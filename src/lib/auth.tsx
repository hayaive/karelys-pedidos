import { getState, mutate, useAppState, logAudit } from "./store";
import type { Permission } from "./types";

export function login(username: string, password: string): { ok: boolean; error?: string } {
  const s = getState();
  const u = s.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
  if (!u) return { ok: false, error: "Usuario no encontrado" };
  if (!u.active) return { ok: false, error: "Usuario desactivado" };
  if (u.password !== password) return { ok: false, error: "Contraseña incorrecta" };
  mutate((st) => {
    st.sessionUserId = u.id;
    logAudit("inicio_sesion", "user", u.id);
  });
  return { ok: true };
}

export function logout() {
  mutate((s) => {
    s.sessionUserId = null;
  });
}

export function useSession() {
  const s = useAppState();
  const user = s.users.find((u) => u.id === s.sessionUserId) ?? null;
  const role = user ? (s.roles.find((r) => r.id === user.roleId) ?? null) : null;
  const can = (p: Permission) => !!role?.permissions.includes(p);
  return { user, role, can, state: s };
}
