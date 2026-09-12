import { useSyncExternalStore } from "react";
import { runMigrations } from "./migrations";
import { buildSeed, uid } from "./seed";
import type { AppState } from "./types";

const KEY = "karelys.db.v1";

let state: AppState = buildSeed();
let loaded = false;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function loadFromDisk() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      const seed = buildSeed();
      // La fusión es superficial salvo en `company`: ahí sí hay que combinar
      // campo a campo, porque un objeto guardado por una versión anterior no
      // trae las claves nuevas y reemplazaría al de la semilla por completo.
      state = { ...seed, ...parsed, company: { ...seed.company, ...(parsed.company ?? {}) } };

      // Migraciones de esquema (ver lib/migrations). Idempotentes.
      const migration = runMigrations(state);
      if (migration.applied.length) {
        for (const step of migration.applied) {
          logAudit("migracion_esquema", "app_state", step.name, {
            from: migration.from,
            to: migration.to,
            notes: step.notes,
          });
        }
        persist();
      }

      // Corrección de tasas iniciales obsoletas (412,50 / 485,30 / 415,20)
      if (state.rates.some((r) => r.value === 412.5 || r.value === 485.3 || r.value === 415.2)) {
        state.rates = [...seed.rates, ...state.rates.filter((r) => ![412.5, 485.3, 415.2].includes(r.value))];
        persist();
      }
      // Carga clientes de ejemplo que aún no existan (por cédula)
      const have = new Set(state.customers.map((c) => c.cedula));
      const missing = seed.customers.filter((c) => !have.has(c.cedula));
      if (missing.length) {
        state.customers = [...missing, ...state.customers];
        persist();
      }
    } else {
      persist();
    }
  } catch {
    /* corrupt */
  }

  emit();
}

function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState() {
  return state;
}

export function mutate(fn: (draft: AppState) => void) {
  fn(state);
  persist();
  emit();
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function resetDatabase() {
  state = buildSeed();
  persist();
  emit();
}

export function logAudit(action: string, entity: string, entityId: string, data?: unknown) {
  const user = state.users.find((u) => u.id === state.sessionUserId);
  state.audit.unshift({
    id: uid(),
    userId: user?.id ?? "system",
    userName: user?.fullName ?? "Sistema",
    action,
    entity,
    entityId,
    data: data ? JSON.stringify(data).slice(0, 500) : undefined,
    createdAt: new Date().toISOString(),
  });
  state.audit = state.audit.slice(0, 500);
}
