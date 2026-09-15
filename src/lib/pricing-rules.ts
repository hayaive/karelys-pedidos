/**
 * Constantes de negocio de precios. Único lugar donde viven los números
 * "mágicos": umbrales, precios objetivo e identidad de la familia de tortas
 * frías. Los valores configurables por el usuario se guardan en
 * `CompanySettings` / `PriceGroup.rule` y usan estos como valor por defecto.
 */

import type { PriceRule } from "./types";

/* ── Tortas frías ─────────────────────────────────────── */

/** Umbral de alerta: por debajo de este precio USD hay que subir el precio. */
export const COLD_CAKE_ALERT_USD = 1.1;

/** Precio USD al que la alerta pide subir cuando se dispara. */
export const COLD_CAKE_TARGET_USD = 1.3;

/** Id de la categoría de tortas frías en el catálogo semilla. */
export const COLD_CAKE_CATEGORY_ID = "cat-tortas-frias";
export const COLD_CAKE_CATEGORY_NAME = "Tortas Frías";

/**
 * Las 3 unidades de precio de la familia. Cada una tiene exactamente un
 * producto: el genérico "Tortas Frías" y los dos diferenciados. Se mantiene la
 * indirección de grupo en los tres por simetría —la UI de "Precios agrupados"
 * lista una fila por grupo— y porque la regla de precio con banda vive en el
 * grupo, no en el producto (ver `priceRuleOf` en lib/pricing).
 */
export const COLD_CAKE_GENERIC_GROUP_ID = "pg-tortas-frias";
export const COLD_CAKE_OREO_BROWNIE_GROUP_ID = "pg-oreo-brownie";
export const COLD_CAKE_QUESILLO_GROUP_ID = "pg-torta-quesillo";

/** Códigos de los productos que conservan precio propio y diferenciado. */
export const OREO_BROWNIE_CODE = "P059";
export const TORTA_QUESILLO_CODE = "P015";

export const OREO_BROWNIE_NAME = "Brownie";
export const TORTA_QUESILLO_NAME = "Torta Quesillo";

/* ── Producto único de tortas frías ───────────────────── */

/**
 * Producto único que representa toda la familia de sabores. El negocio dejó de
 * distinguir el sabor al vender (decisión del dueño, esquema v3): el cajero ve
 * un solo ítem "Tortas Frías".
 *
 * El código es nuevo (sigue la serie del catálogo, que llegaba a P059) y no
 * reutiliza ninguno de los retirados: un ticket viejo que dice "P001 ·
 * tres-leches" nunca debe resolver a este producto.
 */
export const COLD_CAKE_GENERIC_CODE = "P060";
export const COLD_CAKE_GENERIC_PRODUCT_ID = "prod-" + COLD_CAKE_GENERIC_CODE;
export const COLD_CAKE_GENERIC_NAME = COLD_CAKE_CATEGORY_NAME;

/**
 * Los 13 sabores individuales que existieron hasta el esquema v2. Se eliminan
 * en v3 y se consolidan en `COLD_CAKE_GENERIC_CODE` (ver
 * `ensureColdCakeFamily` en lib/catalog).
 *
 * La lista se conserva aquí —no en la semilla— porque es la identidad de lo
 * que hay que retirar en instalaciones existentes: la semilla ya no los trae.
 * Sus códigos quedan **retirados**: `nextFreeCode` no los reparte de nuevo,
 * para que no aparezcan dos productos distintos con el mismo código en
 * comprobantes de fechas distintas.
 */
export const COLD_CAKE_LEGACY_FLAVORS: { code: string; name: string }[] = [
  { code: "P001", name: "tres-leches" },
  { code: "P002", name: "milhojas" },
  { code: "P003", name: "fresa" },
  { code: "P004", name: "arequipe" },
  { code: "P005", name: "torta suiza" },
  { code: "P006", name: "chocolate" },
  { code: "P007", name: "choco-leche" },
  { code: "P008", name: "choco-fresa" },
  { code: "P009", name: "mani" },
  { code: "P010", name: "choco-mani" },
  { code: "P011", name: "choco-arequipe" },
  { code: "P012", name: "prestigio" },
  { code: "P013", name: "tornado" },
];

/**
 * Precio del grupo genérico. Coincide con el precio que ya tenían los 13
 * sabores, así consolidarlos no cambia ningún precio de venta.
 */
export const COLD_CAKE_GENERIC_PRICES = { mayor: 1.1, detal: 1.11 };

/**
 * Precio de los dos diferenciados. "Torta Quesillo" conserva exactamente el
 * precio que tenía como postre (1,30 / 1,36). "Brownie" es un producto
 * nuevo: se alinea al mismo escalón (revisar con el negocio).
 */
export const COLD_CAKE_QUESILLO_PRICES = { mayor: 1.3, detal: 1.36 };
export const COLD_CAKE_OREO_BROWNIE_PRICES = { mayor: 1.3, detal: 1.36 };

/**
 * Regla del grupo genérico. Es el único con `band`: al redondear el precio a
 * Bs enteros el equivalente USD se corrige para no salirse de 1,10–1,30.
 * Los dos diferenciados heredan la regla de la empresa (alerta sin banda),
 * porque su precio vive por encima de la banda del genérico a propósito.
 */
export const COLD_CAKE_GENERIC_RULE: PriceRule = {
  minUsd: COLD_CAKE_ALERT_USD,
  targetUsd: COLD_CAKE_TARGET_USD,
  band: { minUsd: COLD_CAKE_ALERT_USD, maxUsd: COLD_CAKE_TARGET_USD },
};

/* ── Tasa de cambio ───────────────────────────────────── */

/** Fuente canónica para convertir precios de venta a bolívares. */
export const SALE_RATE_SOURCE = "BCV_USD" as const;

/** Horas tras las que la tasa BCV se considera vencida. */
export const DEFAULT_RATE_MAX_AGE_HOURS = 24;

/** Paso de redondeo en Bs por defecto (1 = bolívares enteros). */
export const DEFAULT_BS_ROUNDING = 1;
