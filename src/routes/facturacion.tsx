import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { Badge, Btn, Card, ConfirmDialog, Empty, Input, Modal, Select } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { cancelSale, lineBs } from "@/lib/business";
import { useSaleMoney } from "@/hooks/use-money";
import { bs, dayKey, dt, num, usd } from "@/lib/format";
import { TicketPreview } from "@/components/ticket";
import type { Sale } from "@/lib/types";

export const Route = createFileRoute("/facturacion")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Facturación · Karelys Delicias" },
      {
        name: "description",
        content: "Historial de ventas con detalle, filtros e impresión de tickets.",
      },
      { property: "og:title", content: "Facturación · Karelys Delicias" },
      {
        property: "og:description",
        content: "Historial de ventas con detalle, filtros e impresión de tickets.",
      },
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
      <PageHead
        title="Facturación"
        sub="Cada venta cobrada, con su ticket y su forma de pago."
        dato={`${s.sales.length} ventas registradas`}
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Buscar número o cliente"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
                    {dt(x.createdAt)} · {x.userName} ·{" "}
                    {x.payments.map((p) => p.methodName).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-semibold">{bs(x.totalBs)}</p>
                  <p className="num text-xs text-muted-foreground">{usd(x.totalUsd)}</p>
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

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Venta ${detail?.number ?? ""}`}
        wide
      >
        {detail && <SaleDetailPanel sale={detail} />}
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

/**
 * Detalle de una venta ya cerrada. Usa la tasa congelada de la venta
 * (`useSaleMoney`), igual que el ticket: una venta de ayer se ve con la tasa
 * de ayer aunque la de hoy haya cambiado.
 */
function SaleDetailPanel({ sale }: { sale: Sale }) {
  const money = useSaleMoney(sale);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Cliente: {sale.customerName}</p>
        <p className="text-muted-foreground">Cajero: {sale.userName}</p>
        <p className="num text-muted-foreground">
          Tasa usada: {num(sale.rateSnapshot.usd)} Bs/USD
        </p>
        <div className="divide-y divide-border rounded-md border border-border">
          {sale.items.map((i, k) => (
            <div key={k} className="flex justify-between px-3 py-2">
              <span className="num">
                {i.qty} × {i.name}
              </span>
              <span className="text-right">
                <span className="num block">{money.fmtBsAmount(lineBs(i, money))}</span>
                {!i.bsOnly && (
                  <span className="num block text-xs text-muted-foreground">
                    {usd(i.subtotalUsd)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="num text-right font-semibold">{money.fmtBsAmount(sale.totalBs)}</p>
        <p className="num text-right text-muted-foreground">{usd(sale.totalUsd)}</p>
      </div>
      <TicketPreview sale={sale} />
    </div>
  );
}
