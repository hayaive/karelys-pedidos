import { makeMoney } from "./money";
import {
  buildDeposit,
  depositsAsPayments,
  depositsOfDay,
  linkDepositsToSale,
  orderBalance,
  type NewDepositInput,
} from "./orders";
import { currentRate, isGenericColdCake, itemsTotals, moneyOf, rateSnapshot } from "./pricing";
import { DEFAULT_RATE_MAX_AGE_HOURS } from "./pricing-rules";
import { dayKey } from "./format";
import { getState, logAudit, mutate } from "./store";
import { newId } from "./ids";
import {
  queueCustomerCreate,
  queueCustomerUpdate,
  queueMovementCreate,
  queueOrderCreate,
  queueOrderDelete,
  queueOrderStatus,
  queueOrderUpdate,
  queueRateCreate,
  queueSaleCreate,
  queueSaleVoid,
} from "./sync/mutations";
import type {
  AppState,
  Customer,
  ExchangeRate,
  ID,
  InventoryMovement,
  LineItem,
  Order,
  OrderStatus,
  Payment,
  RateSource,
  Sale,
} from "./types";

/**
 * Reexportaciones de compatibilidad. La resolución de precios y la conversión a
 * bolívares viven ahora en lib/pricing y lib/money; este módulo se queda con
 * los mutadores (crear venta, pedido, movimientos, cierre).
 */
export {
  bcvRate,
  commonPriceTypeId,
  companyPriceRule,
  currentRate,
  defaultPriceType,
  isGenericColdCake,
  itemsTotals,
  lineBs,
  mergeLines,
  moneyOf,
  moneyOfSale,
  priceAlertOf,
  priceAlerts,
  priceOf,
  priceRuleOf,
  rateSnapshot,
  repriceLine,
  totalsOf,
  unitBs,
} from "./pricing";
export { roundBs } from "./money";
export {
  activeDeposits,
  addOrderDeposit,
  depositTotalUsd,
  depositsAsPayments,
  depositsOfDay,
  orderBalance,
  ordersWithBalance,
  voidOrderDeposit,
} from "./orders";

/* ── Tasas ────────────────────────────────────────────── */

/**
 * Publica una tasa nueva. Nunca se sobreescribe la anterior: el historial es lo
 * que permite auditar a qué tasa se cobró cada venta y cada abono.
 */
export function setRate(source: RateSource, value: number, automatic = false) {
  let published: ExchangeRate | undefined;
  mutate((s) => {
    published = {
      id: newId(),
      source,
      currency: source === "BCV_EUR" ? "EUR" : "USD",
      value,
      automatic,
      userId: s.sessionUserId,
      createdAt: new Date().toISOString(),
    };
    s.rates.unshift(published);
    logAudit(automatic ? "tasa_automatica" : "tasa_manual", "exchange_rate", source, { value });
  });
  // Sólo las manuales: las automáticas las publica el servidor por su cuenta.
  if (published) queueRateCreate(published);
}

type DolarApiQuote = { fuente: string; promedio: number };

async function dolarApi(path: "dolares" | "euros"): Promise<DolarApiQuote[]> {
  const res = await fetch(`https://ve.dolarapi.com/v1/${path}`);
  if (!res.ok) throw new Error(`dolarapi /${path}: ${res.status}`);
  return (await res.json()) as DolarApiQuote[];
}

/**
 * Publica una tasa automática sólo si aporta algo: cambió el valor o la vigente
 * ya está vencida. Se consulta en cada cambio de pantalla, y publicar siempre
 * llenaría el log append-only de tasas (y la auditoría) con copias idénticas.
 */
function publishAutomaticRate(source: RateSource, value: number | undefined) {
  if (!value || !Number.isFinite(value)) return;
  const s = getState();
  const actual = currentRate(s, source);
  const maxAge = s.company.rateMaxAgeHours ?? DEFAULT_RATE_MAX_AGE_HOURS;
  const ageHours = actual ? (Date.now() - Date.parse(actual.createdAt)) / 3_600_000 : Infinity;
  if (actual?.value === value && ageHours <= maxAge) return;
  setRate(source, value, true);
}

/**
 * Trae BCV USD, paralelo y BCV EUR de dolarapi. Dólar y euro se consultan por
 * separado: si falla uno, el otro igual se actualiza. Si fallan ambos, el admin
 * las edita a mano.
 */
export async function fetchRatesFromApi(): Promise<{ ok: boolean; message: string }> {
  const [dolares, euros] = await Promise.allSettled([dolarApi("dolares"), dolarApi("euros")]);
  const promedio = (r: PromiseSettledResult<DolarApiQuote[]>, fuente: string) =>
    r.status === "fulfilled" ? r.value.find((d) => d.fuente === fuente)?.promedio : undefined;

  publishAutomaticRate("BCV_USD", promedio(dolares, "oficial"));
  publishAutomaticRate("BINANCE", promedio(dolares, "paralelo"));
  publishAutomaticRate("BCV_EUR", promedio(euros, "oficial"));

  if (dolares.status === "rejected" && euros.status === "rejected")
    return { ok: false, message: "No se pudo consultar la API. Edita las tasas manualmente." };
  if (dolares.status === "rejected" || euros.status === "rejected") {
    const falta = dolares.status === "rejected" ? "el dólar" : "el euro";
    return { ok: true, message: `Tasas actualizadas, pero no se pudo traer ${falta}` };
  }
  return { ok: true, message: "Tasas actualizadas desde la fuente oficial" };
}

/* ── Inventario ───────────────────────────────────────── */

/**
 * Movimiento de inventario capturado por una persona (la pantalla de inventario).
 *
 * Éste **sí** se encola: es un asiento de kardex por sí mismo. Los movimientos que
 * genera una venta o su anulación no se encolan, porque `sale.create` y `sale.void`
 * ya mueven el inventario en el servidor y hacerlo dos veces descuadraría el stock.
 */
export function addMovement(
  productId: ID,
  qty: number,
  type: "entrada" | "salida" | "ajuste",
  reason: string,
  note?: string,
) {
  let created: InventoryMovement | undefined;
  mutate((s) => {
    created = applyMovement(s, productId, qty, type, reason, note);
  });
  if (created) queueMovementCreate(created);
}

/**
 * Aplica el movimiento al estado y devuelve el asiento creado (o `undefined` si el
 * producto no existe). **No encola**: quien lo llame decide si ese movimiento es un
 * hecho propio o el efecto de una venta.
 */
export function applyMovement(
  s: AppState,
  productId: ID,
  qty: number,
  type: "entrada" | "salida" | "ajuste",
  reason: string,
  note?: string,
): InventoryMovement | undefined {
  const p = s.products.find((x) => x.id === productId);
  if (!p) return undefined;
  if (type === "entrada") p.stock += qty;
  else if (type === "salida") p.stock -= qty;
  else p.stock = qty;
  const movement: InventoryMovement = {
    id: newId(),
    productId,
    qty,
    type,
    reason,
    note,
    userId: s.sessionUserId ?? "system",
    createdAt: new Date().toISOString(),
  };
  s.movements.unshift(movement);
  logAudit("movimiento_inventario", "product", productId, { qty, type, reason });
  return movement;
}

/* ── Ventas ───────────────────────────────────────────── */

/**
 * Registra la venta.
 *
 * El total en Bs se calcula aquí con la tasa del momento y se congela en
 * `Sale.rateSnapshot`, porque un comprobante emitido tiene que poder
 * reimprimirse con la tasa que realmente se cobró.
 *
 * Abonos: si se procesa un pedido con abonos vigentes, éstos se incorporan
 * automáticamente como pagos de la venta (con su fecha y su tasa originales) y
 * cuentan para cubrir el total. **La UI de cobro debe cobrar sólo
 * `orderBalance(order).balanceUsd`**, no el total del pedido; si cobra el total
 * completo, el importe de los abonos aparecerá como vuelto.
 */
export function createSale(input: {
  items: LineItem[];
  customerId: ID | null;
  customerName: string;
  payments: Payment[];
  note?: string;
  orderId?: ID;
}): { ok: boolean; sale?: Sale; error?: string } {
  const s = getState();
  if (!input.items.length) return { ok: false, error: "El carrito está vacío" };
  const snap = rateSnapshot(s);
  const money = makeMoney({ rate: snap.usd, bsRounding: s.company.bsRounding });
  const { totalUsd, totalBs } = itemsTotals(input.items, money);

  const order = input.orderId ? s.orders.find((o) => o.id === input.orderId) : undefined;
  const alreadyIncluded = new Set(
    input.payments.map((p) => p.fromOrderDepositId).filter(Boolean) as string[],
  );
  const depositPayments = order
    ? depositsAsPayments(order).filter((p) => !alreadyIncluded.has(p.fromOrderDepositId!))
    : [];
  const payments = [...depositPayments, ...input.payments];

  const paid = payments.reduce((a, p) => a + p.usdEquivalent, 0);
  if (Math.abs(paid - totalUsd) > 0.02 && paid < totalUsd)
    return { ok: false, error: "Los pagos no cubren el total de la venta" };

  /* Tasa BCV: sin tasa vigente ninguna venta se puede asentar de forma confiable
     — el cierre de caja no cuadra y el ticket no se puede reimprimir con el
     equivalente correcto, sea o no la venta de un producto con precio en Bs.
     Bloquea toda venta, no sólo la del genérico de tortas frías (decisión del
     dueño del negocio, alineada con el mismo guard del backend).

     Esto sustituye a la validación de banda del esquema ≤5, que en la práctica
     sólo llegaba a bloquear en este mismo caso (el algoritmo corregía el precio
     dentro del rango antes de comprobarlo) pero lo explicaba con un mensaje de
     rango que no decía lo que de verdad pasaba. */
  if (money.missing)
    return {
      ok: false,
      error: "No se puede vender sin una tasa BCV vigente. Actualízala en Mercado.",
    };

  let sale: Sale | undefined;
  mutate((st) => {
    const user = st.users.find((u) => u.id === st.sessionUserId);
    const number = st.company.salePrefix + String(st.company.saleNext).padStart(5, "0");
    st.company.saleNext += 1;
    sale = {
      id: newId(),
      number,
      createdAt: new Date().toISOString(),
      customerId: input.customerId,
      customerName: input.customerName || "Consumidor final",
      userId: user?.id ?? "system",
      userName: user?.fullName ?? "Sistema",
      items: input.items,
      payments,
      totalUsd,
      totalBs,
      changeUsd: Math.max(0, Math.round((paid - totalUsd) * 100) / 100),
      rateSnapshot: snap,
      status: "completada",
      orderId: input.orderId,
      note: input.note,
    };
    st.sales.unshift(sale);
    for (const it of input.items) {
      const p = st.products.find((x) => x.id === it.productId);
      if (p && !p.isCombo) applyMovement(st, it.productId, it.qty, "salida", "Salida por venta", number);
    }
    if (input.orderId) {
      const o = st.orders.find((x) => x.id === input.orderId);
      if (o) {
        o.status = "procesado";
        o.saleId = sale!.id;
        linkDepositsToSale(st, input.orderId, sale!.id);
      }
    }
    logAudit("venta_creada", "sale", sale.id, {
      number,
      totalUsd,
      depositUsd: depositPayments.reduce((a, p) => a + p.usdEquivalent, 0) || undefined,
    });
  });

  // Se encola con los pagos que cobró el cajero. Los abonos del pedido los añade
  // el servidor desde el pedido, para que no se puedan consumir dos veces.
  if (sale) queueSaleCreate(sale, input.payments);

  return { ok: true, sale };
}

export function cancelSale(saleId: ID, reason: string) {
  let voided = false;
  mutate((s) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale || sale.status === "anulada") return;
    sale.status = "anulada";
    for (const it of sale.items) {
      const p = s.products.find((x) => x.id === it.productId);
      if (p && !p.isCombo) applyMovement(s, it.productId, it.qty, "entrada", "Anulación de venta", sale.number);
    }
    logAudit("venta_anulada", "sale", saleId, { reason, number: sale.number });
    voided = true;
  });
  // La devolución de stock la hace el servidor al anular: los movimientos de
  // arriba son sólo la copia local y no se encolan.
  if (voided) queueSaleVoid(saleId, reason);
}

/* ── Pedidos ──────────────────────────────────────────── */

/**
 * Crea el pedido y, si el cliente adelantó dinero, registra el abono en el
 * mismo acto. Si el abono es inválido no se crea nada: no queremos pedidos a
 * medias con el cobro sin registrar.
 */
export function createOrder(input: {
  items: LineItem[];
  customerId: ID | null;
  customerName: string;
  note?: string;
  /** Abono adelantado opcional al momento de registrar el pedido. */
  deposit?: NewDepositInput;
}): { ok: boolean; order?: Order; error?: string } {
  const s = getState();
  if (!input.items.length) return { ok: false, error: "El pedido no tiene productos" };
  // Suma directa de `subtotalUsd`: en una línea `bsOnly` eso siempre es 0 (no
  // tiene precio propio en USD), así que este total NO sirve para validar un
  // abono — sólo se guarda en `order.totalUsd` por compatibilidad con lo que
  // ese campo ya representaba (igual que `orderBalance` en lib/orders.ts, que
  // tampoco confía en este valor para el saldo real).
  const totalUsd = input.items.reduce((a, i) => a + i.subtotalUsd, 0);
  // Total real para validar el abono: convierte también las líneas `bsOnly` a
  // su equivalente USD vigente (`lineUsd`, vía `itemsTotals`). Sin esto, un
  // pedido con torta fría rechazaba cualquier abono con "supera el total del
  // pedido ($0.00)" aunque el total en Bs sí alcanzara para cubrirlo.
  const { totalUsd: totalUsdReal } = itemsTotals(input.items, moneyOf(s));

  const built = input.deposit ? buildDeposit(s, input.deposit) : null;
  if (built && !built.ok) return { ok: false, error: built.error };
  if (built?.ok && built.deposit.usdEquivalent > totalUsdReal + 0.02)
    return {
      ok: false,
      error: `El abono ($${built.deposit.usdEquivalent.toFixed(2)}) supera el total del pedido ($${totalUsdReal.toFixed(2)})`,
    };

  let order: Order | undefined;
  mutate((st) => {
    const number = st.company.orderPrefix + String(st.company.orderNext).padStart(5, "0");
    st.company.orderNext += 1;
    order = {
      id: newId(),
      number,
      createdAt: new Date().toISOString(),
      customerId: input.customerId,
      customerName: input.customerName || "Consumidor final",
      items: input.items,
      totalUsd,
      note: input.note,
      status: "pendiente",
      userId: st.sessionUserId ?? "system",
      deposits: built?.ok ? [built.deposit] : [],
    };
    st.orders.unshift(order);
    logAudit("pedido_creado", "order", order.id, {
      number,
      totalUsd,
      abonoUsd: built?.ok ? built.deposit.usdEquivalent : undefined,
    });
  });

  // El abono adelantado viaja **dentro** del pedido: es un solo acto.
  if (order) queueOrderCreate(order);

  return { ok: true, order: order! };
}

/**
 * Edita el pedido y recalcula su total. Los abonos no se tocan: si el pedido se
 * reduce por debajo de lo abonado, `orderBalance()` lo reporta como
 * `overpaidUsd` (excedente a devolver) en lugar de dejar un saldo negativo.
 */
export function updateOrder(id: ID, patch: Partial<Order>) {
  const edited = applyOrderPatch(id, patch);
  // Va con `baseRev`: si otro equipo ya lo cambió, el servidor responde `conflict`
  // con su versión en lugar de dejar que una edición pise la otra.
  if (edited) queueOrderUpdate(edited, patch);
}

/**
 * Cambia el estado del pedido. Viaja como `order.status`, que es **monótono**: una
 * transición que retrocede porque este equipo iba atrasado no se aplica, se audita,
 * y el servidor responde con su estado para que lo adoptemos.
 */
export function setOrderStatus(id: ID, status: OrderStatus) {
  const edited = applyOrderPatch(id, { status });
  if (edited) queueOrderStatus(edited, status);
}

/**
 * El parche local, compartido por `updateOrder` y `setOrderStatus`. Devuelve el
 * pedido **antes** del parche cuando se aplicó algo, porque es su `rev` el que vale
 * como `baseRev` (la copia local no tiene una versión nueva hasta que el servidor
 * confirme).
 */
function applyOrderPatch(id: ID, patch: Partial<Order>): Order | undefined {
  let base: Order | undefined;
  mutate((s) => {
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.status === "procesado") return;
    base = { ...o };
    Object.assign(o, patch);
    o.totalUsd = o.items.reduce((a, i) => a + i.subtotalUsd, 0);
    logAudit("pedido_editado", "order", id, patch.status ? { status: patch.status } : undefined);
  });
  return base;
}

/**
 * Elimina un pedido. Se niega si tiene abonos vigentes: borrarlo destruiría el
 * registro de un dinero que ya entró a caja. En ese caso hay que anular primero
 * el abono (devolución) o cancelar el pedido, que sí conserva el rastro.
 */
export function deleteOrder(id: ID): { ok: boolean; error?: string } {
  const s = getState();
  const order = s.orders.find((o) => o.id === id);
  if (!order) return { ok: false, error: "El pedido no existe" };
  const balance = orderBalance(s, order);
  if (balance.depositUsd > 0.001)
    return {
      ok: false,
      error: `El pedido tiene $${balance.depositUsd.toFixed(2)} abonados. Anula el abono o cancela el pedido en lugar de eliminarlo.`,
    };
  mutate((st) => {
    st.orders = st.orders.filter((o) => o.id !== id || o.status === "procesado");
    logAudit("pedido_eliminado", "order", id);
  });
  queueOrderDelete(id);
  return { ok: true };
}

/* ── Clientes ─────────────────────────────────────────── */

export function upsertCustomer(c: Partial<Customer> & { cedula: string; name: string }) {
  let saved: Customer | undefined;
  let created = false;
  mutate((s) => {
    if (c.id) {
      const ex = s.customers.find((x) => x.id === c.id);
      if (ex) {
        Object.assign(ex, c);
        saved = ex;
        logAudit("cliente_editado", "customer", ex.id);
      }
    } else {
      saved = {
        id: newId(),
        cedula: c.cedula,
        name: c.name,
        phone: c.phone,
        address: c.address,
        active: c.active ?? true,
        createdAt: new Date().toISOString(),
      };
      s.customers.unshift(saved);
      created = true;
      logAudit("cliente_creado", "customer", saved.id);
    }
  });

  if (saved) {
    // Un alta con una cédula que el servidor ya conoce se **fusiona** allí y
    // devuelve su id: el motor reapunta los pedidos y ventas que colgaban del
    // id local.
    if (created) queueCustomerCreate(saved);
    else queueCustomerUpdate(saved, c);
  }

  return saved!;
}

/* ── Cierre de caja ───────────────────────────────────── */

/**
 * Cierre del día. Cuenta el dinero por **fecha de recepción**, no por fecha de
 * venta: un abono cobrado el lunes pertenece a la caja del lunes aunque el
 * pedido se facture el viernes. Para eso cada pago lleva `at` y los abonos que
 * se convierten en pago de venta se marcan con `fromOrderDepositId`, de modo que
 * se cuentan una sola vez, el día del abono.
 *
 * Cada método se cuadra **en su moneda** (la configurada hoy en el método): un
 * método en Bs espera los bolívares que realmente entraron (`Payment.amount`),
 * no su equivalente en USD reconvertido a la tasa del día. `expected` sigue en
 * USD para los totales y los cierres ya guardados.
 */
export function closureDraft(s: AppState, dayISO: string) {
  const sales = s.sales.filter(
    (x) => x.status === "completada" && x.createdAt.slice(0, 10) === dayISO,
  );
  const methodCurrency = new Map(s.paymentMethods.map((m) => [m.id, m.currency]));

  /** Tasa Bs/USD con la que entró un pago: la congelada, la implícita o la de la venta. */
  const rateOf = (p: Payment, fallback: number) =>
    p.rateUsed ||
    (p.currency === "BS" && p.usdEquivalent > 0 ? p.amount / p.usdEquivalent : fallback);

  /** Monto de un pago expresado en la moneda del método que lo recibió. */
  const inMethodCurrency = (p: Payment, usdAmount: number, fallbackRate: number) => {
    const currency = methodCurrency.get(p.methodId) ?? p.currency;
    if (currency === "USD") return usdAmount;
    if (p.currency === "BS" && usdAmount === p.usdEquivalent) return p.amount;
    return usdAmount * rateOf(p, fallbackRate);
  };

  /** Entradas de efectivo del día, por método (en USD y en la moneda del método). */
  const received: { methodId: ID; usd: number; amount: number }[] = [];
  for (const sale of s.sales) {
    if (sale.status !== "completada") continue;
    for (const p of sale.payments) {
      if (p.fromOrderDepositId) continue; // ya se contó el día del abono
      if ((p.at ?? sale.createdAt).slice(0, 10) !== dayISO) continue;
      received.push({
        methodId: p.methodId,
        usd: p.usdEquivalent,
        amount: inMethodCurrency(p, p.usdEquivalent, sale.rateSnapshot?.usd ?? 0),
      });
    }
  }
  const dayDeposits = depositsOfDay(s, dayISO);
  for (const { deposit } of dayDeposits) {
    received.push({
      methodId: deposit.methodId,
      usd: deposit.usdEquivalent,
      amount: inMethodCurrency(deposit, deposit.usdEquivalent, 0),
    });
  }

  // Descuenta el vuelto entregado del método con el que se pagó de más (el
  // último pago), en USD y en la moneda de ese método a la tasa de ese pago.
  const changeByMethod = new Map<string, { usd: number; amount: number }>();
  for (const sale of sales) {
    const change =
      sale.changeUsd ??
      Math.max(0, sale.payments.reduce((a, p) => a + p.usdEquivalent, 0) - sale.totalUsd);
    const last = sale.payments[sale.payments.length - 1];
    if (change > 0.001 && last) {
      const acc = changeByMethod.get(last.methodId) ?? { usd: 0, amount: 0 };
      acc.usd += change;
      acc.amount += inMethodCurrency(last, change, sale.rateSnapshot?.usd ?? 0);
      changeByMethod.set(last.methodId, acc);
    }
  }

  const byMethod = s.paymentMethods.map((m) => {
    const mine = received.filter((r) => r.methodId === m.id);
    const change = changeByMethod.get(m.id);
    const expected = mine.reduce((a, r) => a + r.usd, 0) - (change?.usd ?? 0);
    const expectedAmount = mine.reduce((a, r) => a + r.amount, 0) - (change?.amount ?? 0);
    return {
      methodId: m.id,
      methodName: m.name,
      currency: m.currency,
      expected,
      received: expected,
      expectedAmount: Math.round(expectedAmount * 100) / 100,
    };
  });

  // Tasa BCV vigente ese día: la última publicada hasta esa fecha (hoy, la actual).
  const dayRate =
    s.rates
      .filter((r) => r.source === "BCV_USD" && dayKey(r.createdAt) <= dayISO)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.value ??
    currentRate(s, "BCV_USD")?.value ??
    0;

  return {
    sales,
    byMethod,
    /** Tasa BCV con la que se llevan a USD los bolívares contados en el cierre. */
    rate: dayRate,
    /** Facturado del día (suma de los totales de las ventas). */
    totalUsd: sales.reduce((a, x) => a + x.totalUsd, 0),
    totalBs: sales.reduce((a, x) => a + x.totalBs, 0),
    /** Abonos de pedidos recibidos hoy (aún sin facturar). */
    depositUsd: dayDeposits.reduce((a, x) => a + x.deposit.usdEquivalent, 0),
    /** Efectivo que debe haber en caja hoy. Es lo que se compara al cerrar. */
    expectedUsd: byMethod.reduce((a, m) => a + m.expected, 0),
  };
}
