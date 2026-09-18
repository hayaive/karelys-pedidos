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
import {
  createPriceType,
  deletePriceType,
  priceTypeErrorText,
  renamePriceType,
  setDefaultPriceType,
  usePriceTypeAccess,
} from "@/lib/sync/price-types";
import { uid } from "@/lib/seed";
import { dt, num, usd } from "@/lib/format";
import { ALL_PERMISSIONS, type Permission, type PriceType, type User } from "@/lib/types";
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

function Empresa() {
  const s = useAppState();
  const [f, setF] = useState(s.company);
  return (
    <Card className="max-w-4xl">
      <CardHead
        title="Configuración de empresa"
        sub="Karelys Delicias es la marca principal del sistema"
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Dirección">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="Datos fiscales (RIF)">
          <Input value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} />
        </Field>
        <Field label="Logo del negocio">
          <div className="flex items-center gap-3">
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-linea bg-sup-2 text-center text-[11px] leading-tight text-texto-3 transition-colors hover:border-sol hover:text-sol">
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
                <Btn size="sm" onClick={() => setF({ ...f, logoUrl: "" })}>
                  Quitar logo
                </Btn>
              )}
            </div>
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Btn
            variant="amber"
            onClick={() => {
              mutate((st) => {
                st.company = { ...st.company, ...f };
                logAudit("empresa_actualizada", "company", "company");
              });
              toast.success("Configuración guardada");
            }}
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function Usuarios() {
  const s = useAppState();
  const { can } = useSession();
  const [edit, setEdit] = useState<Partial<User> | null>(null);
  const [del, setDel] = useState<User | null>(null);
  const [roleEdit, setRoleEdit] = useState<string | null>(null);
  const [roleDel, setRoleDel] = useState<string | null>(null);

  if (!can("manage_users"))
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No tienes permiso para gestionar usuarios.
      </Card>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead
          title="Usuarios"
          action={
            <Btn
              size="sm"
              variant="amber"
              onClick={() =>
                setEdit({ username: "", fullName: "", roleId: s.roles[0].id, active: true })
              }
            >
              Nuevo
            </Btn>
          }
        />
        <div className="divide-y divide-border">
          {s.users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.fullName}</p>
                <p className="num text-xs text-muted-foreground">
                  {u.username} · {s.roles.find((r) => r.id === u.roleId)?.name}
                </p>
              </div>
              <Badge tone={u.active ? "green" : "neutral"}>
                {u.active ? "Activo" : "Inactivo"}
              </Badge>
              <Btn size="sm" onClick={() => setEdit(u)}>
                Editar
              </Btn>
              {u.username !== "admin" && (
                <Btn size="sm" variant="ghost" onClick={() => setDel(u)}>
                  Eliminar
                </Btn>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Roles y permisos"
          action={
            <Btn
              size="sm"
              onClick={() =>
                mutate((st) => {
                  st.roles.push({ id: uid(), name: "Nuevo rol", permissions: [] });
                })
              }
            >
              Nuevo rol
            </Btn>
          }
        />
        <div className="divide-y divide-border">
          {s.roles.map((r) => (
            <div key={r.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <input
                  defaultValue={r.name}
                  onBlur={(e) =>
                    mutate((st) => {
                      const role = st.roles.find((x) => x.id === r.id);
                      if (role) role.name = e.target.value;
                    })
                  }
                  className="min-w-[8rem] flex-1 bg-transparent text-sm font-medium outline-none"
                />
                <span className="num text-xs text-muted-foreground">
                  {r.permissions.length} permisos
                </span>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => setRoleEdit(roleEdit === r.id ? null : r.id)}
                >
                  {roleEdit === r.id ? "Cerrar" : "Permisos"}
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (r.id === "role-admin") {
                      toast.error("El rol Administrador no se puede eliminar");
                      return;
                    }
                    const used = s.users.filter((u) => u.roleId === r.id).length;
                    if (used > 0) {
                      toast.error(`Hay ${used} usuario(s) con este rol. Cámbialos primero.`);
                      return;
                    }
                    setRoleDel(r.id);
                  }}
                >
                  Eliminar
                </Btn>
              </div>
              {roleEdit === r.id && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={r.permissions.includes(p.key)}
                        onChange={(e) =>
                          mutate((st) => {
                            const role = st.roles.find((x) => x.id === r.id)!;
                            role.permissions = e.target.checked
                              ? [...role.permissions, p.key as Permission]
                              : role.permissions.filter((x) => x !== p.key);
                            logAudit("permisos_actualizados", "role", role.id);
                          })
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={!!roleDel}
        title="Eliminar rol"
        message="¿Seguro que quieres eliminar este rol? No se puede deshacer."
        danger
        onCancel={() => setRoleDel(null)}
        onConfirm={() => {
          mutate((st) => {
            st.roles = st.roles.filter((x) => x.id !== roleDel);
            logAudit("rol_eliminado", "role", roleDel!);
          });
          setRoleDel(null);
          toast.success("Rol eliminado");
        }}
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
                value={edit.fullName ?? ""}
                onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
              />
            </Field>
            <Field label="Usuario">
              <Input
                value={edit.username ?? ""}
                onChange={(e) => setEdit({ ...edit, username: e.target.value })}
              />
            </Field>
            <Field label="Contraseña" hint={edit.id ? "Déjala vacía para no cambiarla" : undefined}>
              <Input
                type="text"
                value={edit.password ?? ""}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
              />
            </Field>
            <Field label="Rol">
              <Select
                value={edit.roleId}
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
                onChange={(e) => setEdit({ ...edit, active: e.target.value === "1" })}
              >
                <option value="1">Activo</option>
                <option value="0">Desactivado</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEdit(null)}>Cancelar</Btn>
              <Btn
                variant="amber"
                onClick={() => {
                  if (!edit.username?.trim() || !edit.fullName?.trim())
                    return toast.error("Completa nombre y usuario");
                  mutate((st) => {
                    if (edit.id) {
                      const u = st.users.find((x) => x.id === edit.id)!;
                      u.fullName = edit.fullName!;
                      u.username = edit.username!;
                      u.roleId = edit.roleId!;
                      u.active = edit.active ?? true;
                      if (edit.password) u.password = edit.password;
                      logAudit("usuario_editado", "user", u.id);
                    } else {
                      if (!edit.password) return toast.error("Define una contraseña");
                      st.users.push({
                        id: uid(),
                        username: edit.username!,
                        fullName: edit.fullName!,
                        password: edit.password!,
                        roleId: edit.roleId!,
                        active: true,
                        createdAt: new Date().toISOString(),
                      });
                      logAudit("usuario_creado", "user", edit.username!);
                    }
                  });
                  toast.success("Usuario guardado");
                  setEdit(null);
                }}
              >
                Guardar
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!del}
        danger
        title="Eliminar usuario"
        message={`¿Eliminar a ${del?.fullName}?`}
        onCancel={() => setDel(null)}
        onConfirm={() => {
          mutate((st) => {
            st.users = st.users.filter((x) => x.id !== del!.id);
            logAudit("usuario_eliminado", "user", del!.id);
          });
          toast.success("Usuario eliminado");
          setDel(null);
        }}
      />
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

function Pagos() {
  const s = useAppState();
  const [f, setF] = useState({ name: "", currency: "USD", ref: "no" });
  return (
    <Card className="max-w-2xl">
      <CardHead title="Métodos de pago" />
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-4">
        <Input
          placeholder="Nombre"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
          <option value="USD">USD</option>
          <option value="BS">Bolívares</option>
        </Select>
        <Select value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })}>
          <option value="no">Sin referencia</option>
          <option value="si">Requiere referencia</option>
        </Select>
        <Btn
          variant="amber"
          onClick={() => {
            if (!f.name.trim()) return;
            mutate((st) =>
              st.paymentMethods.push({
                id: uid(),
                name: f.name.trim(),
                currency: f.currency as "USD" | "BS",
                requiresReference: f.ref === "si",
                active: true,
              }),
            );
            setF({ name: "", currency: "USD", ref: "no" });
            toast.success("Método agregado");
          }}
        >
          Agregar
        </Btn>
      </div>
      <div className="divide-y divide-border">
        {s.paymentMethods.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="flex-1">{m.name}</span>
            <Badge>{m.currency === "USD" ? "USD" : "Bs"}</Badge>
            {m.requiresReference && <Badge tone="amber">Referencia</Badge>}
            <Btn
              size="sm"
              variant="ghost"
              onClick={() =>
                mutate((st) => {
                  const pm = st.paymentMethods.find((x) => x.id === m.id)!;
                  pm.active = !pm.active;
                })
              }
            >
              {m.active ? "Desactivar" : "Activar"}
            </Btn>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Impresion() {
  const s = useAppState();
  const [f, setF] = useState(s.company);
  return (
    <Card className="max-w-2xl">
      <CardHead title="Impresión y numeración" sub="Ticket térmico 58mm y correlativos" />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Mensaje final del ticket">
          <Input
            value={f.ticketFooter}
            onChange={(e) => setF({ ...f, ticketFooter: e.target.value })}
          />
        </Field>
        <Field label="Prefijo de ventas">
          <Input
            value={f.salePrefix}
            onChange={(e) => setF({ ...f, salePrefix: e.target.value })}
          />
        </Field>
        <Field label="Próximo número de venta">
          <Input
            className="num"
            type="number"
            value={f.saleNext}
            onChange={(e) => setF({ ...f, saleNext: parseInt(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Prefijo de pedidos">
          <Input
            value={f.orderPrefix}
            onChange={(e) => setF({ ...f, orderPrefix: e.target.value })}
          />
        </Field>
        <Field label="Redondeo en Bs">
          <Input
            className="num"
            type="number"
            value={f.bsRounding}
            onChange={(e) => setF({ ...f, bsRounding: parseFloat(e.target.value) || 1 })}
          />
        </Field>
        <Field
          label="Tortas frías · mínimo USD"
          hint="Por debajo de esto, el genérico de tortas frías avisa que hay que subirlo."
        >
          <Input
            className="num"
            inputMode="decimal"
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
          label="Tortas frías · máximo USD"
          hint="El precio al que la alerta pide subirlo. No puede ser menor que el mínimo."
        >
          <Input
            className="num"
            inputMode="decimal"
            defaultValue={String(f.coldCakeMax)}
            onChange={(e) =>
              setF({ ...f, coldCakeMax: parseFloat(e.target.value.replace(",", ".")) || 1.2 })
            }
          />
        </Field>
        <div className="sm:col-span-2">
          <Btn
            variant="amber"
            onClick={() => {
              /* Un máximo por debajo del mínimo deja la regla sin sentido: la
                 alerta pediría "sube el precio" a un valor que la vuelve a
                 disparar. `companyPriceRule` dejó de corregirlo en silencio a
                 propósito, así que el error se para aquí, que es donde el
                 usuario puede arreglarlo. */
              if (!Number.isFinite(f.coldCakeMin) || !Number.isFinite(f.coldCakeMax))
                return toast.error("El mínimo y el máximo de tortas frías deben ser números");
              if (f.coldCakeMin < 0 || f.coldCakeMax < 0)
                return toast.error("El mínimo y el máximo de tortas frías no pueden ser negativos");
              if (f.coldCakeMax < f.coldCakeMin)
                return toast.error(
                  `El máximo de tortas frías (${usd(f.coldCakeMax)}) no puede ser menor que el mínimo (${usd(f.coldCakeMin)})`,
                );

              mutate((st) => {
                st.company = { ...st.company, ...f };
              });
              toast.success("Configuración guardada");
            }}
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
   * Los productos siguen yendo a local tal cual estaban (esta pantalla no los
   * encola; ver el informe de esta tarea).
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

    let count = 0;
    let omitidas = 0;
    mutate((st) => {
      for (const [code, name, category, mayor, detal, stock] of rows) {
        const cat = st.categories.find((c) => clave(c.name.trim()) === clave(nombreCat(category)));
        // No debería pasar (se acaban de crear), y si pasa la fila se omite: un
        // producto con un `categoryId` inexistente es justo lo que se evita.
        if (!cat) {
          omitidas++;
          continue;
        }
        const existing = st.products.find((p) => p.code === code.trim());
        const prices = st.priceTypes.map((pt, i) => ({
          priceTypeId: pt.id,
          amount: parseFloat((i === 0 ? mayor : detal) || mayor || "0") || 0,
        }));
        if (existing) {
          Object.assign(existing, { name: name.trim(), categoryId: cat.id, prices });
        } else {
          const nuevo = {
            id: uid(),
            code: code.trim(),
            name: name.trim(),
            categoryId: cat.id,
            stock: parseFloat(stock || "0") || 0,
            minStock: 5,
            active: true,
            prices,
            createdAt: new Date().toISOString(),
          };
          st.products.push(nuevo);
        }
        count++;
      }
      logAudit("importacion_productos", "product", "csv", { count });
    });

    toast.success(`${count} productos importados`);
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
