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

/**
 * Tipo de precio predeterminado del negocio (el marcado en Ajustes · Tipos de
 * precio). **Úsalo en vez de `s.priceTypes[0]`**: el orden de la lista no es la
 * preferencia del negocio, y una pantalla que lea el primero muestra un precio
 * distinto del que el mostrador va a cobrar en cuanto alguien marque otro
 * predeterminado. Cae al primero sólo si ninguno está marcado.
 */
export function defaultPriceType(s: AppState) {
  return s.priceTypes.find((p) => p.isDefault) ?? s.priceTypes[0];
}

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

/**
 * Precio en Bs de un producto `bsOnly` para un tipo de precio. Mismo criterio
 * que `priceOf` con su lista (`bsPrices`); un producto sin precios en Bs por
 * tipo —todos los anteriores a esa lista— usa su único `bsPrice` para todos.
 */
export function bsPriceOf(p: Product, priceTypeId: ID | undefined) {
  if (p.bsPrices?.length) return pick(p.bsPrices, priceTypeId);
  return p.bsPrice ?? 0;
}

/* ── Reglas y alertas de precio ───────────────────────── */

/**
 * El genérico que reemplazó a los 13 sabores. Hasta 2026-09 era el **único**
 * producto con banda/alerta; hoy la banda la decide `priceBand` en cada
 * producto, y esto queda como respaldo para datos que aún no lo traen (ver
 * `isPriceBanded`).
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

/**
 * ¿El precio de este producto está sujeto al rango de Ajustes? Lo decide el
 * negocio con el switch del formulario de producto (`priceBand`).
 *
 * `undefined` no es "no": es un producto que todavía no pasó por un servidor
 * que conozca el campo (o una instalación sin backend anterior a él). Ahí se
 * conserva el comportamiento de antes —sólo el genérico de tortas frías—, para
 * que su alerta no desaparezca mientras se actualiza el backend.
 */
export function isPriceBanded(p: Product) {
  return p.priceBand ?? isGenericColdCake(p);
}

/** Regla aplicable a un producto, o null si no está sujeto al rango. */
export function priceRuleOf(s: AppState, p: Product): PriceRule | null {
  return isPriceBanded(p) ? companyPriceRule(s) : null;
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

  const ptName = s.priceTypes.find((x) => x.id === priceTypeId)?.name ?? "";

  if (p.bsOnly) {
    // Sin tasa no hay nada que comparar: mostrar "$0,00" o sugerir 0 Bs sería
    // peor que no avisar. El aviso que toca en ese caso es el de la tasa.
    if (money.missing) return null;
    const currentBs = bsPriceOf(p, priceTypeId);
    const currentUsd = money.toUsd(currentBs);
    if (currentUsd >= rule.minUsd) return null;
    const suggestedBs = money.toBsRounded(rule.targetUsd);
    return {
      ...base,
      mode: "bs",
      priceTypeId,
      priceTypeName: priceTypeId ? ptName : undefined,
      currentUsd,
      currentBs,
      suggestedBs,
      message:
        `${p.name} está en ${bsLabel(currentBs)}${priceTypeId ? ` (precio ${ptName})` : ""} ` +
        `(≈ ${fmtUsd(currentUsd)} ${rateLabel(money)}); por debajo de ${fmtUsd(rule.minUsd)}. ` +
        `Precio sugerido: ${bsLabel(suggestedBs)} (≈ ${fmtUsd(rule.targetUsd)}).`,
    };
  }

  const currentUsd = priceOf(s, p, priceTypeId);
  if (currentUsd >= rule.minUsd) return null;
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
 * Todas las alertas de precio bajo del catálogo: una por cada producto activo
 * sujeto al rango (`isPriceBanded`) cuyo precio quedó por debajo del mínimo.
 * Pueden ser muchas a la vez —una subida de tasa baja el equivalente en USD de
 * todos los precios en Bs— y por eso la pantalla las corrige en bloque.
 *
 * Un producto sujeto al rango lo está en **todos** sus tipos de precio (Mayor y
 * Detal): da una alerta por cada tipo que quedó por debajo, sea en USD o en Bs.
 * La excepción es un producto `bsOnly` sin precios en Bs por tipo (un único
 * `bsPrice` para todos): ahí sólo hay un número que medir y da una sola alerta.
 */
export function priceAlerts(s: AppState): PriceAlert[] {
  const money = moneyOf(s);
  const out: PriceAlert[] = [];
  const seen = new Set<string>();

  for (const p of s.products) {
    if (!p.active) continue;
    if (!isPriceBanded(p)) continue;

    const types: (ID | undefined)[] =
      p.bsOnly && !p.bsPrices?.length ? [undefined] : s.priceTypes.map((pt) => pt.id);
    for (const typeId of types) {
      const alert = priceAlertOf(s, p, typeId, money);
      if (!alert) continue;
      const key = priceAlertKey(alert);
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
 * produce: una alerta por producto, moneda y tipo de precio afectado. Dos
 * pantallas la pintan (Inventario e Inicio) y ninguna debería tener que
 * deducirla por su cuenta.
 */
export function priceAlertKey(a: PriceAlert) {
  return a.productId + "|" + a.mode + "|" + (a.priceTypeId ?? "");
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

/* ── Tipo de precio por línea ─────────────────────────── */

/**
 * Vuelve a valorar una línea con otro tipo de precio (Mayor, Detal, …).
 *
 * El tipo de precio se guarda **en la línea**, no en la pantalla: una venta
 * puede llevar un producto al mayor y otro al detal. Por eso cambiarlo obliga a
 * recalcular el unitario y el subtotal de esa línea con el precio de ese tipo.
 *
 * Los productos con precio en Bs (`bsOnly`) también tienen Mayor y Detal: su
 * unitario es el monto en Bs de ese tipo (`bsPriceOf`), y el USD queda en 0.
 */
export function repriceLine(s: AppState, it: LineItem, priceTypeId: ID): LineItem {
  const p = s.products.find((x) => x.id === it.productId);
  if (!p) return it;
  if (it.bsOnly) return { ...it, priceTypeId, unitPriceBs: bsPriceOf(p, priceTypeId) };
  const unit = priceOf(s, p, priceTypeId);
  return {
    ...it,
    priceTypeId,
    unitPriceUsd: unit,
    subtotalUsd: (unit + (it.customizationPrice ?? 0)) * it.qty,
  };
}

/**
 * Fusiona las líneas que quedaron idénticas. Cambiar el tipo de precio de una
 * línea puede dejarla igual a otra del carrito (mismo producto, mismo tipo y
 * misma personalización), y dos líneas iguales en un ticket se leen como un
 * error de cobro: se suman las cantidades, igual que al agregar dos veces el
 * mismo producto.
 */
export function mergeLines(items: LineItem[]): LineItem[] {
  const out: LineItem[] = [];
  for (const it of items) {
    const twin = out.find(
      (x) =>
        x.productId === it.productId &&
        x.priceTypeId === it.priceTypeId &&
        (x.customization ?? "") === (it.customization ?? ""),
    );
    if (!twin) {
      out.push({ ...it });
      continue;
    }
    twin.qty += it.qty;
    twin.subtotalUsd = (twin.unitPriceUsd + (twin.customizationPrice ?? 0)) * twin.qty;
  }
  return out;
}

/**
 * Tipo de precio común a todo el carrito, o `null` si las líneas mezclan tipos
 * (una al mayor y otra al detal) o no hay ninguna. Cuentan todas, también las de
 * precio en Bs, que tienen su Mayor y su Detal. Sirve para que el selector
 * general diga la verdad sobre el carrito en vez de mostrar el último tipo elegido.
 */
export function commonPriceTypeId(items: LineItem[]): ID | null {
  const ids = new Set(items.map((i) => i.priceTypeId));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Compatibilidad: misma semántica que antes, a partir de una tasa suelta. */
export function totalsOf(items: LineItem[], rate: number) {
  return itemsTotals(items, makeMoney({ rate }));
}
