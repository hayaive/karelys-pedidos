import { createFileRoute } from "@tanstack/react-router";
import { IcoBuscar, IcoMas } from "@/chasis/iconos";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import {
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui-kit";
import { mutate, useAppState, logAudit } from "@/lib/store";
import { upsertCustomer } from "@/lib/business";
import { validCedula } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/clientes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clientes · Karelys Delicias" },
      { name: "description", content: "Directorio de clientes con cédula, contacto y estado." },
      { property: "og:title", content: "Clientes · Karelys Delicias" },
      {
        property: "og:description",
        content: "Directorio de clientes con cédula, contacto y estado.",
      },
    ],
  }),
  component: () => (
    <AppShell requires="view_customers">
      <Clientes />
    </AppShell>
  ),
});

function Clientes() {
  const s = useAppState();
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [del, setDel] = useState<Customer | null>(null);

  const list = s.customers.filter(
    (c) =>
      (estado === "todos" || (estado === "activos" ? c.active : !c.active)) &&
      (c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.cedula.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <PageHead
        title="Clientes"
        sub="Busca por cédula o teléfono antes de crear uno nuevo: casi siempre ya existe."
        dato={`${s.customers.length} registrados`}
        action={
          can("edit_customers") && (
            <Btn variant="amber" onClick={() => setEdit({ cedula: "", name: "", active: true })}>
              <IcoMas /> Nuevo cliente
            </Btn>
          )
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <IcoBuscar />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o cédula"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="sm:w-40">
          <option value="todos">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Desactivados</option>
        </Select>
      </div>

      <Card>
        {list.length === 0 ? (
          <Empty
            title="Sin clientes"
            sub="Crea el primer cliente para asociarlo a ventas y pedidos."
          />
        ) : (
          <div className="divide-y divide-border">
            {list.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="num text-xs break-words text-muted-foreground">
                      {c.cedula}
                      {c.phone ? " · " + c.phone : ""}
                      {c.address ? " · " + c.address : ""}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Badge tone={c.active ? "green" : "neutral"}>
                      {c.active ? "Activo" : "Desactivado"}
                    </Badge>
                  </div>
                </div>
                {can("edit_customers") && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn size="sm" onClick={() => setEdit(c)}>
                      Editar
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        upsertCustomer({ ...c, active: !c.active });
                        toast.success(c.active ? "Cliente desactivado" : "Cliente activado");
                      }}
                    >
                      {c.active ? "Desactivar" : "Activar"}
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setDel(c)}>
                      Eliminar
                    </Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Editar cliente" : "Nuevo cliente"}
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Cédula" hint="Formato V-12345678">
              <Input
                value={edit.cedula ?? ""}
                onChange={(e) => setEdit({ ...edit, cedula: e.target.value })}
              />
            </Field>
            <Field label="Nombre">
              <Input
                value={edit.name ?? ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={edit.phone ?? ""}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <Input
                value={edit.address ?? ""}
                onChange={(e) => setEdit({ ...edit, address: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEdit(null)}>Cancelar</Btn>
              <Btn
                variant="amber"
                onClick={() => {
                  if (!validCedula(edit.cedula ?? ""))
                    return toast.error("Cédula inválida (ej: V-12345678)");
                  if (!edit.name?.trim()) return toast.error("El nombre es obligatorio");
                  upsertCustomer(edit as Customer);
                  toast.success("Cliente guardado");
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
        title="Eliminar cliente"
        message={`¿Eliminar a ${del?.name}? Las ventas históricas conservarán su nombre.`}
        onCancel={() => setDel(null)}
        onConfirm={() => {
          mutate((st) => {
            st.customers = st.customers.filter((x) => x.id !== del!.id);
            logAudit("cliente_eliminado", "customer", del!.id);
          });
          toast.success("Cliente eliminado");
          setDel(null);
        }}
      />
    </>
  );
}
