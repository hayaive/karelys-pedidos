/**
 * Refresco automático de tasas (BCV USD, paralelo/Binance y BCV EUR) al entrar
 * a la app con sesión iniciada.
 *
 * Antes esto sólo pasaba si alguien abría Mercado y pulsaba "Traer de API": si
 * nadie lo hacía, la tasa se quedaba congelada indefinidamente y el negocio
 * terminaba corrigiéndola a mano (como pasó con 832,49). Se dispara una sola
 * vez por carga de la app —guard en memoria, no en cada render ni en cada
 * navegación entre pantallas— y sólo si la tasa BCV vigente ya está vencida
 * según `company.rateMaxAgeHours` (el mismo umbral de "stale" que usa
 * `moneyOf`/`useMoney`) o si todavía no hay ninguna tasa cargada.
 *
 * Falla en silencio: es un refresco de fondo que el usuario no pidió, así que
 * un error de red aquí no debe ser tan intrusivo como el botón manual "Traer
 * de API" de `VentanaMercado` (ese sí le muestra su propio toast de error a
 * quien lo pulsó a propósito).
 */
import { useEffect } from "react";
import { useHydrated } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { fetchRatesFromApi } from "@/lib/business";
import { moneyOf } from "@/lib/pricing";
import { useAppState } from "@/lib/store";

/** Módulo, no componente: sobrevive a la navegación entre rutas y sólo se
 *  reinicia con una recarga completa de la página, que es justo el "una vez
 *  por carga" que se pidió. */
let firedThisLoad = false;

export function useAutoRefreshRates() {
  const hydrated = useHydrated();
  const s = useAppState();
  const { user } = useSession();

  useEffect(() => {
    if (!hydrated || !user || firedThisLoad) return;
    const money = moneyOf(s);
    if (!money.missing && !money.stale) return;

    firedThisLoad = true;
    fetchRatesFromApi()
      .then((r) => {
        if (!r.ok) console.warn("[rates] refresco automático:", r.message);
      })
      .catch((err) => console.warn("[rates] refresco automático falló", err));
  }, [hydrated, user, s]);
}
