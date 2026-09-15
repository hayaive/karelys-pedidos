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
export const SCHEMA_VERSION = 4;

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
 *
 * El catálogo lo deja `ensureColdCakeFamily`, que es la forma canónica de hoy
 * (por eso una instalación en v1 llega directo al estado de v3 en este paso y
 * el siguiente no encuentra nada que hacer).
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

/**
 * v2 → v3
 *  · los 13 sabores individuales de tortas frías (P001–P013) se **eliminan** y
 *    se consolidan en un único producto "Tortas Frías": el negocio dejó de
 *    elegir sabor al vender.
 *  · el stock de los 13 se suma en el producto único y todo lo que apuntaba a
 *    sus ids (kardex, líneas de ventas y pedidos) se reapunta a él, para no
 *    dejar referencias huérfanas que romperían la devolución de stock de una
 *    venta anulada o el descuento de un pedido pendiente anterior.
 *
 * Toda la lógica vive en `ensureColdCakeFamily` (lib/catalog), la misma función
 * que usa la semilla, para que instalación nueva y migrada queden idénticas.
 */
function toV3(s: AppState): string[] {
  return ensureColdCakeFamily(s);
}

/**
 * v3 → v4
 *  · nuevo método de pago "Punto de venta" (terminal de tarjeta), para que las
 *    instalaciones ya sembradas antes de que existiera lo reciban sin
 *    perder los métodos que el negocio ya haya configurado o editado.
 *
 * Igual que con `ensureColdCakeFamily`, esto se busca primero por id y, si no
 * está, por nombre normalizado: una instalación pudo haberlo creado a mano
 * desde Ajustes → Métodos de pago antes de esta migración, y duplicarlo sería
 * peor que no migrar nada.
 */
function toV4(s: AppState): string[] {
  const id = "pm-pos";
  const name = "Punto de venta";
  const norm = (x: string) => x.trim().toLowerCase();

  if (!Array.isArray(s.paymentMethods)) s.paymentMethods = [];
  const exists = s.paymentMethods.some(
    (m) => m.id === id || norm(m.name) === norm(name),
  );
  if (exists) return [];

  s.paymentMethods.push({
    id,
    name,
    currency: "BS",
    requiresReference: true,
    active: true,
  });
  return [`método de pago "${name}" agregado`];
}

const MIGRATIONS: Migration[] = [
  { to: 2, name: "price-groups-and-order-deposits", up: toV2 },
  { to: 3, name: "cold-cake-single-product", up: toV3 },
  { to: 4, name: "punto-de-venta-payment-method", up: toV4 },
];

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
