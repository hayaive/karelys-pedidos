import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ChevronRight,
  CreditCard,
  PackageSearch,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
      {
        name: "description",
        content: "Resumen operativo del día: ventas, pedidos, stock bajo y caja.",
      },
      { property: "og:title", content: "Inicio · Karelys Delicias" },
      {
        property: "og:description",
        content: "Resumen operativo del día: ventas, pedidos, stock bajo y caja.",
      },
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
    const v = sales
      .filter((x) => new Date(x.createdAt).getHours() === h)
      .reduce((a, x) => a + x.totalUsd, 0);
    return { h, v };
  });
  const maxHour = Math.max(1, ...byHour.map((x) => x.v));
  const horaPico = byHour.reduce((a, x) => (x.v > a.v ? x : a), byHour[0]);

  const byMethod = s.paymentMethods.map((m) => ({
    ...m,
    total: sales
      .flatMap((x) => x.payments)
      .filter((p) => p.methodId === m.id)
      .reduce((a, p) => a + p.usdEquivalent, 0),
  }));
  const totalMetodos = Math.max(
    0.0001,
    byMethod.reduce((a, m) => a + m.total, 0),
  );

  return (
    <>
      <PageHead title="Buen día en el mostrador" sub={longDate()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Ventas de hoy"
          value={usd(totalUsd)}
          sub={`${sales.length} ventas · ${bs(totalUsd * rate)}`}
          icon={TrendingUp}
        />
        <Kpi
          label="Pedidos pendientes"
          value={String(pending.length)}
          sub="por atender"
          icon={CalendarClock}
        />
        <Kpi
          label="Stock bajo"
          value={String(low.length)}
          sub="productos"
          icon={PackageSearch}
          tone={low.length ? "red" : "neutral"}
        />
        <Kpi label="Caja actual" value={usd(cash)} sub="efectivo USD + Bs" icon={Wallet} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card destacada>
          <CardHead
            title="Ventas del día"
            sub="Por hora, equivalente en USD"
            icon={TrendingUp}
            action={
              totalUsd > 0 ? (
                <span className="num hidden text-xs text-texto-3 sm:block">
                  pico {horaPico.h}:00
                </span>
              ) : undefined
            }
          />
          <div className="relative px-4 pb-4 pt-5">
            {totalUsd > 0 && (
              <div className="rotulo num absolute right-4 top-2">{usd(maxHour)}</div>
            )}
            {totalUsd === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-4 text-center text-xs text-texto-3">
                Todavía no hay ventas hoy
              </p>
            )}
            <div className="flex h-40 items-end gap-1.5 border-b border-dashed border-border">
              {byHour.map((x) => (
                <div key={x.h} className="group flex h-full flex-1 flex-col justify-end gap-1">
                  <div
                    className={cn(
                      "crece w-full rounded-t-sm transition-opacity",
                      x.v
                        ? "bg-gradient-to-t from-sol-90 to-sol group-hover:opacity-80"
                        : "bg-linea group-hover:bg-linea-2",
                    )}
                    style={{ height: `${Math.max(2, (x.v / maxHour) * 130)}px` }}
                    title={`${x.h}:00 · ${usd(x.v)}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {byHour.map((x) => (
                <span
                  key={x.h}
                  className={cn(
                    "num flex-1 text-center text-[9px]",
                    x.v ? "text-texto-2" : "text-texto-3",
                  )}
                >
                  {x.h}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Métodos de pago" sub="Hoy" icon={CreditCard} />
          <div className="divide-y divide-border">
            {byMethod.map((m) => {
              const parte = m.total / totalMetodos;
              return (
                <div key={m.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm">{m.name}</span>
                    <span className="num shrink-0 text-sm font-medium">{usd(m.total)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sup-2">
                    <div
                      className="h-full rounded-full bg-sol transition-all duration-500"
                      style={{ width: `${Math.round(parte * 100)}%`, opacity: m.total ? 1 : 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead
            title="Pedidos pendientes"
            icon={CalendarClock}
            action={
              <Link
                to="/pedidos"
                className="inline-flex items-center gap-1 text-xs text-sol-70 transition-colors hover:text-sol"
              >
                Ver todos <ChevronRight className="size-3.5" />
              </Link>
            }
          />
          {pending.length === 0 ? (
            <Empty
              icon={CalendarClock}
              title="Sin pedidos pendientes"
              sub="Los pedidos por WhatsApp aparecerán aquí."
            />
          ) : (
            <div className="divide-y divide-border">
              {pending.slice(0, 6).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sup-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <span className="num text-texto-2">{o.number}</span> · {o.customerName}
                    </p>
                    <p className="num text-xs text-muted-foreground">
                      {time(o.createdAt)} · {usd(o.totalUsd)}
                    </p>
                  </div>
                  <Badge dot tone={o.status === "listo" ? "green" : "amber"}>
                    {o.status}
                  </Badge>
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
          <CardHead title="Accesos rápidos" icon={ShoppingCart} />
          <div className="grid grid-cols-2 gap-2 p-3">
            {can("create_sale") && <Quick to="/venta" icon={ShoppingCart} label="Nueva venta" />}
            {can("edit_orders") && (
              <Quick to="/pedidos" icon={CalendarClock} label="Nuevo pedido" />
            )}
            {can("edit_customers") && (
              <Quick to="/clientes" icon={UserPlus} label="Nuevo cliente" />
            )}
            {can("edit_inventory") && (
              <Quick to="/inventario" icon={ArrowDownToLine} label="Registrar entrada" />
            )}
            {can("edit_inventory") && (
              <Quick to="/inventario" icon={ArrowUpFromLine} label="Registrar salida" />
            )}
            {can("close_cash") && <Quick to="/cierre" icon={Wallet} label="Cerrar caja" />}
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-sup-2/60 px-3.5 py-2.5 text-xs text-texto-3">
        <Boxes className="size-3.5 text-sol" />
        <span className="num">
          {s.products.length} productos · tasa BCV {num(rate)} Bs/USD
        </span>
        <Link
          to="/atajos"
          className="ml-auto text-sol-70 transition-colors hover:text-sol hover:underline"
        >
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
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "red";
}) {
  return (
    <Card alza className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="rotulo">{label}</p>
        {Icon && (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md border",
              tone === "red"
                ? "border-rojo-linea bg-rojo-luz text-rojo"
                : "border-sol-luz bg-sol-vela text-sol-70",
            )}
          >
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "num mt-2 text-2xl font-semibold tracking-tight",
          tone === "red" && "text-rojo",
        )}
      >
        {value}
      </p>
      {sub && <p className="num mt-0.5 text-[11px] text-texto-3">{sub}</p>}
    </Card>
  );
}

function Quick({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2.5 text-sm shadow-sutil transition-all duration-200 hover:-translate-y-0.5 hover:border-sol hover:bg-sol-vela hover:shadow-alza"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-sol-luz bg-sol-vela text-sol-70 transition-colors group-hover:border-sol group-hover:bg-sol group-hover:text-noche">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
