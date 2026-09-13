/**
 * La sesión del dispositivo: identidad del equipo, tokens, cursor y el
 * verificador que permite volver a entrar sin red.
 *
 * Vive en **su propia clave** de localStorage, aparte del blob de datos
 * (`karelys.db.v1`). Dos razones: `resetDatabase()` no debe tirar la sesión, y el
 * estado de la app no debe llevar tokens dentro (se exporta, se pega en informes,
 * se mira en la consola).
 */

import { newId } from "../ids";

const KEY = "karelys.sync.session.v1";

/** Verificador local de contraseña. Ver `verifyOffline` más abajo. */
export interface OfflineVerifier {
  username: string;
  /** Sal aleatoria por dispositivo, en base64. */
  salt: string;
  /** PBKDF2-SHA256 de la contraseña, en base64. */
  hash: string;
  iterations: number;
  createdAt: string;
  /** Días tras los que el verificador caduca y hay que volver a entrar en línea. */
  maxDays: number;
}

export interface SyncSession {
  /** Identidad de este equipo. Viaja en `X-Device-Id` y sella cada asiento. */
  deviceId: string;
  deviceName?: string;
  accessToken?: string;
  /** Epoch ms en el que caduca el access token (con margen). */
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: string;
  /** Usuario de la última sesión en línea. Es el id **del servidor**. */
  userId?: string;
  username?: string;
  /** Cursor opaco de `GET /sync`. No es una fecha: no se hace aritmética con él. */
  cursor: number;
  /** `serverTime − Date.now()` del último intercambio, en ms. */
  serverSkewMs: number;
  lastBootstrapAt?: string;
  lastSyncAt?: string;
  offline?: OfflineVerifier;
}

const BLANK = (): SyncSession => ({ deviceId: "", cursor: 0, serverSkewMs: 0 });

let cache: SyncSession | null = null;

function read(): SyncSession {
  if (cache) return cache;
  if (typeof window === "undefined") return BLANK();
  let parsed = BLANK();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) parsed = { ...parsed, ...(JSON.parse(raw) as SyncSession) };
  } catch {
    /* corrupto: se empieza de cero, no se pierde nada crítico */
  }
  // El id del equipo se acuña una sola vez y no cambia nunca: el servidor lo usa
  // para auditar el origen de cada asiento y para el cursor por dispositivo.
  if (!parsed.deviceId) {
    parsed.deviceId = newId();
    cache = parsed;
    write(parsed);
    return parsed;
  }
  cache = parsed;
  return parsed;
}

function write(s: SyncSession) {
  cache = s;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function getSession(): SyncSession {
  return read();
}

export function patchSession(patch: Partial<SyncSession>): SyncSession {
  const next = { ...read(), ...patch };
  write(next);
  return next;
}

/** Id de este equipo. Se crea la primera vez que se pregunta. */
export function deviceId(): string {
  return read().deviceId;
}

/**
 * ¿Este equipo está **emparejado** con el backend? Es decir: ¿alguna vez inició
 * sesión en línea contra él?
 *
 * Es la pregunta que decide si una mutación se encola, y es distinta de "¿tengo
 * tokens válidos?" a propósito. Confundir las dos costó un error de los caros:
 * tras un inicio de sesión **sin red** no hay tokens, así que con la otra condición
 * el motor dejaba de encolar y las ventas de ese turno no se registraban para el
 * servidor — se perdían para siempre en cuanto alguien limpiara la caché.
 *
 * Encolar es anotar una intención, y eso no necesita credenciales; enviarla sí.
 */
export function isPairedWithBackend(): boolean {
  return !!read().userId;
}

/** ¿Se puede hablar con el backend ahora mismo (hay con qué autenticarse)? */
export function hasRemoteSession(): boolean {
  const s = read();
  return !!s.userId && !!s.refreshToken;
}

/** ¿Hay un access token que valga ahora mismo? */
export function hasLiveToken(): boolean {
  const s = read();
  return !!s.accessToken && (s.accessExpiresAt ?? 0) > Date.now();
}

/**
 * Cierra la sesión: se van los tokens y el usuario, se **conservan** el id del
 * equipo, el cursor y el verificador offline. El cursor se conserva a propósito:
 * los datos cacheados siguen ahí, así que volver a hacer `/bootstrap` sería tirar
 * trabajo a la basura.
 */
export function clearTokens() {
  const s = read();
  write({
    ...s,
    accessToken: undefined,
    accessExpiresAt: undefined,
    refreshToken: undefined,
    refreshExpiresAt: undefined,
  });
}

/** Reloj del servidor estimado desde el desfase medido. */
export function serverNow(): Date {
  return new Date(Date.now() + read().serverSkewMs);
}

/**
 * Marca temporal de negocio ya corregida contra el reloj del servidor (§4.6). Un
 * equipo con la fecha mal puesta envenena el día contable; el servidor además
 * acota lo que reciba, pero es mejor no mandarle basura.
 */
export function businessNowISO(): string {
  return serverNow().toISOString();
}

/** Anota el desfase a partir del `serverTime` de cualquier respuesta. */
export function noteServerTime(serverTime?: string) {
  if (!serverTime) return;
  const t = Date.parse(serverTime);
  if (!Number.isFinite(t)) return;
  patchSession({ serverSkewMs: t - Date.now() });
}

/* ── Login sin red ────────────────────────────────────── */

const PBKDF2_ITERATIONS = 210_000;

const subtle = () => globalThis.crypto?.subtle;

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/**
 * Deriva el verificador de contraseña que se guarda en el dispositivo tras un
 * login en línea correcto (§6.2, "Login offline").
 *
 * Es PBKDF2-SHA256 con sal aleatoria por equipo: permite comprobar la contraseña
 * sin red **en este dispositivo** y no sirve para autenticarse contra el servidor
 * ni para recuperar la contraseña. El servidor nunca manda nada reutilizable: el
 * argon2id no sale de ahí.
 */
export async function buildOfflineVerifier(
  username: string,
  password: string,
  maxDays = 30,
): Promise<OfflineVerifier | null> {
  const s = subtle();
  if (!s) return null; // contexto no seguro: se prescinde del login offline
  try {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(s, password, salt, PBKDF2_ITERATIONS);
    return {
      username: username.trim().toLowerCase(),
      salt: b64(salt.buffer as ArrayBuffer),
      hash: b64(hash),
      iterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString(),
      maxDays,
    };
  } catch {
    return null;
  }
}

/**
 * Comprueba una contraseña contra el verificador guardado. Devuelve `false` si no
 * hay verificador, si es de otro usuario o si ya caducó: en esos casos hay que
 * entrar en línea.
 */
export async function verifyOffline(username: string, password: string): Promise<boolean> {
  const v = read().offline;
  const s = subtle();
  if (!v || !s) return false;
  if (v.username !== username.trim().toLowerCase()) return false;

  const ageDays = (Date.now() - Date.parse(v.createdAt)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > v.maxDays) return false;

  try {
    const salt = Uint8Array.from(atob(v.salt), (c) => c.charCodeAt(0));
    const hash = await derive(s, password, salt, v.iterations);
    return b64(hash) === v.hash;
  } catch {
    return false;
  }
}

async function derive(
  s: SubtleCrypto,
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await s.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return s.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
}
