// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import process from "node:process";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

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
});
