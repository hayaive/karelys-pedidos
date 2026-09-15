// Service worker mínimo para instalabilidad (Add to Home Screen).
//
// Alcance deliberadamente angosto: sólo cachea el app-shell estático (HTML de
// arranque, JS/CSS/fuentes/imágenes construidos, manifest e íconos). Nunca
// toca peticiones a la API del backend (que además vive en otro origin, ver
// `src/lib/sync/config.ts`) ni interfiere con el motor de sync offline propio
// en `src/lib/sync` — ese motor ya maneja su propia lógica de reintentos y
// cola, y una caché de red aquí encima sólo lo confundiría.
//
// Sube SHELL_CACHE_VERSION cuando cambies esta lista o la estrategia de
// fetch, para que las pestañas viejas no se queden con una caché obsoleta.
const SHELL_CACHE_VERSION = "karelys-shell-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

const CACHEABLE_DESTINATIONS = new Set(["script", "style", "font", "image"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // Sin red en el install (poco probable) — no bloquear la instalación
        // del SW por esto, el fetch handler igual cachea bajo demanda.
      }),
  );
  self.skipWaiting();
});

// Disparado por `src/lib/force-update.ts` cuando la pantalla obligatoria de
// actualización pide adoptar la versión nueva ya instalada (estado
// "waiting") sin esperar a que se cierren todas las pestañas viejas.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sólo GET, y sólo mismo origin: cualquier llamada al backend (otro origin)
  // o método distinto pasa de largo sin tocarla.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación (cargar una ruta de la app): red primero, y si no hay red,
  // devolver el shell cacheado como último recurso. El router de TanStack y
  // el motor de sync toman el control una vez hidratada la página.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match(request)) || (await caches.match("/")),
      ),
    );
    return;
  }

  // Sólo assets estáticos construidos (JS/CSS/fuentes/imágenes). Cualquier
  // otra petición GET del mismo origin (p.ej. RSC/data loaders de TanStack)
  // pasa directo a la red, sin caché de por medio.
  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(SHELL_CACHE_VERSION).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
