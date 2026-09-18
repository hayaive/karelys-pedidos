/**
 * Tipos de precio: el mismo problema que resuelve `categories.ts`, y la misma
 * solución.
 *
 * El backend también los declara `ONLINE_ONLY` (ver `sync/mutations/registry.ts`
 * allí): no hay mutación de `POST /sync` que los cree, renombre, marque
 * predeterminado o borre, así que gestionarlos sólo en local con `mutate(...)`
 * —como hacía hasta ahora `Precios` en `ajustes.tsx`— se pierde en el siguiente
 * `/bootstrap`, que es autoritativo y no conoce el cambio. Y el negocio depende de
 * que "Mayor" sea el tipo de precio por defecto: perder ese ajuste no es cosmético,
 * cambia con qué precio arranca el POS.
 *
 * Mismo orden que categorías: primero el servidor, y sólo si confirma, el estado
 * local. En build sin backend (`VITE_API_URL=off`) se sigue gestionando en local,
 * porque ahí no hay bootstrap que pode el cambio.
 */

import { logAudit, mutate } from "../store";
import { slug, uid } from "../ids";
import type { ID, PriceType } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus, useSyncStatus } from "./engine";
import { hasRemoteSession, isPairedWithBackend } from "./session";

/** Lo que devuelve el backend (`priceTypeOut`) en el alta y en la edición. */
interface PriceTypeWire {
  id: string;
  name: string;
  isDefault: boolean;
  position?: number;
  rev?: number;
}

/** Tope de `name` en `CreatePriceTypeDto` / `UpdatePriceTypeDto`. */
const NAME_MAX = 60;

export type PriceTypeAccess =
  /** Hay con qué hablar con el backend: cada cambio va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se gestiona en local, como antes. */
  | { mode: "local" }
  /** No se puede gestionar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se pueden gestionar tipos de precio ahora mismo? Calcado de
 * `categoryAccess()`: mismas comprobaciones, mismo orden (lo que el usuario puede
 * arreglar primero), y el mismo motivo por el que `isPairedWithBackend()` y
 * `hasRemoteSession()` son distintas (ver `session.ts`).
 */
export function priceTypeAccess(): PriceTypeAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason:
        "Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para gestionar tipos de precio.",
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason:
        "Entraste sin conexión. Vuelve a iniciar sesión con conexión para gestionar tipos de precio.",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: "Necesitas conexión para gestionar tipos de precio." };
  }
  // El último ciclo no alcanzó el servidor (sin red, caído o un 5xx). Reintentarlo
  // es pulsar el indicador de sincronización de la cabecera.
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason:
        "El servidor no responde ahora mismo. Necesitas conexión para gestionar tipos de precio.",
    };
  }

  return { mode: "remote" };
}

/**
 * Lo mismo, para la interfaz: se recalcula cuando cambia el estado del motor, que
 * ya escucha los eventos `online`/`offline` del navegador y marca la fase
 * `offline` cuando el servidor no contesta.
 */
export function usePriceTypeAccess(): PriceTypeAccess {
  useSyncStatus();
  return priceTypeAccess();
}

/** Mensaje corto y en cristiano para el toast de error. */
export function priceTypeErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) {
    // `has_history`: el servicio lo niega porque hay ventas, pedidos o precios de
    // producto que referencian este tipo de precio (`ON DELETE RESTRICT`). El
    // mensaje del backend ya es correcto, pero éste es más concreto para quien
    // sólo ve el toast.
    if (err.code === "has_history") {
      return "No se puede eliminar: hay ventas o productos con este tipo de precio";
    }
    return err.message;
  }
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

/* ── Operaciones ──────────────────────────────────────── */

/**
 * Crea un tipo de precio.
 *
 * El `id` **no** se manda: lo acuña el servidor con el mismo criterio semántico
 * que la semilla local (`pt-<slug>`), así que las dos convergen, y el alta es
 * idempotente por ese id igual que en categorías.
 */
export async function createPriceType(rawName: string): Promise<PriceType> {
  const name = cleanName(rawName);
  const access = requireAccess();

  if (access.mode === "local") {
    const base = slug(name);
    const local: PriceType = { id: base ? `pt-${base}` : uid(), name, isDefault: false };
    mutate((st) => {
      const i = st.priceTypes.findIndex((p) => p.id === local.id);
      if (i >= 0) st.priceTypes[i] = { ...st.priceTypes[i], name };
      else st.priceTypes.push(local);
      logAudit("tipo_precio_creado", "price_type", local.id, { name });
    });
    return local;
  }

  const row = await apiFetch<PriceTypeWire>("/price-types", { method: "POST", body: { name } });
  return adopt(row, "tipo_precio_creado");
}

/** Renombra un tipo de precio. El parche lleva sólo `name`: `isDefault` no se toca aquí. */
export async function renamePriceType(id: ID, rawName: string): Promise<PriceType> {
  const name = cleanName(rawName);
  const access = requireAccess();

  if (access.mode === "local") {
    let result: PriceType | undefined;
    mutate((st) => {
      const pt = st.priceTypes.find((x) => x.id === id);
      if (pt) pt.name = name;
      result = pt;
      logAudit("tipo_precio_editado", "price_type", id, { name });
    });
    if (!result) throw new Error("El tipo de precio ya no existe");
    return result;
  }

  const row = await apiFetch<PriceTypeWire>(`/price-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { name },
  });
  return adopt(row, "tipo_precio_editado");
}

/**
 * Marca un tipo de precio como predeterminado.
 *
 * El servidor desmarca el anterior dentro de la misma transacción (el índice
 * único parcial sólo admite un `isDefault`), así que aquí se refleja lo mismo en
 * local: sólo el que se acaba de confirmar queda con `isDefault`, en vez de
 * esperar al siguiente ciclo de sync para que no se vean dos "Predeterminado" a
 * la vez.
 */
export async function setDefaultPriceType(id: ID): Promise<PriceType> {
  const access = requireAccess();

  if (access.mode === "local") {
    let result: PriceType | undefined;
    mutate((st) => {
      st.priceTypes.forEach((x) => (x.isDefault = x.id === id));
      result = st.priceTypes.find((x) => x.id === id);
      logAudit("tipo_precio_editado", "price_type", id, { isDefault: true });
    });
    if (!result) throw new Error("El tipo de precio ya no existe");
    return result;
  }

  const row = await apiFetch<PriceTypeWire>(`/price-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { isDefault: true },
  });
  return adopt(row, "tipo_precio_editado", { exclusiveDefault: true });
}

/**
 * Elimina un tipo de precio.
 *
 * El servidor lo niega con `has_history` (409) si algún comprobante, pedido o
 * precio de producto lo referencia, así que la comprobación local previa que hace
 * `ajustes.tsx` (¿queda al menos uno, y ningún producto lo usa?) es cortesía para
 * no ir al servidor de balde, no la garantía.
 *
 * `DELETE` responde 204 sin cuerpo; `apiFetch` lo traduce a `undefined`.
 */
export async function deletePriceType(id: ID): Promise<void> {
  const access = requireAccess();

  if (access.mode === "remote") {
    await apiFetch<void>(`/price-types/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    st.priceTypes = st.priceTypes.filter((x) => x.id !== id);
    logAudit("tipo_precio_eliminado", "price_type", id);
  });
}

/* ── Interno ──────────────────────────────────────────── */

function requireAccess(): PriceTypeAccess {
  const access = priceTypeAccess();
  // Los controles ya deberían estar deshabilitados; esto es la red de seguridad
  // para que un camino que no consultó el acceso no escriba en local a escondidas.
  if (access.mode === "blocked") throw new Error(access.reason);
  return access;
}

function cleanName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error("El tipo de precio necesita un nombre");
  if (name.length > NAME_MAX) {
    throw new Error(`El nombre no puede pasar de ${NAME_MAX} caracteres`);
  }
  return name;
}

/**
 * Adopta la respuesta del servidor en el estado local: es él quien decide el
 * `id`, el nombre final (lo recorta) y el `rev`.
 *
 * `exclusiveDefault` es sólo para `setDefaultPriceType`: además de escribir la
 * fila, apaga `isDefault` en cualquier otra, que es lo que el servidor ya hizo.
 */
function adopt(
  row: PriceTypeWire,
  action: string,
  opts?: { exclusiveDefault?: boolean },
): PriceType {
  const pt: PriceType = {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    position: row.position,
    rev: row.rev,
  };
  mutate((st) => {
    const i = st.priceTypes.findIndex((x) => x.id === pt.id);
    if (i >= 0) st.priceTypes[i] = { ...st.priceTypes[i], ...pt };
    else st.priceTypes.push(pt);
    if (opts?.exclusiveDefault) {
      st.priceTypes.forEach((x) => {
        if (x.id !== pt.id) x.isDefault = false;
      });
    }
    logAudit(action, "price_type", pt.id, { name: pt.name });
  });
  return pt;
}
