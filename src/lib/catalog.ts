/**
 * Forma canónica del catálogo. Lo usan tanto la semilla (instalación nueva)
 * como las migraciones (instalación existente), así ambas convergen al mismo
 * resultado y no hay dos definiciones de "cómo debe quedar el catálogo".
 *
 * Todo aquí es idempotente: correrlo dos veces no cambia nada.
 */

import { normalizeName, uid } from "./ids";
import {
  COLD_CAKE_CATEGORY_ID,
  COLD_CAKE_CATEGORY_NAME,
  COLD_CAKE_GENERIC_GROUP_ID,
  COLD_CAKE_GENERIC_PRICES,
  COLD_CAKE_GENERIC_RULE,
  COLD_CAKE_OREO_BROWNIE_GROUP_ID,
  COLD_CAKE_OREO_BROWNIE_PRICES,
  COLD_CAKE_QUESILLO_GROUP_ID,
  COLD_CAKE_QUESILLO_PRICES,
  OREO_BROWNIE_CODE,
  OREO_BROWNIE_NAME,
  TORTA_QUESILLO_CODE,
  TORTA_QUESILLO_NAME,
} from "./pricing-rules";
import type { AppState, Category, PriceGroup, PriceRule, Product, ProductPrice } from "./types";

/* ── Utilidades ───────────────────────────────────────── */

/**
 * Reparte un par mayor/detal entre los tipos de precio existentes: el primero
 * recibe "mayor", el resto "detal". Así funciona con 2 tipos de precio o con
 * los que el negocio añada después.
 */
export function spreadPrices(s: AppState, pair: { mayor: number; detal: number }): ProductPrice[] {
  if (!s.priceTypes.length) return [{ priceTypeId: "pt-mayor", amount: pair.mayor }];
  return s.priceTypes.map((pt, i) => ({
    priceTypeId: pt.id,
    amount: i === 0 ? pair.mayor : pair.detal,
  }));
}

function productByCode(s: AppState, code: string) {
  return s.products.find((p) => p.code === code);
}

function productByName(s: AppState, name: string) {
  const target = normalizeName(name);
  return s.products.find((p) => normalizeName(p.name) === target);
}

/** Siguiente código libre de la serie del catálogo (P001, P002, …). */
function nextFreeCode(s: AppState, preferred: string) {
  if (!productByCode(s, preferred)) return preferred;
  const used = new Set(s.products.map((p) => p.code));
  for (let n = 1; n < 1000; n++) {
    const candidate = "P" + String(n).padStart(3, "0");
    if (!used.has(candidate)) return candidate;
  }
  return "P-" + uid();
}

function ensureGroup(
  s: AppState,
  spec: {
    id: string;
    name: string;
    categoryId: string;
    prices: ProductPrice[];
    rule?: PriceRule;
  },
): PriceGroup {
  let g = s.priceGroups.find((x) => x.id === spec.id);
  if (!g) {
    g = {
      id: spec.id,
      name: spec.name,
      categoryId: spec.categoryId,
      prices: spec.prices,
      rule: spec.rule,
      active: true,
      createdAt: new Date().toISOString(),
    };
    s.priceGroups.push(g);
    return g;
  }
  // Grupo existente: se respetan los precios que el negocio haya editado y
  // sólo se reparan los metadatos estructurales.
  g.categoryId = spec.categoryId;
  if (!g.prices.length) g.prices = spec.prices;
  if (spec.rule && !g.rule) g.rule = spec.rule;
  return g;
}

/* ── Invariante de agrupación ─────────────────────────── */

/**
 * Garantiza la invariante "todo producto de una familia con precio general
 * pertenece a un grupo de precio". Llámala al crear o recategorizar un
 * producto (formulario de inventario, importación CSV): si cae en la categoría
 * de tortas frías y no trae grupo propio, hereda el precio general.
 *
 * Sin esto, un producto nuevo en esa categoría añadiría una cuarta unidad de
 * precio a una familia que debe tener exactamente tres.
 */
export function attachDefaultPriceGroup(s: AppState, p: Product) {
  if (p.priceGroupId) return;
  if (p.categoryId !== s.company.coldCakeCategory) return;
  if (!s.priceGroups?.some((g) => g.id === COLD_CAKE_GENERIC_GROUP_ID)) return;
  p.priceGroupId = COLD_CAKE_GENERIC_GROUP_ID;
}

/* ── Familia de tortas frías ──────────────────────────── */

/**
 * Deja la familia de tortas frías con **3 unidades de precio**:
 *
 *   1. "Tortas Frías"    → precio general de todos los sabores
 *   2. "Oreo y Brownie"  → precio propio y diferenciado
 *   3. "Torta Quesillo"  → precio propio y diferenciado
 *
 * Los sabores siguen existiendo como productos individuales (el ticket, el
 * inventario y la producción necesitan saber qué sabor se vendió, y los pedidos
 * y ventas ya registrados apuntan a esos ids). Lo que se agrupa es el
 * **precio**, no el producto: así ninguna referencia histórica se rompe.
 *
 * Devuelve notas de lo que cambió, para registrarlas en la auditoría.
 */
export function ensureColdCakeFamily(s: AppState): string[] {
  const notes: string[] = [];
  if (!s.priceGroups) s.priceGroups = [];

  /* 1 · Categoría de la familia */
  const wantedId = s.company.coldCakeCategory || COLD_CAKE_CATEGORY_ID;
  let cat: Category | undefined =
    s.categories.find((c) => c.id === wantedId) ??
    s.categories.find((c) => normalizeName(c.name) === normalizeName(COLD_CAKE_CATEGORY_NAME));
  if (!cat) {
    cat = { id: wantedId, name: COLD_CAKE_CATEGORY_NAME, active: true };
    s.categories.push(cat);
    notes.push(`categoría "${COLD_CAKE_CATEGORY_NAME}" creada`);
  }
  s.company.coldCakeCategory = cat.id;

  /* 2 · Torta Quesillo: entra a la familia conservando su precio */
  const quesillo =
    productByCode(s, TORTA_QUESILLO_CODE) ?? productByName(s, TORTA_QUESILLO_NAME) ?? null;
  if (quesillo) {
    if (quesillo.categoryId !== cat.id) {
      quesillo.categoryId = cat.id;
      notes.push(`"${TORTA_QUESILLO_NAME}" movida a ${cat.name}`);
    }
    if (quesillo.name !== TORTA_QUESILLO_NAME) quesillo.name = TORTA_QUESILLO_NAME;
  }

  /* 3 · Oreo y Brownie: producto nuevo si no existía */
  let oreo = productByName(s, OREO_BROWNIE_NAME) ?? null;
  if (!oreo) {
    const code = nextFreeCode(s, OREO_BROWNIE_CODE);
    oreo = {
      id: "prod-" + code,
      code,
      name: OREO_BROWNIE_NAME,
      categoryId: cat.id,
      stock: 0,
      minStock: 5,
      active: true,
      prices: spreadPrices(s, COLD_CAKE_OREO_BROWNIE_PRICES),
      createdAt: new Date().toISOString(),
    };
    s.products.push(oreo);
    notes.push(`producto "${OREO_BROWNIE_NAME}" creado (${code})`);
  } else if (oreo.categoryId !== cat.id) {
    oreo.categoryId = cat.id;
    notes.push(`"${OREO_BROWNIE_NAME}" movido a ${cat.name}`);
  }

  /* 4 · Las tres unidades de precio.
     El precio del grupo se toma del producto que ya lo tenía, para que agrupar
     no cambie ningún precio de venta en instalaciones existentes. */
  const genericSample = s.products.find(
    (p) =>
      p.categoryId === cat!.id && p.id !== quesillo?.id && p.id !== oreo!.id && p.prices.length > 0,
  );
  const generic = ensureGroup(s, {
    id: COLD_CAKE_GENERIC_GROUP_ID,
    name: COLD_CAKE_CATEGORY_NAME,
    categoryId: cat.id,
    prices: genericSample
      ? genericSample.prices.map((x) => ({ ...x }))
      : spreadPrices(s, COLD_CAKE_GENERIC_PRICES),
    rule: COLD_CAKE_GENERIC_RULE,
  });

  const oreoGroup = ensureGroup(s, {
    id: COLD_CAKE_OREO_BROWNIE_GROUP_ID,
    name: OREO_BROWNIE_NAME,
    categoryId: cat.id,
    prices: oreo.prices.length
      ? oreo.prices.map((x) => ({ ...x }))
      : spreadPrices(s, COLD_CAKE_OREO_BROWNIE_PRICES),
  });

  const quesilloGroup = ensureGroup(s, {
    id: COLD_CAKE_QUESILLO_GROUP_ID,
    name: TORTA_QUESILLO_NAME,
    categoryId: cat.id,
    prices: quesillo?.prices.length
      ? quesillo.prices.map((x) => ({ ...x }))
      : spreadPrices(s, COLD_CAKE_QUESILLO_PRICES),
  });

  /* 5 · Asignación. Los diferenciados primero, para que el barrido del
     genérico no se los lleve. */
  oreo.priceGroupId = oreoGroup.id;
  if (quesillo) quesillo.priceGroupId = quesilloGroup.id;

  let grouped = 0;
  for (const p of s.products) {
    if (p.categoryId !== cat.id) continue;
    if (p.id === oreo.id || p.id === quesillo?.id) continue;
    // Respeta cualquier unidad de precio que el negocio ya le haya asignado.
    if (p.priceGroupId) continue;
    p.priceGroupId = generic.id;
    grouped++;
  }
  if (grouped) notes.push(`${grouped} sabores agrupados bajo el precio general "${generic.name}"`);

  return notes;
}
