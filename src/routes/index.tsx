import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ShoppingCart,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { Badge, Btn, Card, CardHead, Empty } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { bs, dayKey, longDate, num, time, usd } from "@/lib/format";
import { currentRate } from "@/lib/business";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inicio · Karelys Delicias" },
      { name: "description", content: "Resumen operativo del día: ventas, pedidos, stock bajo y caja." },
      { property: "og:title", content: "Inicio · Karelys Delicias" },
      { property: "og:description", content: "Resumen operativo del día: ventas, pedidos, stock bajo y caja." },
    ],
  }),
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const s = useAppState();
  const { can } = useSession();
  const navigate = useNavigate();
  const today = dayKey();
  const rate = currentRate(s, "BCV_USD")?.value ?? 0;
  const sales = s.sales.filter((x) => x.status === "completada" && dayKey(x.createdAt) === today);
  const totalUsd = sales.reduce((a, x) => a + x.totalUsd, 0);
  const pending = s.orders.filter((o) => ["pendiente", "preparacion", "listo"].includes(o.status));
  const low = s.products.filter((p) => p.active && !p.isCombo && p.stock <= p.minStock);
  const cash = sales
    .flatMap((x) => x.payments)
    .filter((p) => p.methodId === "pm-usd" || p.methodId === "pm-bs")
    .reduce((a, p) => a + p.usdEquivalent, 0);

  const byHour = Array.from({ length: 12 }, (_, i) => {
    const h = i + 8;
    const v = sales.filter((x) => new Date(x.createdAt).getHours() === h).reduce((a, x) => a + x.totalUsd, 0);
    return { h, v };
  });
  const maxHour = Math.max(1, ...byHour.map((x) => x.v));

  const byMethod = s.paymentMethods.map((m) => ({
    ...m,
    total: sales
      .flatMap((x) => x.payments)
      .filter((p) => p.methodId === m.id)
      .reduce((a, p) => a + p.usdEquivalent, 0),
  }));

  return (
    <>
      <PageHead title="Buen día en el mostrador" sub={longDate()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ventas de hoy" value={usd(totalUsd)} sub={`${sales.length} ventas · ${bs(totalUsd * rate)}`} />
        <Kpi label="Pedidos pendientes" value={String(pending.length)} sub="por atender" />
        <Kpi label="Stock bajo" value={String(low.length)} sub="productos" tone={low.length ? "red" : "neutral"} />
        <Kpi label="Caja actual" value={usd(cash)} sub="efectivo USD + Bs" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead title="Ventas del día" sub="Por hora, equivalente en USD" />
          <div className="flex h-44 items-end gap-1.5 px-4 py-4">
            {byHour.map((x) => (
              <div key={x.h} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-sol"
                  style={{ height: `${Math.max(2, (x.v / maxHour) * 110)}px`, opacity: x.v ? 1 : 0.18 }}
                  title={usd(x.v)}
                />
                <span className="num text-[9px] text-texto-3">{x.h}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Métodos de pago" sub="Hoy" />
          <div className="divide-y divide-border">
            {byMethod.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{m.name}</span>
                <span className="num text-sm font-medium">{usd(m.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead
            title="Pedidos pendientes"
            action={
              <Link to="/pedidos" className="text-xs text-sol-70 hover:underline">
                Ver todos
              </Link>
            }
          />
          {pending.length === 0 ? (
            <Empty title="Sin pedidos pendientes" sub="Los pedidos por WhatsApp aparecerán aquí." />
          ) : (
            <div className="divide-y divide-border">
              {pending.slice(0, 6).map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <span className="num">{o.number}</span> · {o.customerName}
                    </p>
                    <p className="num text-xs text-muted-foreground">
                      {time(o.createdAt)} · {usd(o.totalUsd)}
                    </p>
                  </div>
                  <Badge tone={o.status === "listo" ? "green" : "amber"}>{o.status}</Badge>
                  {can("process_orders") && (
                    <Btn size="sm" variant="amber" onClick={() => navigate({ to: "/pedidos" })}>
                      Procesar
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Accesos rápidos" />
          <div className="grid grid-cols-2 gap-2 p-3">
            {can("create_sale") && <Quick to="/venta" icon={ShoppingCart} label="Nueva venta" />}
            {can("edit_orders") && <Quick to="/pedidos" icon={CalendarClock} label="Nuevo pedido" />}
            {can("edit_customers") && <Quick to="/clientes" icon={UserPlus} label="Nuevo cliente" />}
            {can("edit_inventory") && <Quick to="/inventario" icon={ArrowDownToLine} label="Registrar entrada" />}
            {can("edit_inventory") && <Quick to="/inventario" icon={ArrowUpFromLine} label="Registrar salida" />}
            {can("close_cash") && <Quick to="/cierre" icon={Wallet} label="Cerrar caja" />}
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-texto-3">
        <Boxes className="size-3.5" />
        <span className="num">
          {s.products.length} productos · tasa BCV {num(rate)} Bs/USD
        </span>
        <Link to="/atajos" className="ml-auto text-sol-70 hover:underline">
          Ver atajos de teclado
        </Link>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "red";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-2xl font-semibold", tone === "red" && "text-rojo")}>{value}</p>
      {sub && <p className="num mt-0.5 text-[11px] text-texto-3">{sub}</p>}
    </Card>
  );
}

function Quick({ to, icon: Icon, label }: { to: string; icon: typeof Boxes; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:border-sol hover:bg-sol-vela"
    >
      <Icon className="size-4 text-sol" />
      {label}
    </Link>
  );
}
