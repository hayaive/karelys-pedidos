/**
 * Abonos (pagos adelantados) sobre pedidos.
 *
 * Modelo: `Order.deposits` es la única fuente de verdad. El total abonado y el
 * saldo pendiente **no se persisten**, se derivan con `orderBalance()`, porque
 * el total del pedido cambia cada vez que se editan sus líneas y dos campos
 * cacheados se desincronizarían.
 *
 * Cada abono congela la tasa BCV del momento (`rateUsed`) porque el dinero ya
 * entró a esa tasa. El **saldo**, en cambio, se cotiza siempre a la tasa
 * vigente: es dinero que aún no se ha cobrado.
 */

import { bcvRate } from "./pricing";
import { uid } from "./seed";
import { getState, logAudit, mutate } from "./store";
import type {
  AppState,
  ID,
  Order,
  OrderBalance,
  OrderDeposit,
  OrderPaymentStatus,
  Payment,
} from "./types";

/** Tolerancia en USD para comparaciones de dinero (centavos de redondeo). */
const EPS = 0.02;

/* ── Selectores ───────────────────────────────────────── */

/** Abonos vigentes: excluye los anulados/devueltos. */
export function activeDeposits(o: Order): OrderDeposit[] {
  return (o.deposits ?? []).filter((d) => !d.voided);
}

export function depositTotalUsd(o: Order) {
  return activeDeposits(o).reduce((a, d) => a + d.usdEquivalent, 0);
}

/**
 * Estado de pago derivado de un pedido. Úsalo en lugar de sumar abonos a mano:
 * es el único sitio donde se decide qué cuenta como abonado y qué como saldo.
 */
export function orderBalance(o: Order): OrderBalance {
  const totalUsd = o.totalUsd;
  const depositUsd = depositTotalUsd(o);
  const raw = totalUsd - depositUsd;
  const balanceUsd = Math.max(0, Math.round(raw * 100) / 100);
  const overpaidUsd = Math.max(0, Math.round(-raw * 100) / 100);
  let status: OrderPaymentStatus = "sin_abono";
  if (depositUsd > EPS) status = balanceUsd <= EPS ? "pagado" : "abonado";
  return { totalUsd, depositUsd, balanceUsd, overpaidUsd, status, deposits: activeDeposits(o) };
}

/**
 * Convierte los abonos en pagos de la venta, conservando la fecha y la tasa
 * originales. `createSale` los inyecta automáticamente al procesar el pedido:
 * así el abono nunca se pierde y el cierre de caja lo cuenta el día en que
 * realmente entró, no el día de la venta.
 *
 * Importante para la UI de cobro: al procesar un pedido con abonos hay que
 * cobrar `orderBalance(order).balanceUsd`, no el total del pedido.
 */
export function depositsAsPayments(o: Order): Payment[] {
  return activeDeposits(o).map((d) => ({
    methodId: d.methodId,
    methodName: d.methodName,
    currency: d.currency,
    amount: d.amount,
    usdEquivalent: d.usdEquivalent,
    reference: d.reference,
    at: d.at ?? d.createdAt,
    rateUsed: d.rateUsed,
    fromOrderDepositId: d.id,
  }));
}

/** Abonos recibidos en una fecha (YYYY-MM-DD), para el cierre de caja. */
export function depositsOfDay(s: AppState, dayISO: string) {
  const out: { order: Order; deposit: OrderDeposit }[] = [];
  for (const order of s.orders) {
    for (const deposit of activeDeposits(order)) {
      const at = deposit.at ?? deposit.createdAt;
      if (at.slice(0, 10) === dayISO) out.push({ order, deposit });
    }
  }
  return out;
}

/** Pedidos con saldo pendiente, más antiguos primero. Para la vista de cobros. */
export function ordersWithBalance(s: AppState) {
  return s.orders
    .filter((o) => o.status !== "cancelado" && o.status !== "procesado")
    .map((o) => ({ order: o, balance: orderBalance(o) }))
    .filter((x) => x.balance.depositUsd > EPS && x.balance.balanceUsd > EPS)
    .sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt));
}

/* ── Construcción y mutadores ─────────────────────────── */

export interface NewDepositInput {
  methodId: ID;
  /** Monto en la moneda del método de pago (USD o Bs). */
  amount: number;
  reference?: string;
  note?: string;
  /** Fecha real de recepción; por defecto ahora. */
  at?: string;
}

/**
 * Construye un abono validado a partir del estado actual. Se usa tanto al
 * crear el pedido con abono adelantado como al abonar después.
 */
export function buildDeposit(
  s: AppState,
  input: NewDepositInput,
): { ok: true; deposit: OrderDeposit } | { ok: false; error: string } {
  const method = s.paymentMethods.find((m) => m.id === input.methodId);
  if (!method) return { ok: false, error: "Forma de pago inválida" };
  if (!method.active) return { ok: false, error: `"${method.name}" está desactivada` };
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return { ok: false, error: "El monto del abono debe ser mayor que cero" };
  if (method.requiresReference && !input.reference?.trim())
    return { ok: false, error: `"${method.name}" requiere número de referencia` };

  const rate = bcvRate(s);
  if (method.currency === "BS" && !rate)
    return { ok: false, error: "No hay tasa BCV cargada: no se puede abonar en bolívares" };

  const usdEquivalent =
    method.currency === "USD" ? input.amount : Math.round((input.amount / rate) * 10000) / 10000;
  const at = input.at ?? new Date().toISOString();

  return {
    ok: true,
    deposit: {
      id: uid(),
      createdAt: at,
      at,
      methodId: method.id,
      methodName: method.name,
      currency: method.currency,
      amount: input.amount,
      usdEquivalent,
      rateUsed: rate,
      reference: input.reference?.trim() || undefined,
      note: input.note?.trim() || undefined,
      userId: s.sessionUserId ?? "system",
    },
  };
}

/** Registra un abono sobre un pedido existente. */
export function addOrderDeposit(
  orderId: ID,
  input: NewDepositInput,
): { ok: boolean; deposit?: OrderDeposit; error?: string } {
  const s = getState();
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: "El pedido no existe" };
  if (order.status === "procesado")
    return { ok: false, error: "El pedido ya fue procesado: cobra sobre la venta" };
  if (order.status === "cancelado") return { ok: false, error: "El pedido está cancelado" };

  const built = buildDeposit(s, input);
  if (!built.ok) return { ok: false, error: built.error };

  const balance = orderBalance(order);
  if (built.deposit.usdEquivalent > balance.balanceUsd + EPS)
    return {
      ok: false,
      error: `El abono ($${built.deposit.usdEquivalent.toFixed(2)}) supera el saldo pendiente ($${balance.balanceUsd.toFixed(2)})`,
    };

  mutate((st) => {
    const o = st.orders.find((x) => x.id === orderId);
    if (!o) return;
    o.deposits = [...(o.deposits ?? []), built.deposit];
    logAudit("abono_registrado", "order", orderId, {
      number: o.number,
      amount: built.deposit.amount,
      currency: built.deposit.currency,
      usd: built.deposit.usdEquivalent,
    });
  });
  return { ok: true, deposit: built.deposit };
}

/**
 * Anula un abono (devolución o error de registro). No se borra: se marca, para
 * que el rastro quede en el pedido y en la auditoría.
 *
 * Nota para el cierre de caja: un abono anulado deja de contar en **todos** los
 * días. Si la devolución ocurre en un día distinto al del abono, el cierre del
 * día original cambia; registra además el egreso de efectivo correspondiente.
 */
export function voidOrderDeposit(
  orderId: ID,
  depositId: ID,
  reason: string,
): { ok: boolean; error?: string } {
  const s = getState();
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: "El pedido no existe" };
  if (order.status === "procesado")
    return { ok: false, error: "El pedido ya fue procesado: anula la venta en su lugar" };
  const deposit = (order.deposits ?? []).find((d) => d.id === depositId);
  if (!deposit) return { ok: false, error: "El abono no existe" };
  if (deposit.voided) return { ok: false, error: "El abono ya estaba anulado" };

  mutate((st) => {
    const d = st.orders.find((x) => x.id === orderId)?.deposits?.find((x) => x.id === depositId);
    if (!d) return;
    d.voided = true;
    d.voidedAt = new Date().toISOString();
    d.voidReason = reason;
    logAudit("abono_anulado", "order", orderId, { depositId, reason, usd: d.usdEquivalent });
  });
  return { ok: true };
}

/** Marca los abonos de un pedido como consumidos por una venta. */
export function linkDepositsToSale(st: AppState, orderId: ID, saleId: ID) {
  const o = st.orders.find((x) => x.id === orderId);
  if (!o) return;
  for (const d of o.deposits ?? []) if (!d.voided) d.saleId = saleId;
}
