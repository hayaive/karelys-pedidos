/**
 * Usuarios y roles: el mismo problema que resuelven `categories.ts`,
 * `price-types.ts` y `company.ts`, con una vuelta extra de seguridad.
 *
 * El backend los declara `ONLINE_ONLY` (`sync/mutations/registry.ts` allí) **a
 * propósito**, no por comodidad: `UsersService` lo dice en su propio comentario
 * ("una cola offline podría resucitar a un usuario revocado o devolverle
 * permisos"). Antes de este módulo, `Usuarios` en `ajustes.tsx` sólo hacía
 * `mutate(...)` local, así que el usuario nuevo (o el rol, o el cambio de
 * contraseña) desaparecía en el siguiente `/bootstrap`, que es autoritativo: el
 * usuario recién creado nunca llegaba a existir en el servidor y no podía
 * iniciar sesión.
 *
 * Mismo orden que en los otros módulos: primero el servidor, y sólo si confirma,
 * el estado local. En build sin backend (`VITE_API_URL=off`) se sigue
 * gestionando en local, porque ahí no hay bootstrap que pise el cambio.
 *
 * Dos cosas que este módulo hace cumplir y que no se pueden relajar:
 *  1. La contraseña en claro nunca sale del modo local: el servidor jamás la
 *     manda (`userOut` no incluye `passwordHash`) y este módulo nunca intenta
 *     mandarla de vuelta como si fuera la real.
 *  2. El backend no tiene `DELETE /users` (sólo `PATCH .../active`): en modo
 *     remoto no existe "eliminar" un usuario, sólo desactivarlo. `deleteUser`
 *     revienta a propósito si se le llama fuera de modo local para que quien la
 *     use no pueda borrar en este equipo algo que el servidor sigue conservando.
 */

import { getState, logAudit, mutate } from "../store";
import { slug, uid } from "../ids";
import type { ID, Permission, Role, User } from "../types";
import { ApiError, NetworkError, apiFetch } from "./api";
import { SYNC_ENABLED } from "./config";
import { getSyncStatus, useSyncStatus } from "./engine";
import { hasRemoteSession, isPairedWithBackend } from "./session";

/** Lo que devuelve el backend (`userOut`) en el alta y en la edición. */
interface UserWire {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  roleId: string;
  active: boolean;
  system?: boolean;
  deactivatedAt?: string;
  lastLoginAt?: string;
  createdAt: string;
  rev?: number;
}

/** Lo que devuelve el backend (`roleOut`) en el alta y en la edición. */
interface RoleWire {
  id: string;
  name: string;
  permissions: Permission[];
  system?: boolean;
  rev?: number;
}

/** Calcado de `CreateUserDto`/`UpdateUserDto` en el backend. */
const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const USERNAME_MAX = 40;
const FULLNAME_MAX = 120;
const EMAIL_MAX = 160;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
/** Calcado de `CreateRoleDto`/`UpdateRoleDto`. */
const ROLE_NAME_MAX = 80;

export type UserAccess =
  /** Hay con qué hablar con el backend: cada cambio va por HTTP. */
  | { mode: "remote" }
  /** Esta build no tiene backend: se gestiona en local, como antes. */
  | { mode: "local" }
  /** No se puede gestionar ahora mismo. `reason` es lo que se le muestra al usuario. */
  | { mode: "blocked"; reason: string };

/**
 * ¿Se pueden gestionar usuarios y roles ahora mismo? Calcado de
 * `categoryAccess()`/`priceTypeAccess()`: mismas comprobaciones, mismo orden.
 */
export function userAccess(): UserAccess {
  if (!SYNC_ENABLED) return { mode: "local" };

  if (!isPairedWithBackend()) {
    return {
      mode: "blocked",
      reason:
        "Este equipo todavía no se ha conectado al servidor. Inicia sesión con conexión para gestionar usuarios.",
    };
  }
  if (!hasRemoteSession()) {
    return {
      mode: "blocked",
      reason:
        "Entraste sin conexión. Vuelve a iniciar sesión con conexión para gestionar usuarios.",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { mode: "blocked", reason: "Necesitas conexión para gestionar usuarios." };
  }
  // El último ciclo no alcanzó el servidor (sin red, caído o un 5xx). Reintentarlo
  // es pulsar el indicador de sincronización de la cabecera.
  if (getSyncStatus().phase === "offline") {
    return {
      mode: "blocked",
      reason: "El servidor no responde ahora mismo. Necesitas conexión para gestionar usuarios.",
    };
  }

  return { mode: "remote" };
}

/** Lo mismo, para la interfaz: se recalcula cuando cambia el estado del motor. */
export function useUserAccess(): UserAccess {
  useSyncStatus();
  return userAccess();
}

/** Mensaje corto y en cristiano para el toast de error. */
export function userErrorText(err: unknown): string {
  if (err instanceof NetworkError) return "Sin conexión con el servidor";
  if (err instanceof ApiError) {
    // `has_history`: `removeRole` lo niega porque hay usuarios con ese rol
    // (comprobación que la pantalla ya hace antes de llamar, pero el servidor es
    // quien manda la última palabra).
    if (err.code === "has_history") {
      return "No se puede eliminar: hay usuarios con este rol";
    }
    return err.message;
  }
  const message = (err as Error | undefined)?.message;
  return message && message.trim() ? message : "Error inesperado";
}

/* ── Usuarios ─────────────────────────────────────────── */

export interface CreateUserInput {
  username: string;
  fullName: string;
  email?: string;
  password: string;
  roleId: ID;
  active?: boolean;
}

/**
 * Crea un usuario.
 *
 * El `id` **no** se manda: a diferencia de categorías o tipos de precio, el alta
 * de usuario no es idempotente por id en el backend (`createUser` sólo mira
 * `username`), así que dejar que el servidor acuñe un UUID es lo correcto.
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const access = requireAccess();
  const username = cleanUsername(input.username);
  const fullName = cleanFullName(input.fullName);
  const email = cleanEmail(input.email);
  const password = cleanPassword(input.password);
  requireRoleExists(input.roleId);
  const active = input.active ?? true;

  if (access.mode === "local") {
    const local: User = {
      id: uid(),
      username,
      fullName,
      email,
      password,
      roleId: input.roleId,
      active,
      createdAt: new Date().toISOString(),
    };
    mutate((st) => {
      st.users.push(local);
      logAudit("usuario_creado", "user", local.id, { username });
    });
    return local;
  }

  const row = await apiFetch<UserWire>("/users", {
    method: "POST",
    body: { username, fullName, email, password, roleId: input.roleId, active },
  });
  return adoptUser(row, "usuario_creado");
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  roleId?: ID;
  active?: boolean;
}

/**
 * Edita nombre, correo, rol o estado. **No incluye `username`**: `UpdateUserDto`
 * en el backend no lo declara, así que el usuario no se puede renombrar después
 * de creado en modo remoto (la pantalla debe deshabilitar ese campo al editar).
 *
 * `email` sólo viaja cuando trae un valor: mandar `email: ""` dispara
 * `@IsEmail()` en el DTO (que `@IsOptional()` sólo exime en `undefined`, no en
 * cadena vacía) y el backend respondería 400 en vez de limpiarlo. Limitación
 * conocida del contrato actual: por ahora no se puede borrar un correo ya
 * puesto desde esta pantalla.
 */
export async function updateUser(id: ID, patch: UpdateUserInput): Promise<User> {
  const access = requireAccess();
  const body: UpdateUserInput = {};
  if (patch.fullName !== undefined) body.fullName = cleanFullName(patch.fullName);
  if (patch.email !== undefined) {
    const email = cleanEmail(patch.email);
    if (email !== undefined) body.email = email;
  }
  if (patch.roleId !== undefined) {
    requireRoleExists(patch.roleId);
    body.roleId = patch.roleId;
  }
  if (patch.active !== undefined) body.active = patch.active;

  if (access.mode === "local") {
    let result: User | undefined;
    mutate((st) => {
      const u = st.users.find((x) => x.id === id);
      if (u) {
        if (body.fullName !== undefined) u.fullName = body.fullName;
        if (patch.email !== undefined) u.email = body.email;
        if (body.roleId !== undefined) u.roleId = body.roleId;
        if (body.active !== undefined) u.active = body.active;
      }
      result = u;
      logAudit("usuario_editado", "user", id, { fields: Object.keys(body) });
    });
    if (!result) throw new Error("El usuario ya no existe");
    return result;
  }

  const row = await apiFetch<UserWire>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return adoptUser(row, patch.active === false ? "usuario_desactivado" : "usuario_editado");
}

/**
 * Cambia la contraseña. El servidor revoca todas las sesiones abiertas de ese
 * usuario al hacerlo (`UsersService.setPassword`), así que un cambio de clave
 * también lo saca de cualquier equipo donde siga con la sesión iniciada.
 *
 * En modo local la contraseña en claro se guarda (es el único respaldo que
 * existe para el login sin red); en modo remoto **no se guarda nada en local**:
 * la contraseña real vive sólo como argon2id en el servidor.
 */
export async function setUserPassword(id: ID, rawPassword: string): Promise<void> {
  const access = requireAccess();
  const password = cleanPassword(rawPassword);

  if (access.mode === "local") {
    let found = false;
    mutate((st) => {
      const u = st.users.find((x) => x.id === id);
      if (u) {
        u.password = password;
        found = true;
      }
      logAudit("contrasena_cambiada", "user", id);
    });
    if (!found) throw new Error("El usuario ya no existe");
    return;
  }

  await apiFetch<{ ok: boolean }>(`/users/${encodeURIComponent(id)}/password`, {
    method: "POST",
    body: { password },
  });
  mutate(() => logAudit("contrasena_cambiada", "user", id));
}

/**
 * Elimina un usuario. **Sólo existe en modo local**: el backend no declara
 * `DELETE /users` (`UsersController` sólo tiene `POST`, `PATCH` y
 * `POST .../password`), así que en modo remoto o bloqueado esto revienta a
 * propósito. La pantalla debe llamar `updateUser(id, { active: false })` en su
 * lugar cuando hay backend: desactivar es lo más parecido que el servidor
 * ofrece, y conserva el historial (ventas, auditoría) que un borrado real
 * destruiría.
 */
export function deleteUser(id: ID): void {
  const access = requireAccess();
  if (access.mode !== "local") {
    throw new Error("El servidor no permite eliminar usuarios: desactívalo en su lugar");
  }
  mutate((st) => {
    st.users = st.users.filter((x) => x.id !== id);
    logAudit("usuario_eliminado", "user", id);
  });
}

/* ── Roles ────────────────────────────────────────────── */

export interface CreateRoleInput {
  name: string;
  permissions: Permission[];
}

/**
 * Crea un rol.
 *
 * El `id` **no** se manda: lo acuña el servidor con el mismo criterio semántico
 * que la semilla local (`role-<slug>`, ver `createRole` en el backend), así que
 * las dos convergen y el alta es idempotente por ese id, igual que categorías y
 * tipos de precio.
 */
export async function createRole(input: CreateRoleInput): Promise<Role> {
  const access = requireAccess();
  const name = cleanRoleName(input.name);
  const permissions = input.permissions;

  if (access.mode === "local") {
    const base = slug(name);
    const local: Role = { id: base ? `role-${base}` : uid(), name, permissions };
    mutate((st) => {
      const i = st.roles.findIndex((r) => r.id === local.id);
      if (i >= 0) st.roles[i] = { ...st.roles[i], name, permissions };
      else st.roles.push(local);
      logAudit("rol_creado", "role", local.id, { name });
    });
    return local;
  }

  const row = await apiFetch<RoleWire>("/roles", { method: "POST", body: { name, permissions } });
  return adoptRole(row, "rol_creado");
}

export interface UpdateRoleInput {
  name?: string;
  permissions?: Permission[];
}

/**
 * Edita nombre y/o permisos de un rol. Los permisos van en bloque (reemplazo
 * completo, no fusión): igual que hace `UsersService.updateRole` en el
 * servidor, mandar `permissions` sustituye la lista entera.
 *
 * Un rol de sistema (`system: true`, el Administrador) no admite cambios de
 * permisos: el servidor lo niega con `invalid` si se le manda `permissions`, así
 * que aquí ni se intenta si el llamador se equivocó y lo mandó de todas formas.
 */
export async function updateRole(id: ID, patch: UpdateRoleInput): Promise<Role> {
  const access = requireAccess();
  const body: UpdateRoleInput = {};
  if (patch.name !== undefined) body.name = cleanRoleName(patch.name);
  if (patch.permissions !== undefined) body.permissions = patch.permissions;

  if (access.mode === "local") {
    let result: Role | undefined;
    mutate((st) => {
      const r = st.roles.find((x) => x.id === id);
      if (r) {
        if (body.name !== undefined) r.name = body.name;
        if (body.permissions !== undefined) r.permissions = body.permissions;
      }
      result = r;
      logAudit("rol_editado", "role", id, { fields: Object.keys(body) });
    });
    if (!result) throw new Error("El rol ya no existe");
    return result;
  }

  const row = await apiFetch<RoleWire>(`/roles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return adoptRole(row, "rol_editado");
}

/**
 * Elimina un rol.
 *
 * El servidor lo niega con `has_history` (409) si hay usuarios con ese rol, así
 * que la comprobación local previa que hace `ajustes.tsx` es cortesía para no ir
 * al servidor de balde, no la garantía. También lo niega (`invalid`, 400) si es
 * un rol de sistema.
 *
 * `DELETE` responde 204 sin cuerpo; `apiFetch` lo traduce a `undefined`.
 */
export async function deleteRole(id: ID): Promise<void> {
  const access = requireAccess();

  if (access.mode === "remote") {
    await apiFetch<void>(`/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  mutate((st) => {
    st.roles = st.roles.filter((x) => x.id !== id);
    logAudit("rol_eliminado", "role", id);
  });
}

/* ── Interno ──────────────────────────────────────────── */

function requireAccess(): UserAccess {
  const access = userAccess();
  // Los controles ya deberían estar deshabilitados; esto es la red de seguridad
  // para que un camino que no consultó el acceso no escriba en local a escondidas.
  if (access.mode === "blocked") throw new Error(access.reason);
  return access;
}

function requireRoleExists(roleId: ID) {
  if (!getState().roles.some((r) => r.id === roleId)) {
    throw new Error("El rol seleccionado ya no existe");
  }
}

function cleanUsername(rawUsername: string): string {
  const username = rawUsername.trim();
  if (!username) throw new Error("El usuario necesita un nombre de usuario");
  if (username.length > USERNAME_MAX) {
    throw new Error(`El usuario no puede pasar de ${USERNAME_MAX} caracteres`);
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error("El usuario sólo admite letras, números, punto, guion y guion bajo");
  }
  return username;
}

function cleanFullName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error("El usuario necesita un nombre completo");
  if (name.length > FULLNAME_MAX) {
    throw new Error(`El nombre no puede pasar de ${FULLNAME_MAX} caracteres`);
  }
  return name;
}

/** `undefined` si viene vacío: así el llamador sabe que no hay nada que mandar. */
function cleanEmail(rawEmail?: string): string | undefined {
  const email = rawEmail?.trim();
  if (!email) return undefined;
  if (email.length > EMAIL_MAX) {
    throw new Error(`El correo no puede pasar de ${EMAIL_MAX} caracteres`);
  }
  // Validación laxa a propósito: sólo para no mandar basura obvia. El servidor
  // (`@IsEmail()`) es quien de verdad decide si el correo es válido.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no es válido");
  return email;
}

function cleanPassword(rawPassword: string): string {
  if (rawPassword.length < PASSWORD_MIN) {
    throw new Error(`La contraseña necesita al menos ${PASSWORD_MIN} caracteres`);
  }
  if (rawPassword.length > PASSWORD_MAX) {
    throw new Error(`La contraseña no puede pasar de ${PASSWORD_MAX} caracteres`);
  }
  return rawPassword;
}

function cleanRoleName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new Error("El rol necesita un nombre");
  if (name.length > ROLE_NAME_MAX) {
    throw new Error(`El nombre no puede pasar de ${ROLE_NAME_MAX} caracteres`);
  }
  return name;
}

/**
 * Adopta la respuesta del servidor en el estado local: es él quien decide todo
 * salvo la contraseña en claro, que se conserva tal cual estuviera en este
 * equipo (igual que `mergeUser` en `lib/sync/apply.ts`, que resuelve el mismo
 * problema para el delta del bootstrap).
 */
function adoptUser(row: UserWire, action: string): User {
  let result!: User;
  mutate((st) => {
    const i = st.users.findIndex((x) => x.id === row.id);
    const local = i >= 0 ? st.users[i] : undefined;
    const user: User = {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      email: row.email,
      password: local?.password,
      roleId: row.roleId,
      active: row.active,
      system: row.system,
      deactivatedAt: row.deactivatedAt,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      rev: row.rev,
    };
    if (i >= 0) st.users[i] = user;
    else st.users.push(user);
    result = user;
    logAudit(action, "user", user.id, { username: user.username });
  });
  return result;
}

/** Adopta la respuesta del servidor en el estado local: es él quien decide todo. */
function adoptRole(row: RoleWire, action: string): Role {
  const role: Role = {
    id: row.id,
    name: row.name,
    permissions: row.permissions,
    system: row.system,
    rev: row.rev,
  };
  mutate((st) => {
    const i = st.roles.findIndex((x) => x.id === role.id);
    if (i >= 0) st.roles[i] = { ...st.roles[i], ...role };
    else st.roles.push(role);
    logAudit(action, "role", role.id, { name: role.name });
  });
  return role;
}
