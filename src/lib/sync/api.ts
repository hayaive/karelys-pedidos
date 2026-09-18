/**
 * Cliente HTTP del backend.
 *
 * Su única responsabilidad es traducir el contrato del §6.1 a excepciones que el
 * motor pueda clasificar, porque de esa clasificación depende que la cola no entre
 * en bucle:
 *
 *  · `NetworkError`  → no hubo respuesta (sin red, servidor caído, timeout).
 *                      **Transitorio siempre**: se reintenta sin tocar la cola.
 *  · `ApiError`      → el servidor respondió con `{ error: { code, message } }`.
 *                      `retryable` dice si tiene sentido insistir.
 *
 * Añade `Authorization` y `X-Device-Id` (las dos obligatorias en todo lo que no
 * sea login) y renueva el access token una sola vez por petición cuando caducó.
 */

import { API_URL, REQUEST_TIMEOUT_MS } from "./config";
import {
  clearTokens,
  deviceId,
  getSession,
  noteServerTime,
  patchSession,
} from "./session";
import type { ApiErrorBody, RefreshResponse } from "./types";

/** El servidor respondió, y respondió que no. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * Un 5xx o un 429 son baches; un 4xx del contrato es una decisión tomada y
   * repetirla da el mismo resultado.
   */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }

  /** El cursor caducó o el servidor pide rehacer `/bootstrap` (§4.4). */
  get needsBootstrap(): boolean {
    return (
      this.code === "cursor_too_old" ||
      this.status === 410 ||
      this.details?.bootstrapRequired === true
    );
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.code === "unauthorized";
  }
}

/** No hubo respuesta: sin red, DNS, CORS, timeout o el backend caído. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** `false` en login/refresh, que no llevan token. */
  auth?: boolean;
  /** Interno: evita que el reintento tras renovar el token se reintente otra vez. */
  retriedAfterRefresh?: boolean;
  signal?: AbortSignal;
  /**
   * Cabeceras adicionales del llamador (p. ej. `If-Match` en `PATCH /company`,
   * ver lib/sync/company.ts). Se añaden **después** de las que ya arma esta
   * función, así que no pueden pisar `Authorization` ni `X-Device-Id`.
   */
  headers?: Record<string, string>;
}

/** Margen con el que se considera caducado el access token antes de que lo esté. */
const EXPIRY_MARGIN_MS = 30_000;

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) throw new NetworkError("No hay backend configurado (VITE_API_URL)");

  const { method = "GET", body, auth = true } = options;

  if (auth) await ensureFreshToken();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // `X-Device-Id` va siempre: sin él `/bootstrap` y `/sync` responden 400.
  headers["X-Device-Id"] = deviceId();
  if (auth) {
    const token = getSession().accessToken;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.headers) Object.assign(headers, options.headers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) options.signal.addEventListener("abort", () => controller.abort());

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(
      controller.signal.aborted
        ? "El servidor no respondió a tiempo"
        : `No se pudo contactar el servidor: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = toApiError(res.status, payload, text);

    // Token caducado: se renueva una vez y se repite la petición. Si el refresh
    // también falla, la sesión se cae y el usuario vuelve a entrar.
    if (err.isAuthFailure && auth && !options.retriedAfterRefresh) {
      const renewed = await tryRefresh();
      if (renewed) return apiFetch<T>(path, { ...options, retriedAfterRefresh: true });
    }
    throw err;
  }

  if (payload && typeof payload === "object" && "serverTime" in payload) {
    noteServerTime((payload as { serverTime?: string }).serverTime);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(status: number, payload: unknown, raw: string): ApiError {
  const body = payload as ApiErrorBody | null;
  if (body?.error?.code) {
    return new ApiError(status, body.error.code, body.error.message, body.error.details);
  }
  // Un error sin la forma del contrato (un 502 del proxy de Railway, por ejemplo).
  return new ApiError(status, `http_${status}`, raw.slice(0, 300) || `HTTP ${status}`);
}

/* ── Tokens ───────────────────────────────────────────── */

/** Una sola renovación en vuelo: dos peticiones a la vez no deben rotar dos veces. */
let refreshing: Promise<boolean> | null = null;

async function ensureFreshToken(): Promise<void> {
  const s = getSession();
  if (!s.accessToken) return; // sin sesión: la petición fallará con 401 y quien llama decide
  if ((s.accessExpiresAt ?? 0) - EXPIRY_MARGIN_MS > Date.now()) return;
  await tryRefresh();
}

/**
 * Rota el refresh token. Devuelve `false` si no se pudo y la sesión ya no sirve.
 *
 * Un fallo de red **no** borra la sesión: el token puede seguir siendo bueno y
 * borrarlo echaría al cajero de la aplicación cada vez que se cae el wifi.
 */
export async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;

  const token = getSession().refreshToken;
  if (!token) return false;

  refreshing = (async () => {
    try {
      const res = await apiFetch<RefreshResponse>("/auth/refresh", {
        method: "POST",
        body: { refreshToken: token },
        auth: false,
      });
      storeTokens(res);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        // El servidor invalidó la cadena (reutilización detectada, sesión revocada).
        clearTokens();
        return false;
      }
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/** Guarda un par de tokens recién emitido, con su caducidad ya en epoch ms. */
export function storeTokens(t: {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}) {
  patchSession({
    accessToken: t.accessToken,
    // `accessExpiresIn` viene en segundos.
    accessExpiresAt: Date.now() + t.accessExpiresIn * 1000,
    refreshToken: t.refreshToken,
    refreshExpiresAt: t.refreshExpiresAt,
  });
}

/** ¿Este error significa "no hay red" a efectos de la interfaz? */
export function isOfflineError(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof ApiError && err.status >= 500);
}
