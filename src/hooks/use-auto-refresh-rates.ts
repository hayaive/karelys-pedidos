/**
 * Refresco automático de tasas (BCV USD, paralelo/Binance y BCV EUR): **una vez
 * al día**, la primera vez que alguien entra.
 *
 * Regla del negocio: la tasa se trae sola una sola vez por día, y a partir de
 * ahí manda lo que haya —si alguien la corrige a mano, esa corrección se mantiene
 * el resto del día—. Al día siguiente, el primero que entra la vuelve a traer.
 * Antes se consultaba en cada cambio de pantalla y cada 5 minutos, y eso pisaba
 * cualquier tasa editada a mano.
 *
 * "Ya se trajo hoy" se lee de los datos, no de una marca local: hay tasa BCV
 * publicada hoy (automática o manual) → no se consulta nada. Así vale para todos
 * los equipos, porque la tasa que publicó el primero llega a los demás por la
 * sincronización. Por eso, con backend, se espera al primer ciclo de sync de esta
 * carga antes de decidir: sin esa espera, un equipo que abre con datos de ayer
 * volvería a traerla aunque otro ya lo hubiera hecho. El backend aplica la misma
 * regla a su tarea programada (`RatesCron`).
 *
 * Se comprueba al entrar, en cada cambio de pantalla y al volver a la app: la
 * comprobación es local y gratis (no llama a la API si ya hay tasa de hoy), y
 * esos momentos cubren la app que se queda abierta de un día para otro.
 *
 * Falla en silencio: es un refresco de fondo que el usuario no pidió, así que
 * un error de red aquí no debe ser tan intrusivo como el botón manual "Traer
 * de API" de `VentanaMercado`, que sigue disponible para actualizar a propósito.
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useHydrated } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { fetchRatesFromApi, hasRateToday } from "@/lib/business";
import { getState } from "@/lib/store";
import { SYNC_ENABLED } from "@/lib/sync/config";
import { useSyncStatus } from "@/lib/sync/engine";
import { hasRemoteSession } from "@/lib/sync/session";

/** Módulo, no componente: una sola consulta en vuelo aunque varias pantallas
 *  o eventos la pidan a la vez. */
let inFlight: Promise<void> | null = null;

function refreshRatesOncePerDay() {
  if (inFlight) return;
  if (hasRateToday(getState(), "BCV_USD")) return;
  inFlight = fetchRatesFromApi({ oncePerDay: true })
    .then((r) => {
      if (!r.ok) console.warn("[rates] refresco del día:", r.message);
    })
    .catch((err) => console.warn("[rates] refresco del día falló", err))
    .finally(() => {
      inFlight = null;
    });
}

export function useAutoRefreshRates() {
  const hydrated = useHydrated();
  const { user } = useSession();
  const userId = user?.id;
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const sync = useSyncStatus();

  // Con backend, esperar a tener los datos del servidor de esta carga (primer
  // ciclo completo). Si no hay con qué sincronizar —build sin backend, sesión sin
  // conexión, servidor caído— se decide con lo que haya en el equipo.
  const ready =
    !SYNC_ENABLED || !!sync.lastSyncAt || sync.phase === "offline" || !hasRemoteSession();

  useEffect(() => {
    if (!hydrated || !userId || !ready) return;
    refreshRatesOncePerDay();
  }, [hydrated, userId, ready, pathname]);

  // Al volver a la app (pestaña o PWA en primer plano): cubre el cambio de día
  // con la app abierta desde ayer.
  useEffect(() => {
    if (!hydrated || !userId || !ready) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRatesOncePerDay();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hydrated, userId, ready]);
}
