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
 * Estado de las operaciones del contrato que este cliente usa:
 *  · implementadas de punta a punta: `sale.create`, `sale.void`, `order.create`,
 *    `order.update`, `order.status`, `order.delete`, `orderDeposit.create`,
 *    `orderDeposit.void`, `movement.create`, `customer.create`, `customer.update`,
 *    `product.create`, `product.update`, `productPrice.set`, `rate.create`,
 *    `closure.create`.
 *  · pendientes (el motor ya las soporta; sólo falta la llamada en su mutador):
 *    `audit.append`.
 *
 * Las tres operaciones de grupo de precio desaparecieron con el esquema 6, que
 * retiró el mecanismo entero (ver `toV6` en lib/migrations).
 *
 * `productPrice.set` no hace falta para el formulario de producto: su parche de
 * `product.update` ya lleva `prices` completo, y la granularidad por celda sólo
 * gana cuando se edita **un** precio suelto: la corrección de una alerta de
 * precio bajo en USD.
 */

import type {
  ComboItem,
  Customer,
  DailyClosure,
  ExchangeRate,
  ID,
  InventoryMovement,
  LineItem,
  Order,
  OrderDeposit,
  OrderStatus,
  Payment,
  Product,
  ProductPrice,
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
  enqueueMutation("order.status", { orderId: order.id, status, reason }, { baseRev: order.rev });
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

/* ── Catálogo ─────────────────────────────────────────── */

/**
 * Tope de `imageUrl` en el contrato (`@MaxLength(2000)` en `CreateProductDto`).
 *
 * El formulario de inventario guarda la foto como **data URL** en base64, que pasa
 * de sobra ese tope. Mandarla haría que el servidor rechazara el alta entera con
 * `validation_failed`, y un rechazo permanente saca la mutación de la cola: el
 * producto se quedaría sólo en este navegador y el siguiente `/bootstrap` —que
 * reemplaza el catálogo completo— lo borraría. Perder la foto es infinitamente más
 * barato que perder el producto, así que la imagen se omite y el resto del alta
 * viaja.
 *
 * Para que la foto llegue de verdad hace falta subirla a algún sitio y mandar su
 * URL; hoy el backend no tiene endpoint de subida (ver el informe de esta tarea).
 */
const IMAGE_URL_MAX = 2000;

function wireImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.length <= IMAGE_URL_MAX) return imageUrl;
  console.warn(
    "[sync] la imagen del producto no viaja al servidor: excede los " +
      `${IMAGE_URL_MAX} caracteres que admite el contrato (es una data URL)`,
  );
  return undefined;
}

/** Precio propio tal como lo espera `PriceInputDto`. */
function wirePrice(p: ProductPrice) {
  return { priceTypeId: p.priceTypeId, amount: p.amount };
}

/** Línea de combo tal como la espera `ComboItemInputDto`. */
function wireComboItem(i: ComboItem) {
  return { description: i.description, qty: i.qty, productId: i.productId };
}

/**
 * `product.create`.
 *
 * **`stock` no se manda**: no es escribible por ningún cliente. El servidor crea
 * todo producto con existencia 0 y la única forma de moverla es un movimiento de
 * inventario, así que el stock inicial del formulario viaja aparte como un
 * `movement.create` de tipo `ajuste` (ver `inventario.tsx`). El orden de la cola es
 * lo que lo hace posible: se aplica en secuencia, y el producto existe en el
 * servidor antes del movimiento que le fija la existencia.
 *
 * Un `code` repetido tampoco es un error: dos dispositivos sin red pueden generar
 * el mismo, así que el servidor **recodifica** y responde `renumbered`; el motor
 * adopta el código definitivo y avisa.
 */
export function queueProductCreate(product: Product) {
  enqueueMutation(
    "product.create",
    {
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      imageUrl: wireImageUrl(product.imageUrl),
      minStock: product.minStock,
      active: product.active,
      bsOnly: product.bsOnly,
      // Un producto que se vende sólo en Bs **necesita** su precio en Bs: sin él
      // el servidor rechaza el alta (el CHECK `products_bs_only_needs_price_ck`).
      // El formulario muestra 0 cuando nadie tocó el campo, así que 0 es lo que
      // corresponde mandar, no "nada".
      bsPrice: product.bsOnly ? (product.bsPrice ?? 0) : product.bsPrice,
      isCombo: product.isCombo,
      allowCustomization: product.allowCustomization,
      customizationPrice: product.customizationPrice,
      prices: product.prices?.length ? product.prices.map(wirePrice) : undefined,
      comboItems: product.comboItems?.length ? product.comboItems.map(wireComboItem) : undefined,
    },
    { at: product.createdAt },
  );
}

/**
 * `product.update`. Parche con **LWW por campo**: sólo compiten los campos que dos
 * dispositivos tocaron a la vez, y para eso el último en escribir es la respuesta
 * acordada. Por eso **no** va `baseRev` (el servidor aplica el parche sin comparar
 * `rev`, igual que en `customer.update`) y por eso viaja como parche y no como
 * foto completa.
 *
 * `stock` no viaja nunca, por lo mismo que en el alta.
 *
 * `prices` y `comboItems` se **reemplazan en bloque** cuando vienen, así que una
 * lista vacía no se manda: el formulario de producto no edita combos, de modo que
 * un `[]` significaría "este formulario no sabe de combos" y borraría las líneas
 * del combo en el servidor.
 *
 * `priceGroupId` ya no es un campo del producto en este cliente (esquema 6) pero
 * el parche admite `null` para poder **desvincular** en el servidor lo que quedó
 * agrupado: lo manda `toV6` y nadie más. `null` viaja; `undefined` se descarta
 * (ver `prune` en lib/sync/queue), que es justo la distinción que hace falta.
 */
export function queueProductUpdate(
  productId: ID,
  patch: Partial<Product> & { priceGroupId?: ID | null },
) {
  const payload: Record<string, unknown> = { productId };

  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.categoryId !== undefined) payload.categoryId = patch.categoryId;
  if (patch.imageUrl !== undefined) payload.imageUrl = wireImageUrl(patch.imageUrl);
  if (patch.minStock !== undefined) payload.minStock = patch.minStock;
  if (patch.active !== undefined) payload.active = patch.active;
  if (patch.bsOnly !== undefined) payload.bsOnly = patch.bsOnly;
  // Igual que en el alta: si el producto pasa a venderse sólo en Bs, su precio en
  // Bs tiene que ir en el **mismo** parche o el servidor lo rechaza.
  if (patch.bsPrice !== undefined) payload.bsPrice = patch.bsPrice;
  else if (patch.bsOnly) payload.bsPrice = 0;
  if (patch.priceGroupId !== undefined) payload.priceGroupId = patch.priceGroupId;
  if (patch.isCombo !== undefined) payload.isCombo = patch.isCombo;
  if (patch.allowCustomization !== undefined) payload.allowCustomization = patch.allowCustomization;
  if (patch.customizationPrice !== undefined) payload.customizationPrice = patch.customizationPrice;
  if (patch.prices?.length) payload.prices = patch.prices.map(wirePrice);
  if (patch.comboItems?.length) payload.comboItems = patch.comboItems.map(wireComboItem);

  enqueueMutation("product.update", payload);
}

/* ── Precios ──────────────────────────────────────────── */

/**
 * `productPrice.set`: fija **una** celda `(producto, tipo de precio)`.
 *
 * La celda es la unidad de conflicto: el servidor resuelve con LWW por celda, así
 * que dos cajas que corrigen a la vez el precio Mayor y el precio Detal del mismo
 * producto **sobreviven las dos**. Por eso se encola una mutación por cada celda
 * que de verdad cambió y no un `product.update` con la lista `prices` completa:
 * esa lista se reemplaza en bloque en el servidor, de modo que mandarla haría que
 * el último en sincronizar pisara la corrección del otro con el valor viejo que
 * tenía en su copia local.
 *
 * Sólo la usa la corrección de una alerta de precio bajo en **USD** (ver
 * `applyPriceAlertFix` en lib/catalog). El formulario de producto no la necesita:
 * su `product.update` ya manda `prices` completo. Y la corrección de un producto
 * `bsOnly` tampoco: ésa va por `product.update` con `bsOnly` + `bsPrice`, porque
 * el precio en Bs vive en otra tabla y no es una celda de esta rejilla.
 *
 * `amount` tiene que ser ≥ 0 (`@Min(0)` en `SetPriceDto`): un negativo es un
 * rechazo **permanente**, y un rechazo permanente saca la mutación de la cola y
 * deja el precio corregido sólo en este navegador. Quien llama valida antes.
 */
export function queueProductPriceSet(productId: ID, priceTypeId: ID, amount: number) {
  enqueueMutation("productPrice.set", { productId, priceTypeId, amount });
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

/* ── Cierres ──────────────────────────────────────────── */

/**
 * `closure.create`. El servidor recalcula lo **esperado** desde sus propias
 * ventas y abonos (`ClosuresService.draft`); lo único que viaja del cierre local
 * es lo que el cajero contó de verdad: `byMethod[].received`, ya en USD (el
 * mismo número que se guarda en el cierre local, ver `cierre.tsx`). `expected`,
 * `expectedAmount`/`receivedAmount` por moneda, `rate` y los totales del día no
 * son parte de `CreateClosureDto`: son derivados y el servidor los descarta si
 * llegaran.
 *
 * "Gana el primero" (§5): si otra caja cerró antes ese mismo día contable, el
 * servidor responde `rejected`/`already_closed` con **su** cierre. El motor
 * (`engine.ts`) adopta esa respuesta como `serverEntity`, y `apply.ts` tiene que
 * sustituir el cierre local de esa fecha —así tenga otro id— por el del
 * servidor: dos cierres sin red para el mismo día nunca deben coexistir.
 */
export function queueClosureCreate(closure: DailyClosure) {
  enqueueMutation(
    "closure.create",
    {
      id: closure.id,
      date: closure.date,
      byMethod: closure.byMethod.map((m) => ({
        methodId: m.methodId,
        // Nunca negativo: un valor fuera de rango es un rechazo permanente
        // (`@Min(0)` en `ClosureMethodDto`) que sacaría la mutación de la cola
        // sin que el cierre llegara jamás al servidor.
        received: Math.max(0, Math.round(m.received * 100) / 100),
      })),
      note: closure.note,
    },
    { at: closure.closedAt },
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
