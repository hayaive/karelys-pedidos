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
  COLD_CAKE_GENERIC_CODE,
  COLD_CAKE_GENERIC_GROUP_ID,
  COLD_CAKE_GENERIC_NAME,
  COLD_CAKE_GENERIC_PRICES,
  COLD_CAKE_GENERIC_PRODUCT_ID,
  COLD_CAKE_GENERIC_RULE,
  COLD_CAKE_LEGACY_FLAVORS,
  COLD_CAKE_OREO_BROWNIE_GROUP_ID,
  COLD_CAKE_OREO_BROWNIE_PRICES,
  COLD_CAKE_QUESILLO_GROUP_ID,
  COLD_CAKE_QUESILLO_PRICES,
  OREO_BROWNIE_CODE,
  OREO_BROWNIE_NAME,
  TORTA_QUESILLO_CODE,
  TORTA_QUESILLO_NAME,
} from "./pricing-rules";
import type {
  AppState,
  Category,
  PriceAlert,
  PriceGroup,
  PriceRule,
  Product,
  ProductPrice,
} from "./types";

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

/**
 * Siguiente código libre de la serie del catálogo (P001, P002, …).
 *
 * Los códigos de los sabores retirados cuentan como ocupados aunque ya no
 * exista el producto: un comprobante viejo sigue diciendo "P001 · tres-leches"
 * y reasignar ese código a otro producto haría que el mismo código signifique
 * dos cosas distintas según la fecha del ticket.
 */
function nextFreeCode(s: AppState, preferred: string) {
  const used = new Set<string>([
    ...s.products.map((p) => p.code),
    ...COLD_CAKE_LEGACY_FLAVORS.map((f) => f.code),
  ]);
  if (!used.has(preferred)) return preferred;
  for (let n = 1; n < 1000; n++) {
    const candidate = "P" + String(n).padStart(3, "0");
    if (!used.has(candidate)) return candidate;
  }
  return "P-" + uid();
}

/**
 * Los productos que fueron los 13 sabores individuales, si todavía existen.
 * Se identifican por código (la clave de negocio estable del catálogo) y, por
 * si alguien editó el código a mano, también por el id que generó la semilla.
 */
function legacyFlavorProducts(s: AppState): Product[] {
  const codes = new Set(COLD_CAKE_LEGACY_FLAVORS.map((f) => f.code));
  const ids = new Set(COLD_CAKE_LEGACY_FLAVORS.map((f) => "prod-" + f.code));
  return s.products.filter(
    (p) => p.id !== COLD_CAKE_GENERIC_PRODUCT_ID && (codes.has(p.code) || ids.has(p.id)),
  );
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

/* ── Consolidación de los sabores ─────────────────────── */

/**
 * Deja **un único producto** "Tortas Frías" y elimina los 13 sabores
 * individuales (P001–P013).
 *
 * Decisión del negocio (esquema v3): ya no se elige sabor al vender, así que la
 * distinción por sabor desaparece hacia adelante (nuevas ventas) y hacia atrás
 * (los productos se borran de verdad, no se archivan).
 *
 * Lo que sí se preserva es la **integridad referencial**: el stock de los 13 se
 * suma en el producto único y todo lo que apuntaba a sus ids se reapunta, en
 * vez de dejarse colgando. Ver el comentario de la reasignación más abajo.
 *
 * Es idempotente: si ya no queda ningún sabor, sólo garantiza que el producto
 * único exista y no toca nada más.
 */
function collapseColdCakeFlavors(s: AppState, cat: Category): string[] {
  const notes: string[] = [];
  if (!Array.isArray(s.movements)) s.movements = [];

  const flavors = legacyFlavorProducts(s);

  /* Producto único: por id canónico y, si no, por nombre dentro de la familia
     (una instalación pudo crearlo a mano antes de migrar). Nunca por código
     suelto: adoptar un producto ajeno que casualmente use ese código sería
     peor que crear el propio. */
  const target = normalizeName(COLD_CAKE_GENERIC_NAME);
  let generic =
    s.products.find((p) => p.id === COLD_CAKE_GENERIC_PRODUCT_ID) ??
    s.products.find((p) => p.categoryId === cat.id && normalizeName(p.name) === target) ??
    null;

  /* Precio de arranque: el del grupo genérico si ya existe (el negocio pudo
     haberlo editado) y si no el de los sabores. Así consolidar no cambia
     ningún precio de venta. */
  const groupPrices = s.priceGroups?.find((g) => g.id === COLD_CAKE_GENERIC_GROUP_ID)?.prices;
  const inherited = groupPrices?.length
    ? groupPrices
    : (flavors.find((f) => f.prices.length)?.prices ?? null);

  if (!generic) {
    const code = nextFreeCode(s, COLD_CAKE_GENERIC_CODE);
    generic = {
      id: COLD_CAKE_GENERIC_PRODUCT_ID,
      code,
      name: COLD_CAKE_GENERIC_NAME,
      categoryId: cat.id,
      stock: 0,
      minStock: 5,
      active: true,
      prices: inherited
        ? inherited.map((x) => ({ ...x }))
        : spreadPrices(s, COLD_CAKE_GENERIC_PRICES),
      createdAt: new Date().toISOString(),
    };
    s.products.push(generic);
    notes.push(`producto único "${COLD_CAKE_GENERIC_NAME}" creado (${code})`);
  } else {
    if (generic.categoryId !== cat.id) generic.categoryId = cat.id;
    if (generic.name !== COLD_CAKE_GENERIC_NAME) generic.name = COLD_CAKE_GENERIC_NAME;
    if (!generic.prices.length && inherited) generic.prices = inherited.map((x) => ({ ...x }));
  }

  if (!flavors.length) return notes; // nada que consolidar

  /* Stock: la familia pasa a ser un solo SKU fungible, así que las unidades
     físicas de los 13 sabores son las del producto único. Si no se sumaran, el
     inventario quedaría subvalorado y habría que recontar a mano. */
  const stockSum = flavors.reduce((a, f) => a + (Number.isFinite(f.stock) ? f.stock : 0), 0);
  generic.stock += stockSum;

  /* Reasignación de referencias. Los ids de los sabores no se dejan colgando:
   *   · `movements`  el kardex conserva su dueño (si no, el historial mostraría
   *     filas sin producto) y cuadra con el stock consolidado.
   *   · `items` de ventas y pedidos: `applyMovement` ignora en silencio un
   *     `productId` que no existe, así que una venta vieja anulada nunca
   *     devolvería stock y un pedido pendiente creado antes de migrar nunca lo
   *     descontaría al procesarse (ver createSale/cancelSale en lib/business).
   *
   * `code` y `name` de las líneas y el `reason` de los movimientos NO se tocan:
   * son la foto del momento y el comprobante debe seguir diciendo qué sabor se
   * despachó. El sabor original se anota además en el movimiento, para que la
   * reasignación quede visible en el historial y no sea un cambio silencioso. */
  const byId = new Map(flavors.map((f) => [f.id, f]));

  let movedMovements = 0;
  for (const m of s.movements) {
    const f = byId.get(m.productId);
    if (!f) continue;
    m.productId = generic.id;
    m.note = m.note ? `${m.note} · sabor: ${f.name}` : `sabor: ${f.name}`;
    movedMovements++;
  }

  let movedLines = 0;
  for (const doc of [...s.sales, ...s.orders]) {
    if (!Array.isArray(doc.items)) continue;
    for (const it of doc.items) {
      if (!byId.has(it.productId)) continue;
      it.productId = generic.id;
      movedLines++;
    }
  }

  /* El stock del producto único salta por la consolidación, no por una venta:
     queda asentado como ajuste para que el historial explique de dónde viene. */
  s.movements.unshift({
    id: uid(),
    productId: generic.id,
    qty: generic.stock,
    type: "ajuste",
    reason: "Consolidación de sabores de Tortas Frías",
    note: `${flavors.length} sabores retirados · stock acumulado ${stockSum}`,
    userId: "system",
    createdAt: new Date().toISOString(),
  });

  /* Borrado real de las filas, como pidió el negocio (no archivado). */
  s.products = s.products.filter((p) => !byId.has(p.id));

  notes.push(
    `${flavors.length} sabores eliminados y consolidados en "${generic.name}" (${generic.code})`,
  );
  notes.push(`stock acumulado ${stockSum} trasladado al producto único`);
  if (movedMovements) notes.push(`${movedMovements} movimientos de inventario reasignados`);
  if (movedLines) notes.push(`${movedLines} líneas de venta/pedido reapuntadas`);

  return notes;
}

/* ── Familia de tortas frías ──────────────────────────── */

/**
 * Deja la familia de tortas frías con **3 unidades de precio**, una por
 * producto:
 *
 *   1. "Tortas Frías"    → producto único que reemplaza a los 13 sabores
 *   2. "Oreo y Brownie"  → precio propio y diferenciado
 *   3. "Torta Quesillo"  → precio propio y diferenciado
 *
 * Los tres conservan la indirección de `PriceGroup` aunque tengan un solo
 * miembro: la UI de precios lista una fila por grupo, la regla con banda del
 * genérico vive en el grupo (ver `priceRuleOf` en lib/pricing) y cualquier
 * producto nuevo de la categoría hereda el precio general sin tocar código.
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

  /* 4 · Producto único de sabores: se crea y se retiran los 13 individuales.
     Va antes de los grupos porque el precio del grupo genérico se toma de él. */
  notes.push(...collapseColdCakeFlavors(s, cat));

  /* 5 · Las tres unidades de precio.
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

  /* 6 · Asignación. Los diferenciados primero, para que el barrido del
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
  if (grouped)
    notes.push(
      `${grouped} producto${grouped === 1 ? "" : "s"} bajo el precio general "${generic.name}"`,
    );

  return notes;
}

/* ── Corrección de alertas de precio ─────────────────────── */

/**
 * Fija el precio de un tipo de precio concreto dentro de un `PriceGroup`.
 * Único mutador de `PriceGroup.prices`: úsalo en vez de tocar el arreglo a
 * mano para no duplicar la lógica de "reemplazar o agregar" en cada pantalla.
 */
export function setPriceGroupAmount(
  s: AppState,
  groupId: string,
  priceTypeId: string,
  amount: number,
): boolean {
  const g = s.priceGroups?.find((x) => x.id === groupId);
  if (!g) return false;
  const existing = g.prices.find((x) => x.priceTypeId === priceTypeId);
  if (existing) existing.amount = amount;
  else g.prices.push({ priceTypeId, amount });
  return true;
}

/**
 * Aplica la corrección que pide una `PriceAlert`: sube el precio del tipo de
 * precio alertado a `alert.suggestedUsd`. Si la alerta viene de un grupo
 * (caso normal: el genérico "Tortas Frías"), corrige sólo ese grupo. Si por
 * alguna razón el producto alertado no pertenece a ningún grupo (categoría de
 * tortas frías sin agrupar, caso residual), corrige el precio propio de cada
 * producto afectado para no dejar la alerta sin acción posible.
 */
export function applyPriceAlertFix(s: AppState, alert: PriceAlert): boolean {
  if (alert.priceGroupId) {
    return setPriceGroupAmount(s, alert.priceGroupId, alert.priceTypeId, alert.suggestedUsd);
  }
  let touched = false;
  for (const id of alert.productIds) {
    const p = s.products.find((x) => x.id === id);
    if (!p) continue;
    const existing = p.prices.find((x) => x.priceTypeId === alert.priceTypeId);
    if (existing) existing.amount = alert.suggestedUsd;
    else p.prices.push({ priceTypeId: alert.priceTypeId, amount: alert.suggestedUsd });
    touched = true;
  }
  return touched;
}
