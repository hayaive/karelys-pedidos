/**
 * Ajustes de la empresa (`company`): el mismo problema que resuelven
 * `price-types.ts` y `categories.ts` —gestionarlos sólo en local con
 * `mutate(...)` se pierde en el siguiente `/bootstrap`, que es autoritativo—
 * con una vuelta extra: `company` no es una colección con altas y bajas, es
 * **una sola fila** que el backend protege con bloqueo optimista.
 * `PATCH /company` exige `If-Match: <rev>` (ARCHITECTURE.md §6.7) y lo
 * rechaza con 409 si el `rev` no coincide, cosa que pasa seguido: cualquier
 * venta o pedido sube `company.rev` al asignar su número (ver
 * `CompanyService.allocate` en el backend), así que dos pestañas de Ajustes,
 * o un cajero cobrando mientras un admin guarda, chocan a menudo sin que
 * nadie haya tocado el mismo campo.
 *
 * El patrón es el mismo que en categorías y tipos de precio: primero el
 * servidor, y sólo si confirma, el estado local. En build sin backend
 * (`VITE_API_URL=off`) se sigue gestionando en local, porque ahí no hay
 * bootstrap que pise el cambio.
 */

import { getState, logAudit, mutate } from "../store";
import type { CompanySettings } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { mergeCompany } from "./apply";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus, useSyncStatus } from "./engine";
import { hasRemoteSession, isPairedWithBackend } from "./session";

/**
 * Los únicos campos que Ajustes → Impresión y numeración puede mandar por
 * `PATCH /company`: los que declara `UpdateCompanyDto` en el backend.
 * `saleNext`/`orderNext` **no** están aquí a propósito: la numeración es
 * propiedad del servidor (el DTO tampoco los declara) y mandarlos no haría
 * nada salvo sugerir, con el tipo, que sí se puede.
 */
export type PatchableCompanyFields = Pick<
  CompanySettings,
  | "ticketFooter"
  | "salePrefix"
  | "orderPrefix"
  | "bsRounding"
  | "coldCakeMin"
  | "coldCakeMax"
  | "productCodePrefix"
  | "productCodeDigits"
  | "productCodeStart"
>;

/** Los tres campos que el backend puede no conocer todavía (ver `updateCompany`). */
const PRODUCT_CODE_KEYS: (keyof PatchableCompanyFields)[] = [
  "productCodePrefix",
  "productCodeDigits",
  "productCodeStart",
];

export type CompanyAccess =
  /** Hay con qué hablar con el backend: el guardado va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se gestiona en local, como antes. */
  | { mode: "local" }
  /** No se puede gestionar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se puede guardar la configuración ahora mismo? Calcado de
 * `categoryAccess()`/`priceTypeAccess()`: mismas comprobaciones, mismo orden.
 */
export function companyAccess(): CompanyAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason:
        "Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para gestionar la configuración.",
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason:
        "Entraste sin conexión. Vuelve a iniciar sesión con conexión para gestionar la configuración.",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: "Necesitas conexión para gestionar la configuración." };
  }
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason:
        "El servidor no responde ahora mismo. Necesitas conexión para gestionar la configuración.",
    };
  }

  return { mode: "remote" };
}

/** Lo mismo, para la interfaz: se recalcula cuando cambia el estado del motor. */
export function useCompanyAccess(): CompanyAccess {
  useSyncStatus();
  return companyAccess();
}

/** Mensaje corto y en cristiano para el toast de error. */
export function companyErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) return err.message;
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

export interface UpdateCompanyResult {
  company: CompanySettings;
  /**
   * `true` si se mandó algún campo de la secuencia de códigos y el servidor
   * respondió sin él: ese backend todavía no lo conoce (el `ValidationPipe`
   * lo descarta en silencio, sin dar error), así que el valor quedó guardado
   * sólo en este equipo. Ajustes usa esto para avisar en vez de dar por hecho
   * que se guardó en el servidor.
   */
  degraded: boolean;
}

/**
 * Guarda un parche de Ajustes → Impresión y numeración.
 *
 * En modo local (o sin backend) se aplica directo, como hacía la pantalla
 * hasta ahora. En modo remoto va por `PATCH /company` con bloqueo optimista:
 * un 409 (el `rev` cambió) se reintenta **una vez** con el `rev` fresco que
 * trae el propio error —o, si no vino, con un `GET /company`— mandando de
 * nuevo el mismo `patch` y nada más: nunca los campos que el admin no tocó,
 * que podrían pisar una edición hecha en el ínterin por otra pestaña.
 */
export async function updateCompany(
  patch: Partial<PatchableCompanyFields>,
): Promise<UpdateCompanyResult> {
  const access = requireAccess();

  if (access.mode === "local") {
    let result!: CompanySettings;
    mutate((st) => {
      st.company = { ...st.company, ...patch };
      result = st.company;
      logAudit("ajustes_editados", "company", "singleton", { fields: Object.keys(patch) });
    });
    return { company: result, degraded: false };
  }

  return updateRemote(patch);
}

async function updateRemote(patch: Partial<PatchableCompanyFields>): Promise<UpdateCompanyResult> {
  const rev = await currentRev();

  try {
    return await patchOnce(patch, rev);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409) throw err;

    // El propio 409 trae la entidad actual (`AppError('conflict', …, { serverEntity })`
    // en el backend); si por lo que sea no viniera, se pide con un GET aparte.
    const fromError = err.details?.serverEntity as CompanySettings | undefined;
    const current = fromError ?? (await apiFetch<CompanySettings>("/company"));
    adopt(current);
    if (typeof current.rev !== "number") throw err;

    return await patchOnce(patch, current.rev); // un solo reintento
  }
}

/** `rev` con el que abrir el `If-Match`: el que ya está en local, o un `GET /company` si no hay ninguno. */
async function currentRev(): Promise<number> {
  const local = getState().company.rev;
  if (typeof local === "number") return local;

  const fresh = await apiFetch<CompanySettings>("/company");
  adopt(fresh);
  if (typeof fresh.rev !== "number") {
    throw new Error("El servidor no devolvió la versión de la configuración");
  }
  return fresh.rev;
}

async function patchOnce(
  patch: Partial<PatchableCompanyFields>,
  rev: number,
): Promise<UpdateCompanyResult> {
  const row = await apiFetch<CompanySettings>("/company", {
    method: "PATCH",
    body: patch,
    headers: { "If-Match": String(rev) },
  });

  const degraded = PRODUCT_CODE_KEYS.some((k) => patch[k] !== undefined && !(k in row));
  adopt(row);
  logAudit("ajustes_editados", "company", "singleton", { fields: Object.keys(patch) });
  return { company: getState().company, degraded };
}

/** Funde la respuesta del servidor en local, igual que hace el bootstrap. */
function adopt(row: CompanySettings) {
  mutate((st) => {
    st.company = mergeCompany(st.company, row);
  });
}

function requireAccess(): CompanyAccess {
  const access = companyAccess();
  // Los controles ya deberían estar deshabilitados; esto es la red de seguridad
  // para que un camino que no consultó el acceso no escriba en local a escondidas.
  if (access.mode === "blocked") throw new Error(access.reason);
  return access;
}
