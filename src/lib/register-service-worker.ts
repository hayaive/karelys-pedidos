/**
 * Registro del service worker mínimo de `public/sw.js` (ver ese archivo para
 * su alcance). Sólo corre en el navegador y sólo en producción: en `vite dev`
 * el SW no se comporta igual (el criterio de instalabilidad se valida con
 * `npm run build && npm run preview`), y cachear módulos durante desarrollo
 * activo sólo estorbaría al HMR.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker", error);
    });
  };

  // El evento "load" puede haber disparado ya para cuando este efecto corre
  // (hidratación puede tardar más que la carga de recursos) — en ese caso
  // registrar de una vez en vez de esperar un evento que no va a llegar.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
