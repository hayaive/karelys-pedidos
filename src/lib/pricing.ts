/**
 * Resolución de precios: tasa vigente, grupos de precio ("precio general"),
 * reglas de alerta y totales de líneas.
 *
 * Todo aquí es puro: recibe `AppState` y devuelve valores derivados. Los
 * mutadores viven en lib/business. Este módulo es el único que decide de dónde
 * sale el precio de un producto, para que no haya dos respuestas distintas
 * entre el catálogo, el POS y el ticket.
 */

import { makeMoney, type Money } from "./money";
import {
  COLD_CAKE_ALERT_USD,
  COLD_CAKE_TARGET_USD,
  DEFAULT_BS_ROUNDING,
  DEFAULT_RATE_MAX_AGE_HOURS,
  SALE_RATE_SOURCE,
} from "./pricing-rules";
import type {
  AppState,
  ID,
  LineItem,
  PriceAlert,
  PriceGroup,
  PriceRule,
  Product,
  ProductPrice,
  RateSource,
  Sale,
} from "./types";

/* ── Tasa de cambio ───────────────────────────────────── */

/**
 * La tasa vive en `AppState.rates`: un log append-only, más reciente primero.
 * Nunca se sobreescribe una tasa: se publica una nueva (ver `setRate` en
 * lib/business) para conservar el historial y poder auditar qué tasa se cobró.
 */
export function currentRate(s: AppState, source: RateSource) {
  return s.rates
    .filter((r) => r.source === source)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Tasa BCV USD vigente (la única con la que se cobra). 0 si no hay ninguna. */
export function bcvRate(s: AppState) {
  return currentRate(s, SALE_RATE_SOURCE)?.value ?? 0;
}

/**
 * Conversor ligado a la tasa BCV vigente y al redondeo configurado.
 * Es el punto único de conversión a bolívares: precios de lista, ticket de
 * pedido, ticket de venta y cobro salen todos de aquí.
 */
export function moneyOf(s: AppState): Money {
  const r = currentRate(s, SALE_RATE_SOURCE);
  return makeMoney({
    rate: r?.value ?? 0,
    bsRounding: s.company.bsRounding ?? DEFAULT_BS_ROUNDING,
    at: r?.createdAt ?? null,
    source: SALE_RATE_SOURCE,
    maxAgeHours: s.company.rateMaxAgeHours ?? DEFAULT_RATE_MAX_AGE_HOURS,
  });
}

/**
 * Conversor congelado a la tasa con la que se cobró una venta. Un comprobante
 * ya emitido debe reimprimirse siempre con su tasa original, no con la de hoy.
 */
export function moneyOfSale(s: AppState, sale: Sale): Money {
  return makeMoney({
    rate: sale.rateSnapshot?.usd ?? 0,
    bsRounding: s.company.bsRounding ?? DEFAULT_BS_ROUNDING,
    at: sale.rateSnapshot?.at ?? sale.createdAt,
    source: SALE_RATE_SOURCE,
  });
}

export function rateSnapshot(s: AppState) {
  return {
    usd: currentRate(s, "BCV_USD")?.value ?? 0,
    eur: currentRate(s, "BCV_EUR")?.value ?? 0,
    binance: currentRate(s, "BINANCE")?.value ?? 0,
    at: new Date().toISOString(),
  };
}

/* ── Grupos de precio ─────────────────────────────────── */

export function priceGroupOf(s: AppState, p: Product): PriceGroup | null {
  if (!p.priceGroupId) return null;
  return s.priceGroups?.find((g) => g.id === p.priceGroupId) ?? null;
}

/** Precios efectivos: los del grupo si pertenece a uno, si no los propios. */
export function resolvePrices(s: AppState, p: Product): ProductPrice[] {
  const g = priceGroupOf(s, p);
  if (g && g.prices.length) return g.prices;
  return p.prices;
}

function pick(prices: ProductPrice[], priceTypeId: ID | undefined) {
  return prices.find((x) => x.priceTypeId === priceTypeId)?.amount ?? prices[0]?.amount ?? 0;
}

/**
 * Precio de venta efectivo en USD. **Usa siempre esta función** para leer un
 * precio: resuelve el grupo y así el "precio general" de tortas frías aplica
 * en todas las pantallas sin duplicar la regla.
 */
export function priceOf(s: AppState, p: Product, priceTypeId: ID | undefined) {
  return pick(resolvePrices(s, p), priceTypeId);
}

/**
 * Precio propio del producto, ignorando el grupo. Sólo para el formulario de
 * inventario, que edita el precio individual (y debe avisar que el grupo lo
 * sobreescribe).
 */
export function ownPriceOf(p: Product, priceTypeId: ID | undefined) {
  return pick(p.prices, priceTypeId);
}

/** Productos que comparten una unidad de precio. */
export function productsOfGroup(s: AppState, groupId: ID) {
  return s.products.filter((p) => p.priceGroupId === groupId);
}

/** Grupos de precio de una categoría, con sus miembros. Para la UI de precios. */
export function priceGroupsOfCategory(s: AppState, categoryId: ID) {
  return (s.priceGroups ?? [])
    .filter((g) => g.categoryId === categoryId)
    .map((g) => ({ group: g, products: productsOfGroup(s, g.id) }));
}

/**
 * Las unidades de precio de la familia de tortas frías. Después de la
 * migración son exactamente 3, con un producto cada una: el genérico
 * "Tortas Frías" (que reemplazó a los 13 sabores) y los dos diferenciados.
 */
export function coldCakePriceGroups(s: AppState) {
  return priceGroupsOfCategory(s, s.company.coldCakeCategory);
}

export function isColdCake(s: AppState, p: Product) {
  return p.categoryId === s.company.coldCakeCategory;
}

/* ── Reglas y alertas de precio ───────────────────────── */

/** Regla por defecto de la empresa (umbral y precio objetivo de tortas frías). */
export function companyPriceRule(s: AppState): PriceRule {
  const minUsd = s.company.coldCakeMin ?? COLD_CAKE_ALERT_USD;
  const targetUsd = Math.max(s.company.coldCakeMax ?? COLD_CAKE_TARGET_USD, minUsd);
  return { minUsd, targetUsd, band: { minUsd, maxUsd: targetUsd } };
}

/**
 * Regla aplicable a un producto: la de su grupo si la declara, si no la de la
 * empresa. Devuelve null para productos ajenos a la familia de tortas frías:
 * no tienen umbral y no deben generar alertas.
 *
 * Un producto que pertenece a un grupo de precio se rige **sólo** por la
 * regla de ese grupo (o ninguna, si el grupo no la declara): "Brownie"
 * y "Torta Quesillo" viven en la categoría de tortas frías pero su grupo no
 * declara `rule` a propósito, para quedar fuera de la banda del genérico (ver
 * comentario de `priceBandCheck`). El resguardo de la regla de empresa sólo
 * aplica a productos de la categoría sin grupo asignado.
 */
export function priceRuleOf(s: AppState, p: Product): PriceRule | null {
  const g = priceGroupOf(s, p);
  if (g) return g.rule ?? null;
  if (isColdCake(s, p)) return companyPriceRule(s);
  return null;
}

/**
 * Alerta de precio bajo de un producto para un tipo de precio.
 * Se calcula al vuelo (no es un campo persistido) para que reaccione a cambios
 * de precio y de configuración sin migraciones ni recálculos.
 */
export function priceAlertOf(
  s: AppState,
  p: Product,
  priceTypeId: ID | undefined,
): PriceAlert | null {
  if (p.bsOnly) return null; // su precio no está en USD
  const rule = priceRuleOf(s, p);
  if (!rule) return null;
  const current = priceOf(s, p, priceTypeId);
  if (current >= rule.minUsd) return null;

  const g = priceGroupOf(s, p);
  const members = g ? productsOfGroup(s, g.id) : [p];
  const ptName = s.priceTypes.find((x) => x.id === priceTypeId)?.name ?? "";
  return {
    kind: "precio_bajo",
    priceGroupId: g?.id,
    priceGroupName: g?.name,
    productIds: members.map((x) => x.id),
    productNames: members.map((x) => x.name),
    priceTypeId: priceTypeId ?? "",
    priceTypeName: ptName,
    currentUsd: current,
    thresholdUsd: rule.minUsd,
    suggestedUsd: rule.targetUsd,
    message: `${g?.name ?? p.name} está en $${current.toFixed(2)} (precio ${ptName}); por debajo de $${rule.minUsd.toFixed(2)} hay que subirlo a $${rule.targetUsd.toFixed(2)}.`,
  };
}

/**
 * Todas las alertas de precio bajo del catálogo, deduplicadas por unidad de
 * precio: un grupo produce una sola alerta por tipo de precio, tenga uno o
 * varios miembros. Para el badge/panel de alertas.
 */
export function priceAlerts(s: AppState): PriceAlert[] {
  const out: PriceAlert[] = [];
  const seen = new Set<string>();
  for (const p of s.products) {
    if (!p.active) continue;
    for (const pt of s.priceTypes) {
      const alert = priceAlertOf(s, p, pt.id);
      if (!alert) continue;
      const key = (alert.priceGroupId ?? p.id) + "|" + pt.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alert);
    }
  }
  return out;
}

/* ── Banda de redondeo en Bs ──────────────────────────── */

export interface BandCheck {
  /** Equivalente exacto en Bs antes de redondear. */
  rawBs: number;
  /** Equivalente en Bs ya redondeado y corregido dentro de la banda. */
  finalBs: number;
  /** Precio USD que representa `finalBs` (lo que realmente paga el cliente). */
  usdBack: number;
  ok: boolean;
  min: number;
  max: number;
  /** false si el producto no tiene banda declarada: nunca bloquea. */
  enforced: boolean;
}

function bandCheckWith(
  band: { minUsd: number; maxUsd: number } | undefined,
  usdPrice: number,
  rate: number,
  step: number,
): BandCheck {
  const rawBs = usdPrice * rate;
  const s = step || 1;
  if (!band) {
    return {
      rawBs,
      finalBs: Math.round(rawBs / s) * s,
      usdBack: usdPrice,
      ok: true,
      min: 0,
      max: Infinity,
      enforced: false,
    };
  }
  let finalBs = Math.round(rawBs / s) * s;
  let back = rate ? finalBs / rate : 0;
  if (back < band.minUsd) {
    finalBs = Math.ceil((band.minUsd * rate) / s) * s;
    back = rate ? finalBs / rate : 0;
  } else if (back > band.maxUsd) {
    finalBs = Math.floor((band.maxUsd * rate) / s) * s;
    back = rate ? finalBs / rate : 0;
  }
  return {
    rawBs,
    finalBs,
    usdBack: back,
    ok: back >= band.minUsd - 1e-9 && back <= band.maxUsd + 1e-9,
    min: band.minUsd,
    max: band.maxUsd,
    enforced: true,
  };
}

/**
 * Comprueba la banda que aplica a un producto concreto. Sólo los grupos que
 * declaran `band` pueden bloquear una venta; los sabores diferenciados quedan
 * fuera de la banda del genérico a propósito y por eso nunca se bloquean.
 */
export function priceBandCheck(s: AppState, p: Product, usdPrice: number, rate: number): BandCheck {
  const rule = priceRuleOf(s, p);
  return bandCheckWith(rule?.band, usdPrice, rate, s.company.bsRounding ?? DEFAULT_BS_ROUNDING);
}

/**
 * Versión heredada, con la regla de la empresa. Se conserva porque la usan
 * pantallas existentes; para validar un producto concreto usa `priceBandCheck`.
 */
export function coldCakeCheck(s: AppState, usdPrice: number, rate: number): BandCheck {
  return bandCheckWith(
    companyPriceRule(s).band,
    usdPrice,
    rate,
    s.company.bsRounding ?? DEFAULT_BS_ROUNDING,
  );
}

/* ── Líneas y totales ─────────────────────────────────── */

/** Subtotal en USD de una línea (incluye el recargo por personalización). */
export function lineUsd(i: LineItem, m?: Money) {
  if (i.bsOnly) return m && m.rate ? m.toUsd((i.unitPriceBs ?? 0) * i.qty) : 0;
  return i.subtotalUsd;
}

/**
 * Subtotal en Bs de una línea, convertido con la tasa del conversor recibido.
 * Las líneas con precio fijado en Bs se devuelven tal cual, sin convertir.
 */
export function lineBs(i: LineItem, m: Money) {
  if (i.bsOnly) return (i.unitPriceBs ?? 0) * i.qty;
  return m.toBs(i.subtotalUsd);
}

/** Precio unitario en Bs (con personalización incluida), para tickets. */
export function unitBs(i: LineItem, m: Money) {
  if (i.bsOnly) return i.unitPriceBs ?? 0;
  return m.toBs(i.unitPriceUsd + (i.customizationPrice ?? 0));
}

/**
 * Totales de un carrito con un conversor. El total en Bs se calcula al vuelo:
 * así una torta de cumpleaños siempre se cobra a la tasa del momento de la
 * venta y nunca a una tasa congelada al crear el producto.
 */
export function itemsTotals(items: LineItem[], m: Money) {
  const totalUsd = items.reduce((a, i) => a + (i.bsOnly ? 0 : i.subtotalUsd), 0);
  const totalBs = items.reduce((a, i) => a + lineBs(i, m), 0);
  return { totalUsd, totalBs };
}

/** Compatibilidad: misma semántica que antes, a partir de una tasa suelta. */
export function totalsOf(items: LineItem[], rate: number) {
  return itemsTotals(items, makeMoney({ rate }));
}
