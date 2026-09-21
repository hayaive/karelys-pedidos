/**
 * Buscador de productos por **nombre o código**, tolerante a como se escriba:
 * sin distinguir mayúsculas, acentos (`piña` = `pina`), guiones, puntos ni
 * espacios (`chole` encuentra el código `cho le`, `15kg` encuentra `1,5 kg`), y
 * con las palabras en cualquier orden (`pan guayaba` → "pan de guayaba grande").
 *
 * Los resultados salen **ordenados por cercanía**: primero el código exacto, que
 * es la búsqueda rápida del mostrador (teclear `TQ` y Enter), después lo que
 * empieza por lo escrito y al final lo que sólo lo contiene.
 *
 * El backend aplica la misma regla en `GET /products?search=`
 * (`src/catalog/product-search.ts`): si cambias una, cambia la otra.
 */

/** Marcas diacríticas que aparecen al normalizar en NFD ("í" → "i" + tilde). */
const MARKS = /\p{Diacritic}/gu;

/** Minúsculas y sin acentos; conserva la puntuación para poder partir en palabras. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(MARKS, "");
}

/** Palabras alfanuméricas de un texto ya plegado. */
function wordsOf(folded: string): string[] {
  return folded.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Un token corto (1–2 letras) sólo cuenta al inicio de palabra: si no, "t s"
 *  encontraría medio catálogo. Uno largo vale en cualquier parte. */
const SHORT_TOKEN = 2;

interface Searchable {
  name: string;
  code: string;
}

/**
 * Cercanía de un producto a lo buscado: menor es mejor, `null` si no coincide.
 * `query` vacío coincide con todo.
 */
export function productSearchScore(p: Searchable, query: string): number | null {
  const tokens = wordsOf(fold(query));
  if (!tokens.length) return 0;
  const compactQuery = tokens.join("");

  const codeWords = wordsOf(fold(p.code));
  const nameWords = wordsOf(fold(p.name));
  const code = codeWords.join("");
  const name = nameWords.join("");

  if (code === compactQuery) return 0;
  if (code.startsWith(compactQuery)) return 1;
  if (name.startsWith(compactQuery)) return 2;
  if (code.includes(compactQuery)) return 3;
  if (name.includes(compactQuery)) return 4;

  // Palabras sueltas, en cualquier orden, repartidas entre nombre y código.
  const words = [...nameWords, ...codeWords];
  const every = tokens.every((t) =>
    t.length <= SHORT_TOKEN
      ? words.some((w) => w.startsWith(t))
      : words.some((w) => w.includes(t)) || name.includes(t) || code.includes(t),
  );
  return every ? 5 : null;
}

/** ¿Coincide el producto con lo buscado? */
export function matchesProductSearch(p: Searchable, query: string): boolean {
  return productSearchScore(p, query) !== null;
}

/**
 * Filtra y ordena por cercanía. Con la búsqueda vacía devuelve la lista tal
 * cual (mismo orden, misma referencia de elementos). El orden es estable: a
 * igual cercanía se conserva el de entrada.
 */
export function searchProducts<T extends Searchable>(products: T[], query: string): T[] {
  if (!wordsOf(fold(query)).length) return products;
  const scored: { p: T; score: number; i: number }[] = [];
  products.forEach((p, i) => {
    const score = productSearchScore(p, query);
    if (score !== null) scored.push({ p, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.map((x) => x.p);
}
