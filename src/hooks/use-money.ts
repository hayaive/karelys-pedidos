/**
 * Acceso a la conversión a bolívares desde componentes.
 *
 * Úsalo en lugar de leer la tasa y multiplicar a mano: el conversor se
 * reconstruye cuando cambia la tasa, así cualquier precio mostrado en Bs queda
 * siempre a la tasa BCV vigente (es lo que necesitan las tortas de cumpleaños:
 * precio fijado en USD, cobro en Bs al día de la venta).
 *
 *   const m = useMoney();
 *   <span>{m.fmtBs(product.priceUsd)}</span>
 */

import { useMemo } from "react";
import { moneyOf, moneyOfSale } from "@/lib/pricing";
import type { Money } from "@/lib/money";
import { useAppState } from "@/lib/store";
import type { Sale } from "@/lib/types";

/** Conversor ligado a la tasa BCV vigente. */
export function useMoney(): Money {
  const s = useAppState();
  return useMemo(() => moneyOf(s), [s]);
}

/**
 * Conversor congelado a la tasa de una venta ya emitida. Para reimprimir un
 * ticket con la tasa que realmente se cobró, no con la de hoy.
 */
export function useSaleMoney(sale: Sale): Money {
  const s = useAppState();
  return useMemo(() => moneyOfSale(s, sale), [s, sale]);
}

/** Sólo el número de la tasa, cuando no hace falta el conversor completo. */
export function useBcvRate(): number {
  return useMoney().rate;
}
