/**
 * La cola de mutaciones pendientes.
 *
 * Es la pieza que hace que una venta se pueda cerrar sin internet: el store local
 * se escribe primero (la UI no espera a nadie) y **la misma** operación se anota
 * aquí como `{ mutationId, entity, op, payload }` con la forma exacta que espera
 * `POST /sync`. Con red, el ciclo de un minuto la sube; sin red, espera.
 *
 * Hay un solo camino de escritura, con o sin conexión: el modo offline no es una
 * ruta rara que casi nunca se ejerce.
 *
 * Vive en su propia clave de localStorage — **nunca** dentro del blob de datos —
 * para que `resetDatabase()` o una migración del estado no se lleven por delante
 * dinero que todavía no llegó al servidor.
 */

import { newId } from "../ids";
import { RETRY_BASE_MS, RETRY_MAX_MS, SYNC_ENABLED } from "./config";
import { businessNowISO, isPairedWithBackend } from "./session";
import type { MutationOp } from "./types";

const KEY = "karelys.sync.queue.v1";

/**
 * Aviso a partir del cual la cola es un problema operativo (semanas sin red, o un
 * error que no se está viendo). No se descarta nada: descartar es perder dinero
 * del registro.
 */
const WARN_SIZE = 500;

export interface QueuedMutation {
  mutationId: string;
  entity: string;
  op: string;
  /** Momento de negocio, ya corregido contra el reloj del servidor. */
  at: string;
  /** Versión sobre la que se editó, para el bloqueo optimista (`order.update`). */
  baseRev?: number;
  payload: Record<string, unknown>;
  /** Se creó sin conexión. El servidor lo usa para no bloquear por banda de precio. */
  offline: boolean;
  attempts: number;
  lastError?: string;
  /** Epoch ms antes del cual no se vuelve a intentar (espera creciente). */
  nextAttemptAt?: number;
  enqueuedAt: string;
}

let cache: QueuedMutation[] | null = null;
const listeners = new Set<() => void>();

function read(): QueuedMutation[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: QueuedMutation[]) {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Sin espacio. Lo peor que se puede hacer aquí es tirar la cola en silencio.
      console.error("[sync] no se pudo guardar la cola de sincronización (cuota de localStorage)");
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeQueue(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ── Encolar ──────────────────────────────────────────── */

export interface EnqueueOptions {
  /** `at` de negocio si no es "ahora" (un abono con fecha propia, p.ej.). */
  at?: string;
  /** `baseRev` de la entidad que se está editando. */
  baseRev?: number;
}

/**
 * Anota una mutación para el servidor. **Es el único punto de entrada**: las 20
 * operaciones del contrato se suman pasando otro `op` y otro `payload`, sin tocar
 * el motor.
 *
 * No encola nada si:
 *  · esta build no tiene backend (`VITE_API_URL` vacío), o
 *  · este dispositivo nunca inició sesión contra el backend.
 *
 * Lo segundo importa: una instalación que funciona sólo en local no debe acumular
 * una cola eterna de cosas que nadie va a recibir.
 *
 * Lo que **no** se exige es tener tokens válidos: un turno entero abierto con el
 * login sin red tiene que seguir anotando todo lo que se registra (ver
 * `isPairedWithBackend`).
 */
export function enqueueMutation(
  op: MutationOp,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): QueuedMutation | null {
  if (!SYNC_ENABLED || !isPairedWithBackend()) return null;

  const [entity, operation] = splitOp(op);

  const item: QueuedMutation = {
    mutationId: newId(),
    entity,
    op: operation,
    at: options.at ?? businessNowISO(),
    baseRev: options.baseRev,
    payload: prune(payload),
    // Se marca como offline cuando el navegador dice que no hay red. El servidor
    // lo usa para avisar en vez de bloquear por banda de precio: esa venta ya
    // ocurrió y el dinero ya entró.
    offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
  };

  const next = [...read(), item];
  if (next.length === WARN_SIZE) {
    console.warn(`[sync] la cola pendiente llegó a ${WARN_SIZE} mutaciones sin sincronizar`);
  }
  write(next);
  return item;
}

function splitOp(op: MutationOp): [string, string] {
  const i = op.indexOf(".");
  return [op.slice(0, i), op.slice(i + 1)];
}

/** Quita las claves `undefined`: el backend valida con `whitelist` y no quiere ruido. */
function prune(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) if (v !== undefined) out[k] = v;
  return out;
}

/* ── Leer ─────────────────────────────────────────────── */

export function pendingMutations(): QueuedMutation[] {
  return read();
}

export function queueCount(): number {
  return read().length;
}

/**
 * Las que toca intentar ahora, **en orden de llegada**. El orden es parte del
 * contrato: el servidor aplica el lote en secuencia, así que un `order.create`
 * tiene que ir antes que el `orderDeposit.create` que lo abona.
 */
export function dueMutations(limit: number, now = Date.now()): QueuedMutation[] {
  const out: QueuedMutation[] = [];
  for (const m of read()) {
    if ((m.nextAttemptAt ?? 0) > now) break; // respeta el orden: si una espera, las de detrás también
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ids de entidades con mutaciones aún sin confirmar. Ver `apply.ts` (stock y poda). */
export function pendingEntityIds(): Set<string> {
  const ids = new Set<string>();
  for (const m of read()) {
    for (const key of ["id", "orderId", "saleId", "productId", "customerId", "depositId"]) {
      const v = m.payload[key];
      if (typeof v === "string" && v) ids.add(v);
    }
    const items = m.payload.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const pid = (it as { productId?: unknown })?.productId;
        if (typeof pid === "string") ids.add(pid);
      }
    }
  }
  return ids;
}

/** ¿Hay pendientes que muevan existencias? Decide si se adopta el `stock` del servidor. */
export function hasPendingStockEffects(): boolean {
  return read().some(
    (m) =>
      (m.entity === "sale" && (m.op === "create" || m.op === "void")) ||
      (m.entity === "movement" && m.op === "create"),
  );
}

/* ── Escribir ─────────────────────────────────────────── */

export function removeMutations(ids: string[]) {
  if (!ids.length) return;
  const drop = new Set(ids);
  write(read().filter((m) => !drop.has(m.mutationId)));
}

/**
 * Anota un fallo **transitorio** y programa el siguiente intento con espera
 * creciente. La mutación conserva su `mutationId`: el servidor la reconoce como
 * reenvío y no la aplica dos veces.
 */
export function deferMutation(mutationId: string, error: string) {
  write(
    read().map((m) => {
      if (m.mutationId !== mutationId) return m;
      const attempts = m.attempts + 1;
      const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 10));
      return { ...m, attempts, lastError: error.slice(0, 300), nextAttemptAt: Date.now() + wait };
    }),
  );
}

/** Vacía la cola. Sólo para herramientas de diagnóstico: tirarla pierde datos. */
export function clearQueue() {
  write([]);
}
