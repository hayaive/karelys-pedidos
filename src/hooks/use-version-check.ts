/**
 * Compara el SHA horneado en este bundle (`BUILD_COMMIT_SHA`) contra el que
 * `GET /api/version` reporta en caliente para el proceso de servidor que
 * está corriendo ahora mismo. Si difieren, el bundle que este navegador
 * cargó quedó desactualizado y `UpdateRequiredOverlay`
 * (`src/components/update-required-overlay.tsx`) debe mostrar la pantalla
 * obligatoria de actualización.
 *
 * Se revisa: al montar, cada `CHECK_INTERVAL_MS` (esto es un POS que puede
 * quedar una pestaña abierta horas, así que no conviene ser agresivo) y al
 * recuperar foco/visibilidad — el momento más probable de que el negocio
 * note el aviso, porque suele coincidir con volver a usar la caja.
 *
 * Un fetch fallido (sin red, endpoint no disponible) no cambia el estado:
 * ausencia de respuesta no es lo mismo que versión distinta.
 */
import { useEffect, useRef, useState } from "react";
import { BUILD_COMMIT_SHA } from "@/lib/app-version";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
// Evita ráfagas de fetch cuando visibilitychange y focus se disparan juntos.
const MIN_GAP_BETWEEN_CHECKS_MS = 30 * 1000;

export function useVersionCheck(): { outdated: boolean } {
  const [outdated, setOutdated] = useState(false);
  const lastCheckAtRef = useRef(0);
  const outdatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (outdatedRef.current) return; // ya se decidió mostrar el aviso, no hace falta seguir pidiendo
      const now = Date.now();
      if (now - lastCheckAtRef.current < MIN_GAP_BETWEEN_CHECKS_MS) return;
      lastCheckAtRef.current = now;

      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled || !data.version) return;
        if (data.version !== BUILD_COMMIT_SHA) {
          outdatedRef.current = true;
          setOutdated(true);
        }
      } catch {
        // Sin red o endpoint no disponible: silencio total, no es señal de nada.
      }
    }

    void check();
    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void check();
    }
    function onFocus() {
      void check();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { outdated };
}
