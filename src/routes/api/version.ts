/**
 * `GET /api/version` — reporta el SHA del commit que corre este proceso de
 * servidor ahora mismo (`src/lib/server-version.ts`, leído en caliente, no
 * horneado). `useVersionCheck` (`src/hooks/use-version-check.ts`) lo compara
 * contra el SHA horneado en el bundle del cliente para detectar cuándo
 * conviene mostrar la pantalla obligatoria de actualización.
 *
 * `Cache-Control: no-store` para que ningún proxy/CDN intermedio (Railway no
 * pone uno delante, pero un navegador o extensión sí podría) devuelva una
 * respuesta vieja.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeCommitSha } from "@/lib/server-version";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          { version: getRuntimeCommitSha() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
