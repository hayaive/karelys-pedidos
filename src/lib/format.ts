export const usd = (n: number) =>
  "$" + (Number.isFinite(n) ? n : 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const bs = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Bs";

export const num = (n: number, d = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });

export const dt = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

export const dayKey = (d: Date | string = new Date()) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const longDate = (d = new Date()) =>
  d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Validación de cédula venezolana: V/E + 6 a 9 dígitos */
export function validCedula(v: string) {
  return /^[VEJPG]-?\d{6,9}$/i.test(v.trim());
}

/** Parsea un monto tecleado a mano, tolerando "," o "." como separador decimal o de miles. */
export function parseAmount(raw: string): number {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return NaN;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  let norm = t;
  if (hasComma && hasDot) {
    norm =
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (hasComma) {
    norm = t.replace(",", ".");
  } else if (hasDot) {
    const parts = t.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || last.length === 3) norm = parts.join("");
  }
  return parseFloat(norm);
}
