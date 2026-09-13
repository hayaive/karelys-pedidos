/**
 * Categorías: la única parte del catálogo que **no** pasa por la cola de
 * mutaciones.
 *
 * El backend las declara `ONLINE_ONLY` (ver `sync/mutations/registry.ts` allí), de
 * modo que no existe ninguna operación de `POST /sync` que las cree, renombre o
 * borre: se gestionan con sus propios endpoints REST y punto. Hasta ahora la app
 * las creaba **sólo en local** con `mutate(...)`, y eso costaba datos de dos formas
 * distintas desde que `/bootstrap` es autoritativo:
 *
 *  1. la categoría desaparecía en el siguiente bootstrap (no está en la foto del
 *     servidor y no hay mutación pendiente que la proteja de la poda);
 *  2. peor: el producto que apuntaba a ella viajaba con un `categoryId` que el
 *     servidor no conoce, su `product.create` era rechazado de forma permanente
 *     —un rechazo permanente sale de la cola— y el producto se perdía también.
 *
 * Decisión del negocio: **gestionar categorías requiere conexión**. Este módulo es
 * el único sitio que sabe cómo, y hace las dos cosas en el orden que importa:
 * primero el servidor, y sólo si el servidor confirma, el estado local. Nunca al
 * revés.
 *
 * La excepción es una build **sin backend** (`VITE_API_URL=off`), donde la app es
 * local por definición, nadie va a hacer bootstrap y bloquear los controles sería
 * romper el modo de desarrollo que `sync/config.ts` documenta.
 */

import { logAudit, mutate } from "../store";
import { slug, uid } from "../ids";
import type { Category, ID } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus, useSyncStatus } from "./engine";
import { hasRemoteSession, isPairedWithBackend } from "./session";

/** Lo que devuelve el backend (`categoryOut`) en el alta y en la edición. */
interface CategoryWire {
  id: string;
  name: string;
  active: boolean;
  rev?: number;
}

/** Tope de `name` en `CreateCategoryDto` / `UpdateCategoryDto`. */
const NAME_MAX = 80;

export type CategoryAccess =
  /** Hay con qué hablar con el backend: cada cambio va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se gestiona en local, como antes. */
  | { mode: "local" }
  /** No se puede gestionar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se pueden gestionar categorías ahora mismo?
 *
 * El orden de las comprobaciones es el de lo que el usuario puede arreglar: si el
 * equipo nunca se emparejó, que se conecte no cambia nada, y decirle "sin conexión"
 * sería mentirle.
 *
 * `isPairedWithBackend()` y `hasRemoteSession()` son distintas a propósito (ver
 * `session.ts`): emparejado dice que este equipo alguna vez entró en línea, y sólo
 * la segunda dice que hay credenciales con las que hablar **ahora**. Para encolar
 * basta la primera; para una llamada HTTP hace falta la segunda.
 */
export function categoryAccess(): CategoryAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason:
        "Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para gestionar categorías.",
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason:
        "Entraste sin conexión. Vuelve a iniciar sesión con conexión para gestionar categorías.",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: "Necesitas conexión para gestionar categorías." };
  }
  // El último ciclo no alcanzó el servidor (sin red, caído o un 5xx). Reintentarlo
  // es pulsar el indicador de sincronización de la cabecera.
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason: "El servidor no responde ahora mismo. Necesitas conexión para gestionar categorías.",
    };
  }

  return { mode: "remote" };
}

/**
 * Lo mismo, para la interfaz: se recalcula cuando cambia el estado del motor, que
 * es quien ya escucha los eventos `online`/`offline` del navegador y quien marca la
 * fase `offline` cuando el servidor no contesta. Así los controles se habilitan y
 * se deshabilitan solos sin un segundo juego de escuchas.
 */
export function useCategoryAccess(): CategoryAccess {
  useSyncStatus();
  return categoryAccess();
}

/** Mensaje corto y en cristiano para el toast de error. */
export function categoryErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) return err.message;
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

/* ── Operaciones ──────────────────────────────────────── */

/**
 * Crea una categoría.
 *
 * El `id` **no** se manda: lo acuña el servidor con el mismo criterio semántico que
 * la semilla local (`cat-<slug>`), así que las dos convergen. Y el alta es
 * idempotente por ese id: crear "Tortas" dos veces devuelve la fila que ya existía
 * en lugar de duplicarla, que es justo lo que hace falta cuando dos cajas dan de
 * alta la misma categoría.
 */
export async function createCategory(rawName: string): Promise<Category> {
  const name = cleanName(rawName);
  const access = requireAccess();

  if (access.mode === "local") {
    const base = slug(name);
    const local: Category = { id: base ? `cat-${base}` : uid(), name, active: true };
    mutate((st) => {
      const i = st.categories.findIndex((c) => c.id === local.id);
      if (i >= 0) st.categories[i] = { ...st.categories[i], name };
      else st.categories.push(local);
      logAudit("categoria_creada", "category", local.id, { name });
    });
    return local;
  }

  const row = await apiFetch<CategoryWire>("/categories", { method: "POST", body: { name } });
  return adopt(row, "categoria_creada");
}

/** Renombra una categoría. El parche lleva sólo `name`: `active` no se toca aquí. */
export async function renameCategory(id: ID, rawName: string): Promise<Category> {
  const name = cleanName(rawName);
  const access = requireAccess();

  if (access.mode === "local") {
    let activa = true;
    mutate((st) => {
      const cat = st.categories.find((c) => c.id === id);
      if (cat) {
        cat.name = name;
        activa = cat.active;
      }
      logAudit("categoria_editada", "category", id, { name });
    });
    return { id, name, active: activa };
  }

  const row = await apiFetch<CategoryWire>(`/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { name },
  });
  return adopt(row, "categoria_editada");
}

/**
 * Elimina una categoría.
 *
 * El servidor la niega con `has_history` (409) si algún producto la referencia
 * —`products.category_id` es `ON DELETE RESTRICT`—, así que la comprobación local
 * previa es cortesía para no ir al servidor de balde, no la garantía.
 *
 * `DELETE` responde 204 sin cuerpo; `apiFetch` lo traduce a `undefined`.
 */
export async function deleteCategory(id: ID): Promise<void> {
  const access = requireAccess();

  if (access.mode === "remote") {
    await apiFetch<void>(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    st.categories = st.categories.filter((c) => c.id !== id);
    logAudit("categoria_eliminada", "category", id);
  });
}

/* ── Interno ──────────────────────────────────────────── */

function requireAccess(): CategoryAccess {
  const access = categoryAccess();
  // Los controles ya deberían estar deshabilitados; esto es la red de seguridad
  // para que un camino que no consultó el acceso no escriba en local a escondidas.
  if (access.mode === "blocked") throw new Error(access.reason);
  return access;
}

function cleanName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error("La categoría necesita un nombre");
  if (name.length > NAME_MAX) {
    throw new Error(`El nombre no puede pasar de ${NAME_MAX} caracteres`);
  }
  return name;
}

/**
 * Adopta la respuesta del servidor en el estado local: es él quien decide el `id`,
 * el nombre final (lo recorta) y el `rev`.
 */
function adopt(row: CategoryWire, action: string): Category {
  const cat: Category = { id: row.id, name: row.name, active: row.active, rev: row.rev };
  mutate((st) => {
    const i = st.categories.findIndex((c) => c.id === cat.id);
    if (i >= 0) st.categories[i] = { ...st.categories[i], ...cat };
    else st.categories.push(cat);
    logAudit(action, "category", cat.id, { name: cat.name });
  });
  return cat;
}
