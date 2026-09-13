import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  IcoCaja,
  IcoChevron,
  IcoEntrada,
  IcoPedidos,
  IcoPersonaMas,
  IcoSalida,
  IcoStockBajo,
  IcoTarjeta,
  IcoTendencia,
  IcoVenta,
} from "@/chasis/iconos";
import type { Icono } from "@/chasis/iconos";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { Badge, BarraProg, Btn, Card, CardHead, Cifra, Empty } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { bs, dayKey, num, time, usd } from "@/lib/format";
import { currentRate } from "@/lib/business";
import { useMoney } from "@/hooks/use-money";
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
  const money = useMoney();
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
    .filter((p) => {
      const method = s.paymentMethods.find((pm) => pm.id === p.methodId);
      return method?.currency === "USD" || method?.currency === "BS";
    })
    .reduce((a, p) => a + p.usdEquivalent, 0);

  const byHour = Array.from({ length: 12 }, (_, i) => {
    const h = i + 8;
    const v = sales
      .filter((x) => new Date(x.createdAt).getHours() === h)
      .reduce((a, x) => a + x.totalUsd, 0);
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
  const totalMetodos = byMethod.reduce((a, m) => a + m.total, 0);

  return (
    <>
      <PageHead
        title="Buen día en el mostrador"
        sub="Lo que se ha cobrado hoy, lo que falta por entregar y lo que hay que reponer."
      />

      {/* La cifra del día va en ámbar, y no hay más de una por vista. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CifraT
          label="Ventas de hoy"
          valor={usd(totalUsd)}
          pie={`${sales.length} ventas · ${bs(totalUsd * rate)}`}
          icon={IcoTendencia}
          tone="sol"
        />
        <CifraT
          label="Pedidos pendientes"
          valor={String(pending.length)}
          pie="por atender"
          icon={IcoPedidos}
        />
        <CifraT
          label="Stock bajo"
          valor={String(low.length)}
          pie="productos"
          icon={IcoStockBajo}
          alerta={low.length > 0}
        />
        <CifraT label="Caja actual" valor={usd(cash)} pie="efectivo USD + Bs" icon={IcoCaja} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHead title="Ventas del día" sub="Por hora, equivalente en USD" icon={IcoTendencia} />
          <div className="px-4 pb-4 pt-5">
            {totalUsd === 0 ? (
              <p className="flex h-28 items-center justify-center text-etiqueta text-texto-3">
                Todavía no hay ventas hoy
              </p>
            ) : (
              <>
                <div className="flex h-28 items-end gap-[0.35rem]">
                  {byHour.map((x) => (
                    <div
                      key={x.h}
                      title={`${x.h}:00 · ${usd(x.v)}`}
                      className={cn(
                        "min-h-[2px] flex-1 rounded-t-sm",
                        x.v === maxHour ? "bg-sol" : "bg-sol-luz",
                      )}
                      style={{ height: `${(x.v / maxHour) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="mt-[0.35rem] flex gap-[0.35rem]">
                  {byHour.map((x) => (
                    <span key={x.h} className="num flex-1 text-center text-[0.68rem] text-texto-3">
                      {x.h}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Métodos de pago" sub="Hoy" icon={IcoTarjeta} />
          <div className="divide-y divide-border">
            {byMethod.map((m) => (
              <div key={m.id} className="px-4 py-[0.6rem]">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-etiqueta">{m.name}</span>
                  <div className="shrink-0 text-right">
                    <Cifra size="sm">{money.fmtBs(m.total)}</Cifra>
                    <p className="num text-[0.72rem] text-texto-3">{usd(m.total)}</p>
                  </div>
                </div>
                {totalMetodos > 0 && (
                  <div className="mt-[0.4rem]">
                    <BarraProg fina valor={(m.total / totalMetodos) * 100} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHead
            title="Pedidos pendientes"
            icon={IcoPedidos}
            action={
              <Link
                to="/pedidos"
                className="inline-flex items-center gap-1 text-etiqueta text-sol-70 hover:underline"
              >
                Ver todos <IcoChevron />
              </Link>
            }
          />
          {pending.length === 0 ? (
            <div className="p-4">
              <Empty
                icon={IcoPedidos}
                title="Sin pedidos pendientes"
                sub="Los pedidos que entren por WhatsApp aparecerán aquí para montarlos y entregarlos."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pending.slice(0, 6).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-[0.6rem] transition-colors duration-[140ms] hover:bg-sup-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-etiqueta font-[550]">
                      <span className="num text-texto-2">{o.number}</span> · {o.customerName}
                    </p>
                    <p className="num text-[0.79rem] text-texto-2">
                      {time(o.createdAt)} · {usd(o.totalUsd)}
                    </p>
                  </div>
                  <Badge tone={o.status === "listo" ? "green" : "amber"}>{o.status}</Badge>
                  {can("process_orders") && (
                    <Btn size="sm" onClick={() => navigate({ to: "/pedidos" })}>
                      Procesar
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Accesos rápidos" icon={IcoVenta} />
          <div className="grid grid-cols-2 gap-2 p-3">
            {can("create_sale") && <Quick to="/venta" icon={IcoVenta} label="Nueva venta" />}
            {can("edit_orders") && <Quick to="/pedidos" icon={IcoPedidos} label="Nuevo pedido" />}
            {can("edit_customers") && (
              <Quick to="/clientes" icon={IcoPersonaMas} label="Nuevo cliente" />
            )}
            {can("edit_inventory") && (
              <Quick to="/inventario" icon={IcoEntrada} label="Registrar entrada" />
            )}
            {can("edit_inventory") && (
              <Quick to="/inventario" icon={IcoSalida} label="Registrar salida" />
            )}
            {can("close_cash") && <Quick to="/cierre" icon={IcoCaja} label="Cerrar caja" />}
          </div>
        </Card>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.79rem] text-texto-3">
        <span className="num">
          {s.products.length} productos · tasa BCV {num(rate)} Bs/USD
        </span>
        <Link to="/atajos" className="ml-auto text-sol-70 hover:underline">
          Ver atajos de teclado
        </Link>
      </p>
    </>
  );
}

/* Tarjeta de cifra — sólo para números que de verdad son el asunto
   de la pantalla. La ámbar es la cifra del día. */
function CifraT({
  label,
  valor,
  pie,
  icon: Icon,
  tone = "papel",
  alerta,
}: {
  label: string;
  valor: string;
  pie?: string;
  icon?: Icono;
  tone?: "papel" | "sol";
  alerta?: boolean;
}) {
  const sol = tone === "sol";
  return (
    <div
      className={cn(
        "flex flex-col gap-[0.35rem] rounded-lg border px-[1.15rem] py-[1.05rem]",
        sol ? "border-sol bg-sol text-noche" : "border-border bg-card",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-[0.4rem] text-[0.82rem]",
          sol ? "text-noche/70" : "text-texto-2",
        )}
      >
        {Icon && <Icon />}
        {label}
      </p>
      <Cifra size="lg" className={cn(alerta && !sol && "text-rojo")}>
        {valor}
      </Cifra>
      {pie && (
        <p className={cn("num text-[0.78rem]", sol ? "text-noche/70" : "text-texto-3")}>{pie}</p>
      )}
    </div>
  );
}

/* Rejilla de un toque: el hover marca el borde ámbar, no el icono. */
function Quick({ to, icon: Icon, label }: { to: string; icon: Icono; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-10 items-center gap-[0.6rem] rounded-md border border-border bg-card px-3 py-[0.55rem] text-etiqueta text-texto transition-[border-color,background-color] duration-[120ms] hover:border-sol hover:bg-sol-vela active:translate-y-px"
    >
      <Icon />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
