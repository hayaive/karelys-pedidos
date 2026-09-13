/** Generadores de identificadores y slugs. Aislados para que el catálogo y las
 *  migraciones puedan usarlos sin depender de la semilla completa. */

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/**
 * Id de un registro **nuevo de negocio** (venta, pedido, abono, movimiento).
 *
 * `uid()` son 8 caracteres aleatorios más 4 de reloj: suficiente dentro de un
 * navegador, débil cuando varios dispositivos crean registros a la vez sin verse
 * y luego los suben al mismo servidor, donde el id es la clave primaria y la
 * unidad de idempotencia. Para eso se usa un UUID v4 de verdad.
 *
 * Los ids ya existentes **no se tocan**: los semánticos del catálogo
 * (`prod-P060`, `pt-mayor`) son constantes del código y el backend los acepta tal
 * cual; sólo impone unicidad, no formato.
 */
export const newId = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Navegador viejo o contexto no seguro: se degrada a algo con la misma forma.
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${uid()}-${uid()}-${uid()}`;
};

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
