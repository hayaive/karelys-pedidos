/**
 * Aplica al store local lo que manda el servidor: el estado inicial
 * (`GET /bootstrap`), el delta (`GET /sync`) y la entidad que devuelve cada
 * mutación confirmada.
 *
 * Todo pasa por `mutate()`, el mismo camino que usa la UI, **una sola vez por
 * ciclo**: un `mutate` por entidad dispararía un render por colección.
 *
 * Las cuatro reglas que gobiernan este archivo:
 *
 *  1. **El delta funde, nunca poda.** `GET /sync` es incremental: una colección que
 *     no viene, o que viene con tres filas, no dice nada de las demás. Ahí los
 *     borrados llegan **sólo** por `deletions` (tombstones).
 *  2. **El bootstrap es autoritativo en lo que manda completo.** `GET /bootstrap`
 *     no es un delta: para el catálogo, los clientes, los usuarios y los roles es
 *     *la* foto del servidor, así que una ausencia ahí sí significa "no existe" y
 *     la colección local se **reemplaza** (ver `applyBootstrap`).
 *  3. **Lo que tiene una mutación pendiente no se pisa ni se borra.** Mientras la
 *     cola no confirme, la copia local es la que el cajero está viendo y tocando, y
 *     el servidor todavía no puede saber que existe.
 *  4. **Las colecciones acotadas por ventana nunca se reemplazan.** Pedidos,
 *     ventas, movimientos, cierres, tasas y bitácora llegan recortados a propósito
 *     (`BOOTSTRAP_WINDOW_DAYS` y compañía): reemplazarlas borraría historial local
 *     legítimo que el servidor sí tiene pero no mandó.
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

/**
 * Reemplazo autoritativo. Para las colecciones que `GET /bootstrap` manda
 * **completas** (catálogo, clientes, usuarios, roles), `remote` no es un lote de
 * novedades: es la colección entera tal como existe en el servidor. Lo que no está
 * ahí, no está.
 *
 * Es lo contrario de `upsert` y la diferencia importa: fundir la foto completa
 * dejaba para siempre los datos de ejemplo de la semilla —los 20 clientes de
 * prueba— en cuanto el equipo se conectaba a un backend real con la lista vacía. No
 * había tombstone que los quitara porque el servidor nunca supo que existían: nadie
 * los borró allí, nunca estuvieron.
 *
 * Lo que **sí** sobrevive a la poda:
 *
 *  · lo que el servidor mandó (se funde con `merge`, para no perder lo que es local
 *    por naturaleza: la contraseña del usuario, el stock estimado del producto);
 *  · lo que tiene una **mutación pendiente** en la cola (`pendingIds`): se creó o se
 *    editó aquí y todavía no ha subido, así que su ausencia en la foto no es una
 *    decisión del servidor sino el retraso de la cola. Borrarlo sería tirar el
 *    trabajo de un turno sin red;
 *  · lo que `protect` marque (el usuario de la sesión y su rol: ver `applyBootstrap`).
 *
 * El orden pasa a ser el del servidor —que es el que tiene criterio: clientes por
 * nombre, productos por código— y los locales conservados van al final.
 */
function replaceAuthoritative<T extends WithId>(
  local: T[],
  remote: T[] | undefined,
  pendingIds: Set<string>,
  merge: (local: T, remote: T) => T = remoteWins,
  protect?: (local: T) => boolean,
): T[] {
  // `undefined` es "el servidor no mandó esta colección" (una respuesta más vieja,
  // un campo que aún no existe) y **no** es lo mismo que `[]`, que es "está vacía".
  // Confundirlos aquí borraría el catálogo entero por un campo que falta.
  if (!remote) return local;

  const mineById = new Map(local.map((x) => [x.id, x]));
  const incoming = new Set(remote.map((r) => r.id));

  const next = remote.map((r) => {
    const mine = mineById.get(r.id);
    return mine ? merge(mine, r) : r;
  });

  for (const mine of local) {
    if (incoming.has(mine.id)) continue;
    if (pendingIds.has(mine.id) || protect?.(mine)) next.push(mine);
  }

  return next;
}

const byCreatedDesc = (a: { createdAt: string }, b: { createdAt: string }) =>
  b.createdAt.localeCompare(a.createdAt);

/**
 * Une códigos de producto retirados sin achicar nunca la lista local: un
 * bootstrap más viejo, o uno que traiga una ventana distinta, no debe hacer
 * que `nextProductCode` (lib/catalog) vuelva a ofrecer un código que el
 * servidor ya rechazaría. Ver el comentario de `retiredProductCodes` en
 * lib/types.
 */
function unionRetiredCodes(local: string[] | undefined, incoming: string[]): string[] {
  if (!incoming.length) return local ?? [];
  const set = new Set(local ?? []);
  for (const code of incoming) set.add(code);
  return [...set];
}

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

/**
 * Ajustes del negocio: fusión campo a campo, para no perder claves que el
 * servidor no manda. Se exporta porque `lib/sync/company.ts` la reutiliza
 * para adoptar la respuesta de `PATCH /company`: es la misma garantía de
 * degradación (un backend que aún no conoce `productCode*` no debe borrar el
 * valor que ya estaba en este equipo) que necesita aquí y en el bootstrap.
 */
export function mergeCompany(local: CompanySettings, remote: CompanySettings): CompanySettings {
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
  return [...byId.values()].sort((a, b) =>
    (a.at ?? a.createdAt).localeCompare(b.at ?? b.createdAt),
  );
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

/**
 * Venta: insert-only. Se adopta la del servidor, que ya trae la anulación si la hubo.
 *
 * La excepción es la anulación que todavía está en la cola (`sale.void`): el servidor
 * aún manda la venta como `completada` y adoptarla tal cual la revive en pantalla —
 * el cajero ve otra vez como buena una venta que acaba de anular, y el cierre del día
 * la cuenta. Anular es monótono y terminal, igual que `cancelado` en un pedido, así
 * que mientras la cola no confirme manda la anulación local.
 */
function mergeSale(local: Sale, remote: Sale, pending: boolean): Sale {
  if (!pending || local.status !== "anulada" || remote.status === "anulada") return remote;

  return {
    ...remote,
    status: local.status,
    voidedAt: local.voidedAt ?? remote.voidedAt,
    voidReason: local.voidReason ?? remote.voidReason,
    voidedByUserId: local.voidedByUserId ?? remote.voidedByUserId,
  };
}

/**
 * Cierre de caja. `closureOut` (backend) manda `byMethod[].{expected,received}`
 * en USD, `expectedUsd`/`receivedUsd`/`differenceUsd`/`rev` y poco más: no
 * conoce `rate` (la tasa BCV con la que este equipo llevó los Bs a dólares) ni,
 * por método, `currency`/`expectedAmount`/`receivedAmount` (el desglose en la
 * moneda propia del método que muestra esta pantalla) — son detalle de
 * presentación que sólo vive en el cliente. Un `remoteWins` liso los borraría
 * en cuanto el cierre local confirma o llega por delta, y la pantalla caería al
 * mismo *fallback* que ya contempla `DailyClosure` para cierres antiguos
 * (mostrar lo esperado en vez de lo contado). Aquí se conservan cuando el
 * servidor no los manda, y por id de método: si esto es un cierre ajeno que
 * ganó la carrera (`applyClosureEntity`), no hay local con quien fundir y el
 * resultado es tal cual el servidor, que es lo correcto.
 */
function mergeClosure(local: DailyClosure, remote: DailyClosure): DailyClosure {
  const localByMethod = new Map(local.byMethod.map((m) => [m.methodId, m]));
  return {
    ...remote,
    rate: remote.rate ?? local.rate,
    byMethod: remote.byMethod.map((m) => {
      const mine = localByMethod.get(m.methodId);
      return {
        ...m,
        currency: m.currency ?? mine?.currency,
        expectedAmount: m.expectedAmount ?? mine?.expectedAmount,
        receivedAmount: m.receivedAmount ?? mine?.receivedAmount,
      };
    }),
  };
}

/* ── Delta ────────────────────────────────────────────── */

/**
 * Aplica un delta. El orden es el del §6.4 (dependencias por FK):
 * company → categories → priceTypes → products → paymentMethods →
 * roles → users → customers → orders → orderDeposits → sales → movements →
 * closures → audit → deletions.
 *
 * `changes.priceGroups` puede seguir llegando y **se ignora**: el precio es del
 * producto desde el esquema 6 (ver `toV6` en lib/migrations).
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

    s.sales = upsert<Sale>(
      s.sales,
      changes.sales,
      (l, r) => mergeSale(l, r, pending.has(l.id)),
      byCreatedDesc,
    );
    s.movements = upsert<InventoryMovement>(
      s.movements,
      changes.movements,
      remoteWins,
      byCreatedDesc,
    );
    s.closures = upsert<DailyClosure>(s.closures, changes.closures, mergeClosure, (a, b) =>
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
        // El cliente ya no guarda grupos de precio (esquema 6): el tombstone
        // llega y no hay nada que borrar. Se declara igual para no caer al
        // `default`, que lo reportaría como entidad desconocida.
        break;
      case "product": {
        // El código se lee **antes** de quitar el producto: una vez borrado no
        // hay de dónde recuperarlo, y `nextProductCode` necesita saber que ese
        // código ya no está libre aunque el producto haya desaparecido.
        const removed = s.products.find((x) => x.id === id);
        if (removed) {
          s.retiredProductCodes = unionRetiredCodes(s.retiredProductCodes, [removed.code]);
        }
        s.products = s.products.filter((x) => x.id !== id);
        break;
      }
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
 * Hidrata la caché con el estado inicial. **Dos regímenes, y la diferencia es el
 * corazón de esta función.**
 *
 * ### Lo que el servidor manda completo: se reemplaza
 *
 * Catálogo (categorías, tipos de precio, productos, formas de
 * pago), clientes, usuarios y roles no están acotados por ninguna ventana: el
 * bootstrap los trae enteros, así que es la foto autoritativa y una ausencia
 * significa "ya no existe". Se aplican con `replaceAuthoritative`.
 *
 * Antes se fundían con `upsert` y el resultado era que **nada se podía quitar nunca
 * por esta vía**: un equipo recién instalado arranca con la semilla local (20
 * clientes de ejemplo), iniciaba sesión contra un backend real con `customers: []`
 * y se quedaba con los 20 para siempre. No había tombstone que los borrara porque el
 * servidor nunca supo de ellos. Lo mismo valía para productos y categorías de
 * ejemplo que no existen en el backend.
 *
 * El riesgo de podar por ausencia es real y por eso está acotado:
 *
 *  · **Lo pendiente no se toca.** Lo que tiene una mutación en la cola sobrevive:
 *    el cliente que el cajero acaba de crear sin red no está en la foto porque
 *    todavía no ha subido, no porque el servidor lo haya borrado.
 *  · **El usuario de la sesión y su rol no se tocan.** Un bootstrap a mitad de turno
 *    (cursor caducado) no debe dejar la sesión sin usuario y echar al cajero a la
 *    pantalla de inicio.
 *  · **Una colección ausente no poda nada** (ver `replaceAuthoritative`): sólo una
 *    lista presente y vacía significa "vacía".
 *
 * Integridad referencial: igual que con los tombstones (`applyDeletions`), un
 * registro local que se conserva puede quedar apuntando a algo que el servidor no
 * mandó. La aplicación ya lo tolera —`priceOf` cae a la primera celda de precio
 * cuando falta la del tipo pedido, y las listas resuelven el nombre del cliente
 * sobre la marcha— y es el precio de tener una sola fuente de verdad.
 *
 * ### Lo que llega recortado: se funde
 *
 * Pedidos, abonos, ventas, movimientos, tasas, cierres y bitácora vienen acotados
 * (`BOOTSTRAP_WINDOW_DAYS`, `BOOTSTRAP_CLOSURES_DAYS`, `BOOTSTRAP_RATES_DAYS`, las
 * últimas 200 entradas de bitácora). Reemplazarlos borraría el historial local que
 * está fuera de la ventana —legítimo, y que el servidor sí tiene pero no manda— así
 * que se fusionan por id y sus borrados siguen llegando por tombstone. Los que
 * tienen una mutación pendiente conservan además su copia local: `mergeOrder` para
 * el pedido en edición, `mergeSale` para la anulación que aún no subió y
 * `unionDeposits` para el abono cobrado sin red.
 */
export function applyBootstrap(b: BootstrapResponse) {
  const pending = pendingEntityIds();
  const keepStock = hasPendingStockEffects();

  mutate((s) => {
    s.company = mergeCompany(s.company, b.company);

    // Códigos retirados: se funden, nunca se reemplazan (ver `unionRetiredCodes`).
    // El bootstrap es autoritativo para casi todo, pero éste es un caso aparte:
    // el servidor no manda "todos los retirados desde siempre", así que una
    // lista ausente o recortada aquí no debe borrar lo que ya se sabía local.
    if (b.retiredProductCodes?.length) {
      s.retiredProductCodes = unionRetiredCodes(
        s.retiredProductCodes,
        b.retiredProductCodes.map((r) => r.code),
      );
    }

    // El usuario de la sesión y su rol se protegen de la poda: sin ellos en la caché
    // `useSession()` se queda sin permisos y la aplicación rebota al login.
    const sessionUserId = s.sessionUserId;
    const sessionRoleId = s.users.find((u) => u.id === sessionUserId)?.roleId;

    s.categories = replaceAuthoritative<Category>(s.categories, b.categories, pending);
    s.priceTypes = replaceAuthoritative<PriceType>(s.priceTypes, b.priceTypes, pending);
    // `b.priceGroups` se ignora a propósito: ver el comentario en lib/sync/types.
    s.products = replaceAuthoritative<Product>(s.products, b.products, pending, (l, r) =>
      mergeProduct(l, r, keepStock),
    );
    s.paymentMethods = replaceAuthoritative<PaymentMethod>(
      s.paymentMethods,
      b.paymentMethods,
      pending,
    );
    s.roles = replaceAuthoritative<Role>(
      s.roles,
      b.roles,
      pending,
      remoteWins,
      (r) => r.id === sessionRoleId,
    );
    s.users = replaceAuthoritative<User>(
      s.users,
      b.users,
      pending,
      mergeUser,
      (u) => u.id === sessionUserId,
    );
    s.customers = replaceAuthoritative<Customer>(s.customers, b.customers, pending);

    s.orders = upsert<Order>(
      s.orders,
      b.orders,
      (l, r) => mergeOrder(l, r, pending.has(l.id)),
      byCreatedDesc,
    );
    if (b.orderDeposits?.length) applyDeposits(s, b.orderDeposits);
    s.sales = upsert<Sale>(
      s.sales,
      b.sales,
      (l, r) => mergeSale(l, r, pending.has(l.id)),
      byCreatedDesc,
    );
    s.movements = upsert<InventoryMovement>(s.movements, b.movements, remoteWins, byCreatedDesc);
    s.rates = upsert<ExchangeRate>(s.rates, b.rates, remoteWins, byCreatedDesc);
    s.closures = upsert<DailyClosure>(s.closures, b.closures, mergeClosure, (a, x) =>
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
    case "closure":
      applyClosureEntity(serverEntity as DailyClosure);
      break;
    // Las tasas no son raíz del delta (llegan en `/bootstrap`), así que se funden aparte.
    case "rate":
      applyRate(serverEntity as ExchangeRate);
      break;
    default:
      // `productPrice.set` devuelve el padre releído; el resto no devuelve
      // entidad. Nada que adoptar.
      break;
  }
}

/**
 * Cierre confirmado (o rechazado) por `closure.create`. A diferencia del resto de
 * `applyServerEntity`, no basta con fundir por `id`: "gana el primero" (§5)
 * significa que el equipo que pierde la carrera mandó su propio id local para la
 * misma fecha, y el servidor responde con el cierre **ajeno**, de otro id. Un
 * `upsert` por id dejaría los dos —el local huérfano y el del servidor—
 * conviviendo para siempre en la lista, cuando sólo puede existir un cierre por
 * fecha. Por eso primero se retira cualquier cierre local de esa misma fecha con
 * otro id, y recién entonces se adopta el del servidor.
 */
function applyClosureEntity(closure: DailyClosure) {
  if (!closure?.id || !closure.date) return;
  mutate((s) => {
    s.closures = s.closures.filter((c) => c.id === closure.id || c.date !== closure.date);
  });
  applyDelta({ closures: [closure] });
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
