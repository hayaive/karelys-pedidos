/**
 * El motor de sincronización.
 *
 * Corre **por debajo** del store, no por encima: la UI sigue leyendo y escribiendo
 * el estado local con `useAppState()` y `mutate()` exactamente como antes, y este
 * motor se ocupa de que ese estado y el servidor converjan.
 *
 * El ciclo, cada 60 segundos (requisito explícito del negocio; no hay websockets):
 *
 *   1. `POST /sync`  — sube las mutaciones pendientes de la cola, en orden.
 *   2. `GET  /sync?since=<cursor>` — trae lo que cambió en los otros dispositivos
 *      y lo funde en el store.
 *
 * Es el **mismo** mecanismo para "ponerse al día tras una caída" y para "ver lo
 * que hizo la otra caja estando en línea". La única desviación del minuto es el
 * evento de reconexión, donde el ciclo se dispara de inmediato.
 *
 * Nada de esto bloquea la aplicación: si el servidor no responde, el store local
 * sigue siendo la verdad inmediata y la cola espera.
 */

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch, NetworkError } from "./api";
import { applyBootstrap, applyDelta, applyServerEntity, remapId } from "./apply";
import {
  MAX_PULL_PAGES,
  MAX_PUSH_BATCH,
  PULL_PAGE_LIMIT,
  SYNC_ENABLED,
  SYNC_INTERVAL_MS,
} from "./config";
import {
  deferMutation,
  dueMutations,
  queueCount,
  removeMutations,
  subscribeQueue,
  type QueuedMutation,
} from "./queue";
import { getSession, hasRemoteSession, isPairedWithBackend, patchSession } from "./session";
import type {
  BootstrapResponse,
  DeltaResponse,
  MutationResult,
  PushResponse,
  WireMutation,
} from "./types";

/* ── Estado observable para la interfaz ───────────────── */

export type SyncPhase =
  /** Sin backend en esta build. */
  | "disabled"
  /** Este equipo nunca se emparejó con el backend: sólo local. */
  | "local"
  /** Al día. */
  | "synced"
  /** Ciclo en curso. */
  | "syncing"
  /** Hay cambios locales esperando para subir. */
  | "pending"
  /** No hay red o el servidor no responde. */
  | "offline"
  /**
   * Emparejado, pero sin credenciales para hablar con el servidor: es lo que
   * queda tras entrar sin red o después de que caduque el refresh token. Se sigue
   * encolando todo; para subirlo hace falta iniciar sesión con conexión.
   */
  | "needs-auth"
  /** El servidor respondió, pero mal. */
  | "error";

export interface SyncStatus {
  phase: SyncPhase;
  /** Mutaciones locales sin confirmar. */
  pending: number;
  lastSyncAt?: string;
  lastError?: string;
  /** Hidratando el estado inicial desde `/bootstrap`. */
  bootstrapping: boolean;
}

let status: SyncStatus = {
  phase: SYNC_ENABLED ? "local" : "disabled",
  pending: 0,
  bootstrapping: false,
};

const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch, pending: patch.pending ?? queueCount() };
  // Sin cambios reales no se notifica: esto corre cada minuto y no debe provocar
  // renders de balde.
  if (
    next.phase === status.phase &&
    next.pending === status.pending &&
    next.lastSyncAt === status.lastSyncAt &&
    next.lastError === status.lastError &&
    next.bootstrapping === status.bootstrapping
  ) {
    return;
  }
  status = next;
  listeners.forEach((l) => l());
}

/** El estado del sync, para el indicador de la cabecera. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const stopQueue = subscribeQueue(l);
      return () => {
        listeners.delete(l);
        stopQueue();
      };
    },
    () => status,
    () => status,
  );
}

export const getSyncStatus = () => status;

/** Fase de reposo: al día si la cola está vacía, pendiente si no. */
function restingPhase(): SyncPhase {
  if (!SYNC_ENABLED) return "disabled";
  if (!isPairedWithBackend()) return "local";
  // Emparejado pero sin con qué autenticarse: se encola, no se sube.
  if (!hasRemoteSession()) return "needs-auth";
  return queueCount() > 0 ? "pending" : "synced";
}

/* ── Ciclo ────────────────────────────────────────────── */

/** Un ciclo a la vez: dos a la vez subirían el mismo lote dos veces. */
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = 0;

/**
 * Ejecuta un ciclo completo. Nunca lanza: los fallos se reflejan en el estado
 * observable, porque quien lo llama suele ser un `setInterval` o un evento del
 * navegador y una excepción ahí no la recoge nadie.
 */
export function syncNow(reason = "ciclo"): Promise<void> {
  if (inFlight) return inFlight;

  // `.finally()` en lugar de un `try/finally` dentro de la función async, y no es
  // un detalle de estilo: el camino "sin red" sale **sincrónicamente**, así que un
  // `finally` interno se ejecutaría ANTES de la asignación de `inFlight` y la
  // dejaría apuntando para siempre a una promesa ya resuelta. A partir de ese
  // momento todas las llamadas devolverían esa promesa y el motor no volvería a
  // sincronizar nunca: el primer minuto sin wifi dejaba la cola congelada.
  // El callback de `.finally()` siempre se aplaza a un microtask, así que la
  // asignación ocurre primero.
  const run = cycle(reason).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function cycle(reason: string): Promise<void> {
  if (!SYNC_ENABLED || !isPairedWithBackend()) {
    setStatus({ phase: restingPhase() });
    return;
  }
  if (!hasRemoteSession()) {
    // Se entró sin red (o caducó el refresh token): no hay con qué autenticarse.
    // La cola sigue creciendo y se sube en cuanto haya un inicio de sesión en línea.
    setStatus({
      phase: "needs-auth",
      lastError:
        queueCount() > 0
          ? "Hay cambios sin subir: inicia sesión con conexión para sincronizarlos"
          : undefined,
    });
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus({ phase: "offline", lastError: undefined });
    return;
  }

  setStatus({ phase: "syncing" });

  try {
    await pushQueue();
    await pullDelta();

    const at = new Date().toISOString();
    patchSession({ lastSyncAt: at });
    setStatus({ phase: restingPhase(), lastSyncAt: at, lastError: undefined });
  } catch (err) {
    if (err instanceof NetworkError) {
      setStatus({ phase: "offline", lastError: err.message });
      return;
    }
    if (err instanceof ApiError) {
      if (err.needsBootstrap) {
        // El cursor caducó: no es un error, es rehacer el estado inicial.
        try {
          await runBootstrap();
          setStatus({ phase: restingPhase(), lastError: undefined });
          return;
        } catch {
          /* cae al tratamiento de error de abajo */
        }
      }
      if (err.isAuthFailure) {
        setStatus({ phase: "error", lastError: "La sesión caducó: vuelve a iniciar sesión" });
        return;
      }
      setStatus({ phase: err.retryable ? "offline" : "error", lastError: err.message });
      return;
    }
    console.error(`[sync] ciclo (${reason}) falló`, err);
    setStatus({ phase: "error", lastError: (err as Error).message });
  }
}

/**
 * Arranca el motor. Devuelve la función para pararlo, y es idempotente: si dos
 * componentes lo arrancan, sólo el último en soltarlo lo apaga.
 */
export function startSyncEngine(): () => void {
  if (!SYNC_ENABLED || typeof window === "undefined") return () => {};

  started += 1;
  if (started === 1) {
    // Un ciclo al abrir: es lo que trae lo que pasó mientras la app estaba cerrada.
    void bootIfNeeded();
    timer = setInterval(() => void syncNow("intervalo"), SYNC_INTERVAL_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    started = Math.max(0, started - 1);
    if (started === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/** Reconexión: el único caso en el que el ciclo no espera al minuto. */
const onOnline = () => void syncNow("reconexión");

const onOffline = () => setStatus({ phase: "offline" });

/**
 * Volver a la pestaña. `setInterval` se estrangula en una pestaña de fondo, así que
 * un equipo que estuvo horas en otra ventana volvería con datos viejos. Sólo se
 * sincroniza si el último ciclo ya quedó atrás: es ponerse al día, no polling
 * agresivo.
 */
function onVisible() {
  if (document.visibilityState !== "visible") return;
  const last = Date.parse(getSession().lastSyncAt ?? "");
  if (!Number.isFinite(last) || Date.now() - last > SYNC_INTERVAL_MS) void syncNow("reanudar");
}

/**
 * Al arrancar: si este dispositivo nunca hizo bootstrap (o no tiene cursor), lo
 * hace; si ya lo tiene, un delta basta y es muchísimo más barato.
 */
async function bootIfNeeded() {
  if (!hasRemoteSession()) {
    setStatus({ phase: restingPhase() });
    return;
  }
  const s = getSession();
  if (!s.lastBootstrapAt || s.cursor <= 0) {
    try {
      await runBootstrap();
    } catch (err) {
      // El backend caído al abrir la app **no** es un error fatal: la caché local
      // ya está cargada y la app funciona. Se reintenta en el siguiente ciclo.
      if (err instanceof NetworkError) {
        setStatus({ phase: "offline", lastError: err.message });
        return;
      }
      setStatus({ phase: "error", lastError: (err as Error).message });
      return;
    }
  }
  await syncNow("arranque");
}

/* ── 1 · Subir la cola ────────────────────────────────── */

async function pushQueue(): Promise<void> {
  // Se sube de a lotes hasta vaciar lo que está listo, sin dar vueltas infinitas:
  // lo que quede diferido se intentará en el siguiente ciclo.
  for (let round = 0; round < 10; round++) {
    const batch = dueMutations(MAX_PUSH_BATCH);
    if (!batch.length) return;

    const res = await apiFetch<PushResponse>("/sync", {
      method: "POST",
      body: {
        deviceId: getSession().deviceId,
        cursor: getSession().cursor,
        mutations: batch.map(toWire),
      },
    });

    handleResults(batch, res.results);

    // Si nada salió de la cola, insistir con el mismo lote es un bucle.
    if (res.results.every((r) => r.retryable)) return;
    if (batch.length < MAX_PUSH_BATCH) return;
  }
}

function toWire(m: QueuedMutation): WireMutation {
  return {
    mutationId: m.mutationId,
    entity: m.entity,
    op: m.op,
    at: m.at,
    baseRev: m.baseRev,
    offline: m.offline,
    payload: m.payload,
  };
}

/**
 * Traduce los resultados del servidor a acciones sobre la cola y el store.
 *
 * La distinción crítica es `rejected` **permanente** vs error transitorio: tratar
 * un rechazo permanente como reintentable deja la cola girando para siempre, y
 * tratar un fallo de red como permanente pierde el asiento.
 */
function handleResults(batch: QueuedMutation[], results: MutationResult[]) {
  const byId = new Map(batch.map((m) => [m.mutationId, m]));
  const settled: string[] = [];

  for (const r of results) {
    const sent = byId.get(r.mutationId);
    const label = sent ? `${sent.entity}.${sent.op}` : r.mutationId;

    // Reapuntar ids fusionados antes de adoptar la entidad: si no, el registro
    // adoptado apuntaría al id local que estamos a punto de retirar.
    if (r.idMap?.length) {
      for (const m of r.idMap) remapId(m.entity, m.localId, m.serverId);
    }

    switch (r.status) {
      case "applied":
      case "duplicate":
        if (sent && r.serverEntity) applyServerEntity(sent.entity, r.serverEntity);
        if (r.renumbered) {
          toast.info(
            `El servidor renumeró ${r.renumbered.from} como ${r.renumbered.to}`,
            { description: "Otro equipo ya había usado ese número mientras no había conexión." },
          );
        }
        settled.push(r.mutationId);
        break;

      case "conflict":
        // El servidor tiene una versión más nueva. Se adopta la suya y **no** se
        // reenvía automáticamente: reponer nuestras líneas encima borraría la
        // edición del otro equipo, y aquí las líneas son dinero. Que decida una
        // persona con los dos datos delante.
        if (sent && r.serverEntity) applyServerEntity(sent.entity, r.serverEntity);
        toast.warning("Ese registro cambió en otro equipo", {
          description: `Se adoptó la versión del servidor (${label}). Revisa y vuelve a aplicar tu cambio si hace falta.`,
        });
        settled.push(r.mutationId);
        break;

      case "rejected":
        if (r.retryable) {
          // Fallo transitorio del servidor: se queda en la cola, con espera creciente.
          deferMutation(r.mutationId, r.reason ?? "error transitorio del servidor");
          break;
        }
        // Permanente: fuera de la cola y se avisa. Nunca se reintenta.
        if (sent && r.serverEntity) applyServerEntity(sent.entity, r.serverEntity);
        toast.error(`El servidor rechazó un cambio (${label})`, {
          description: humanizeReason(r.reason),
          duration: 10_000,
        });
        console.warn(`[sync] ${label} rechazada: ${r.reason}`);
        settled.push(r.mutationId);
        break;
    }
  }

  // Una mutación que el servidor no mencionó se queda en la cola tal cual: sin
  // respuesta no hay nada que concluir.
  removeMutations(settled);
}

/** El `reason` del contrato es `codigo: mensaje`. Al cajero le sirve el mensaje. */
function humanizeReason(reason?: string): string {
  if (!reason) return "El servidor no dio un motivo.";
  const i = reason.indexOf(": ");
  const code = i > 0 ? reason.slice(0, i) : "";
  const message = i > 0 ? reason.slice(i + 2) : reason;

  switch (code) {
    case "online_only":
      return `${message} Vuelve a intentarlo con conexión.`;
    case "terminal_state":
      return `${message} El registro ya estaba cerrado en el servidor.`;
    case "order_already_billed":
      return message;
    case "dependency_failed":
      return "Dependía de otro cambio que el servidor no pudo aplicar.";
    // Los mensajes de estos códigos son genéricos en el servidor, así que la
    // explicación útil la pone el cliente.
    case "has_deposits":
      return "El pedido tiene abonos vigentes: anula el abono o cancela el pedido en lugar de eliminarlo.";
    case "has_history":
      return "Tiene historial y no se puede eliminar: desactívalo en su lugar.";
    case "already_closed":
      return "Ese día ya tenía un cierre de caja: se conserva el primero.";
    case "retired_code":
      return "Ese código de producto está retirado y no puede volver a usarse.";
    case "user_deactivated":
      return "El usuario fue desactivado antes de este cambio.";
    default:
      return message;
  }
}

/* ── 2 · Traer el delta ───────────────────────────────── */

async function pullDelta(): Promise<void> {
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const since = getSession().cursor;
    const res = await apiFetch<DeltaResponse>(`/sync?since=${since}&limit=${PULL_PAGE_LIMIT}`);

    if (res.bootstrapRequired) {
      await runBootstrap();
      return;
    }

    applyDelta(res.changes ?? {}, res.deletions ?? []);
    patchSession({ cursor: res.cursor });

    if (!res.hasMore) return;
  }
  console.warn("[sync] quedan cambios por traer; siguen en el próximo ciclo");
}

/* ── Estado inicial ───────────────────────────────────── */

/**
 * `GET /bootstrap`: estado completo de la ventana operativa. Se pide al iniciar
 * sesión, la primera vez que este equipo habla con el backend, y cuando el cursor
 * caducó — no en cada arranque, que para eso está el delta.
 */
export async function runBootstrap(): Promise<void> {
  setStatus({ bootstrapping: true });
  try {
    const res = await apiFetch<BootstrapResponse>("/bootstrap");
    applyBootstrap(res);
    patchSession({ cursor: res.cursor, lastBootstrapAt: new Date().toISOString() });
    setStatus({ bootstrapping: false, phase: restingPhase(), lastError: undefined });
  } catch (err) {
    setStatus({ bootstrapping: false });
    throw err;
  }
}

/** Refresca la fase mostrada (tras login/logout, que cambian `hasRemoteSession`). */
export function refreshSyncStatus() {
  setStatus({ phase: restingPhase() });
}
