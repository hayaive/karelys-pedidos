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
import { normalizeName } from "./ids";
import { isGenericColdCake } from "./pricing";
import {
  COLD_CAKE_ALERT_USD,
  COLD_CAKE_TARGET_USD,
  DEFAULT_BS_ROUNDING,
  DEFAULT_RATE_MAX_AGE_HOURS,
  OREO_BROWNIE_CODE,
  OREO_BROWNIE_NAME,
} from "./pricing-rules";
import { queueProductUpdate } from "./sync/mutations";
import { pendingMutations, removeMutations } from "./sync/queue";
import type { AppState, ID, Product, ProductPrice } from "./types";

/** Versión de esquema que entiende este código. */
export const SCHEMA_VERSION = 6;

interface Migration {
  to: number;
  name: string;
  up: (s: AppState) => string[];
}

/* ── Formas del esquema ≤5 ────────────────────────────────
   `lib/types` ya no las declara (el código vivo no las conoce), pero el estado
   guardado en un navegador todavía las trae. Viven aquí, que es el único sitio
   que tiene que entender el pasado. */

interface LegacyPriceGroup {
  id: string;
  name: string;
  categoryId?: string;
  prices: ProductPrice[];
}

type LegacyState = AppState & {
  priceGroups?: LegacyPriceGroup[];
  company: AppState["company"] & { coldCakeCategory?: string };
};

type LegacyProduct = Product & { priceGroupId?: ID };

/**
 * Ids de los grupos de precio del esquema ≤5. Sólo los necesitan `toV5` y
 * `toV6`, así que no vuelven a `pricing-rules`: allí viven las constantes
 * vigentes, y éstas ya no lo son.
 */
const LEGACY_GENERIC_GROUP_ID = "pg-tortas-frias";
const LEGACY_GENERIC_BROWNIE_GROUP_ID = "pg-oreo-brownie";

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

  // Se conserva tal cual aunque `toV6` borre `priceGroups` acto seguido en la
  // misma pasada: una migración pasada no se reescribe, y el efecto observable
  // (inicializar algo que se elimina después) es exactamente ninguno.
  const legacy = s as LegacyState;
  if (!Array.isArray(legacy.priceGroups)) {
    legacy.priceGroups = [];
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

/**
 * v4 → v5
 *  · el producto y el grupo de precio "Oreo y Brownie" pasan a llamarse sólo
 *    "Brownie" (decisión del negocio): en Precios Agrupados no debe existir
 *    "Oreo y Brownie".
 *
 * Se busca primero por la clave de negocio estable (código de producto / id de
 * grupo) y, si no calza, por el nombre viejo normalizado — igual que en
 * `toV4` — para no crear un producto o grupo duplicado en una instalación que
 * ya tenía el suyo con otro nombre. Idempotente: si ya está en "Brownie", no
 * hace nada.
 */
function toV5(s: AppState): string[] {
  const notes: string[] = [];
  const legacyName = normalizeName("Oreo y Brownie");

  const product =
    s.products.find((p) => p.code === OREO_BROWNIE_CODE) ??
    s.products.find((p) => normalizeName(p.name) === legacyName);
  if (product && product.name !== OREO_BROWNIE_NAME) {
    product.name = OREO_BROWNIE_NAME;
    notes.push(`producto "${product.code}" renombrado a "${OREO_BROWNIE_NAME}"`);
  }

  // Igual que en `toV2`: el grupo desaparece en `toV6`, pero la migración se
  // deja como estaba. Renombrar algo que se va a borrar no cambia nada.
  const groups = (s as LegacyState).priceGroups;
  const group =
    groups?.find((g) => g.id === LEGACY_GENERIC_BROWNIE_GROUP_ID) ??
    groups?.find((g) => normalizeName(g.name) === legacyName);
  if (group && group.name !== OREO_BROWNIE_NAME) {
    group.name = OREO_BROWNIE_NAME;
    notes.push(`grupo de precio "${group.id}" renombrado a "${OREO_BROWNIE_NAME}"`);
  }

  return notes;
}

/**
 * v5 → v6
 *  · se elimina el mecanismo de **grupos de precio**: el precio de venta vuelve
 *    a ser el del producto, editable directo desde Inventario (decisión del
 *    negocio). Los precios que vivían en el grupo se vuelcan sobre sus
 *    miembros **celda a celda**, así que ningún precio de venta cambia.
 *  · se elimina `company.coldCakeCategory`: la alerta de precio bajo deja de
 *    ser "toda la categoría" y pasa a ser **un solo producto**, el genérico
 *    (ver `isGenericColdCake` en lib/pricing). `coldCakeMin`/`coldCakeMax`
 *    siguen vivos: son el umbral y el objetivo de esa alerta.
 *
 * Idempotente: si no queda ningún grupo ni ningún producto agrupado, no hace
 * nada y no devuelve notas.
 */
function toV6(s: AppState): string[] {
  const legacy = s as LegacyState;
  const groups = Array.isArray(legacy.priceGroups) ? legacy.priceGroups : null;
  const products = s.products as LegacyProduct[];
  const grouped = products.filter((p) => p.priceGroupId);

  if (!groups && !grouped.length) return []; // ya está en v6 (o nació en v6)

  const notes: string[] = [];

  /* 1 · La cola de sincronización. Las mutaciones de grupo apuntan a una entidad
     que el cliente deja de conocer y que el servidor va a retirar: mandarlas
     sería un rechazo seguro, y un rechazo permanente saca la mutación de la cola
     igual pero con ruido. Se purgan antes de tocar nada. */
  const stale = pendingMutations().filter(
    (m) => m.entity === "priceGroup" || m.entity === "priceGroupPrice",
  );
  if (stale.length) {
    removeMutations(stale.map((m) => m.mutationId));
    notes.push(`${stale.length} mutaciones de grupo de precio descartadas de la cola`);
  }

  /* 2 · Volcado del precio del grupo sobre el producto, **celda a celda**: se
     reemplaza la celda del mismo tipo de precio y se añade la que falte, pero
     no se borra ninguna celda propia de un tipo que el grupo no declare. El
     precio del grupo gana porque era el que se cobraba.

     El genérico entra aquí aunque hoy se venda `bsOnly`: sus precios en USD
     quedan como respaldo (no se usan para vender mientras el interruptor siga
     activo, pero se conservan). */
  const byId = new Map(groups?.map((g) => [g.id, g]) ?? []);
  let flattened = 0;

  for (const p of products) {
    // El genérico pudo crearse en esta misma pasada (`toV3`) y llegar aquí sin
    // grupo asignado; su precio vivía igualmente en el grupo genérico.
    const groupId = p.priceGroupId ?? (isGenericColdCake(p) ? LEGACY_GENERIC_GROUP_ID : undefined);
    const g = groupId ? byId.get(groupId) : undefined;

    if (g?.prices.length) {
      if (!Array.isArray(p.prices)) p.prices = [];
      for (const cell of g.prices) {
        const own = p.prices.find((x) => x.priceTypeId === cell.priceTypeId);
        if (own) own.amount = cell.amount;
        else p.prices.push({ priceTypeId: cell.priceTypeId, amount: cell.amount });
      }
      flattened++;
    }

    if (!p.priceGroupId) continue;
    delete p.priceGroupId;

    /* Parche **mínimo y explícito**: sólo desvincular y los precios. Mandar el
       producto entero desde una migración pisaría en el servidor campos que
       aquí nadie tocó (nombre, categoría, stock mínimo) con la copia local, que
       puede ser más vieja que la del servidor. `priceGroupId: null` viaja como
       null a propósito: es lo que desvincula; `undefined` se descartaría. */
    queueProductUpdate(p.id, { priceGroupId: null, prices: p.prices });
  }

  if (flattened)
    notes.push(`${flattened} producto${flattened === 1 ? "" : "s"} con el precio de su grupo`);
  if (grouped.length)
    notes.push(`${grouped.length} producto${grouped.length === 1 ? "" : "s"} desvinculados`);

  /* 3 · Fuera las estructuras del mecanismo retirado. */
  if (groups) {
    delete legacy.priceGroups;
    notes.push(`${groups.length} grupos de precio eliminados`);
  }
  if (legacy.company.coldCakeCategory !== undefined) {
    delete legacy.company.coldCakeCategory;
    notes.push("categoría de tortas frías retirada (la alerta es de un solo producto)");
  }

  /* 4 · Salvaguarda. La alerta se apoya en que exista **exactamente un**
     producto genérico; si no, el umbral no se aplica a nada (o se aplica dos
     veces) y hay que mirarlo a mano, no descubrirlo cuando falte dinero. */
  const generics = s.products.filter(isGenericColdCake);
  if (generics.length !== 1)
    notes.push(
      `ATENCIÓN: se esperaba 1 producto genérico de tortas frías y hay ${generics.length}` +
        (generics.length ? ` (${generics.map((p) => p.code).join(", ")})` : "") +
        ": revisa el catálogo, la alerta de precio bajo depende de él",
    );

  return notes;
}

const MIGRATIONS: Migration[] = [
  { to: 2, name: "price-groups-and-order-deposits", up: toV2 },
  { to: 3, name: "cold-cake-single-product", up: toV3 },
  { to: 4, name: "punto-de-venta-payment-method", up: toV4 },
  { to: 5, name: "oreo-brownie-rename-to-brownie", up: toV5 },
  { to: 6, name: "flatten-price-groups", up: toV6 },
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
