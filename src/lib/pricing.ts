/**
 * Resolución de precios: tasa vigente, regla de alerta y totales de líneas.
 *
 * Todo aquí es puro: recibe `AppState` y devuelve valores derivados. Los
 * mutadores viven en lib/business. Este módulo es el único que decide de dónde
 * sale el precio de un producto, para que no haya dos respuestas distintas
 * entre el catálogo, el POS y el ticket.
 *
 * Desde el esquema 6 el precio de venta es **siempre** el del producto: la
 * indirección del grupo de precio ("precio general") se retiró y cada producto
 * se edita directo desde Inventario.
 */

import { num, usd as fmtUsd } from "./format";
import { makeMoney, type Money } from "./money";
import {
  COLD_CAKE_ALERT_USD,
  COLD_CAKE_GENERIC_CODE,
  COLD_CAKE_GENERIC_PRODUCT_ID,
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

/* ── Precio de un producto ────────────────────────────── */

function pick(prices: ProductPrice[], priceTypeId: ID | undefined) {
  return prices.find((x) => x.priceTypeId === priceTypeId)?.amount ?? prices[0]?.amount ?? 0;
}

/**
 * Precio de venta en USD. **Usa siempre esta función** para leer un precio, en
 * vez de hurgar en `p.prices`: si un tipo de precio no tiene celda propia se cae
 * a la primera, que es lo que espera el mostrador.
 *
 * Recibe el estado aunque ya no lo necesite (el precio es del producto desde el
 * esquema 6): conservar la firma evita tocar las veinte llamadas de las
 * pantallas y deja la puerta abierta a una resolución que sí lo use.
 */
export function priceOf(_s: AppState, p: Product, priceTypeId: ID | undefined) {
  return pick(p.prices, priceTypeId);
}

/* ── Reglas y alertas de precio ───────────────────────── */

/**
 * El **único** producto con banda/alerta: el genérico que reemplazó a los 13
 * sabores. "Brownie" y "Torta Quesillo" quedan libres de cualquier control a
 * propósito (su precio vive por encima), igual que el resto del catálogo.
 *
 * Se identifica por id canónico y, si alguien lo recreó a mano, por código: son
 * las dos claves estables del catálogo.
 */
export function isGenericColdCake(p: Product) {
  return p.id === COLD_CAKE_GENERIC_PRODUCT_ID || p.code === COLD_CAKE_GENERIC_CODE;
}

/**
 * Regla configurada por el negocio: umbral de alerta y precio objetivo.
 *
 * **No corrige** un máximo menor que el mínimo: esa validación vive en Ajustes,
 * que es donde el usuario puede arreglarlo y ver el error. Corregirlo aquí en
 * silencio era lo que enmascaraba la configuración inválida.
 */
export function companyPriceRule(s: AppState): PriceRule {
  return {
    minUsd: s.company.coldCakeMin ?? COLD_CAKE_ALERT_USD,
    targetUsd: s.company.coldCakeMax ?? COLD_CAKE_TARGET_USD,
  };
}

/** Regla aplicable a un producto, o null si no tiene ninguna (todos menos uno). */
export function priceRuleOf(s: AppState, p: Product): PriceRule | null {
  return isGenericColdCake(p) ? companyPriceRule(s) : null;
}

/** "con la tasa de hoy" / "con la tasa del 12/09", para el texto de la alerta. */
function rateLabel(money: Money) {
  if (!money.stale || !money.at) return "con la tasa de hoy";
  const d = new Date(money.at);
  if (Number.isNaN(d.getTime())) return "con la tasa cargada";
  return `con la tasa del ${d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" })}`;
}

/** Monto en Bs para el texto de la alerta: sin decimales si es entero. */
function bsLabel(n: number) {
  return num(n, Number.isInteger(n) ? 0 : 2) + " Bs";
}

/**
 * Alerta de precio bajo de un producto.
 *
 * Se calcula al vuelo (no es un campo persistido) para que reaccione a cambios
 * de precio, de configuración **y de tasa** sin migraciones ni recálculos. Ese
 * último es el caso que importa en producción: el precio del genérico está fijo
 * en Bs, así que su equivalente en USD baja solo con la devaluación y la alerta
 * tiene que aparecer sin que nadie edite nada.
 *
 * `money` se recibe en vez de construirlo aquí para no rehacer el conversor una
 * vez por producto y por tipo de precio (ver `priceAlerts`).
 */
export function priceAlertOf(
  s: AppState,
  p: Product,
  priceTypeId: ID | undefined,
  money: Money,
): PriceAlert | null {
  if (!isGenericColdCake(p)) return null;
  const rule = priceRuleOf(s, p);
  if (!rule) return null;

  const base = {
    kind: "precio_bajo" as const,
    productId: p.id,
    productName: p.name,
    thresholdUsd: rule.minUsd,
    suggestedUsd: rule.targetUsd,
    rate: money.rate,
    rateAt: money.at,
    rateStale: money.stale,
  };

  if (p.bsOnly) {
    // Sin tasa no hay nada que comparar: mostrar "$0,00" o sugerir 0 Bs sería
    // peor que no avisar. El aviso que toca en ese caso es el de la tasa.
    if (money.missing) return null;
    const currentBs = p.bsPrice ?? 0;
    const currentUsd = money.toUsd(currentBs);
    if (currentUsd >= rule.minUsd) return null;
    const suggestedBs = money.toBsRounded(rule.targetUsd);
    return {
      ...base,
      mode: "bs",
      currentUsd,
      currentBs,
      suggestedBs,
      message:
        `${p.name} está en ${bsLabel(currentBs)} (≈ ${fmtUsd(currentUsd)} ${rateLabel(money)}); ` +
        `por debajo de ${fmtUsd(rule.minUsd)}. ` +
        `Súbela a ${bsLabel(suggestedBs)} (≈ ${fmtUsd(rule.targetUsd)}).`,
    };
  }

  const currentUsd = priceOf(s, p, priceTypeId);
  if (currentUsd >= rule.minUsd) return null;
  const ptName = s.priceTypes.find((x) => x.id === priceTypeId)?.name ?? "";
  return {
    ...base,
    mode: "usd",
    priceTypeId: priceTypeId ?? "",
    priceTypeName: ptName,
    currentUsd,
    message:
      `${p.name} está en ${fmtUsd(currentUsd)} (precio ${ptName}); ` +
      `por debajo de ${fmtUsd(rule.minUsd)} hay que subirlo a ${fmtUsd(rule.targetUsd)}.`,
  };
}

/**
 * Todas las alertas de precio bajo del catálogo. Hoy sólo puede haberlas de un
 * producto —el genérico de tortas frías— pero se recorre el catálogo igual para
 * que añadir otro con regla no obligue a tocar las pantallas.
 *
 * Un producto `bsOnly` produce **una sola** alerta: su precio es un único número
 * en Bs, no hay Mayor/Detal que distinguir.
 */
export function priceAlerts(s: AppState): PriceAlert[] {
  const money = moneyOf(s);
  const out: PriceAlert[] = [];
  const seen = new Set<string>();

  for (const p of s.products) {
    if (!p.active) continue;
    if (!isGenericColdCake(p)) continue;

    if (p.bsOnly) {
      const alert = priceAlertOf(s, p, undefined, money);
      const key = p.id + "|bs";
      if (alert && !seen.has(key)) {
        seen.add(key);
        out.push(alert);
      }
      continue;
    }

    for (const pt of s.priceTypes) {
      const alert = priceAlertOf(s, p, pt.id, money);
      if (!alert) continue;
      const key = p.id + "|" + pt.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alert);
    }
  }
  return out;
}

/**
 * Clave estable de una alerta dentro de una lista de React.
 *
 * Vive aquí, junto a `priceAlerts`, porque es la identidad de lo que esa función
 * produce: un producto `bsOnly` da una sola alerta, y uno con precio en USD, una
 * por tipo de precio afectado. Dos pantallas la pintan (Inventario e Inicio) y
 * ninguna debería tener que deducirla por su cuenta.
 */
export function priceAlertKey(a: PriceAlert) {
  return a.productId + "|" + (a.mode === "bs" ? "bs" : (a.priceTypeId ?? ""));
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
 *
 * `totalUsd` usa `lineUsd()` para TODAS las líneas, incluidas las `bsOnly`:
 * antes sumaba `subtotalUsd` directo, que en una línea `bsOnly` siempre es 0
 * (no tiene precio propio en USD) — así el "total en $" de un carrito con
 * torta fría daba 0, lo que a su vez bloqueaba abonos y pagos en USD sobre
 * ese carrito ("el abono supera el saldo pendiente ($0.00)") aunque el saldo
 * real, convertido a la tasa vigente, sí alcanzara para cubrirlos.
 */
export function itemsTotals(items: LineItem[], m: Money) {
  const totalUsd = items.reduce((a, i) => a + lineUsd(i, m), 0);
  const totalBs = items.reduce((a, i) => a + lineBs(i, m), 0);
  return { totalUsd, totalBs };
}

/** Compatibilidad: misma semántica que antes, a partir de una tasa suelta. */
export function totalsOf(items: LineItem[], rate: number) {
  return itemsTotals(items, makeMoney({ rate }));
}
