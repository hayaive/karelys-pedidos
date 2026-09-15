/**
 * SHA del commit horneado en este bundle en build time (ver `vite.config.ts`,
 * `define: { __APP_VERSION__ }` — aplica a todos los environments porque
 * `RootComponent` también se renderiza en SSR). Se compara contra lo que el
 * servidor reporta en caliente en cada request — ver `src/lib/server-version.ts`
 * y `src/hooks/use-version-check.ts` — para detectar cuándo el bundle que ya
 * cargó este navegador quedó desactualizado.
 */
declare const __APP_VERSION__: string;

export const BUILD_COMMIT_SHA = __APP_VERSION__;
