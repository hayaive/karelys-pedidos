/**
 * Conversión USD ⇄ Bs. Único lugar donde se multiplica o divide por la tasa.
 *
 * Regla de oro: **nunca se persiste un monto en Bs derivado de un precio USD**.
 * El equivalente en Bs se calcula en el momento de mostrarlo o de vender, con
 * la tasa BCV vigente. Sólo se congela la tasa cuando el dinero ya entró
 * (`Sale.rateSnapshot`, `OrderDeposit.rateUsed`), porque un comprobante debe
 * reflejar la tasa que realmente se cobró.
 *
 * Este módulo es puro: no conoce el store ni React. Para la tasa viva usa
 * `useMoney()` (hooks/use-money) o `moneyOf(state)` (lib/pricing).
 */

import { bs as fmtBsAmount, num, usd as fmtUsdAmount } from "./format";
import { DEFAULT_BS_ROUNDING } from "./pricing-rules";

/** Redondea un monto en Bs al paso configurado (1 = bolívares enteros). */
export function roundBs(amount: number, step: number = DEFAULT_BS_ROUNDING) {
  if (!Number.isFinite(amount)) return 0;
  if (!step || step <= 0) return amount;
  return Math.round(amount / step) * step;
}

/** USD → Bs, sin redondear. */
export function usdToBs(amountUsd: number, rate: number) {
  if (!Number.isFinite(amountUsd) || !Number.isFinite(rate)) return 0;
  return amountUsd * rate;
}

/** Bs → USD. Devuelve 0 si no hay tasa cargada. */
export function bsToUsd(amountBs: number, rate: number) {
  if (!Number.isFinite(amountBs) || !rate) return 0;
  return amountBs / rate;
}

/**
 * Conversor inmutable ligado a una tasa concreta. Pásalo a componentes y
 * funciones en lugar de repartir el número de la tasa: así queda explícito
 * *qué* tasa se usó y no hay cálculos ad-hoc dispersos.
 */
export interface Money {
  /** Tasa Bs/USD usada por este conversor. 0 = sin tasa cargada. */
  readonly rate: number;
  /** Paso de redondeo en Bs. */
  readonly bsRounding: number;
  /** Momento en que se publicó la tasa (ISO), si se conoce. */
  readonly at: string | null;
  /** Fuente de la tasa (BCV_USD por defecto). */
  readonly source: string;
  /** true si no hay tasa cargada: la UI debe impedir cobrar en Bs. */
  readonly missing: boolean;
  /** true si la tasa superó la antigüedad máxima configurada. */
  readonly stale: boolean;
  /** Antigüedad de la tasa en horas, o null si no se conoce. */
  readonly ageHours: number | null;

  /** USD → Bs exacto (sin redondear). Úsalo para acumular totales. */
  toBs(amountUsd: number): number;
  /** USD → Bs redondeado al paso configurado. Úsalo para precios de lista. */
  toBsRounded(amountUsd: number): number;
  /** Bs → USD. */
  toUsd(amountBs: number): number;

  /** "1.234,50 Bs" a partir de un monto en USD. */
  fmtBs(amountUsd: number): string;
  /** "1.234,50 Bs" a partir de un monto que ya está en Bs. */
  fmtBsAmount(amountBs: number): string;
  /** "$1,10" */
  fmtUsd(amountUsd: number): string;
  /** La tasa formateada para mostrar en tickets y cabeceras. */
  fmtRate(): string;
}

export interface MoneyInput {
  rate: number;
  bsRounding?: number;
  at?: string | null;
  source?: string;
  maxAgeHours?: number;
}

/** Crea un conversor a partir de una tasa. */
export function makeMoney(input: MoneyInput): Money {
  const rate = Number.isFinite(input.rate) && input.rate > 0 ? input.rate : 0;
  const bsRounding = input.bsRounding ?? DEFAULT_BS_ROUNDING;
  const at = input.at ?? null;
  const ageHours = at ? (Date.now() - new Date(at).getTime()) / 3_600_000 : null;
  const maxAge = input.maxAgeHours;

  return {
    rate,
    bsRounding,
    at,
    source: input.source ?? "BCV_USD",
    missing: rate <= 0,
    stale: ageHours !== null && maxAge !== undefined ? ageHours > maxAge : false,
    ageHours,
    toBs: (amountUsd) => usdToBs(amountUsd, rate),
    toBsRounded: (amountUsd) => roundBs(usdToBs(amountUsd, rate), bsRounding),
    toUsd: (amountBs) => bsToUsd(amountBs, rate),
    fmtBs: (amountUsd) => fmtBsAmount(usdToBs(amountUsd, rate)),
    fmtBsAmount: (amountBs) => fmtBsAmount(amountBs),
    fmtUsd: (amountUsd) => fmtUsdAmount(amountUsd),
    fmtRate: () => num(rate),
  };
}

/** Conversor sin tasa: todo convierte a 0 y `missing` es true. */
export const NO_RATE: Money = makeMoney({ rate: 0 });
