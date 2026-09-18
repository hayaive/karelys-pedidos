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
  COLD_CAKE_GENERIC_NAME,
  COLD_CAKE_GENERIC_PRICES,
  COLD_CAKE_GENERIC_PRODUCT_ID,
  COLD_CAKE_LEGACY_FLAVORS,
  COLD_CAKE_OREO_BROWNIE_PRICES,
  COLD_CAKE_QUESILLO_PRICES,
  OREO_BROWNIE_CODE,
  OREO_BROWNIE_NAME,
  TORTA_QUESILLO_CODE,
  TORTA_QUESILLO_NAME,
} from "./pricing-rules";
import type { AppState, Category, ID, PriceAlert, Product, ProductPrice } from "./types";

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

/* ── Secuencia automática de códigos de producto ──────────
   Configuración en `company` como **piso configurable, no contador**: el
   negocio dice desde dónde seguir ("Continuar desde") y este cálculo busca
   el primer número libre a partir de ahí cada vez, en vez de guardar un
   cursor que dos altas sin red podrían desincronizar. Regla idéntica a la
   del backend (que la aplica al validar `product.create`), para que lo que
   este cliente sugiere nunca sea algo que el servidor vaya a rechazar. */

/** Default de fábrica: la misma serie "Pxxx" que ya tenía el catálogo semilla. */
export const DEFAULT_PRODUCT_CODE_PREFIX = "P";
export const DEFAULT_PRODUCT_CODE_DIGITS = 3;
export const DEFAULT_PRODUCT_CODE_START = 1;

/** Escapa un texto para usarlo literal dentro de un `RegExp`. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Números ya ocupados dentro de la serie de `prefix`, leyendo el catálogo
 * **numéricamente** y no por comparación de texto: "P0061" ocupa el 61 igual
 * que "P061", así que un código tecleado a mano con ceros de más no abre la
 * puerta a un duplicado semántico.
 *
 * Ocupan un número: los productos vivos, los códigos retirados
 * (`s.retiredProductCodes`, ver `applyBootstrap`/`applyDeletions` en
 * lib/sync/apply) y los 13 sabores legado (P001–P013), que nunca dejan de
 * existir para un ticket viejo aunque el producto ya no esté.
 */
function occupiedCodeNumbers(s: AppState, prefix: string): Set<number> {
  const re = new RegExp("^" + escapeRegex(prefix) + "(\\d+)$");
  const occupied = new Set<number>();
  const consider = (code: string) => {
    const m = code.match(re);
    if (m) occupied.add(parseInt(m[1], 10));
  };
  for (const p of s.products) consider(p.code);
  for (const code of s.retiredProductCodes ?? []) consider(code);
  for (const f of COLD_CAKE_LEGACY_FLAVORS) consider(f.code);
  return occupied;
}

/**
 * Código sugerido para un producto nuevo, según la secuencia configurada en
 * Ajustes → Impresión y numeración. Parte de `productCodeStart` y sube hasta
 * el primer número libre; si el hueco libre excede `productCodeDigits` no se
 * trunca (puede devolver "P1000" con 3 dígitos configurados).
 *
 * Es sólo una **sugerencia**: el campo del formulario sigue siendo editable y
 * el guardado vuelve a validar contra el catálogo del momento (pudo llegar un
 * producto por sync mientras el formulario estaba abierto).
 */
export function nextProductCode(s: AppState): string {
  const prefix = s.company.productCodePrefix ?? DEFAULT_PRODUCT_CODE_PREFIX;
  const digits = s.company.productCodeDigits ?? DEFAULT_PRODUCT_CODE_DIGITS;
  const start = s.company.productCodeStart ?? DEFAULT_PRODUCT_CODE_START;

  const occupied = occupiedCodeNumbers(s, prefix);
  let n = start;
  while (occupied.has(n)) n++;
  return prefix + String(n).padStart(digits, "0");
}

/**
 * Separa un código en prefijo alfabético y longitud de la parte numérica
 * ("P060" → { prefix: "P", digits: 3 }). Sólo para el respaldo de
 * `nextFreeCode`; un código que no encaja en esa forma (un `id` cualquiera)
 * no tiene una serie numérica de la que buscar el siguiente libre.
 */
function splitCode(code: string): { prefix: string; digits: number } | null {
  const m = code.match(/^([A-Za-z-]*)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], digits: m[2].length };
}

/**
 * Siguiente código libre para uno de los productos fijos del catálogo
 * (Brownie, el genérico de tortas frías…) cuando su código preferido ya está
 * tomado. Usa la misma regla numérica que `nextProductCode` —no la búsqueda
 * de antes, texto contra texto— para que "P0060" cuente igual que "P060".
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
    ...(s.retiredProductCodes ?? []),
  ]);
  if (!used.has(preferred)) return preferred;

  const parsed = splitCode(preferred);
  if (!parsed) return "P-" + uid();

  const occupied = occupiedCodeNumbers(s, parsed.prefix);
  let n = 1;
  while (occupied.has(n)) n++;
  return parsed.prefix + String(n).padStart(parsed.digits, "0");
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

  /* Precio de arranque: el de los sabores que se están consolidando, para que
     consolidar no cambie ningún precio de venta.

     Una instalación vieja pudo tener el precio en el grupo de precio en vez de
     en el producto; de eso se encarga `toV6` (lib/migrations), que corre en la
     misma pasada y vuelca los precios del grupo sobre el producto celda a
     celda. Aquí no se lee ningún grupo: ya no existen. */
  const inherited = flavors.find((f) => f.prices.length)?.prices ?? null;

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
 * Deja la familia de tortas frías con **3 productos**, cada uno con su propio
 * precio editable desde Inventario:
 *
 *   1. "Tortas Frías"    → producto único que reemplaza a los 13 sabores
 *   2. "Brownie"         → precio propio y diferenciado
 *   3. "Torta Quesillo"  → precio propio y diferenciado
 *
 * Hasta el esquema 5 los tres compartían la indirección de un grupo de precio;
 * desde el 6 el precio es del producto y punto (decisión del negocio: volver a
 * precio manual por producto). De trasvasar los precios del grupo al producto en
 * instalaciones existentes se encarga `toV6` en lib/migrations.
 *
 * Devuelve notas de lo que cambió, para registrarlas en la auditoría.
 */
export function ensureColdCakeFamily(s: AppState): string[] {
  const notes: string[] = [];

  /* 1 · Categoría de la familia. Se busca por el id canónico y, si el negocio la
     renombró o la creó con otro id, por nombre normalizado. */
  let cat: Category | undefined =
    s.categories.find((c) => c.id === COLD_CAKE_CATEGORY_ID) ??
    s.categories.find((c) => normalizeName(c.name) === normalizeName(COLD_CAKE_CATEGORY_NAME));
  if (!cat) {
    cat = { id: COLD_CAKE_CATEGORY_ID, name: COLD_CAKE_CATEGORY_NAME, active: true };
    s.categories.push(cat);
    notes.push(`categoría "${COLD_CAKE_CATEGORY_NAME}" creada`);
  }

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

  /* 3 · Brownie: producto nuevo si no existía */
  let oreo = productByCode(s, OREO_BROWNIE_CODE) ?? productByName(s, OREO_BROWNIE_NAME) ?? null;
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
  } else {
    if (oreo.categoryId !== cat.id) {
      oreo.categoryId = cat.id;
      notes.push(`"${OREO_BROWNIE_NAME}" movido a ${cat.name}`);
    }
    if (oreo.name !== OREO_BROWNIE_NAME) oreo.name = OREO_BROWNIE_NAME;
  }

  /* 4 · Producto único de sabores: se crea y se retiran los 13 individuales. */
  notes.push(...collapseColdCakeFlavors(s, cat));

  /* 5 · Precio de respaldo de los diferenciados, sólo si llegaron sin ninguno
     (un producto recién creado por esta misma función ya lo trae). Nunca se
     pisa un precio existente: es dinero que el negocio configuró. */
  if (!oreo.prices.length) oreo.prices = spreadPrices(s, COLD_CAKE_OREO_BROWNIE_PRICES);
  if (quesillo && !quesillo.prices.length)
    quesillo.prices = spreadPrices(s, COLD_CAKE_QUESILLO_PRICES);

  return notes;
}

/* ── Corrección de alertas de precio ─────────────────────── */

/**
 * Lo que `applyPriceAlertFix` cambió de verdad, con el valor anterior.
 *
 * Existe para que quien llama pueda **encolar la mutación de sincronización que
 * le toca** y auditar el cambio sin volver a deducir por qué rama pasó la
 * corrección. Las dos ramas escriben en sitios distintos del backend y por eso
 * se distinguen aquí y no en la pantalla:
 *
 *  · `usd` → celda `(producto, tipo de precio)` ⇒ `productPrice.set`
 *  · `bs`  → `bsPrice` del producto ⇒ `product.update` con `bsOnly` + `bsPrice`
 */
export type PriceFixTarget =
  | { mode: "usd"; productId: ID; priceTypeId: ID; amountUsd: number; fromUsd: number }
  | { mode: "bs"; productId: ID; bsPrice: number; fromBs: number };

/**
 * Aplica la corrección que pide una `PriceAlert` con el monto que confirmó el
 * usuario (el sugerido si no lo tocó).
 *
 * Devuelve lo que cambió, o null si no cambió nada (el producto ya no existe, o
 * la alerta venía sin tipo de precio). Quien llama **tiene que** encolarlo: un
 * precio corregido sólo en local se pierde en el siguiente `/bootstrap`, que
 * reemplaza el catálogo completo.
 *
 * `amount` va en la moneda del modo: USD en `usd`, Bs en `bs`.
 */
export function applyPriceAlertFix(
  s: AppState,
  alert: PriceAlert,
  amount: number,
): PriceFixTarget | null {
  const p = s.products.find((x) => x.id === alert.productId);
  if (!p) return null;

  if (alert.mode === "bs") {
    const fromBs = p.bsPrice ?? 0;
    p.bsPrice = amount;
    return { mode: "bs", productId: p.id, bsPrice: amount, fromBs };
  }

  if (!alert.priceTypeId) return null;
  const cell = p.prices.find((x) => x.priceTypeId === alert.priceTypeId);
  const fromUsd = cell?.amount ?? 0;
  if (cell) cell.amount = amount;
  else p.prices.push({ priceTypeId: alert.priceTypeId, amount });
  return { mode: "usd", productId: p.id, priceTypeId: alert.priceTypeId, amountUsd: amount, fromUsd };
}
