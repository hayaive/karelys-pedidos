/**
 * Aplica al store local lo que manda el servidor: el estado inicial
 * (`GET /bootstrap`), el delta (`GET /sync`) y la entidad que devuelve cada
 * mutación confirmada.
 *
 * Todo pasa por `mutate()`, el mismo camino que usa la UI, **una sola vez por
 * ciclo**: un `mutate` por entidad dispararía un render por colección.
 *
 * Las tres reglas que gobiernan este archivo:
 *
 *  1. **Upsert por id, nunca reemplazo a ciegas.** Los agregados llegan completos
 *     y reaplicarlos es inocuo, pero una colección local puede contener registros
 *     que el servidor todavía no conoce (están en la cola). Borrarlos sería perder
 *     dinero.
 *  2. **Lo que tiene una mutación pendiente no se pisa.** Mientras la cola no
 *     confirme, la copia local es la que el cajero está viendo y tocando.
 *  3. **Los borrados sólo llegan por `deletions`** (tombstones), nunca por
 *     ausencia en una lista.
 */

import { getState, mutate } from "../store";
import type {
  AppState,
  AuditLog,
  Category,
  CompanySettings,
  Customer,
  DailyClosure,
  ExchangeRate,
  ID,
  InventoryMovement,
  Order,
  OrderDeposit,
  OrderStatus,
  PaymentMethod,
  PriceGroup,
  PriceType,
  Product,
  Role,
  Sale,
  User,
} from "../types";
import { hasPendingStockEffects, pendingEntityIds } from "./queue";
import type { BootstrapResponse, DeltaChanges, DeltaDeletion } from "./types";

/* ── Utilidades ───────────────────────────────────────── */

interface WithId {
  id: ID;
}

/**
 * Funde `incoming` en `list` por id. Los que ya estaban se actualizan **en su
 * sitio** (para no reordenar una lista que la UI está mostrando) y los nuevos se
 * añaden al final; `sort` reordena después si esa colección tiene un orden.
 */
function upsert<T extends WithId>(
  list: T[],
  incoming: T[] | undefined,
  merge: (local: T, remote: T) => T,
  sort?: (a: T, b: T) => number,
): T[] {
  if (!incoming?.length) return list;

  const byId = new Map(list.map((x, i) => [x.id, i]));
  const next = [...list];

  for (const remote of incoming) {
    const at = byId.get(remote.id);
    if (at === undefined) {
      next.push(remote);
      byId.set(remote.id, next.length - 1);
    } else {
      next[at] = merge(next[at], remote);
    }
  }

  return sort ? next.sort(sort) : next;
}

/** El servidor manda el agregado completo: por defecto gana tal cual. */
const remoteWins = <T>(_local: T, remote: T): T => remote;

const byCreatedDesc = (a: { createdAt: string }, b: { createdAt: string }) =>
  b.createdAt.localeCompare(a.createdAt);

/* ── Fusiones por entidad ─────────────────────────────── */

/**
 * Producto. `stock` es **propiedad del servidor** (sólo lo mueve un movimiento de
 * inventario), así que normalmente se adopta.
 *
 * La excepción: mientras haya ventas o movimientos en la cola, el `stock` del
 * servidor todavía no los incluye y adoptarlo haría que la existencia diera un
 * salto hacia arriba para volver a bajar cuando la cola llegue. Mientras eso pasa
 * manda el cálculo local, que es la mejor estimación que tiene este equipo. Al
 * vaciarse la cola, el número del servidor gana y ambos convergen.
 */
function mergeProduct(local: Product, remote: Product, keepLocalStock: boolean): Product {
  return { ...remote, stock: keepLocalStock ? local.stock : remote.stock };
}

/** Usuario. La contraseña en claro del modelo local no viaja: se conserva la que hubiera. */
function mergeUser(local: User, remote: User): User {
  return { ...remote, password: local.password };
}

/** Ajustes del negocio: fusión campo a campo, para no perder claves que el servidor no manda. */
function mergeCompany(local: CompanySettings, remote: CompanySettings): CompanySettings {
  return {
    ...local,
    ...remote,
    // Los atajos de teclado pueden no existir en el servidor todavía.
    shortcuts: remote.shortcuts ?? local.shortcuts,
  };
}

const STATUS_RANK: Record<OrderStatus, number> = {
  pendiente: 0,
  preparacion: 1,
  listo: 2,
  procesado: 3,
  cancelado: 4,
};

/**
 * La máquina de estados del pedido es **monótona** y sólo avanza; `cancelado` es
 * rama terminal y gana. Así dos dispositivos que empujan el mismo pedido nunca
 * pelean: se queda el más avanzado de los dos.
 */
function advancedStatus(a: OrderStatus, b: OrderStatus): OrderStatus {
  if (a === "cancelado" || b === "cancelado") return "cancelado";
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/**
 * Abonos de un pedido: **unión por id**, con la versión del servidor ganando en
 * los que coinciden.
 *
 * Es la regla del contrato ("siempre se fusionan") y además es lo único correcto
 * aquí: un abono registrado sin red vive sólo en local hasta que la cola lo suba,
 * y reemplazar la lista por la del servidor lo haría desaparecer de la pantalla —
 * con el saldo del pedido cambiando delante del cliente.
 */
function unionDeposits(local: OrderDeposit[] = [], remote: OrderDeposit[] = []): OrderDeposit[] {
  const byId = new Map<ID, OrderDeposit>();
  for (const d of local) byId.set(d.id, d);
  for (const d of remote) byId.set(d.id, { ...byId.get(d.id), ...d });
  return [...byId.values()].sort((a, b) => (a.at ?? a.createdAt).localeCompare(b.at ?? b.createdAt));
}

/**
 * Pedido. Si tiene una mutación pendiente, el contenido local (líneas, notas,
 * cliente) se conserva y sólo se adoptan los campos que son del servidor: su
 * número definitivo, el `rev` y la venta que lo facturó. El estado se resuelve
 * hacia adelante.
 */
function mergeOrder(local: Order, remote: Order, pending: boolean): Order {
  const deposits = unionDeposits(local.deposits, remote.deposits);
  const status = advancedStatus(local.status, remote.status);

  if (!pending) return { ...remote, status, deposits };

  return {
    ...local,
    status,
    deposits,
    number: remote.number,
    clientNumber: remote.clientNumber,
    businessDate: remote.businessDate,
    receivedAt: remote.receivedAt,
    saleId: remote.saleId ?? local.saleId,
    canceledAt: remote.canceledAt ?? local.canceledAt,
    cancelReason: remote.cancelReason ?? local.cancelReason,
    rev: remote.rev,
  };
}

/** Venta: insert-only. Se adopta la del servidor, que ya trae la anulación si la hubo. */
const mergeSale = (_local: Sale, remote: Sale): Sale => remote;

/* ── Delta ────────────────────────────────────────────── */

/**
 * Aplica un delta. El orden es el del §6.4 (dependencias por FK):
 * company → categories → priceTypes → priceGroups → products → paymentMethods →
 * roles → users → customers → orders → orderDeposits → sales → movements →
 * closures → audit → deletions.
 *
 * Se recorre explícitamente en ese orden en lugar de iterar `Object.keys`: el
 * orden de las claves de un JSON no es contractual.
 */
export function applyDelta(changes: DeltaChanges, deletions: DeltaDeletion[] = []) {
  const pending = pendingEntityIds();
  const keepStock = hasPendingStockEffects();

  mutate((s) => {
    if (changes.company) s.company = mergeCompany(s.company, changes.company);

    s.categories = upsert<Category>(s.categories, changes.categories, remoteWins);
    s.priceTypes = upsert<PriceType>(s.priceTypes, changes.priceTypes, remoteWins);
    s.priceGroups = upsert<PriceGroup>(s.priceGroups, changes.priceGroups, remoteWins);
    s.products = upsert<Product>(s.products, changes.products, (l, r) =>
      mergeProduct(l, r, keepStock),
    );
    s.paymentMethods = upsert<PaymentMethod>(s.paymentMethods, changes.paymentMethods, remoteWins);
    s.roles = upsert<Role>(s.roles, changes.roles, remoteWins);
    s.users = upsert<User>(s.users, changes.users, mergeUser);
    s.customers = upsert<Customer>(s.customers, changes.customers, remoteWins);

    s.orders = upsert<Order>(
      s.orders,
      changes.orders,
      (l, r) => mergeOrder(l, r, pending.has(l.id)),
      byCreatedDesc,
    );

    // Los abonos son raíz propia en el delta (tienen su `rev`): llegan sueltos y
    // hay que meterlos en su pedido, que puede no venir en esta misma página.
    if (changes.orderDeposits?.length) applyDeposits(s, changes.orderDeposits);

    s.sales = upsert<Sale>(s.sales, changes.sales, mergeSale, byCreatedDesc);
    s.movements = upsert<InventoryMovement>(
      s.movements,
      changes.movements,
      remoteWins,
      byCreatedDesc,
    );
    s.closures = upsert<DailyClosure>(s.closures, changes.closures, remoteWins, (a, b) =>
      b.date.localeCompare(a.date),
    );
    s.audit = upsert<AuditLog>(s.audit, changes.audit, remoteWins, byCreatedDesc).slice(0, 500);

    if (deletions.length) applyDeletions(s, deletions);
  });
}

function applyDeposits(s: AppState, deposits: OrderDeposit[]) {
  const byOrder = new Map<ID, OrderDeposit[]>();
  for (const d of deposits) {
    if (!d.orderId) continue;
    const list = byOrder.get(d.orderId) ?? [];
    list.push(d);
    byOrder.set(d.orderId, list);
  }

  for (const [orderId, incoming] of byOrder) {
    const order = s.orders.find((o) => o.id === orderId);
    // Un abono de un pedido que este equipo no tiene (quedó fuera de la ventana de
    // bootstrap) se descarta: sin el pedido no hay saldo que recalcular, y el
    // pedido llegará con sus abonos dentro si vuelve a cambiar.
    if (!order) continue;
    order.deposits = unionDeposits(order.deposits, incoming);
  }
}

/**
 * Tombstones. El servidor los nombra en snake_case singular
 * (`product`, `customer`, `order`, `category`, `price_type`, `price_group`,
 * `role`, `user`, `payment_method`).
 *
 * Un registro con mutación pendiente **no se borra**: primero tiene que resolverse
 * su mutación, y si de verdad ya no existe el servidor la rechazará.
 */
function applyDeletions(s: AppState, deletions: DeltaDeletion[]) {
  const pending = pendingEntityIds();

  for (const { entity, id } of deletions) {
    if (pending.has(id)) continue;

    switch (entity) {
      case "category":
        s.categories = s.categories.filter((x) => x.id !== id);
        break;
      case "price_type":
        s.priceTypes = s.priceTypes.filter((x) => x.id !== id);
        break;
      case "price_group":
        s.priceGroups = s.priceGroups.filter((x) => x.id !== id);
        break;
      case "product":
        s.products = s.products.filter((x) => x.id !== id);
        break;
      case "customer":
        s.customers = s.customers.filter((x) => x.id !== id);
        break;
      case "user":
        s.users = s.users.filter((x) => x.id !== id);
        break;
      case "role":
        s.roles = s.roles.filter((x) => x.id !== id);
        break;
      case "payment_method":
        s.paymentMethods = s.paymentMethods.filter((x) => x.id !== id);
        break;
      case "order":
        s.orders = s.orders.filter((x) => x.id !== id);
        break;
      default:
        console.warn(`[sync] tombstone de una entidad desconocida: ${entity}`);
    }
  }
}

/* ── Bootstrap ────────────────────────────────────────── */

/**
 * Hidrata la caché con el estado inicial.
 *
 * **Sólo funde, nunca borra.** Podría parecer que el catálogo y los clientes, que
 * el servidor manda completos, permiten deducir un borrado por ausencia —"si el
 * servidor no lo manda, ya no existe"— y ésa fue la primera versión de esto. Es
 * una mala idea, y se vio en cuanto se probó contra un backend real recién
 * sembrado:
 *
 *  1. **Rompe la integridad referencial.** Ese backend tenía una categoría y
 *     ningún producto: la poda se llevó las otras seis categorías locales y dejó
 *     decenas de productos apuntando a categorías que ya no estaban. Los productos
 *     no se podaron —esa colección venía vacía— así que el resultado no fue un
 *     catálogo limpio sino uno a medio romper.
 *  2. **Duplica un mecanismo que el contrato ya resuelve.** Los borrados viajan
 *     como tombstones (`deletions`, §4.4) precisamente para que el cliente no
 *     tenga que adivinarlos por ausencia. Deducirlos además por omisión es tener
 *     dos fuentes de verdad para lo mismo, y una de ellas equivocada.
 *
 * Consecuencia aceptada: los datos de ejemplo de la semilla (los 20 clientes de
 * prueba) siguen ahí después de conectar el equipo a un backend real, y un
 * dispositivo tan viejo que perdió los tombstones (`cursor_too_old`) puede
 * conservar algo que el servidor ya borró hasta que esa entidad vuelva a cambiar.
 * Las dos cosas se resuelven con una acción deliberada —importar el catálogo,
 * reiniciar la caché— y no con un borrado silencioso: conservar un registro de más
 * es mucho más barato que perder uno por descuido.
 *
 * Ventas, pedidos, movimientos, cierres, tasas y bitácora llegan además
 * **recortados a una ventana**: una caché no es el libro mayor.
 */
export function applyBootstrap(b: BootstrapResponse) {
  const pending = pendingEntityIds();
  const keepStock = hasPendingStockEffects();

  mutate((s) => {
    s.company = mergeCompany(s.company, b.company);

    s.categories = upsert<Category>(s.categories, b.categories, remoteWins);
    s.priceTypes = upsert<PriceType>(s.priceTypes, b.priceTypes, remoteWins);
    s.priceGroups = upsert<PriceGroup>(s.priceGroups, b.priceGroups, remoteWins);
    s.products = upsert<Product>(s.products, b.products, (l, r) => mergeProduct(l, r, keepStock));
    s.paymentMethods = upsert<PaymentMethod>(s.paymentMethods, b.paymentMethods, remoteWins);
    s.roles = upsert<Role>(s.roles, b.roles, remoteWins);
    s.users = upsert<User>(s.users, b.users, mergeUser);
    s.customers = upsert<Customer>(s.customers, b.customers, remoteWins);

    s.orders = upsert<Order>(
      s.orders,
      b.orders,
      (l, r) => mergeOrder(l, r, pending.has(l.id)),
      byCreatedDesc,
    );
    if (b.orderDeposits?.length) applyDeposits(s, b.orderDeposits);
    s.sales = upsert<Sale>(s.sales, b.sales, mergeSale, byCreatedDesc);
    s.movements = upsert<InventoryMovement>(s.movements, b.movements, remoteWins, byCreatedDesc);
    s.rates = upsert<ExchangeRate>(s.rates, b.rates, remoteWins, byCreatedDesc);
    s.closures = upsert<DailyClosure>(s.closures, b.closures, remoteWins, (a, x) =>
      x.date.localeCompare(a.date),
    );
    s.audit = upsert<AuditLog>(s.audit, b.audit, remoteWins, byCreatedDesc).slice(0, 500);
  });
}

/* ── Entidad devuelta por una mutación ────────────────── */

/**
 * Adopta el `serverEntity` de un resultado de `POST /sync`: reemplaza la copia
 * local por la del servidor, que es la que trae el número definitivo, los totales
 * recalculados y el `rev`.
 *
 * Es lo que hace que un ticket renumerado, o una venta cuyo total el servidor
 * recalculó, se vea correcto en la pantalla sin esperar al siguiente poll.
 */
export function applyServerEntity(entity: string, serverEntity: unknown) {
  if (!serverEntity || typeof serverEntity !== "object") return;

  switch (entity) {
    case "sale":
      applyDelta({ sales: [serverEntity as Sale] });
      break;
    case "order":
      applyDelta({ orders: [serverEntity as Order] });
      break;
    case "orderDeposit":
      applyDelta({ orderDeposits: [serverEntity as OrderDeposit] });
      break;
    case "movement":
      applyDelta({ movements: [serverEntity as InventoryMovement] });
      break;
    case "customer":
      applyDelta({ customers: [serverEntity as Customer] });
      break;
    case "product":
      applyDelta({ products: [serverEntity as Product] });
      break;
    case "priceGroup":
      applyDelta({ priceGroups: [serverEntity as PriceGroup] });
      break;
    case "closure":
      applyDelta({ closures: [serverEntity as DailyClosure] });
      break;
    // Las tasas no son raíz del delta (llegan en `/bootstrap`), así que se funden aparte.
    case "rate":
      applyRate(serverEntity as ExchangeRate);
      break;
    default:
      // `productPrice.set` y `priceGroupPrice.set` devuelven el padre releído; el
      // resto no devuelve entidad. Nada que adoptar.
      break;
  }
}

function applyRate(rate: ExchangeRate) {
  if (!rate?.id) return;
  mutate((s) => {
    s.rates = upsert<ExchangeRate>(s.rates, [rate], remoteWins, byCreatedDesc);
  });
}

/**
 * Reapunta un id local al que asignó el servidor (`idMap`), que es lo que ocurre
 * cuando dos dispositivos crean el mismo cliente sin verse: el servidor **fusiona**
 * por cédula y devuelve su id.
 *
 * Hay que reapuntar todo lo que colgaba del id local, o quedan pedidos y ventas
 * señalando a un cliente que ya no existe.
 */
export function remapId(entity: string, localId: ID, serverId: ID) {
  if (localId === serverId) return;

  mutate((s) => {
    switch (entity) {
      case "customer": {
        const local = s.customers.find((c) => c.id === localId);
        if (local) s.customers = s.customers.filter((c) => c.id !== localId);
        for (const o of s.orders) if (o.customerId === localId) o.customerId = serverId;
        for (const v of s.sales) if (v.customerId === localId) v.customerId = serverId;
        break;
      }
      case "product": {
        for (const m of s.movements) if (m.productId === localId) m.productId = serverId;
        for (const list of [s.sales, s.orders]) {
          for (const doc of list) {
            for (const item of doc.items) if (item.productId === localId) item.productId = serverId;
          }
        }
        s.products = s.products.filter((p) => p.id !== localId);
        break;
      }
      default:
        console.warn(`[sync] idMap para una entidad no contemplada: ${entity}`);
    }
  });
}

/** El estado actual, para quien necesite leer sin hook (el motor). */
export const snapshot = (): AppState => getState();
