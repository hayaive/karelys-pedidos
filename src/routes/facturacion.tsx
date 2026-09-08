import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { Badge, Btn, Card, ConfirmDialog, Empty, Input, Modal, Select } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { cancelSale } from "@/lib/business";
import { bs, dayKey, dt, num, usd } from "@/lib/format";
import { TicketPreview } from "@/components/ticket";
import type { Sale } from "@/lib/types";

export const Route = createFileRoute("/facturacion")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Facturación · Karelys Delicias" },
      { name: "description", content: "Historial de ventas con detalle, filtros e impresión de tickets." },
      { property: "og:title", content: "Facturación · Karelys Delicias" },
      { property: "og:description", content: "Historial de ventas con detalle, filtros e impresión de tickets." },
    ],
  }),
  component: () => (
    <AppShell requires="view_sales">
      <Facturacion />
    </AppShell>
  ),
});

function Facturacion() {
  const s = useAppState();
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("all");
  const [user, setUser] = useState("all");
  const [detail, setDetail] = useState<Sale | null>(null);
  const [cancel, setCancel] = useState<Sale | null>(null);

  const list = s.sales.filter(
    (x) =>
      (!date || dayKey(x.createdAt) === date) &&
      (method === "all" || x.payments.some((p) => p.methodId === method)) &&
      (user === "all" || x.userId === user) &&
      (q === "" ||
        x.number.toLowerCase().includes(q.toLowerCase()) ||
        x.customerName.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <PageHead title="Facturación" sub={`${s.sales.length} ventas registradas`} />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Buscar número o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">Todos los métodos</option>
          {s.paymentMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="all">Todos los usuarios</option>
          {s.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {list.length === 0 ? (
          <Empty title="Sin ventas" sub="Las ventas realizadas en el POS aparecerán aquí." />
        ) : (
          <div className="divide-y divide-border">
            {list.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="num">{x.number}</span> · {x.customerName}
                  </p>
                  <p className="num text-xs text-muted-foreground">
                    {dt(x.createdAt)} · {x.userName} · {x.payments.map((p) => p.methodName).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-semibold">{usd(x.totalUsd)}</p>
                  <p className="num text-xs text-muted-foreground">{bs(x.totalBs)}</p>
                </div>
                <Badge tone={x.status === "completada" ? "green" : "red"}>{x.status}</Badge>
                <Btn size="sm" onClick={() => setDetail(x)}>
                  Detalle
                </Btn>
                {x.status === "completada" && can("cancel_sale") && (
                  <Btn size="sm" variant="ghost" onClick={() => setCancel(x)}>
                    Anular
                  </Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Venta ${detail?.number ?? ""}`} wide>
        {detail && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Cliente: {detail.customerName}</p>
              <p className="text-muted-foreground">Cajero: {detail.userName}</p>
              <p className="num text-muted-foreground">Tasa usada: {num(detail.rateSnapshot.usd)} Bs/USD</p>
              <div className="divide-y divide-border rounded-md border border-border">
                {detail.items.map((i, k) => (
                  <div key={k} className="flex justify-between px-3 py-2">
                    <span className="num">
                      {i.qty} × {i.name}
                    </span>
                    <span className="num">{usd(i.subtotalUsd)}</span>
                  </div>
                ))}
              </div>
              <p className="num text-right font-semibold">{usd(detail.totalUsd)}</p>
              <p className="num text-right text-muted-foreground">{bs(detail.totalBs)}</p>
            </div>
            <TicketPreview sale={detail} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancel}
        danger
        title="Anular venta"
        message={`¿Anular la venta ${cancel?.number}? Se devolverá el stock y quedará registrado en auditoría.`}
        onCancel={() => setCancel(null)}
        onConfirm={() => {
          cancelSale(cancel!.id, "Anulación manual");
          toast.success("Venta anulada");
          setCancel(null);
        }}
      />
    </>
  );
}
