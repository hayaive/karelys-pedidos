/**
 * Métodos de pago: mismo problema que resuelven `categories.ts` y
 * `price-types.ts`, y la misma solución.
 *
 * Hasta ahora `Pagos` en `ajustes.tsx` sólo hacía `mutate(...)` local (alta y
 * activar/desactivar), así que un método nuevo —o el que se desactivó— se
 * perdía en el siguiente `/bootstrap`, que es autoritativo y no conoce el
 * cambio. Mismo orden que en los otros módulos: primero el servidor, y sólo
 * si confirma, el estado local. En build sin backend (`VITE_API_URL=off`) se
 * sigue gestionando en local, porque ahí no hay bootstrap que pise el cambio.
 *
 * Nota de despliegue (2026-09-18): el backend de `/payment-methods` lo está
 * terminando otro agente en paralelo. Mientras no esté desplegado, cualquier
 * llamada en modo remoto devuelve 404 (ruta inexistente) en vez del cuerpo de
 * error `{ error: { code, message } }` habitual; `paymentMethodErrorText`
 * reconoce ese caso y da un mensaje claro en vez de "HTTP 404" en crudo. Y
 * como el 404 revienta antes de llegar a cualquier `mutate(...)`, no se
 * escribe nada en local cuando el servidor todavía no sabe guardar esto.
 */

import { logAudit, mutate } from "../store";
import { uid } from "../ids";
import type { ID, PaymentMethod } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus, useSyncStatus } from "./engine";
import { hasRemoteSession, isPairedWithBackend } from "./session";

/** Lo que devuelve el backend en el alta y en la edición. */
interface PaymentMethodWire {
  id: string;
  name: string;
  currency: "USD" | "BS";
  requiresReference: boolean;
  active: boolean;
  position?: number;
  rev?: number;
}

/** Tope de `name` en `CreatePaymentMethodDto` / `UpdatePaymentMethodDto` (1–80). */
const NAME_MAX = 80;

export type PaymentMethodAccess =
  /** Hay con qué hablar con el backend: cada cambio va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se gestiona en local, como antes. */
  | { mode: "local" }
  /** No se puede gestionar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se pueden gestionar métodos de pago ahora mismo? Calcado de
 * `categoryAccess()`/`priceTypeAccess()`: mismas comprobaciones, mismo orden.
 */
export function paymentMethodAccess(): PaymentMethodAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason:
        "Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para gestionar formas de pago.",
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason:
        "Entraste sin conexión. Vuelve a iniciar sesión con conexión para gestionar formas de pago.",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: "Necesitas conexión para gestionar formas de pago." };
  }
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason:
        "El servidor no responde ahora mismo. Necesitas conexión para gestionar formas de pago.",
    };
  }

  return { mode: "remote" };
}

/** Lo mismo, para la interfaz: se recalcula cuando cambia el estado del motor. */
export function usePaymentMethodAccess(): PaymentMethodAccess {
  useSyncStatus();
  return paymentMethodAccess();
}

/** Mensaje corto y en cristiano para el toast de error. */
export function paymentMethodErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) {
    // La ruta todavía no existe en el backend desplegado (ver la nota de
    // despliegue arriba): el 404 no trae el cuerpo `{ error: { code, ... } }`
    // habitual, así que `toApiError` lo traduce a `http_404` con el texto
    // crudo de la respuesta. Ese texto no le sirve a nadie en un toast.
    if (err.status === 404) {
      return "El servidor aún no permite guardar formas de pago: hay que actualizarlo";
    }
    if (err.code === "conflict") return "Ya existe una forma de pago con ese nombre";
    return err.message;
  }
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

/* ── Operaciones ──────────────────────────────────────── */

export interface CreatePaymentMethodInput {
  name: string;
  currency: "USD" | "BS";
  requiresReference?: boolean;
  active?: boolean;
  position?: number;
}

/**
 * Crea un método de pago.
 *
 * El `id` **no** se manda, aunque el contrato lo admita opcional: igual que
 * categorías y tipos de precio, dejar que el servidor lo acuñe evita que dos
 * cajas sin red generen el mismo id con contenidos distintos.
 */
export async function createPaymentMethod(input: CreatePaymentMethodInput): Promise<PaymentMethod> {
  const name = cleanName(input.name);
  const access = requireAccess();

  if (access.mode === "local") {
    const local: PaymentMethod = {
      id: uid(),
      name,
      currency: input.currency,
      requiresReference: input.requiresReference ?? false,
      active: input.active ?? true,
    };
    mutate((st) => {
      st.paymentMethods.push(local);
      logAudit("forma_pago_creada", "payment_method", local.id, { name });
    });
    return local;
  }

  const row = await apiFetch<PaymentMethodWire>("/payment-methods", {
    method: "POST",
    body: {
      name,
      currency: input.currency,
      requiresReference: input.requiresReference,
      active: input.active,
      position: input.position,
    },
  });
  return adopt(row, "forma_pago_creada");
}

export interface UpdatePaymentMethodInput {
  name?: string;
  currency?: "USD" | "BS";
  requiresReference?: boolean;
  active?: boolean;
  position?: number;
}

/**
 * Edita nombre, moneda, referencia, estado o posición. Sólo manda lo que
 * viene en `patch`; quien llama decide qué cambió.
 */
export async function updatePaymentMethod(
  id: ID,
  patch: UpdatePaymentMethodInput,
): Promise<PaymentMethod> {
  const access = requireAccess();
  const body: UpdatePaymentMethodInput = { ...patch };
  if (body.name !== undefined) body.name = cleanName(body.name);

  if (access.mode === "local") {
    let result: PaymentMethod | undefined;
    mutate((st) => {
      const pm = st.paymentMethods.find((x) => x.id === id);
      if (pm) {
        if (body.name !== undefined) pm.name = body.name;
        if (body.currency !== undefined) pm.currency = body.currency;
        if (body.requiresReference !== undefined) pm.requiresReference = body.requiresReference;
        if (body.active !== undefined) pm.active = body.active;
        if (body.position !== undefined) pm.position = body.position;
      }
      result = pm;
      logAudit("forma_pago_editada", "payment_method", id, { fields: Object.keys(body) });
    });
    if (!result) throw new Error("La forma de pago ya no existe");
    return result;
  }

  const row = await apiFetch<PaymentMethodWire>(`/payment-methods/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return adopt(row, "forma_pago_editada");
}

/**
 * Elimina un método de pago.
 *
 * El servidor lo niega con `has_history` (409) si hay movimientos con esa
 * forma de pago, y sugiere desactivarla en su lugar (ver `Pagos` en
 * `ajustes.tsx`, que ofrece "Desactivar" como alternativa siempre visible).
 * `DELETE` responde 204 sin cuerpo; `apiFetch` lo traduce a `undefined`.
 */
export async function deletePaymentMethod(id: ID): Promise<void> {
  const access = requireAccess();

  if (access.mode === "remote") {
    await apiFetch<void>(`/payment-methods/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    st.paymentMethods = st.paymentMethods.filter((x) => x.id !== id);
    logAudit("forma_pago_eliminada", "payment_method", id);
  });
}

/* ── Interno ──────────────────────────────────────────── */

function requireAccess(): PaymentMethodAccess {
  const access = paymentMethodAccess();
  // Los controles ya deberían estar deshabilitados; esto es la red de seguridad
  // para que un camino que no consultó el acceso no escriba en local a escondidas.
  if (access.mode === "blocked") throw new Error(access.reason);
  return access;
}

function cleanName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error("La forma de pago necesita un nombre");
  if (name.length > NAME_MAX) {
    throw new Error(`El nombre no puede pasar de ${NAME_MAX} caracteres`);
  }
  return name;
}

/** Adopta la respuesta del servidor en el estado local: es él quien decide todo. */
function adopt(row: PaymentMethodWire, action: string): PaymentMethod {
  const pm: PaymentMethod = {
    id: row.id,
    name: row.name,
    currency: row.currency,
    requiresReference: row.requiresReference,
    active: row.active,
    position: row.position,
    rev: row.rev,
  };
  mutate((st) => {
    const i = st.paymentMethods.findIndex((x) => x.id === pm.id);
    if (i >= 0) st.paymentMethods[i] = { ...st.paymentMethods[i], ...pm };
    else st.paymentMethods.push(pm);
    logAudit(action, "payment_method", pm.id, { name: pm.name });
  });
  return pm;
}
