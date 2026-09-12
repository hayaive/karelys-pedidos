/** Generadores de identificadores y slugs. Aislados para que el catálogo y las
 *  migraciones puedan usarlos sin depender de la semilla completa. */

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Marcas diacríticas que aparecen al normalizar en NFD ("í" → "i" + tilde). */
const MARKS = /\p{Diacritic}/gu;

export function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Normaliza un nombre para compararlo sin acentos ni mayúsculas. */
export function normalizeName(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
