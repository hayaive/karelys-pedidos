/**
 * Fuerza que la próxima carga traiga el bundle nuevo, para el botón de
 * `UpdateRequiredOverlay`. Si hay un service worker registrado (ver
 * `src/lib/register-service-worker.ts` y `public/sw.js`):
 *
 *   1. `registration.update()` — pide al navegador revisar si hay una
 *      versión nueva de `sw.js`.
 *   2. Si queda un worker en estado `waiting` (instalado pero sin activar,
 *      por el `clients.claim()` que no toma control hasta el siguiente
 *      ciclo), se le manda `SKIP_WAITING` por `postMessage` — el propio
 *      `sw.js` escucha ese mensaje y llama `self.skipWaiting()` — y se
 *      espera a `controllerchange` antes de seguir.
 *   3. `window.location.reload()`.
 *
 * No hace falta purgar la caché del SW aparte: los assets construidos se
 * sirven con nombre de archivo hasheado por contenido (convención estándar
 * de Vite/Rollup), así que un deploy nuevo siempre apunta a URLs que todavía
 * no están en caché — el `network-first` de navegación en `sw.js` ya trae el
 * HTML nuevo, que referencia esos hashes nuevos.
 *
 * Nunca lanza: cualquier paso que falle (sin service worker, `update()`
 * rechazado, timeout esperando `controllerchange`) simplemente cae al
 * `reload()` final, que es la garantía mínima que el botón promete.
 */
const CONTROLLER_CHANGE_TIMEOUT_MS = 3000;

export async function forceUpdateAndReload(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update().catch(() => {});
        if (registration.waiting) {
          await activateWaitingWorker(registration.waiting);
        }
      }
    }
  } catch {
    // Cae al reload de abajo de todas formas.
  } finally {
    window.location.reload();
  }
}

function activateWaitingWorker(waiting: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      clearTimeout(timeout);
      resolve();
    };
    const onControllerChange = () => finish();

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const timeout = setTimeout(finish, CONTROLLER_CHANGE_TIMEOUT_MS);
    waiting.postMessage({ type: "SKIP_WAITING" });
  });
}
