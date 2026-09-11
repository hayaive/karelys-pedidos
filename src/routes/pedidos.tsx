import { createFileRoute } from "@tanstack/react-router";
import { IcoMas, IcoPapelera } from "@/chasis/iconos";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { POS } from "@/components/pos";
import {
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Modal,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { deleteOrder, setOrderStatus, updateOrder } from "@/lib/business";
import { dt, usd } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import { useShortcuts } from "@/lib/shortcuts";

export const Route = createFileRoute("/pedidos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pedidos · Karelys Delicias" },
      { name: "description", content: "Registro y procesamiento de pedidos por encargo." },
      { property: "og:title", content: "Pedidos · Karelys Delicias" },
      { property: "og:description", content: "Registro y procesamiento de pedidos por encargo." },
    ],
  }),
  component: () => (
    <AppShell requires="view_orders">
      <Pedidos />
    </AppShell>
  ),
});

const STATUSES: { key: OrderStatus; label: string }[] = [
  { key: "pendiente", label: "Pendiente" },
  { key: "preparacion", label: "En preparación" },
  { key: "listo", label: "Listo" },
  { key: "procesado", label: "Procesado" },
  { key: "cancelado", label: "Cancelado" },
];

function Pedidos() {
  const s = useAppState();
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState<Order | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [del, setDel] = useState<Order | null>(null);
  const [filter, setFilter] = useState<string>("activos");

  useShortcuts({
    process_order: () => {
      if (!can("process_orders") || processing || creating) return;
      const next = s.orders.find((o) => ["pendiente", "preparacion", "listo"].includes(o.status));
      if (next) setProcessing(next);
      else toast.info("No hay pedidos pendientes");
    },
  });

  const orders = s.orders.filter((o) =>
    filter === "activos"
      ? !["procesado", "cancelado"].includes(o.status)
      : filter === "todos"
        ? true
        : o.status === filter,
  );

  if (creating)
    return (
      <>
        <PageHead
          title="Nuevo pedido"
          sub="Registra el encargo y déjalo pendiente"
          action={<Btn onClick={() => setCreating(false)}>Volver</Btn>}
        />
        <POS mode="order" onDone={() => setCreating(false)} />
      </>
    );

  if (processing)
    return (
      <>
        <PageHead
          title={`Procesar pedido ${processing.number}`}
          sub={`${processing.customerName} · cobra normalmente para generar la venta`}
          action={<Btn onClick={() => setProcessing(null)}>Volver</Btn>}
        />
        <POS
          initialItems={processing.items}
          initialCustomerId={processing.customerId}
          initialCustomerName={processing.customerName}
          orderId={processing.id}
          onDone={() => setProcessing(null)}
        />
      </>
    );

  return (
    <>
      <PageHead
        title="Pedidos"
        sub="Encargos por WhatsApp y mostrador"
        action={
          <div className="flex gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
              <option value="activos">Activos</option>
              <option value="todos">Todos</option>
              {STATUSES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </Select>
            {can("edit_orders") && (
              <Btn variant="amber" onClick={() => setCreating(true)}>
                <IcoMas /> Nuevo pedido
              </Btn>
            )}
          </div>
        }
      />

      {orders.length === 0 ? (
        <Card>
          <Empty
            title="No hay pedidos"
            sub="Registra el primer encargo cuando un cliente escriba."
            action={
              can("edit_orders") ? (
                <Btn variant="amber" className="mt-2" onClick={() => setCreating(true)}>
                  Nuevo pedido
                </Btn>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="num text-sm font-semibold">{o.number}</p>
                  <p className="text-sm">{o.customerName}</p>
                  <p className="num text-xs text-muted-foreground">{dt(o.createdAt)}</p>
                </div>
                <Badge
                  tone={
                    o.status === "procesado" ? "green" : o.status === "cancelado" ? "red" : "amber"
                  }
                >
                  {STATUSES.find((x) => x.key === o.status)?.label}
                </Badge>
              </div>
              <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {o.items.slice(0, 4).map((i, k) => (
                  <li key={k} className="num">
                    {i.qty} × {i.name}
                  </li>
                ))}
                {o.items.length > 4 && <li>+{o.items.length - 4} más</li>}
              </ul>
              {o.note && (
                <p className="mt-2 rounded bg-sol-vela px-2 py-1 text-xs text-sol-70">{o.note}</p>
              )}
              <p className="num mt-3 text-lg font-semibold">{usd(o.totalUsd)}</p>
              {o.status !== "procesado" && o.status !== "cancelado" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {can("process_orders") && (
                    <Btn size="sm" variant="amber" onClick={() => setProcessing(o)}>
                      Procesar
                    </Btn>
                  )}
                  {can("edit_orders") && (
                    <>
                      <Btn size="sm" onClick={() => setEditing(o)}>
                        Editar
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setDel(o)}>
                        <IcoPapelera />
                      </Btn>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar ${editing?.number ?? ""}`}
      >
        {editing && <EditOrder order={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!del}
        danger
        title="Eliminar pedido"
        message={`¿Eliminar el pedido ${del?.number}? Esta acción no se puede deshacer.`}
        onCancel={() => setDel(null)}
        onConfirm={() => {
          deleteOrder(del!.id);
          toast.success("Pedido eliminado");
          setDel(null);
        }}
      />
    </>
  );
}

function EditOrder({ order, onClose }: { order: Order; onClose: () => void }) {
  const [items, setItems] = useState(order.items);
  const [note, setNote] = useState(order.note ?? "");
  const [status, setStatus] = useState<OrderStatus>(order.status);
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((i, k) => (
          <div
            key={k}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="flex-1 truncate text-sm">{i.name}</span>
            <input
              type="number"
              min={1}
              value={i.qty}
              onChange={(e) => {
                const qty = Math.max(1, parseInt(e.target.value) || 1);
                setItems(
                  items.map((x, j) =>
                    j === k
                      ? {
                          ...x,
                          qty,
                          subtotalUsd: (x.unitPriceUsd + (x.customizationPrice ?? 0)) * qty,
                        }
                      : x,
                  ),
                );
              }}
              className="num h-8 w-16 rounded border border-border bg-card px-2 text-sm"
            />
            <span className="num w-20 text-right text-sm">{usd(i.subtotalUsd)}</span>
            <button
              onClick={() => setItems(items.filter((_, j) => j !== k))}
              className="text-muted-foreground hover:text-rojo"
            >
              <IcoPapelera />
            </button>
          </div>
        ))}
      </div>
      <Field label="Estado">
        <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
          {STATUSES.filter((x) => x.key !== "procesado").map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notas">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn
          variant="amber"
          onClick={() => {
            if (!items.length) return toast.error("El pedido debe tener productos");
            updateOrder(order.id, { items, note, status });
            toast.success("Pedido actualizado");
            onClose();
          }}
        >
          Guardar
        </Btn>
      </div>
      <button
        className="text-xs text-rojo hover:underline"
        onClick={() => {
          setOrderStatus(order.id, "cancelado");
          toast.success("Pedido cancelado");
          onClose();
        }}
      >
        Cancelar pedido
      </button>
    </div>
  );
}
