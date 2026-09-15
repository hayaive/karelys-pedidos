/**
 * SHA del commit que corre este proceso de servidor, leído en caliente de
 * `process.env` en cada llamada — nunca horneado por Vite/Rollup en build
 * time (a diferencia de `src/lib/app-version.ts`, que sí lo hornea para el
 * cliente). Así el endpoint `GET /api/version` (`src/routes/api/version.ts`)
 * siempre refleja lo que está desplegado de verdad en este proceso, incluso
 * si el bundle de un cliente viejo quedó de un deploy anterior.
 *
 * Sólo se importa desde ese server route: TanStack Start separa el código
 * bajo `server.handlers` del bundle del cliente, así que este módulo (y su
 * `execSync`, que no existe en el navegador) nunca viaja al browser.
 */
import { execSync } from "node:child_process";

// Fallback vía `git rev-parse HEAD` sólo hace falta cuando RAILWAY_GIT_COMMIT_SHA
// no está presente (build local, otra plataforma) — se calcula una sola vez por
// proceso y se cachea, para no lanzar un subproceso en cada request.
let gitHeadFallback: string | undefined;

export function getRuntimeCommitSha(): string {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv;

  if (gitHeadFallback === undefined) {
    gitHeadFallback = readGitHeadFallback();
  }
  return gitHeadFallback;
}

function readGitHeadFallback(): string {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}
