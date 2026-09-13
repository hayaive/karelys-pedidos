/**
 * Inicio de sesión contra el backend, con caída a local cuando no hay red.
 *
 * El orden importa y es deliberado:
 *
 *  1. **Con red manda el servidor.** Si responde "usuario o contraseña
 *     incorrectos", se acabó: no se prueba el login local a continuación. Hacerlo
 *     convertiría la contraseña heredada del estado local en una puerta de atrás
 *     para entrar a pesar del servidor.
 *  2. **Sin red se entra con el verificador del dispositivo** (PBKDF2 guardado en
 *     el último login en línea correcto, §6.2). Es lo que permite abrir la caja
 *     cuando se cayó internet.
 *  3. **Sólo si este equipo nunca habló con el backend** se usa el login local
 *     heredado, para que una instalación suelta siga funcionando como hasta hoy.
 */

import { getState, logAudit, mutate } from "../store";
import type { AppState, Permission, Role, User } from "../types";
import { ApiError, apiFetch, isOfflineError, storeTokens } from "./api";
import { SYNC_ENABLED } from "./config";
import { refreshSyncStatus, runBootstrap, syncNow } from "./engine";
import { queueCount } from "./queue";
import {
  buildOfflineVerifier,
  clearTokens,
  deviceId,
  getSession,
  isPairedWithBackend,
  noteServerTime,
  patchSession,
  verifyOffline,
} from "./session";
import type { LoginResponse } from "./types";

/** Cómo se resolvió el inicio de sesión. Sirve para lo que la pantalla le diga al usuario. */
export type SignInMode = "online" | "offline" | "local";

export interface SignInResult {
  ok: boolean;
  error?: string;
  mode?: SignInMode;
  /** El login fue bueno pero `/bootstrap` no llegó: se trabaja con la caché. */
  staleData?: boolean;
}

export async function signInRemote(
  username: string,
  password: string,
  loginLocal: (u: string, p: string) => { ok: boolean; error?: string },
): Promise<SignInResult> {
  if (!SYNC_ENABLED) return { ...loginLocal(username, password), mode: "local" };

  try {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: {
        username: username.trim(),
        password,
        device: { id: deviceId(), name: deviceName(), userAgent: userAgent() },
      },
    });

    return await establishSession(res, username, password);
  } catch (err) {
    // El servidor dijo que no: se respeta y no se busca otra puerta.
    if (err instanceof ApiError && !err.retryable) {
      return { ok: false, error: err.message };
    }
    // Sin respuesta (sin red, servidor caído, 5xx): se intenta entrar sin conexión.
    if (isOfflineError(err)) return offlineSignIn(username, password, loginLocal);
    return { ok: false, error: (err as Error).message };
  }
}

/* ── Sesión en línea ──────────────────────────────────── */

async function establishSession(
  res: LoginResponse,
  username: string,
  password: string,
): Promise<SignInResult> {
  const previousUserId = getSession().userId;
  const pending = queueCount();

  storeTokens(res);
  noteServerTime(res.serverTime);

  // El verificador permite volver a entrar en este equipo sin red. Si el navegador
  // no expone WebCrypto (contexto no seguro), se queda sin login offline en lugar
  // de guardar algo débil.
  const offline = await buildOfflineVerifier(
    res.user.username,
    password,
    res.offlineSessionMaxDays ?? 30,
  );

  patchSession({
    userId: res.user.id,
    username: res.user.username,
    ...(offline ? { offline } : {}),
  });

  if (pending > 0 && previousUserId && previousUserId !== res.user.id) {
    // La cola es del dispositivo y el servidor atribuye cada mutación al usuario
    // del token: lo que quedó sin subir se asentará a nombre de quien acaba de
    // entrar. Conviene saberlo antes de que aparezca en la auditoría.
    console.warn(
      `[sync] ${pending} mutaciones de ${previousUserId} siguen en cola y se subirán como ${res.user.id}`,
    );
  }

  // El estado inicial. Si falla, la sesión sigue siendo válida y se trabaja con la
  // caché: el ciclo lo reintentará.
  let staleData = false;
  try {
    await runBootstrap();
  } catch {
    staleData = true;
  }

  mutate((st) => {
    ensureLocalSessionUser(st, res);
    st.sessionUserId = res.user.id;
    logAudit("inicio_sesion", "user", res.user.id);
  });

  refreshSyncStatus();
  // No se espera: entrar a la aplicación no debe depender de que la cola suba.
  void syncNow("post-login");

  return { ok: true, mode: "online", staleData };
}

/**
 * Garantiza que el usuario autenticado y su rol existan en el estado local, que es
 * de donde `useSession()` saca los permisos.
 *
 * En el camino normal `/bootstrap` ya los trajo y esto no hace nada. Es el respaldo
 * para cuando el bootstrap falló: sin él la sesión quedaría sin usuario y la app
 * rebotaría al login.
 */
function ensureLocalSessionUser(st: AppState, res: LoginResponse) {
  const existing = st.users.find((u) => u.id === res.user.id);
  const user: User = {
    ...existing,
    id: res.user.id,
    username: res.user.username,
    fullName: res.user.fullName,
    email: res.user.email,
    roleId: res.user.roleId,
    active: res.user.active,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  st.users = existing
    ? st.users.map((u) => (u.id === user.id ? user : u))
    : [user, ...st.users];

  const role = st.roles.find((r) => r.id === res.user.roleId);
  const permissions = res.permissions as Permission[];
  if (role) {
    // Los permisos que manda el login son los que el servidor aplica de verdad.
    role.permissions = permissions;
  } else {
    const placeholder: Role = { id: res.user.roleId, name: "Rol asignado", permissions };
    st.roles = [...st.roles, placeholder];
  }
}

/* ── Sesión sin red ───────────────────────────────────── */

async function offlineSignIn(
  username: string,
  password: string,
  loginLocal: (u: string, p: string) => { ok: boolean; error?: string },
): Promise<SignInResult> {
  const s = getSession();

  const restoredId = s.userId;

  if (restoredId && (await verifyOffline(username, password))) {
    // El usuario tiene que estar en la caché: es de ahí de donde `useSession()`
    // saca el rol y los permisos. Si no está, no se entra a ciegas.
    if (!getState().users.some((u) => u.id === restoredId)) {
      return {
        ok: false,
        error: "Este equipo no tiene los datos del usuario. Conéctate una vez para entrar.",
      };
    }

    mutate((st) => {
      st.sessionUserId = restoredId;
      logAudit("inicio_sesion_sin_conexion", "user", restoredId);
    });
    refreshSyncStatus();
    return { ok: true, mode: "offline", staleData: true };
  }

  // Nunca hubo sesión contra el backend en este equipo: se permite el login local
  // heredado para no dejar inservible una instalación que funciona sola.
  //
  // La condición es "¿está emparejado?", **no** "¿tiene tokens?": al cerrar sesión
  // los tokens se van pero el equipo sigue emparejado, y con la otra condición la
  // contraseña en claro del estado local heredado habría vuelto a ser una puerta de
  // atrás en cuanto alguien cerrara sesión sin red.
  if (!isPairedWithBackend()) {
    const res = loginLocal(username, password);
    return { ...res, mode: "local", staleData: true };
  }

  return {
    ok: false,
    error: "No hay conexión con el servidor y la contraseña no coincide con la de este equipo",
  };
}

/* ── Cierre de sesión ─────────────────────────────────── */

/**
 * Cierra la sesión. Antes de soltar el token intenta subir lo que quede en la cola
 * — es el último momento en que este dispositivo está autenticado — y luego revoca
 * el refresh token en el servidor. La caché y la cola **se conservan**: tirarlas
 * perdería dinero que aún no llegó.
 */
export async function signOutRemote(): Promise<void> {
  const token = getSession().refreshToken;
  if (!SYNC_ENABLED || !token) {
    clearTokens();
    refreshSyncStatus();
    return;
  }

  try {
    await syncNow("pre-logout");
  } catch {
    /* sin red: lo pendiente espera al próximo inicio de sesión */
  }

  try {
    await apiFetch<void>("/auth/logout", { method: "POST", auth: false, body: { refreshToken: token } });
  } catch {
    /* revocar es best-effort: el token caduca por su cuenta */
  }

  // Sólo se limpia si entretanto no se inició otra sesión (que ya tendría otro token).
  if (getSession().refreshToken === token) clearTokens();
  refreshSyncStatus();
}

/* ── Identidad del equipo ─────────────────────────────── */

function userAgent(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 500);
}

/** Un nombre legible para reconocer el equipo en la tabla `devices`. */
function deviceName(): string | undefined {
  const stored = getSession().deviceName;
  if (stored) return stored;
  if (typeof navigator === "undefined") return undefined;

  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Equipo";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";

  const name = `${browser} · ${os}`.slice(0, 120);
  patchSession({ deviceName: name });
  return name;
}
