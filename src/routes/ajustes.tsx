import { createFileRoute } from "@tanstack/react-router";
import {
  IcoAlerta,
  IcoDatos,
  IcoEtiquetas,
  IcoImprimir,
  IcoMoneda,
  IcoNegocio,
  IcoTarjeta,
  IcoUsuarios,
} from "@/chasis/iconos";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import {
  Aviso,
  Badge,
  Btn,
  Card,
  CardHead,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui-kit";
import { getState, logAudit, mutate, resetDatabase, useAppState } from "@/lib/store";
import { categoryErrorText, createCategory, useCategoryAccess } from "@/lib/sync/categories";
import { companyErrorText, updateCompany, useCompanyAccess } from "@/lib/sync/company";
import {
  createPaymentMethod,
  deletePaymentMethod,
  paymentMethodErrorText,
  updatePaymentMethod,
  usePaymentMethodAccess,
} from "@/lib/sync/payment-methods";
import {
  createPriceType,
  deletePriceType,
  priceTypeErrorText,
  renamePriceType,
  setDefaultPriceType,
  usePriceTypeAccess,
} from "@/lib/sync/price-types";
import {
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  setUserPassword,
  updateRole,
  updateUser,
  userErrorText,
  useUserAccess,
  type UserAccess,
} from "@/lib/sync/users";
import {
  DEFAULT_PRODUCT_CODE_DIGITS,
  DEFAULT_PRODUCT_CODE_PREFIX,
  DEFAULT_PRODUCT_CODE_START,
  nextProductCode,
} from "@/lib/catalog";
import { uid } from "@/lib/seed";
import { addMovement } from "@/lib/business";
import { queueProductCreate, queueProductUpdate } from "@/lib/sync/mutations";
import { dt, num, usd } from "@/lib/format";
import {
  ALL_PERMISSIONS,
  type CompanySettings,
  type PaymentMethod,
  type Permission,
  type PriceType,
  type Product,
  type Role,
  type User,
} from "@/lib/types";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/ajustes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ajustes · Karelys Delicias" },
      {
        name: "description",
        content: "Empresa, usuarios y permisos, tasas, precios, pagos e impresión.",
      },
      { property: "og:title", content: "Ajustes · Karelys Delicias" },
      {
        property: "og:description",
        content: "Empresa, usuarios y permisos, tasas, precios, pagos e impresión.",
      },
    ],
  }),
  component: () => (
    <AppShell requires="manage_settings">
      <Ajustes />
    </AppShell>
  ),
});

const TABS = [
  ["empresa", "Empresa", IcoNegocio],
  ["usuarios", "Usuarios y permisos", IcoUsuarios],
  ["tasas", "Tasas de cambio", IcoMoneda],
  ["precios", "Tipos de precio", IcoEtiquetas],
  ["pagos", "Métodos de pago", IcoTarjeta],
  ["impresion", "Impresión y numeración", IcoImprimir],
  ["datos", "Datos e importación", IcoDatos],
] as const;

function Ajustes() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("empresa");
  return (
    <>
      <PageHead title="Ajustes" sub="Configuración del sistema" />
      <div className="mb-4 lg:hidden">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as (typeof TABS)[number][0])}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          {TABS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-20 hidden rounded-lg border border-border bg-secondary/60 p-3 lg:block">
          <p className="px-3 pb-3 pt-1 text-xs font-semibold uppercase text-texto-3">
            Configuración
          </p>
          <nav className="space-y-1" aria-label="Secciones de ajustes">
            {TABS.map(([k, label, Icon]) => (
              <Btn
                key={k}
                variant="ghost"
                onClick={() => setTab(k)}
                className={
                  "h-auto w-full justify-start px-3 py-2.5 text-left text-sm " +
                  (tab === k
                    ? "bg-sol-vela font-semibold text-sol-70 hover:bg-sol-vela hover:text-sol-70"
                    : "text-muted-foreground")
                }
              >
                <Icon />
                <span className="min-w-0 leading-snug">{label}</span>
              </Btn>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {tab === "empresa" && <Empresa />}
          {tab === "usuarios" && <Usuarios />}
          {tab === "tasas" && <Tasas />}
          {tab === "precios" && <Precios />}
          {tab === "pagos" && <Pagos />}
          {tab === "impresion" && <Impresion />}
          {tab === "datos" && <Datos />}
        </section>
      </div>
    </>
  );
}

/** Cotas de `UpdateCompanyDto` en el backend para los campos de esta pestaña. */
const COMPANY_NAME_MAX = 160;
const COMPANY_LOGO_MAX = 2000;
const COMPANY_PHONE_MAX = 60;
const COMPANY_ADDRESS_MAX = 500;
const COMPANY_TAXID_MAX = 40;

function Empresa() {
  const s = useAppState();
  const acceso = useCompanyAccess();
  const [f, setF] = useState(s.company);
  const [guardando, setGuardando] = useState(false);

  const bloqueado = acceso.mode === "blocked" || guardando;

  async function guardar() {
    if (bloqueado) return;

    const name = f.name.trim();
    const phone = f.phone.trim();
    const address = f.address.trim();
    const taxId = f.taxId.trim();

    if (!name) return toast.error("Completa el nombre de la empresa");
    if (name.length > COMPANY_NAME_MAX)
      return toast.error(`El nombre no puede pasar de ${COMPANY_NAME_MAX} caracteres`);
    if (phone.length > COMPANY_PHONE_MAX)
      return toast.error(`El teléfono no puede pasar de ${COMPANY_PHONE_MAX} caracteres`);
    if (address.length > COMPANY_ADDRESS_MAX)
      return toast.error(`La dirección no puede pasar de ${COMPANY_ADDRESS_MAX} caracteres`);
    if (taxId.length > COMPANY_TAXID_MAX)
      return toast.error(`El RIF no puede pasar de ${COMPANY_TAXID_MAX} caracteres`);
    // El logo se guarda como data URI (base64): con backend, `UpdateCompanyDto`
    // sólo admite hasta `COMPANY_LOGO_MAX` caracteres, y una foto real casi
    // siempre lo pasa. Mejor este aviso ahora que un 400 opaco al guardar.
    if (acceso.mode !== "local" && f.logoUrl.length > COMPANY_LOGO_MAX) {
      return toast.error("El logo es demasiado pesado para guardarlo en el servidor", {
        description: `Usa una imagen más pequeña o de menor calidad: el límite son unos ${COMPANY_LOGO_MAX} caracteres codificados.`,
      });
    }

    const normalizado: CompanySettings = { ...f, name, phone, address, taxId };
    const patch = diffCompanyFields(s.company, normalizado);
    if (!Object.keys(patch).length) {
      setF(normalizado);
      toast.success("Configuración guardada");
      return;
    }

    setGuardando(true);
    try {
      const result = await updateCompany(patch);
      setF(result.company);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error("No se pudo guardar la configuración", { description: companyErrorText(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="max-w-4xl">
      <CardHead
        title="Configuración de empresa"
        sub="Karelys Delicias es la marca principal del sistema"
      />
      {acceso.mode === "blocked" && (
        <div className="px-4 pt-4">
          <Aviso tone="amber" icon={IcoAlerta}>
            {acceso.reason}
          </Aviso>
        </div>
      )}
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input
            value={f.name}
            disabled={bloqueado}
            maxLength={COMPANY_NAME_MAX}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={f.phone}
            disabled={bloqueado}
            maxLength={COMPANY_PHONE_MAX}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Field>
        <Field label="Dirección">
          <Input
            value={f.address}
            disabled={bloqueado}
            maxLength={COMPANY_ADDRESS_MAX}
            onChange={(e) => setF({ ...f, address: e.target.value })}
          />
        </Field>
        <Field label="Datos fiscales (RIF)">
          <Input
            value={f.taxId}
            disabled={bloqueado}
            maxLength={COMPANY_TAXID_MAX}
            onChange={(e) => setF({ ...f, taxId: e.target.value })}
          />
        </Field>
        <Field label="Logo del negocio">
          <div className="flex items-center gap-3">
            <label
              className={
                "flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-linea bg-sup-2 text-center text-[11px] leading-tight text-texto-3 transition-colors hover:border-sol hover:text-sol" +
                (bloqueado ? " pointer-events-none opacity-60" : "")
              }
            >
              {f.logoUrl ? (
                <img src={f.logoUrl} alt="Logo" className="size-full object-cover" />
              ) : (
                <span className="px-1">
                  Subir
                  <br />
                  logo
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={bloqueado}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => setF({ ...f, logoUrl: String(r.result) });
                  r.readAsDataURL(file);
                }}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-texto-3">
                PNG o JPG. Se mostrará en el login, el menú y el ticket.
              </p>
              {f.logoUrl && (
                <Btn size="sm" disabled={bloqueado} onClick={() => setF({ ...f, logoUrl: "" })}>
                  Quitar logo
                </Btn>
              )}
            </div>
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Btn
            variant="amber"
            cargando={guardando}
            disabled={bloqueado}
            title={acceso.mode === "blocked" ? acceso.reason : undefined}
            onClick={() => void guardar()}
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Card>
  );
}

/** Formulario del modal de alta/edición de usuario. `id` ausente ⇒ alta. */
interface UserForm {
  id?: string;
  username: string;
  fullName: string;
  email: string;
  password: string;
  roleId: string;
  active: boolean;
}

const USERNAME_FORM_RE = /^[a-zA-Z0-9._-]+$/;

function Usuarios() {
  const s = useAppState();
  const { can, user: sessionUser } = useSession();
  const acceso = useUserAccess();
  const [edit, setEdit] = useState<UserForm | null>(null);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);
  const [del, setDel] = useState<User | null>(null);
  const [roleAbierto, setRoleAbierto] = useState<string | null>(null);
  const [roleDel, setRoleDel] = useState<Role | null>(null);
  const [borrandoRol, setBorrandoRol] = useState(false);
  const [creandoRol, setCreandoRol] = useState(false);

  if (!can("manage_users"))
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No tienes permiso para gestionar usuarios.
      </Card>
    );

  const bloqueado = acceso.mode === "blocked";
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;
  // Sólo una build sin backend gestiona usuarios de verdad en local; con
  // backend (remoto o momentáneamente bloqueado) "eliminar" no existe: el
  // servidor no tiene `DELETE /users`, sólo desactivar.
  const hayBackend = acceso.mode !== "local";

  function abrirNuevo() {
    if (bloqueado) return;
    setEdit({
      username: "",
      fullName: "",
      email: "",
      password: "",
      roleId: s.roles[0]?.id ?? "",
      active: true,
    });
  }

  function abrirEditar(u: User) {
    setEdit({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email ?? "",
      password: "",
      roleId: u.roleId,
      active: u.active,
    });
  }

  async function guardarUsuario() {
    if (!edit || guardandoUsuario) return;

    const username = edit.username.trim();
    const fullName = edit.fullName.trim();
    const email = edit.email.trim();
    const password = edit.password.trim();

    if (!username) return toast.error("Completa el usuario");
    if (username.length > 40) return toast.error("El usuario no puede pasar de 40 caracteres");
    if (!USERNAME_FORM_RE.test(username))
      return toast.error("El usuario sólo admite letras, números, punto, guion y guion bajo");
    if (!fullName) return toast.error("Completa el nombre completo");
    if (fullName.length > 120) return toast.error("El nombre no puede pasar de 120 caracteres");
    if (!edit.roleId || !s.roles.some((r) => r.id === edit.roleId))
      return toast.error("Selecciona un rol válido");
    if (!edit.id && !password) return toast.error("Define una contraseña");
    if (password && password.length < 10)
      return toast.error("La contraseña necesita al menos 10 caracteres");
    if (bloqueado) return toast.error("No se pudo guardar el usuario", { description: motivo });

    setGuardandoUsuario(true);
    try {
      if (edit.id) {
        await updateUser(edit.id, {
          fullName,
          email,
          roleId: edit.roleId,
          active: edit.active,
        });
        if (password) {
          try {
            await setUserPassword(edit.id, password);
          } catch (err) {
            toast.error("El usuario se guardó, pero no se pudo cambiar la contraseña", {
              description: userErrorText(err),
            });
            setEdit(null);
            return;
          }
        }
        toast.success("Usuario actualizado");
      } else {
        await createUser({
          username,
          fullName,
          email,
          password,
          roleId: edit.roleId,
          active: edit.active,
        });
        toast.success("Usuario creado");
      }
      setEdit(null);
    } catch (err) {
      toast.error(edit.id ? "No se pudo actualizar el usuario" : "No se pudo crear el usuario", {
        description: userErrorText(err),
      });
    } finally {
      setGuardandoUsuario(false);
    }
  }

  async function agregarRol() {
    if (bloqueado || creandoRol) return;
    setCreandoRol(true);
    try {
      const r = await createRole({ name: "Nuevo rol", permissions: [] });
      toast.success(`Rol "${r.name}" creado`);
    } catch (err) {
      toast.error("No se pudo crear el rol", { description: userErrorText(err) });
    } finally {
      setCreandoRol(false);
    }
  }

  function pedirEliminarRol(r: Role) {
    if (bloqueado || r.system) return;
    const usados = s.users.filter((u) => u.roleId === r.id).length;
    if (usados > 0) {
      toast.error(`Hay ${usados} usuario(s) con este rol. Cámbialos primero.`);
      return;
    }
    setRoleDel(r);
  }

  async function confirmarEliminarRol() {
    if (!roleDel || borrandoRol) return;
    setBorrandoRol(true);
    try {
      await deleteRole(roleDel.id);
      toast.success("Rol eliminado");
      setRoleDel(null);
    } catch (err) {
      toast.error("No se pudo eliminar el rol", { description: userErrorText(err) });
    } finally {
      setBorrandoRol(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead
          title="Usuarios"
          action={
            <Btn size="sm" variant="amber" disabled={bloqueado} title={motivo} onClick={abrirNuevo}>
              Nuevo
            </Btn>
          }
        />
        {motivo && (
          <div className="px-3 pt-3">
            <Aviso tone="amber" icon={IcoAlerta}>
              {motivo}
            </Aviso>
          </div>
        )}
        <div className="divide-y divide-border">
          {s.users.map((u) => (
            <FilaUsuario
              key={u.id}
              u={u}
              roles={s.roles}
              acceso={acceso}
              hayBackend={hayBackend}
              protegido={u.username === "admin" || u.id === sessionUser?.id}
              onEdit={() => abrirEditar(u)}
              onDelete={() => setDel(u)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Roles y permisos"
          action={
            <Btn
              size="sm"
              disabled={bloqueado}
              cargando={creandoRol}
              title={motivo}
              onClick={() => void agregarRol()}
            >
              Nuevo rol
            </Btn>
          }
        />
        <div className="divide-y divide-border">
          {s.roles.map((r) => (
            <FilaRol
              key={r.id}
              r={r}
              usados={s.users.filter((u) => u.roleId === r.id).length}
              acceso={acceso}
              abierto={roleAbierto === r.id}
              onToggleAbierto={() => setRoleAbierto(roleAbierto === r.id ? null : r.id)}
              onDelete={() => pedirEliminarRol(r)}
            />
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={!!roleDel}
        title="Eliminar rol"
        message="¿Seguro que quieres eliminar este rol? No se puede deshacer."
        danger
        onCancel={() => setRoleDel(null)}
        onConfirm={() => void confirmarEliminarRol()}
      />

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Editar usuario" : "Nuevo usuario"}
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Nombre completo">
              <Input
                value={edit.fullName}
                maxLength={120}
                disabled={guardandoUsuario}
                onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
              />
            </Field>
            <Field
              label="Usuario"
              hint={
                edit.id && acceso.mode === "remote"
                  ? "El usuario no se puede cambiar después de creado"
                  : undefined
              }
            >
              <Input
                value={edit.username}
                maxLength={40}
                disabled={guardandoUsuario || (!!edit.id && acceso.mode === "remote")}
                onChange={(e) => setEdit({ ...edit, username: e.target.value })}
              />
            </Field>
            <Field label="Correo (opcional)">
              <Input
                type="email"
                value={edit.email}
                maxLength={160}
                disabled={guardandoUsuario}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              />
            </Field>
            <Field
              label="Contraseña"
              hint={
                edit.id
                  ? "Déjala vacía para no cambiarla · mínimo 10 caracteres"
                  : "Mínimo 10 caracteres"
              }
            >
              <Input
                type="text"
                value={edit.password}
                disabled={guardandoUsuario}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
              />
            </Field>
            <Field label="Rol">
              <Select
                value={edit.roleId}
                disabled={guardandoUsuario}
                onChange={(e) => setEdit({ ...edit, roleId: e.target.value })}
              >
                {s.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select
                value={edit.active ? "1" : "0"}
                disabled={guardandoUsuario}
                onChange={(e) => setEdit({ ...edit, active: e.target.value === "1" })}
              >
                <option value="1">Activo</option>
                <option value="0">Desactivado</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEdit(null)} disabled={guardandoUsuario}>
                Cancelar
              </Btn>
              <Btn
                variant="amber"
                cargando={guardandoUsuario}
                disabled={bloqueado}
                title={motivo}
                onClick={() => void guardarUsuario()}
              >
                Guardar
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {!hayBackend && (
        <ConfirmDialog
          open={!!del}
          danger
          title="Eliminar usuario"
          message={`¿Eliminar a ${del?.fullName}?`}
          onCancel={() => setDel(null)}
          onConfirm={() => {
            try {
              deleteUser(del!.id);
              toast.success("Usuario eliminado");
            } catch (err) {
              toast.error("No se pudo eliminar el usuario", { description: userErrorText(err) });
            } finally {
              setDel(null);
            }
          }}
        />
      )}
    </div>
  );
}

function FilaUsuario({
  u,
  roles,
  acceso,
  hayBackend,
  protegido,
  onEdit,
  onDelete,
}: {
  u: User;
  roles: Role[];
  acceso: UserAccess;
  hayBackend: boolean;
  /** El usuario `admin` o el de la sesión actual: no se puede desactivar ni eliminar desde aquí. */
  protegido: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [cambiando, setCambiando] = useState(false);
  const bloqueado = acceso.mode === "blocked";
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;

  async function alternarActivo() {
    if (cambiando || bloqueado) return;
    setCambiando(true);
    try {
      await updateUser(u.id, { active: !u.active });
      toast.success(u.active ? "Usuario desactivado" : "Usuario activado");
    } catch (err) {
      toast.error("No se pudo cambiar el estado del usuario", { description: userErrorText(err) });
    } finally {
      setCambiando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{u.fullName}</p>
        <p className="num text-xs text-muted-foreground">
          {u.username} · {roles.find((r) => r.id === u.roleId)?.name ?? "—"}
        </p>
      </div>
      <Badge tone={u.active ? "green" : "neutral"}>{u.active ? "Activo" : "Inactivo"}</Badge>
      <Btn size="sm" onClick={onEdit}>
        Editar
      </Btn>
      {!protegido && hayBackend && (
        <Btn
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          cargando={cambiando}
          title={motivo}
          onClick={() => void alternarActivo()}
        >
          {u.active ? "Desactivar" : "Activar"}
        </Btn>
      )}
      {!protegido && !hayBackend && (
        <Btn size="sm" variant="ghost" onClick={onDelete}>
          Eliminar
        </Btn>
      )}
    </div>
  );
}

function FilaRol({
  r,
  usados,
  acceso,
  abierto,
  onToggleAbierto,
  onDelete,
}: {
  r: Role;
  usados: number;
  acceso: UserAccess;
  abierto: boolean;
  onToggleAbierto: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(r.name);
  /** El nombre que trajo el estado la última vez que se sincronizó con el input. */
  const [adoptado, setAdoptado] = useState(r.name);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);

  // El nombre cambió en el estado (otro equipo lo renombró y llegó por sync, o
  // acabó de confirmarlo el servidor): el input adopta el valor autoritativo en
  // lugar de quedarse enseñando uno viejo.
  if (adoptado !== r.name) {
    setAdoptado(r.name);
    setName(r.name);
  }

  const bloqueado = acceso.mode === "blocked";
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;
  const ocupado = guardandoNombre || guardandoPermisos;

  async function guardarNombre() {
    const limpio = name.trim();
    if (ocupado || limpio === r.name) {
      setName(r.name);
      return;
    }
    if (!limpio) {
      setName(r.name);
      toast.error("El rol necesita un nombre");
      return;
    }
    if (bloqueado) {
      setName(r.name);
      toast.error("No se pudo renombrar el rol", { description: motivo });
      return;
    }
    setGuardandoNombre(true);
    try {
      await updateRole(r.id, { name: limpio });
      toast.success("Rol actualizado");
    } catch (err) {
      setName(r.name);
      toast.error("No se pudo renombrar el rol", { description: userErrorText(err) });
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function alternarPermiso(permiso: Permission, marcado: boolean) {
    if (ocupado || bloqueado || r.system) return;
    const next = marcado ? [...r.permissions, permiso] : r.permissions.filter((p) => p !== permiso);
    setGuardandoPermisos(true);
    try {
      await updateRole(r.id, { permissions: next });
    } catch (err) {
      toast.error("No se pudo actualizar los permisos", { description: userErrorText(err) });
    } finally {
      setGuardandoPermisos(false);
    }
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <input
          value={name}
          disabled={bloqueado || ocupado}
          title={motivo}
          aria-label={`Nombre del rol ${r.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void guardarNombre()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(r.name);
          }}
          className="min-w-[8rem] flex-1 bg-transparent text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="num text-xs text-muted-foreground">{r.permissions.length} permisos</span>
        <Btn size="sm" variant="ghost" onClick={onToggleAbierto}>
          {abierto ? "Cerrar" : "Permisos"}
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          disabled={bloqueado || r.system}
          title={r.system ? "Un rol de sistema no se puede eliminar" : motivo}
          onClick={onDelete}
        >
          Eliminar
        </Btn>
      </div>
      {abierto && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          {ALL_PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={r.permissions.includes(p.key)}
                disabled={bloqueado || ocupado || r.system}
                title={r.system ? "Un rol de sistema no admite cambios de permisos" : motivo}
                onChange={(e) => void alternarPermiso(p.key, e.target.checked)}
              />
              {p.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Tasas() {
  const s = useAppState();
  return (
    <Card>
      <CardHead
        title="Historial de tasas"
        sub="Cada venta guarda la tasa usada; el histórico nunca se recalcula"
      />
      <div className="divide-y divide-border">
        {s.rates.slice(0, 60).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <Badge tone="amber">{r.source.replace("_", " ")}</Badge>
            <span className="num min-w-[6rem] flex-1">{num(r.value)}</span>
            <span className="text-xs text-muted-foreground">
              {r.automatic ? "Automática" : "Manual"}
            </span>
            <span className="text-xs text-muted-foreground">
              {s.users.find((u) => u.id === r.userId)?.fullName ?? "Sistema"}
            </span>
            <span className="num text-xs text-texto-3">{dt(r.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Precios() {
  const s = useAppState();
  const acceso = usePriceTypeAccess();
  const [name, setName] = useState("");
  const [creando, setCreando] = useState(false);

  const bloqueado = acceso.mode === "blocked";
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;

  async function agregar() {
    if (bloqueado || creando || !name.trim()) return;
    setCreando(true);
    try {
      const pt = await createPriceType(name);
      setName("");
      toast.success(`Tipo de precio "${pt.name}" creado`);
    } catch (err) {
      toast.error("No se pudo crear el tipo de precio", { description: priceTypeErrorText(err) });
    } finally {
      setCreando(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHead
        title="Tipos de precio"
        sub={
          acceso.mode === "local"
            ? "Configurables: agrega tantos como necesites"
            : "Se gestionan en el servidor: hace falta conexión."
        }
      />
      {motivo && (
        <div className="px-3 pt-3">
          <Aviso tone="amber" icon={IcoAlerta}>
            {motivo}
          </Aviso>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        <Input
          placeholder="Nuevo tipo de precio"
          value={name}
          maxLength={60}
          disabled={bloqueado || creando}
          title={motivo}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void agregar();
          }}
        />
        <Btn
          variant="amber"
          disabled={bloqueado || !name.trim()}
          cargando={creando}
          title={motivo}
          onClick={() => void agregar()}
        >
          Agregar
        </Btn>
      </div>
      <div className="divide-y divide-border">
        {s.priceTypes.map((p) => (
          <FilaPrecio
            key={p.id}
            pt={p}
            // Cuántos productos tienen un precio cargado con este tipo: cortesía
            // para no ir al servidor de balde, no la garantía (el servidor niega
            // el borrado con `has_history` si de verdad está en uso).
            productos={
              s.products.filter((x) => x.prices.some((pr) => pr.priceTypeId === p.id)).length
            }
            eliminable={s.priceTypes.length > 1}
            bloqueado={bloqueado}
            motivo={motivo}
          />
        ))}
      </div>
    </Card>
  );
}

function FilaPrecio({
  pt,
  productos,
  eliminable,
  bloqueado,
  motivo,
}: {
  pt: PriceType;
  productos: number;
  eliminable: boolean;
  bloqueado: boolean;
  motivo?: string;
}) {
  const [name, setName] = useState(pt.name);
  /** El nombre que trajo el estado la última vez que se sincronizó con el input. */
  const [adoptado, setAdoptado] = useState(pt.name);
  const [guardando, setGuardando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El nombre cambió en el estado (lo renombró otro equipo y llegó por sync, o
  // acabó de confirmarlo el servidor): el input adopta el valor autoritativo en
  // lugar de quedarse enseñando uno viejo.
  if (adoptado !== pt.name) {
    setAdoptado(pt.name);
    setName(pt.name);
  }

  const ocupado = guardando || marcando || borrando;

  async function guardarNombre() {
    const limpio = name.trim();
    if (ocupado || limpio === pt.name) {
      setName(pt.name);
      return;
    }
    if (!limpio) {
      setName(pt.name);
      toast.error("El tipo de precio necesita un nombre");
      return;
    }
    // Red de seguridad: el input ya está deshabilitado, pero si el acceso se cayó
    // mientras se escribía, el cambio se revierte en lugar de quedarse sólo aquí.
    if (bloqueado) {
      setName(pt.name);
      toast.error("No se pudo renombrar el tipo de precio", { description: motivo });
      return;
    }
    setGuardando(true);
    try {
      await renamePriceType(pt.id, limpio);
      toast.success("Tipo de precio actualizado");
    } catch (err) {
      setName(pt.name);
      toast.error("No se pudo renombrar el tipo de precio", {
        description: priceTypeErrorText(err),
      });
    } finally {
      setGuardando(false);
    }
  }

  async function hacerPredeterminado() {
    if (ocupado || bloqueado) return;
    setMarcando(true);
    try {
      await setDefaultPriceType(pt.id);
      toast.success(`"${pt.name}" es ahora el tipo de precio predeterminado`);
    } catch (err) {
      toast.error("No se pudo marcar como predeterminado", {
        description: priceTypeErrorText(err),
      });
    } finally {
      setMarcando(false);
    }
  }

  async function eliminar() {
    if (ocupado || bloqueado) return;
    // El servidor también lo niega (409 `has_history`): esto evita el viaje.
    if (productos > 0) {
      toast.error("El tipo de precio está en uso en productos");
      return;
    }
    setBorrando(true);
    try {
      await deletePriceType(pt.id);
      toast.success("Tipo de precio eliminado");
    } catch (err) {
      toast.error("No se pudo eliminar el tipo de precio", {
        description: priceTypeErrorText(err),
      });
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <input
        value={name}
        maxLength={60}
        disabled={bloqueado || ocupado}
        title={motivo}
        aria-label={`Nombre del tipo de precio ${pt.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void guardarNombre()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setName(pt.name);
        }}
        className="flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      {pt.isDefault ? (
        <Badge tone="amber">Predeterminado</Badge>
      ) : (
        <Btn
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          cargando={marcando}
          title={motivo}
          onClick={() => void hacerPredeterminado()}
        >
          Hacer predeterminado
        </Btn>
      )}
      {eliminable && (
        <Btn
          size="sm"
          variant="ghost"
          disabled={bloqueado}
          cargando={borrando}
          title={motivo}
          onClick={() => void eliminar()}
        >
          Eliminar
        </Btn>
      )}
    </div>
  );
}

/** Tope de `name` en `CreatePaymentMethodDto` / `UpdatePaymentMethodDto` (ver payment-methods.ts). */
const PAYMENT_METHOD_NAME_MAX = 80;

function Pagos() {
  const s = useAppState();
  const acceso = usePaymentMethodAccess();
  const [f, setF] = useState<{ name: string; currency: "USD" | "BS"; ref: string }>({
    name: "",
    currency: "USD",
    ref: "no",
  });
  const [creando, setCreando] = useState(false);
  const [del, setDel] = useState<PaymentMethod | null>(null);
  const [borrando, setBorrando] = useState(false);

  const bloqueado = acceso.mode === "blocked";
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;

  async function agregar() {
    if (bloqueado || creando) return;
    if (!f.name.trim()) return toast.error("Completa el nombre");
    setCreando(true);
    try {
      await createPaymentMethod({
        name: f.name.trim(),
        currency: f.currency,
        requiresReference: f.ref === "si",
      });
      setF({ name: "", currency: "USD", ref: "no" });
      toast.success("Forma de pago agregada");
    } catch (err) {
      toast.error("No se pudo agregar la forma de pago", {
        description: paymentMethodErrorText(err),
      });
    } finally {
      setCreando(false);
    }
  }

  async function eliminar() {
    if (!del || borrando) return;
    setBorrando(true);
    try {
      await deletePaymentMethod(del.id);
      toast.success("Forma de pago eliminada");
      setDel(null);
    } catch (err) {
      toast.error("No se pudo eliminar la forma de pago", {
        description: paymentMethodErrorText(err),
      });
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHead title="Métodos de pago" />
      {acceso.mode === "blocked" && (
        <div className="px-4 pt-4">
          <Aviso tone="amber" icon={IcoAlerta}>
            {acceso.reason}
          </Aviso>
        </div>
      )}
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-4">
        <Input
          placeholder="Nombre"
          value={f.name}
          disabled={bloqueado || creando}
          maxLength={PAYMENT_METHOD_NAME_MAX}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Select
          value={f.currency}
          disabled={bloqueado || creando}
          onChange={(e) => setF({ ...f, currency: e.target.value as "USD" | "BS" })}
        >
          <option value="USD">USD</option>
          <option value="BS">Bolívares</option>
        </Select>
        <Select
          value={f.ref}
          disabled={bloqueado || creando}
          onChange={(e) => setF({ ...f, ref: e.target.value })}
        >
          <option value="no">Sin referencia</option>
          <option value="si">Requiere referencia</option>
        </Select>
        <Btn
          variant="amber"
          cargando={creando}
          disabled={bloqueado}
          title={motivo}
          onClick={() => void agregar()}
        >
          Agregar
        </Btn>
      </div>
      <div className="divide-y divide-border">
        {s.paymentMethods.map((m) => (
          <FilaPago
            key={m.id}
            m={m}
            bloqueado={bloqueado}
            motivo={motivo}
            onDelete={() => setDel(m)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!del}
        danger
        title="Eliminar forma de pago"
        message={`¿Eliminar "${del?.name}"? Si tiene ventas o pedidos con esta forma de pago, el servidor pedirá desactivarla en vez de eliminarla.`}
        onCancel={() => (borrando ? null : setDel(null))}
        onConfirm={() => void eliminar()}
      />
    </Card>
  );
}

function FilaPago({
  m,
  bloqueado,
  motivo,
  onDelete,
}: {
  m: PaymentMethod;
  bloqueado: boolean;
  motivo?: string;
  onDelete: () => void;
}) {
  const [name, setName] = useState(m.name);
  /** El nombre que trajo el estado la última vez que se sincronizó con el input. */
  const [adoptado, setAdoptado] = useState(m.name);
  const [guardando, setGuardando] = useState(false);
  const [alternando, setAlternando] = useState(false);

  // El nombre cambió en el estado (lo renombró otro equipo y llegó por sync, o
  // acabó de confirmarlo el servidor): el input adopta el valor autoritativo en
  // lugar de quedarse enseñando uno viejo.
  if (adoptado !== m.name) {
    setAdoptado(m.name);
    setName(m.name);
  }

  const ocupado = guardando || alternando;

  async function guardarNombre() {
    const limpio = name.trim();
    if (ocupado || limpio === m.name) {
      setName(m.name);
      return;
    }
    if (!limpio) {
      setName(m.name);
      toast.error("La forma de pago necesita un nombre");
      return;
    }
    if (bloqueado) {
      setName(m.name);
      toast.error("No se pudo renombrar la forma de pago", { description: motivo });
      return;
    }
    setGuardando(true);
    try {
      await updatePaymentMethod(m.id, { name: limpio });
      toast.success("Forma de pago actualizada");
    } catch (err) {
      setName(m.name);
      toast.error("No se pudo renombrar la forma de pago", {
        description: paymentMethodErrorText(err),
      });
    } finally {
      setGuardando(false);
    }
  }

  async function alternarReferencia() {
    if (ocupado || bloqueado) return;
    setAlternando(true);
    try {
      await updatePaymentMethod(m.id, { requiresReference: !m.requiresReference });
    } catch (err) {
      toast.error("No se pudo cambiar la referencia", { description: paymentMethodErrorText(err) });
    } finally {
      setAlternando(false);
    }
  }

  async function alternarActivo() {
    if (ocupado || bloqueado) return;
    setAlternando(true);
    try {
      await updatePaymentMethod(m.id, { active: !m.active });
    } catch (err) {
      toast.error("No se pudo cambiar el estado", { description: paymentMethodErrorText(err) });
    } finally {
      setAlternando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm">
      <input
        value={name}
        maxLength={PAYMENT_METHOD_NAME_MAX}
        disabled={bloqueado || ocupado}
        title={motivo}
        aria-label={`Nombre de la forma de pago ${m.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void guardarNombre()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setName(m.name);
        }}
        className="flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      <Badge>{m.currency === "USD" ? "USD" : "Bs"}</Badge>
      {!m.active && <Badge tone="amber">Inactivo</Badge>}
      <Btn
        size="sm"
        variant="ghost"
        disabled={bloqueado}
        cargando={alternando}
        title={motivo}
        onClick={() => void alternarReferencia()}
      >
        {m.requiresReference ? "Referencia: sí" : "Referencia: no"}
      </Btn>
      <Btn
        size="sm"
        variant="ghost"
        disabled={bloqueado}
        cargando={alternando}
        title={motivo}
        onClick={() => void alternarActivo()}
      >
        {m.active ? "Desactivar" : "Activar"}
      </Btn>
      <Btn size="sm" variant="ghost" disabled={bloqueado} title={motivo} onClick={onDelete}>
        Eliminar
      </Btn>
    </div>
  );
}

/**
 * Prefijo de la secuencia de códigos de producto. Calca la validación del
 * backend (`UpdateCompanyDto`, ARCHITECTURE.md): empieza con una letra, sólo
 * `A-Z0-9-`, hasta 8 caracteres y nunca termina en dígito (para que el número
 * que le sigue siempre sea inequívoco al leerlo).
 */
const PRODUCT_CODE_PREFIX_RE = /^[A-Z]([A-Z0-9-]{0,6}[A-Z-])?$/;

/**
 * Los únicos campos que `PATCH /company` acepta, y sólo los que cambiaron. La
 * usan tanto Empresa como Impresión y numeración (y Atajos, sólo con
 * `shortcuts`): mismo patrón de "no mandar lo que el admin no tocó" en las
 * tres pestañas.
 */
function diffCompanyFields(base: CompanySettings, form: CompanySettings): Partial<CompanySettings> {
  const patch: Partial<CompanySettings> = {};
  if (form.name !== base.name) patch.name = form.name;
  if (form.logoUrl !== base.logoUrl) patch.logoUrl = form.logoUrl;
  if (form.phone !== base.phone) patch.phone = form.phone;
  if (form.address !== base.address) patch.address = form.address;
  if (form.taxId !== base.taxId) patch.taxId = form.taxId;
  if (JSON.stringify(form.shortcuts ?? {}) !== JSON.stringify(base.shortcuts ?? {}))
    patch.shortcuts = form.shortcuts;
  if (form.ticketFooter !== base.ticketFooter) patch.ticketFooter = form.ticketFooter;
  if (form.salePrefix !== base.salePrefix) patch.salePrefix = form.salePrefix;
  if (form.orderPrefix !== base.orderPrefix) patch.orderPrefix = form.orderPrefix;
  if (form.bsRounding !== base.bsRounding) patch.bsRounding = form.bsRounding;
  if (form.coldCakeMin !== base.coldCakeMin) patch.coldCakeMin = form.coldCakeMin;
  if (form.coldCakeMax !== base.coldCakeMax) patch.coldCakeMax = form.coldCakeMax;
  if (form.productCodePrefix !== base.productCodePrefix)
    patch.productCodePrefix = form.productCodePrefix;
  if (form.productCodeDigits !== base.productCodeDigits)
    patch.productCodeDigits = form.productCodeDigits;
  if (form.productCodeStart !== base.productCodeStart)
    patch.productCodeStart = form.productCodeStart;
  return patch;
}

function Impresion() {
  const s = useAppState();
  const acceso = useCompanyAccess();
  const [f, setF] = useState<CompanySettings>({
    ...s.company,
    productCodePrefix: s.company.productCodePrefix ?? DEFAULT_PRODUCT_CODE_PREFIX,
    productCodeDigits: s.company.productCodeDigits ?? DEFAULT_PRODUCT_CODE_DIGITS,
    productCodeStart: s.company.productCodeStart ?? DEFAULT_PRODUCT_CODE_START,
  });
  const [guardando, setGuardando] = useState(false);

  const bloqueado = acceso.mode === "blocked" || guardando;

  // Vista previa en vivo: sólo se calcula con una configuración que ya pasaría
  // la validación, para no enseñar un código que ni siquiera se podría guardar.
  const prefijoNorm = (f.productCodePrefix ?? DEFAULT_PRODUCT_CODE_PREFIX).trim().toUpperCase();
  const prefijoValido = PRODUCT_CODE_PREFIX_RE.test(prefijoNorm);
  const digitosValidos =
    Number.isInteger(f.productCodeDigits) && f.productCodeDigits! >= 1 && f.productCodeDigits! <= 6;
  const pisoValido =
    Number.isInteger(f.productCodeStart) &&
    f.productCodeStart! >= 1 &&
    f.productCodeStart! <= 99999999;
  const proximoCodigo =
    prefijoValido && digitosValidos && pisoValido
      ? nextProductCode({
          ...s,
          company: {
            ...s.company,
            productCodePrefix: prefijoNorm,
            productCodeDigits: f.productCodeDigits,
            productCodeStart: f.productCodeStart,
          },
        })
      : null;

  async function guardar() {
    if (bloqueado) return;

    /* Un máximo por debajo del mínimo deja la regla sin sentido: la alerta
       pediría "sube el precio" a un valor que la vuelve a disparar.
       `companyPriceRule` dejó de corregirlo en silencio a propósito, así que
       el error se para aquí, que es donde el usuario puede arreglarlo. */
    if (!Number.isFinite(f.coldCakeMin) || !Number.isFinite(f.coldCakeMax))
      return toast.error("El mínimo y el máximo del rango de precio deben ser números");
    if (f.coldCakeMin < 0 || f.coldCakeMax < 0)
      return toast.error("El mínimo y el máximo del rango de precio no pueden ser negativos");
    if (f.coldCakeMax < f.coldCakeMin)
      return toast.error(
        `El máximo del rango (${usd(f.coldCakeMax)}) no puede ser menor que el mínimo (${usd(f.coldCakeMin)})`,
      );

    if (!prefijoValido)
      return toast.error("El prefijo de productos no es válido", {
        description:
          "Empieza con una letra, usa sólo A-Z, 0-9 y guiones, no termina en dígito y tiene hasta 8 caracteres.",
      });
    if (!digitosValidos)
      return toast.error("Los dígitos del código de producto deben ser un entero entre 1 y 6");
    if (!pisoValido)
      return toast.error(
        "El piso de la secuencia de productos debe ser un entero entre 1 y 99.999.999",
      );

    const normalizado: CompanySettings = {
      ...f,
      productCodePrefix: prefijoNorm,
    };

    // `saleNext` no pasa por `PATCH /company`: es del servidor en cuanto hay
    // backend (el DTO ni lo declara). Sólo se escribe directo en local cuando
    // este equipo no tiene con quién sincronizarlo.
    if (acceso.mode === "local" && normalizado.saleNext !== s.company.saleNext) {
      mutate((st) => {
        st.company = { ...st.company, saleNext: normalizado.saleNext };
      });
    }

    const patch = diffCompanyFields(s.company, normalizado);
    if (!Object.keys(patch).length) {
      setF(normalizado);
      toast.success("Configuración guardada");
      return;
    }

    setGuardando(true);
    try {
      const result = await updateCompany(patch);
      setF({
        ...result.company,
        productCodePrefix: result.company.productCodePrefix ?? DEFAULT_PRODUCT_CODE_PREFIX,
        productCodeDigits: result.company.productCodeDigits ?? DEFAULT_PRODUCT_CODE_DIGITS,
        productCodeStart: result.company.productCodeStart ?? DEFAULT_PRODUCT_CODE_START,
      });
      if (result.degraded) {
        toast.warning("Configuración guardada", {
          description:
            "La secuencia de códigos quedó guardada solo en este equipo hasta que se actualice el servidor.",
        });
      } else {
        toast.success("Configuración guardada");
      }
    } catch (err) {
      toast.error("No se pudo guardar la configuración", { description: companyErrorText(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHead title="Impresión y numeración" sub="Ticket térmico 58mm y correlativos" />
      {acceso.mode === "blocked" && (
        <div className="px-4 pt-4">
          <Aviso tone="amber" icon={IcoAlerta}>
            {acceso.reason}
          </Aviso>
        </div>
      )}
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Mensaje final del ticket">
          <Input
            value={f.ticketFooter}
            disabled={bloqueado}
            onChange={(e) => setF({ ...f, ticketFooter: e.target.value })}
          />
        </Field>
        <Field label="Prefijo de ventas">
          <Input
            value={f.salePrefix}
            disabled={bloqueado}
            onChange={(e) => setF({ ...f, salePrefix: e.target.value })}
          />
        </Field>
        <Field
          label="Próximo número de venta"
          hint={acceso.mode === "remote" ? "Lo asigna el servidor." : undefined}
        >
          <Input
            className="num"
            type="number"
            value={f.saleNext}
            readOnly={acceso.mode === "remote"}
            disabled={bloqueado}
            onChange={(e) => setF({ ...f, saleNext: parseInt(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Prefijo de pedidos">
          <Input
            value={f.orderPrefix}
            disabled={bloqueado}
            onChange={(e) => setF({ ...f, orderPrefix: e.target.value })}
          />
        </Field>
        <Field label="Redondeo en Bs">
          <Input
            className="num"
            type="number"
            value={f.bsRounding}
            disabled={bloqueado}
            onChange={(e) => setF({ ...f, bsRounding: parseFloat(e.target.value) || 1 })}
          />
        </Field>
        <Field
          label="Rango de precio · mínimo USD"
          hint="Los productos sujetos al rango avisan cuando su precio queda por debajo de esto."
        >
          <Input
            className="num"
            inputMode="decimal"
            disabled={bloqueado}
            // No controlado a propósito: si se ata `value` al número ya
            // parseado, cada tecla reformatea de vuelta a texto y le pisa al
            // usuario el punto decimal antes de que pueda seguir escribiendo
            // (mismo problema que "Precios por tipo" en inventario.tsx).
            defaultValue={String(f.coldCakeMin)}
            onChange={(e) =>
              setF({ ...f, coldCakeMin: parseFloat(e.target.value.replace(",", ".")) || 1.1 })
            }
          />
        </Field>
        <Field
          label="Rango de precio · máximo USD"
          hint="El precio sugerido al corregir. No puede ser menor que el mínimo."
        >
          <Input
            className="num"
            inputMode="decimal"
            disabled={bloqueado}
            defaultValue={String(f.coldCakeMax)}
            onChange={(e) =>
              setF({ ...f, coldCakeMax: parseFloat(e.target.value.replace(",", ".")) || 1.2 })
            }
          />
        </Field>

        <div className="sm:col-span-2 border-t border-border pt-3">
          <p className="mb-1 text-etiqueta font-[550] text-texto">Códigos de producto</p>
          <p className="mb-2 text-[0.79rem] text-texto-2">
            Secuencia automática que Inventario usa para sugerir el código de un producto nuevo.
          </p>
        </div>
        <Field
          label="Prefijo de productos"
          hint="Empieza con letra, sólo A-Z/0-9/guiones, no termina en dígito."
        >
          <Input
            value={f.productCodePrefix}
            disabled={bloqueado}
            maxLength={8}
            onChange={(e) => setF({ ...f, productCodePrefix: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Dígitos" hint="Entre 1 y 6.">
          <Input
            className="num"
            type="number"
            min={1}
            max={6}
            value={f.productCodeDigits}
            disabled={bloqueado}
            onChange={(e) =>
              setF({
                ...f,
                productCodeDigits: parseInt(e.target.value) || DEFAULT_PRODUCT_CODE_DIGITS,
              })
            }
          />
        </Field>
        <Field
          label="Continuar desde"
          hint="Piso de la búsqueda: si ese número ya está en uso, se ofrece el siguiente libre."
        >
          <Input
            className="num"
            type="number"
            min={1}
            max={99999999}
            value={f.productCodeStart}
            disabled={bloqueado}
            onChange={(e) =>
              setF({
                ...f,
                productCodeStart: parseInt(e.target.value) || DEFAULT_PRODUCT_CODE_START,
              })
            }
          />
        </Field>
        <div className="flex items-end">
          <p className="text-sm text-muted-foreground">
            Próximo código:{" "}
            <span className="num font-medium text-texto">{proximoCodigo ?? "—"}</span>
          </p>
        </div>

        <div className="sm:col-span-2">
          <Btn
            variant="amber"
            cargando={guardando}
            disabled={bloqueado}
            onClick={() => void guardar()}
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function Datos() {
  const s = useAppState();
  const [reset, setReset] = useState(false);
  const acceso = useCategoryAccess();
  const [importando, setImportando] = useState(false);

  /**
   * Importa el CSV.
   *
   * Las categorías que el CSV trae y no existen se crean **primero y contra el
   * servidor** (`lib/sync/categories.ts`), antes de tocar el estado local: son
   * `ONLINE_ONLY` en el backend, así que una creada sólo aquí desaparece en el
   * siguiente bootstrap y se lleva con ella los productos que la referencian. Si no
   * se pueden crear, no se importa nada: es preferible a dejar productos apuntando
   * a una categoría que el servidor no conoce.
   *
   * Los productos, en cambio, **sí van encolados**: mismo camino que usa
   * `ProductForm` en inventario.tsx (`queueProductCreate`/`queueProductUpdate` de
   * `lib/sync/mutations`, con el stock inicial como `movement.create` de tipo
   * `ajuste`), no `POST /admin/import`. Se prefiere la cola porque es incremental
   * —esta pantalla se usa para altas sueltas mientras el negocio funciona, no
   * para la migración inicial del catálogo completo que es lo que documenta
   * `AdminService.importState`— y porque reutiliza la validación y el contrato
   * que ya prueba el formulario de producto, en vez de duplicarlos. `stock` de un
   * producto que **ya existe** no se toca (igual que antes de esta tarea): una
   * fila de CSV reimportada no debe pisar la existencia real con una columna que
   * puede estar desactualizada; sólo un producto nuevo asienta su stock inicial.
   */
  async function importarCsv(text: string) {
    const rows = text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(1)
      .map((line) => line.split(","))
      .filter(([code, name]) => code?.trim() && name?.trim());

    if (!rows.length) {
      toast.error("El CSV no trae filas que importar");
      return;
    }

    const nombreCat = (category?: string) => (category?.trim() ? category.trim() : "Sin categoría");
    const clave = (nombre: string) => nombre.toLowerCase();

    const existentes = new Set(getState().categories.map((c) => clave(c.name.trim())));
    const faltantes: string[] = [];
    for (const [, , category] of rows) {
      const nombre = nombreCat(category);
      if (existentes.has(clave(nombre))) continue;
      existentes.add(clave(nombre));
      faltantes.push(nombre);
    }

    if (faltantes.length && acceso.mode === "blocked") {
      toast.error(
        `El CSV trae ${faltantes.length} categorías nuevas y crearlas necesita conexión`,
        { description: acceso.reason },
      );
      return;
    }
    for (const nombre of faltantes) {
      try {
        await createCategory(nombre);
      } catch (err) {
        toast.error(`No se pudo crear la categoría "${nombre}": no se importó nada`, {
          description: categoryErrorText(err),
        });
        return;
      }
    }

    // Códigos retirados: igual que en `ProductForm`, un producto **nuevo** con un
    // código retirado es un rechazo permanente del servidor (`product.create`
    // sale de la cola y el producto se queda sólo en este navegador), así que se
    // ataja aquí en vez de encolarlo para que falle después.
    const retirados = new Set(getState().retiredProductCodes ?? []);

    let omitidas = 0;
    let retiradas = 0;
    const creados: Product[] = [];
    const editados: Product[] = [];
    mutate((st) => {
      for (const [rawCode, name, category, mayor, detal, stock] of rows) {
        const code = rawCode.trim().toUpperCase();
        const cat = st.categories.find((c) => clave(c.name.trim()) === clave(nombreCat(category)));
        // No debería pasar (se acaban de crear), y si pasa la fila se omite: un
        // producto con un `categoryId` inexistente es justo lo que se evita.
        if (!cat) {
          omitidas++;
          continue;
        }
        const prices = st.priceTypes.map((pt, i) => ({
          priceTypeId: pt.id,
          amount: parseFloat((i === 0 ? mayor : detal) || mayor || "0") || 0,
        }));
        const existing = st.products.find((p) => p.code === code);
        if (existing) {
          Object.assign(existing, { name: name.trim(), categoryId: cat.id, prices });
          editados.push(existing);
        } else {
          if (retirados.has(code)) {
            retiradas++;
            continue;
          }
          const nuevo: Product = {
            id: uid(),
            code,
            name: name.trim(),
            categoryId: cat.id,
            stock: parseFloat(stock || "0") || 0,
            minStock: 5,
            active: true,
            prices,
            createdAt: new Date().toISOString(),
          };
          st.products.push(nuevo);
          creados.push(nuevo);
        }
      }
      logAudit("importacion_productos", "product", "csv", {
        creados: creados.length,
        editados: editados.length,
      });
    });

    // Encolar va **después** del `mutate`, con el producto ya en su forma final,
    // y en este orden: la cola se aplica en secuencia en el servidor, así que el
    // producto existe allí antes del movimiento que le fija la existencia (mismo
    // comentario que `ProductForm`).
    for (const p of creados) {
      queueProductCreate(p);
      if (p.stock > 0) {
        addMovement(
          p.id,
          p.stock,
          "ajuste",
          "Stock inicial",
          "Existencia declarada al importar el CSV de productos",
        );
      }
    }
    for (const p of editados) {
      queueProductUpdate(p.id, { name: p.name, categoryId: p.categoryId, prices: p.prices });
    }

    const count = creados.length + editados.length;
    toast.success(`${count} productos importados`);
    if (retiradas)
      toast.warning(`${retiradas} filas omitidas: su código de producto está retirado`);
    if (omitidas) toast.warning(`${omitidas} filas omitidas: su categoría no existe`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead
          title="Importar productos"
          sub="CSV: codigo,nombre,categoria,precio_mayor,precio_detal,stock"
        />
        <div className="space-y-3 p-4">
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-xs"
            disabled={importando}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // El input se limpia para que reimportar el mismo archivo vuelva a
              // disparar el `change`.
              e.target.value = "";
              const r = new FileReader();
              r.onload = () => {
                setImportando(true);
                void importarCsv(String(r.result)).finally(() => setImportando(false));
              };
              r.readAsText(file);
            }}
          />
          {acceso.mode === "blocked" && (
            <p className="text-xs text-sol-70">
              Sin conexión sólo se pueden importar productos de categorías que ya existen.{" "}
              {acceso.reason}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            El catálogo inicial ({s.products.filter((p) => !p.isCombo).length} productos) ya fue
            cargado desde el Excel entregado, más {s.products.filter((p) => p.isCombo).length}{" "}
            combos.
          </p>
        </div>
      </Card>

      <Card>
        <CardHead title="Exportar / Reiniciar" sub="Los datos viven en este navegador" />
        <div className="space-y-3 p-4">
          <Btn
            onClick={() => {
              const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `karelys-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
            }}
          >
            Exportar respaldo JSON
          </Btn>
          <Btn variant="danger" onClick={() => setReset(true)}>
            Borrar datos demo y reiniciar
          </Btn>
          <p className="text-xs text-muted-foreground">
            Reinicia ventas, pedidos, clientes y movimientos, y restaura el catálogo original del
            Excel.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={reset}
        danger
        title="Reiniciar sistema"
        message="Se borrarán ventas, pedidos, clientes y movimientos. El catálogo y el usuario admin se restauran."
        onCancel={() => setReset(false)}
        onConfirm={() => {
          resetDatabase();
          setReset(false);
          toast.success("Sistema reiniciado");
        }}
      />
    </div>
  );
}
