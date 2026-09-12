/**
 * Migraciones de esquema del estado persistido en localStorage.
 *
 * `AppState.version` existía pero nadie lo leía: el estado guardado se fusionaba
 * de forma superficial con la semilla, así que cualquier campo nuevo quedaba
 * `undefined` en instalaciones existentes. A partir de aquí las migraciones son
 * explícitas, versionadas e idempotentes.
 *
 * Para añadir una migración: sube `SCHEMA_VERSION`, agrega una entrada a
 * `MIGRATIONS` con ese `to` y no toques las anteriores.
 */

import { ensureColdCakeFamily } from "./catalog";
import {
  COLD_CAKE_ALERT_USD,
  COLD_CAKE_TARGET_USD,
  DEFAULT_BS_ROUNDING,
  DEFAULT_RATE_MAX_AGE_HOURS,
} from "./pricing-rules";
import type { AppState } from "./types";

/** Versión de esquema que entiende este código. */
export const SCHEMA_VERSION = 2;

interface Migration {
  to: number;
  name: string;
  up: (s: AppState) => string[];
}

/**
 * v1 → v2
 *  · `priceGroups`: precios generales compartidos (tortas frías)
 *  · `Order.deposits`: abonos / pagos adelantados
 *  · regla de precio de tortas frías: umbral 1,10 y objetivo 1,30 USD
 *  · antigüedad máxima de la tasa BCV
 */
function toV2(s: AppState): string[] {
  const notes: string[] = [];

  if (!Array.isArray(s.priceGroups)) {
    s.priceGroups = [];
    notes.push("priceGroups inicializado");
  }

  const c = s.company;
  if (typeof c.bsRounding !== "number") c.bsRounding = DEFAULT_BS_ROUNDING;
  if (typeof c.coldCakeMin !== "number") c.coldCakeMin = COLD_CAKE_ALERT_USD;
  // El máximo anterior (1,20) era más bajo que el precio objetivo de la alerta
  // (1,30): habría bloqueado justo la corrección que la alerta pide.
  if (typeof c.coldCakeMax !== "number" || c.coldCakeMax < COLD_CAKE_TARGET_USD) {
    const before = c.coldCakeMax;
    c.coldCakeMax = COLD_CAKE_TARGET_USD;
    notes.push(`precio objetivo de tortas frías ${before ?? "—"} → ${COLD_CAKE_TARGET_USD}`);
  }
  if (typeof c.rateMaxAgeHours !== "number") c.rateMaxAgeHours = DEFAULT_RATE_MAX_AGE_HOURS;

  notes.push(...ensureColdCakeFamily(s));

  let touched = 0;
  for (const o of s.orders) {
    if (!Array.isArray(o.deposits)) {
      o.deposits = [];
      touched++;
    }
  }
  if (touched) notes.push(`${touched} pedidos preparados para abonos`);

  return notes;
}

const MIGRATIONS: Migration[] = [{ to: 2, name: "price-groups-and-order-deposits", up: toV2 }];

export interface MigrationResult {
  from: number;
  to: number;
  applied: { name: string; notes: string[] }[];
}

/**
 * Lleva el estado a `SCHEMA_VERSION`. Muta `state` en sitio y devuelve el
 * detalle de lo aplicado para poder registrarlo en la auditoría.
 */
export function runMigrations(state: AppState): MigrationResult {
  const from = typeof state.version === "number" ? state.version : 0;
  const applied: MigrationResult["applied"] = [];
  for (const m of MIGRATIONS) {
    if (from >= m.to) continue;
    applied.push({ name: m.name, notes: m.up(state) });
    state.version = m.to;
  }
  if (state.version !== SCHEMA_VERSION) state.version = SCHEMA_VERSION;
  return { from, to: state.version, applied };
}
