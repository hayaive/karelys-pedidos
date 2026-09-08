import { getState, logAudit, mutate } from "./store";
import { uid } from "./seed";
import type {
  AppState,
  Customer,
  ID,
  LineItem,
  Order,
  OrderStatus,
  Payment,
  Product,
  RateSource,
  Sale,
} from "./types";

/* ── Tasas ────────────────────────────────────────────── */

export function currentRate(s: AppState, source: RateSource) {
  return s.rates.filter((r) => r.source === source).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function rateSnapshot(s: AppState) {
  return {
    usd: currentRate(s, "BCV_USD")?.value ?? 0,
    eur: currentRate(s, "BCV_EUR")?.value ?? 0,
    binance: currentRate(s, "BINANCE")?.value ?? 0,
    at: new Date().toISOString(),
  };
}

export function setRate(source: RateSource, value: number, automatic = false) {
  mutate((s) => {
    s.rates.unshift({
      id: uid(),
      source,
      currency: source === "BCV_EUR" ? "EUR" : "USD",
      value,
      automatic,
      userId: s.sessionUserId,
      createdAt: new Date().toISOString(),
    });
    logAudit(automatic ? "tasa_automatica" : "tasa_manual", "exchange_rate", source, { value });
  });
}

/** Intenta obtener tasas oficiales; si falla, el admin las edita a mano. */
export async function fetchRatesFromApi(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares");
    if (!res.ok) throw new Error("bad status");
    const data = (await res.json()) as { fuente: string; promedio: number }[];
    const oficial = data.find((d) => d.fuente === "oficial");
    const paralelo = data.find((d) => d.fuente === "paralelo");
    if (oficial?.promedio) setRate("BCV_USD", oficial.promedio, true);
    if (paralelo?.promedio) setRate("BINANCE", paralelo.promedio, true);
    const eur = await fetch("https://ve.dolarapi.com/v1/euro").then((r) => (r.ok ? r.json() : null));
    if (eur?.oficial?.promedio) setRate("BCV_EUR", eur.oficial.promedio, true);
    else if (eur?.promedio) setRate("BCV_EUR", eur.promedio, true);
    return { ok: true, message: "Tasas actualizadas desde la fuente oficial" };
  } catch {
    return { ok: false, message: "No se pudo consultar la API. Edita las tasas manualmente." };
  }
}

/* ── Precios ──────────────────────────────────────────── */

export function priceOf(p: Product, priceTypeId: ID) {
  return p.prices.find((x) => x.priceTypeId === priceTypeId)?.amount ?? p.prices[0]?.amount ?? 0;
}

export function roundBs(amount: number, step = 1) {
  if (step <= 0) return amount;
  return Math.round(amount / step) * step;
}

/** Regla tortas frías: el equivalente USD debe quedar entre min y max. */
export function coldCakeCheck(s: AppState, usdPrice: number, rate: number) {
  const { coldCakeMin: min, coldCakeMax: max, bsRounding } = s.company;
  const rawBs = usdPrice * rate;
  let finalBs = roundBs(rawBs, bsRounding);
  let back = rate ? finalBs / rate : 0;
  if (back < min) {
    finalBs = Math.ceil((min * rate) / (bsRounding || 1)) * (bsRounding || 1);
    back = rate ? finalBs / rate : 0;
  } else if (back > max) {
    finalBs = Math.floor((max * rate) / (bsRounding || 1)) * (bsRounding || 1);
    back = rate ? finalBs / rate : 0;
  }
  return { rawBs, finalBs, usdBack: back, ok: back >= min - 1e-9 && back <= max + 1e-9, min, max };
}

export function isColdCake(s: AppState, p: Product) {
  return p.categoryId === s.company.coldCakeCategory;
}

/* ── Inventario ───────────────────────────────────────── */

export function addMovement(
  productId: ID,
  qty: number,
  type: "entrada" | "salida" | "ajuste",
  reason: string,
  note?: string,
) {
  mutate((s) => applyMovement(s, productId, qty, type, reason, note));
}

export function applyMovement(
  s: AppState,
  productId: ID,
  qty: number,
  type: "entrada" | "salida" | "ajuste",
  reason: string,
  note?: string,
) {
  const p = s.products.find((x) => x.id === productId);
  if (!p) return;
  if (type === "entrada") p.stock += qty;
  else if (type === "salida") p.stock -= qty;
  else p.stock = qty;
  s.movements.unshift({
    id: uid(),
    productId,
    qty,
    type,
    reason,
    note,
    userId: s.sessionUserId ?? "system",
    createdAt: new Date().toISOString(),
  });
  logAudit("movimiento_inventario", "product", productId, { qty, type, reason });
}

/* ── Ventas ───────────────────────────────────────────── */

export function totalsOf(items: LineItem[], rate: number) {
  const totalUsd = items.reduce((a, i) => a + i.subtotalUsd, 0);
  const bsOnly = items.filter((i) => i.bsOnly).reduce((a, i) => a + (i.unitPriceBs ?? 0) * i.qty, 0);
  const convertible = items.filter((i) => !i.bsOnly).reduce((a, i) => a + i.subtotalUsd, 0);
  const totalBs = convertible * rate + bsOnly;
  return { totalUsd, totalBs };
}

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
  const { totalUsd, totalBs } = totalsOf(input.items, snap.usd);
  const paid = input.payments.reduce((a, p) => a + p.usdEquivalent, 0);
  if (Math.abs(paid - totalUsd) > 0.02 && paid < totalUsd)
    return { ok: false, error: "Los pagos no cubren el total de la venta" };

  for (const it of input.items) {
    const p = s.products.find((x) => x.id === it.productId);
    if (p && isColdCake(s, p)) {
      const chk = coldCakeCheck(s, it.unitPriceUsd, snap.usd);
      if (!chk.ok)
        return {
          ok: false,
          error: `"${it.name}" queda fuera del rango permitido de $${s.company.coldCakeMin} – $${s.company.coldCakeMax}`,
        };
    }
  }

  let sale: Sale | undefined;
  mutate((st) => {
    const user = st.users.find((u) => u.id === st.sessionUserId);
    const number = st.company.salePrefix + String(st.company.saleNext).padStart(5, "0");
    st.company.saleNext += 1;
    sale = {
      id: uid(),
      number,
      createdAt: new Date().toISOString(),
      customerId: input.customerId,
      customerName: input.customerName || "Consumidor final",
      userId: user?.id ?? "system",
      userName: user?.fullName ?? "Sistema",
      items: input.items,
      payments: input.payments,
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
      }
    }
    logAudit("venta_creada", "sale", sale.id, { number, totalUsd });
  });
  return { ok: true, sale };
}

export function cancelSale(saleId: ID, reason: string) {
  mutate((s) => {
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale || sale.status === "anulada") return;
    sale.status = "anulada";
    for (const it of sale.items) {
      const p = s.products.find((x) => x.id === it.productId);
      if (p && !p.isCombo) applyMovement(s, it.productId, it.qty, "entrada", "Anulación de venta", sale.number);
    }
    logAudit("venta_anulada", "sale", saleId, { reason, number: sale.number });
  });
}

/* ── Pedidos ──────────────────────────────────────────── */

export function createOrder(input: {
  items: LineItem[];
  customerId: ID | null;
  customerName: string;
  note?: string;
}) {
  let order: Order | undefined;
  mutate((s) => {
    const number = s.company.orderPrefix + String(s.company.orderNext).padStart(5, "0");
    s.company.orderNext += 1;
    order = {
      id: uid(),
      number,
      createdAt: new Date().toISOString(),
      customerId: input.customerId,
      customerName: input.customerName || "Consumidor final",
      items: input.items,
      totalUsd: input.items.reduce((a, i) => a + i.subtotalUsd, 0),
      note: input.note,
      status: "pendiente",
      userId: s.sessionUserId ?? "system",
    };
    s.orders.unshift(order);
    logAudit("pedido_creado", "order", order.id, { number });
  });
  return order!;
}

export function updateOrder(id: ID, patch: Partial<Order>) {
  mutate((s) => {
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.status === "procesado") return;
    Object.assign(o, patch);
    o.totalUsd = o.items.reduce((a, i) => a + i.subtotalUsd, 0);
    logAudit("pedido_editado", "order", id, patch.status ? { status: patch.status } : undefined);
  });
}

export function setOrderStatus(id: ID, status: OrderStatus) {
  updateOrder(id, { status });
}

export function deleteOrder(id: ID) {
  mutate((s) => {
    s.orders = s.orders.filter((o) => o.id !== id || o.status === "procesado");
    logAudit("pedido_eliminado", "order", id);
  });
}

/* ── Clientes ─────────────────────────────────────────── */

export function upsertCustomer(c: Partial<Customer> & { cedula: string; name: string }) {
  let saved: Customer | undefined;
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
        id: uid(),
        cedula: c.cedula,
        name: c.name,
        phone: c.phone,
        address: c.address,
        active: c.active ?? true,
        createdAt: new Date().toISOString(),
      };
      s.customers.unshift(saved);
      logAudit("cliente_creado", "customer", saved.id);
    }
  });
  return saved!;
}

/* ── Cierre de caja ───────────────────────────────────── */

export function closureDraft(s: AppState, dayISO: string) {
  const sales = s.sales.filter((x) => x.status === "completada" && x.createdAt.slice(0, 10) === dayISO);
  // Descuenta el vuelto entregado del método con el que se pagó de más (el último pago).
  const changeByMethod = new Map<string, number>();
  for (const sale of sales) {
    const change = sale.changeUsd ?? Math.max(0, sale.payments.reduce((a, p) => a + p.usdEquivalent, 0) - sale.totalUsd);
    const last = sale.payments[sale.payments.length - 1];
    if (change > 0.001 && last) changeByMethod.set(last.methodId, (changeByMethod.get(last.methodId) ?? 0) + change);
  }
  const byMethod = s.paymentMethods.map((m) => {
    const gross = sales
      .flatMap((x) => x.payments)
      .filter((p) => p.methodId === m.id)
      .reduce((a, p) => a + p.usdEquivalent, 0);
    const expected = gross - (changeByMethod.get(m.id) ?? 0);
    return { methodId: m.id, methodName: m.name, expected, received: expected };
  });
  return {
    sales,
    byMethod,
    totalUsd: sales.reduce((a, x) => a + x.totalUsd, 0),
    totalBs: sales.reduce((a, x) => a + x.totalBs, 0),
  };
}
