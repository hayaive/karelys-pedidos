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
