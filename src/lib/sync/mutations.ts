/**
 * Traducción de las mutaciones locales a los payloads de `POST /sync`.
 *
 * Todo el conocimiento de "cómo se llama cada campo en el cable" vive aquí, en un
 * solo sitio, para que `lib/business` y `lib/orders` sigan leyéndose como lo que
 * son —las reglas de negocio del mostrador— y para que sumar una de las
 * operaciones que faltan sea escribir una función de diez líneas.
 *
 * Tres reglas que el backend impone y que este archivo respeta:
 *
 *  1. **El dinero derivado no se manda.** `subtotalUsd` de las líneas,
 *     `usdEquivalent` y `currency` de los pagos, `totalUsd` del pedido y el `stock`
 *     del producto los **recalcula el servidor**; mandarlos permitiría asentar un
 *     comprobante cuyo total no cuadra con sus propias líneas.
 *  2. **Los abonos de un pedido no viajan como pagos de la venta.** Los inyecta el
 *     servidor desde el pedido, que es la única forma de garantizar que cada abono
 *     se consuma una sola vez. Si los mandáramos nosotros, el dinero se contaría
 *     dos veces.
 *  3. **Los movimientos de inventario de una venta no se encolan.** `sale.create`
 *     ya mueve el inventario en su misma transacción; encolarlos aparte descontaría
 *     el stock dos veces.
 *
 * Estado de las 20 operaciones del contrato:
 *  · implementadas de punta a punta: `sale.create`, `sale.void`, `order.create`,
 *    `order.update`, `order.status`, `order.delete`, `orderDeposit.create`,
 *    `orderDeposit.void`, `movement.create`, `customer.create`, `customer.update`,
 *    `rate.create`.
 *  · pendientes (el motor ya las soporta; sólo falta la llamada en su mutador):
 *    `product.create`, `product.update`, `productPrice.set`, `priceGroupPrice.set`,
 *    `priceGroup.create`, `priceGroup.update`, `closure.create`, `audit.append`.
 */

import type {
  Customer,
  ExchangeRate,
  ID,
  InventoryMovement,
  LineItem,
  Order,
  OrderDeposit,
  OrderStatus,
  Payment,
  Sale,
} from "../types";
import { enqueueMutation } from "./queue";

/** Línea de venta o pedido tal como la espera `LineItemDto`. Sin `subtotalUsd`. */
function wireLine(i: LineItem) {
  return {
    productId: i.productId,
    code: i.code,
    name: i.name,
    qty: i.qty,
    priceTypeId: i.priceTypeId,
    unitPriceUsd: i.unitPriceUsd,
    unitPriceBs: i.unitPriceBs,
    bsOnly: i.bsOnly,
    customization: i.customization,
    customizationPrice: i.customizationPrice,
  };
}

/**
 * Pago tal como lo espera `PaymentDto`. `currency` y `usdEquivalent` se omiten a
 * propósito: los deriva el servidor de la forma de pago y de la tasa.
 */
function wirePayment(p: Payment) {
  return {
    methodId: p.methodId,
    amount: p.amount,
    reference: p.reference,
    at: p.at,
    rateUsed: p.rateUsed,
  };
}

/** Abono tal como lo espera `CreateDepositDto`. */
function wireDeposit(d: OrderDeposit) {
  return {
    id: d.id,
    methodId: d.methodId,
    amount: d.amount,
    reference: d.reference,
    note: d.note,
    at: d.at ?? d.createdAt,
    rateUsed: d.rateUsed,
  };
}

/* ── Ventas ───────────────────────────────────────────── */

/**
 * `sale.create`. Se mandan **sólo los pagos que cobró el cajero**: los abonos del
 * pedido los añade el servidor.
 *
 * El número que va aquí es provisional. Si otra caja ya usó ese `V-000xx`, el
 * servidor asigna el siguiente libre, guarda el nuestro en `clientNumber` y
 * responde `renumbered`.
 */
export function queueSaleCreate(sale: Sale, clientPayments: Payment[]) {
  enqueueMutation(
    "sale.create",
    {
      id: sale.id,
      number: sale.number,
      customerId: sale.customerId ?? undefined,
      customerName: sale.customerName,
      items: sale.items.map(wireLine),
      payments: clientPayments.filter((p) => !p.fromOrderDepositId).map(wirePayment),
      note: sale.note,
      orderId: sale.orderId,
      createdAt: sale.createdAt,
      rateSnapshot: sale.rateSnapshot,
      changeUsd: sale.changeUsd,
      createdOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    },
    { at: sale.createdAt },
  );
}

/** `sale.void`. Idempotente: el servidor devuelve stock una sola vez. */
export function queueSaleVoid(saleId: ID, reason: string) {
  enqueueMutation("sale.void", { saleId, reason });
}

/* ── Pedidos ──────────────────────────────────────────── */

/**
 * `order.create`. El abono adelantado va **dentro** del pedido: es un solo acto y
 * si el abono es inválido no se crea nada. Por eso no se encola además un
 * `orderDeposit.create`, que lo duplicaría.
 */
export function queueOrderCreate(order: Order) {
  const advance = order.deposits?.[0];
  enqueueMutation(
    "order.create",
    {
      id: order.id,
      number: order.number,
      customerId: order.customerId ?? undefined,
      customerName: order.customerName,
      items: order.items.map(wireLine),
      note: order.note,
      createdAt: order.createdAt,
      deposit: advance ? wireDeposit(advance) : undefined,
    },
    { at: order.createdAt },
  );
}

/**
 * `order.update`. Va con `baseRev` (bloqueo optimista): si otro equipo cambió el
 * pedido entretanto, el servidor responde `conflict` con su versión en lugar de
 * dejar que se pisen. Las líneas se reemplazan en bloque, nunca se fusionan.
 *
 * `totalUsd` no se manda: lo recalcula el servidor desde las líneas.
 */
export function queueOrderUpdate(order: Order, patch: Partial<Order>) {
  const payload: Record<string, unknown> = { orderId: order.id };

  if (patch.items) payload.items = patch.items.map(wireLine);
  if (patch.note !== undefined) payload.note = patch.note;
  if (patch.customerId !== undefined) payload.customerId = patch.customerId ?? undefined;
  if (patch.customerName !== undefined) payload.customerName = patch.customerName;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.cancelReason !== undefined) payload.cancelReason = patch.cancelReason;

  enqueueMutation("order.update", payload, { baseRev: order.rev });
}

/**
 * `order.status`. **Sólo hacia adelante**: una transición que retrocede porque
 * este equipo iba atrasado se ignora y se audita, y el servidor responde con su
 * estado para que lo adoptemos. Así dos dispositivos que empujan el mismo pedido
 * nunca pelean.
 */
export function queueOrderStatus(order: Order, status: OrderStatus, reason?: string) {
  enqueueMutation(
    "order.status",
    { orderId: order.id, status, reason },
    { baseRev: order.rev },
  );
}

/** `order.delete`. El servidor lo niega si tiene abonos vigentes, igual que el frontend. */
export function queueOrderDelete(orderId: ID) {
  enqueueMutation("order.delete", { orderId });
}

/**
 * `orderDeposit.create`. **Siempre se fusiona**: es append-only e idempotente por
 * PK, y sin red no se valida contra el saldo porque el dinero ya entró. Si la suma
 * pasa del total, el excedente sale como `overpaidUsd`, caso que la app ya modela.
 */
export function queueDepositCreate(orderId: ID, deposit: OrderDeposit) {
  enqueueMutation(
    "orderDeposit.create",
    { orderId, ...wireDeposit(deposit) },
    { at: deposit.at ?? deposit.createdAt },
  );
}

/** `orderDeposit.void`. Idempotente, y anular gana sobre no anular. */
export function queueDepositVoid(depositId: ID, reason: string) {
  enqueueMutation("orderDeposit.void", { depositId, reason });
}

/* ── Inventario ───────────────────────────────────────── */

/**
 * `movement.create`. `delta` y `stockAfter` **no se mandan**: los calcula el
 * servidor, y un `ajuste` se resuelve en el momento de aplicarlo, no en el de
 * capturarlo — así un ajuste hecho sin red a las 9:00 que llega a las 18:00 no
 * borra las ventas que ocurrieron entre medias.
 */
export function queueMovementCreate(m: InventoryMovement) {
  enqueueMutation(
    "movement.create",
    {
      id: m.id,
      productId: m.productId,
      type: m.type,
      qty: m.qty,
      reason: m.reason,
      note: m.note,
      createdAt: m.createdAt,
    },
    { at: m.createdAt },
  );
}

/* ── Clientes ─────────────────────────────────────────── */

/**
 * `customer.create`. Si la cédula ya existe en el servidor, **se fusiona** con la
 * fila existente y la respuesta trae `idMap`; el motor reapunta los pedidos y las
 * ventas locales que señalaban al id de aquí.
 */
export function queueCustomerCreate(c: Customer) {
  enqueueMutation("customer.create", {
    id: c.id,
    cedula: c.cedula,
    name: c.name,
    phone: c.phone,
    address: c.address,
    active: c.active,
  });
}

/** `customer.update`. Parche campo a campo: dos equipos que editan campos distintos no chocan. */
export function queueCustomerUpdate(c: Customer, patch: Partial<Customer>) {
  const payload: Record<string, unknown> = { customerId: c.id };
  if (patch.cedula !== undefined) payload.cedula = patch.cedula;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.address !== undefined) payload.address = patch.address;
  if (patch.active !== undefined) payload.active = patch.active;
  enqueueMutation("customer.update", payload);
}

/* ── Tasas ────────────────────────────────────────────── */

/**
 * `rate.create`. Append-only: nunca se sobreescribe la anterior, varias tasas de
 * la misma fuente coexisten y la vigente es la más reciente.
 *
 * Sólo se encolan las tasas **manuales**. Las automáticas las publica el servidor
 * con su propio cron (`POST /rates/fetch`), y subir además la que cada navegador
 * consultó por su cuenta llenaría el log de tasas repetidas y permitiría que dos
 * cajas cobren a tasas distintas el mismo minuto.
 */
export function queueRateCreate(rate: ExchangeRate) {
  if (rate.automatic) return;
  enqueueMutation(
    "rate.create",
    { id: rate.id, source: rate.source, value: rate.value },
    { at: rate.createdAt },
  );
}
