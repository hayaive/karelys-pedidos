// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import process from "node:process";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// SHA del commit horneado en el bundle del CLIENTE (ver src/lib/app-version.ts), para que
// `useVersionCheck` pueda comparar "lo que este navegador cargó" contra lo que el servidor
// reporta en caliente en GET /api/version (src/lib/server-version.ts, nunca horneado). Railway
// inyecta RAILWAY_GIT_COMMIT_SHA en build y runtime cuando el deploy viene de un trigger de Git;
// si no está (build local, otra plataforma), cae a `git rev-parse HEAD`.
function resolveBuildCommitSha(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const buildCommitSha = resolveBuildCommitSha();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Railway runs a plain Node container, so pin Nitro's node-server preset instead of the
  // wrapper's cloudflare-module default. node-server also serves .output/public itself, which
  // Railway needs since there is no CDN in front of the container.
  // NITRO_PRESET still wins for other targets, and Lovable's own builds ignore this because
  // LOVABLE_NITRO_PRESET pins the preset inside them.
  nitro: {
    preset: process.env.NITRO_PRESET ?? "node-server",
  },
  vite: {
    // Sin scope a un environment: `RootComponent` (y por lo tanto
    // `UpdateRequiredOverlay`/`useVersionCheck`) también se renderiza en SSR, así que el bundle
    // SSR necesita el mismo literal reemplazado o revienta con "__APP_VERSION__ is not defined".
    // Esto no compromete el runtime del servidor: `GET /api/version` (src/lib/server-version.ts)
    // nunca referencia `__APP_VERSION__` — lee `process.env.RAILWAY_GIT_COMMIT_SHA` en caliente en
    // cada request, un identificador totalmente distinto que este `define` no toca.
    define: {
      __APP_VERSION__: JSON.stringify(buildCommitSha),
    },
  },
});
