/**
 * Refresco automático de tasas (BCV USD, paralelo/Binance y BCV EUR).
 *
 * Se consulta la API:
 *  - al entrar al sistema (carga de la app con sesión, o al iniciar sesión);
 *  - en cada cambio de pantalla;
 *  - al volver a la app (pestaña o PWA que regresa a primer plano), porque la
 *    app instalada puede quedarse abierta días sin recargarse.
 *
 * Antes sólo se disparaba una vez por carga y sólo si la tasa ya estaba vencida
 * (más de `company.rateMaxAgeHours`), así que con la PWA abierta la tasa se
 * quedaba congelada aunque el BCV ya hubiera publicado una nueva.
 *
 * Publicar no es gratis —el log de tasas es append-only—, así que
 * `fetchRatesFromApi` sólo publica cuando el valor cambió o la vigente venció.
 * Aquí sólo se evita lanzar una consulta mientras otra sigue en curso.
 *
 * Falla en silencio: es un refresco de fondo que el usuario no pidió, así que
 * un error de red aquí no debe ser tan intrusivo como el botón manual "Traer
 * de API" de `VentanaMercado` (ese sí le muestra su propio toast de error a
 * quien lo pulsó a propósito).
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useHydrated } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { fetchRatesFromApi } from "@/lib/business";

/** Módulo, no componente: una sola consulta en vuelo aunque varias pantallas
 *  o eventos la pidan a la vez. */
let inFlight: Promise<void> | null = null;

function refreshRates() {
  if (inFlight) return;
  inFlight = fetchRatesFromApi()
    .then((r) => {
      if (!r.ok) console.warn("[rates] refresco automático:", r.message);
    })
    .catch((err) => console.warn("[rates] refresco automático falló", err))
    .finally(() => {
      inFlight = null;
    });
}

export function useAutoRefreshRates() {
  const hydrated = useHydrated();
  const { user } = useSession();
  const userId = user?.id;
  const pathname = useRouterState({ select: (st) => st.location.pathname });

  // Entrada al sistema y cada cambio de pantalla.
  useEffect(() => {
    if (!hydrated || !userId) return;
    refreshRates();
  }, [hydrated, userId, pathname]);

  // Regreso a la app sin recarga ni navegación.
  useEffect(() => {
    if (!hydrated || !userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRates();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hydrated, userId]);
}
