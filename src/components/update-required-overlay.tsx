/**
 * Pantalla obligatoria: "Hay una nueva versión disponible". Se monta en
 * `__root.tsx` por encima de todo (incluido el login) y sólo se renderiza
 * cuando `useVersionCheck` detecta que el bundle de este navegador quedó
 * desactualizado — ver ese hook para cuándo se dispara la comprobación.
 *
 * A propósito no reutiliza `Modal` de `ui-kit.tsx`: ese componente siempre
 * trae botón de cerrar, Esc y click-fuera-para-cerrar, que es justo lo que
 * esta pantalla no puede tener — es un bloqueo total, no una ventana.
 *
 * El texto/acción del botón distingue PWA instalada ("Descargar nueva
 * versión") de navegador normal ("Actualizar"); la acción técnica es la
 * misma en ambos casos — ver `src/lib/force-update.ts`.
 */
import { useState } from "react";
import { IcoRecargar } from "@/chasis/iconos";
import { Btn } from "@/components/ui-kit";
import { useVersionCheck } from "@/hooks/use-version-check";
import { forceUpdateAndReload } from "@/lib/force-update";

function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // Safari/iOS no soporta la media query display-mode: expone su propio flag.
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function UpdateRequiredOverlay() {
  const { outdated } = useVersionCheck();
  const [updating, setUpdating] = useState(false);

  if (!outdated) return null;

  const label = isInstalledPwa() ? "Descargar nueva versión" : "Actualizar";

  function handleUpdate() {
    setUpdating(true);
    void forceUpdateAndReload();
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-titulo"
      aria-describedby="update-required-cuerpo"
      className="fixed inset-0 z-[999] flex items-center justify-center bg-noche/70 p-4"
    >
      <div className="flex w-full max-w-[23rem] flex-col items-center gap-[1.1rem] rounded-xl border border-border bg-card px-[1.6rem] py-[2rem] text-center shadow-3">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-sol-vela text-sol-70"
        >
          <IcoRecargar />
        </span>
        <div>
          <h2 id="update-required-titulo" className="text-[1.05rem] font-semibold">
            Hay una nueva versión disponible
          </h2>
          <p id="update-required-cuerpo" className="mt-[0.4rem] text-etiqueta text-texto-2">
            Karelys Delicias se actualizó. Hace falta traer la versión nueva para seguir usando el
            sistema.
          </p>
        </div>
        <Btn variant="amber" size="lg" bloque cargando={updating} onClick={handleUpdate}>
          {label}
        </Btn>
      </div>
    </div>
  );
}
