/**
 * Borrado de clientes y productos: al contrario de su alta y su edición
 * (`customer.create`/`update`, `product.create`/`update`), que sí viajan por la
 * cola de `POST /sync` y funcionan sin conexión, el borrado **no tiene mutación
 * de cola**. El backend sólo lo expone por REST (`DELETE /customers/:id`,
 * `DELETE /products/:id`), así que —igual que las categorías y los tipos de
 * precio en `categories.ts`/`price-types.ts`— gestionarlo exige ir primero al
 * servidor y sólo si confirma, tocar el estado local. Nunca al revés, o un
 * borrado que el servidor rechaza (tiene historial) desaparecería igual de esta
 * pantalla y volvería en el siguiente `/bootstrap`, que es autoritativo.
 *
 * En build sin backend (`VITE_API_URL=off`) no hay con quién confirmar nada:
 * se borra sólo en local, como antes.
 */

import { logAudit, mutate } from "../store";
import type { Customer, ID, Product } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus } from "./engine";
import { pendingMutations } from "./queue";
import { hasRemoteSession, isPairedWithBackend } from "./session";

export type DeletionAccess =
  /** Hay con qué hablar con el backend: el borrado va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se borra en local, como antes. */
  | { mode: "local" }
  /** No se puede borrar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se puede borrar un cliente o un producto ahora mismo? Mismas comprobaciones
 * que `categoryAccess()`/`priceTypeAccess()`, en el mismo orden (lo que el
 * usuario puede arreglar primero), porque el borrado —igual que esas dos
 * entidades— no tiene camino offline: sin servidor con quien confirmar, la
 * única opción honesta es bloquear, no fingir un borrado que puede volver.
 */
export function deletionAccess(nounPlural: string): DeletionAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason: `Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para eliminar ${nounPlural}.`,
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason: `Entraste sin conexión. Vuelve a iniciar sesión con conexión para eliminar ${nounPlural}.`,
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: `Necesitas conexión para eliminar ${nounPlural}.` };
  }
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason: `El servidor no responde ahora mismo. Necesitas conexión para eliminar ${nounPlural}.`,
    };
  }

  return { mode: "remote" };
}

/** Mensaje corto y en cristiano para el toast de error. */
export function deletionErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) {
    if (err.code === "has_history") {
      return "Tiene historial y no se puede eliminar: desactívalo en su lugar.";
    }
    return err.message;
  }
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

/**
 * ¿Este registro tiene todavía una mutación sin subir (se creó o se editó sin
 * red y la cola no lo ha confirmado)? Borrarlo ahora tiene dos caminos malos:
 * en local sería borrar algo que el servidor ni siquiera conoce (nada que
 * confirmar, y si luego sube el alta el "borrado" nunca ocurrió allí); contra
 * el servidor, un `DELETE` de un id que no existe todavía sólo puede fallar.
 * Ninguno de los dos es lo que el cajero espera, así que se bloquea con un
 * motivo claro hasta que la cola confirme el alta o la edición pendiente.
 */
function hasPendingMutation(entity: "customer" | "product", id: ID): boolean {
  return pendingMutations().some((m) => {
    if (m.entity !== entity) return false;
    const p = m.payload;
    return p.id === id || p.customerId === id || p.productId === id;
  });
}

/* ── Clientes ─────────────────────────────────────────── */

/**
 * Elimina un cliente. El servidor lo niega con `has_history` (409) si tiene
 * ventas o pedidos (`sales.customer_id`/`orders.customer_id` son `RESTRICT`),
 * así que la comprobación local previa es cortesía, no la garantía.
 */
export async function deleteCustomer(customer: Customer): Promise<void> {
  if (hasPendingMutation("customer", customer.id)) {
    throw new Error(
      "Este cliente se creó o se editó sin conexión y todavía no se sincronizó. Espera a que suba y vuelve a intentar.",
    );
  }

  const access = deletionAccess("clientes");
  if (access.mode === "blocked") throw new Error(access.reason);

  if (access.mode === "remote") {
    await apiFetch<void>(`/customers/${encodeURIComponent(customer.id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    st.customers = st.customers.filter((x) => x.id !== customer.id);
    logAudit("cliente_eliminado", "customer", customer.id);
  });
}

/* ── Productos ────────────────────────────────────────── */

/**
 * Elimina un producto. El servidor lo niega con `has_history` (409) si tiene
 * ventas, pedidos, movimientos o si es componente de un combo, así que la
 * comprobación local previa es cortesía, no la garantía. Cuando sí confirma,
 * también retira el código (`retiredProductCode`): se refleja lo mismo en
 * `retiredProductCodes` local para que `nextProductCode` no vuelva a
 * ofrecerlo mientras llega el tombstone del siguiente delta.
 */
export async function deleteProduct(product: Product): Promise<void> {
  if (hasPendingMutation("product", product.id)) {
    throw new Error(
      "Este producto se creó o se editó sin conexión y todavía no se sincronizó. Espera a que suba y vuelve a intentar.",
    );
  }

  const access = deletionAccess("productos");
  if (access.mode === "blocked") throw new Error(access.reason);

  if (access.mode === "remote") {
    await apiFetch<void>(`/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    const retirados = new Set(st.retiredProductCodes ?? []);
    retirados.add(product.code);
    st.retiredProductCodes = [...retirados];
    st.products = st.products.filter((x) => x.id !== product.id);
    logAudit("producto_eliminado", "product", product.id);
  });
}
