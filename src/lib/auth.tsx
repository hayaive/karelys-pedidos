import { getState, mutate, useAppState, logAudit } from "./store";
import { signInRemote, signOutRemote, type SignInResult } from "./sync/remote-auth";
import type { Permission } from "./types";

/**
 * Inicio de sesión.
 *
 * Habla con el backend cuando hay conexión (que es la fuente de verdad) y cae al
 * dispositivo cuando no la hay. Toda esa decisión vive en `lib/sync/remote-auth`;
 * aquí sólo se compone con el login local heredado, que se le pasa como respaldo.
 */
export async function login(username: string, password: string): Promise<SignInResult> {
  return signInRemote(username, password, loginLocal);
}

/**
 * Login contra el estado local, tal como funcionaba antes del backend.
 *
 * Sigue existiendo por dos motivos: es el respaldo de una instalación que nunca se
 * conectó al servidor, y es lo que hace que la aplicación siga siendo usable sin
 * red el primer día. **No se usa cuando el servidor contesta**: si el backend dice
 * que la contraseña es incorrecta, no hay segunda oportunidad por esta vía.
 */
export function loginLocal(username: string, password: string): { ok: boolean; error?: string } {
  const s = getState();
  const u = s.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
  if (!u) return { ok: false, error: "Usuario no encontrado" };
  if (!u.active) return { ok: false, error: "Usuario desactivado" };
  // Los usuarios que llegan del backend no traen contraseña (su argon2id no sale
  // del servidor): con ellos sólo se puede entrar en línea o con el verificador
  // del dispositivo.
  if (!u.password) return { ok: false, error: "Este usuario necesita conexión para entrar" };
  if (u.password !== password) return { ok: false, error: "Contraseña incorrecta" };
  mutate((st) => {
    st.sessionUserId = u.id;
    logAudit("inicio_sesion", "user", u.id);
  });
  return { ok: true };
}

/**
 * Cierra la sesión. La pantalla no espera: se suelta el usuario de inmediato y, por
 * detrás, se intenta subir lo que quede en la cola (último momento en que este
 * equipo está autenticado) y revocar el token en el servidor.
 */
export function logout() {
  mutate((s) => {
    s.sessionUserId = null;
  });
  void signOutRemote();
}

export function useSession() {
  const s = useAppState();
  const user = s.users.find((u) => u.id === s.sessionUserId) ?? null;
  const role = user ? (s.roles.find((r) => r.id === user.roleId) ?? null) : null;
  const can = (p: Permission) => !!role?.permissions.includes(p);
  return { user, role, can, state: s };
}
