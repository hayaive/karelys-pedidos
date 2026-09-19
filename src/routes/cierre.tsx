import { createFileRoute } from "@tanstack/react-router";
import { IcoImprimir } from "@/chasis/iconos";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import {
  Badge,
  Btn,
  Card,
  CardHead,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Textarea,
} from "@/components/ui-kit";
import { logAudit, mutate, useAppState } from "@/lib/store";
import { closureDraft } from "@/lib/business";
import { bs, dayKey, dt, num, parseAmount, usd } from "@/lib/format";
import { bsToUsd } from "@/lib/money";
import { uid } from "@/lib/seed";
import { useSession } from "@/lib/auth";
import { useMoney } from "@/hooks/use-money";
import { queueClosureCreate } from "@/lib/sync/mutations";
import { deletionErrorText, reopenClosure } from "@/lib/sync/deletions";
import type { DailyClosure } from "@/lib/types";

export const Route = createFileRoute("/cierre")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ventas y cierre · Karelys Delicias" },
      {
        name: "description",
        content: "Resumen diario de ventas por método de pago y cierre de caja.",
      },
      { property: "og:title", content: "Ventas y cierre · Karelys Delicias" },
      {
        property: "og:description",
        content: "Resumen diario de ventas por método de pago y cierre de caja.",
      },
    ],
  }),
  component: () => (
    <AppShell requires="close_cash">
      <Cierre />
    </AppShell>
  ),
});

/** Por debajo de medio céntimo se considera cuadrado. */
const EPS = 0.005;

const round2 = (n: number) => Math.round(n * 100) / 100;

const fmtIn = (currency: "USD" | "BS", amount: number) =>
  currency === "USD" ? usd(amount) : bs(amount);

/** "Exacto" si cuadra; si no, cuánto falta o sobra en la moneda indicada. */
function Diferencia({ currency, amount }: { currency: "USD" | "BS"; amount: number }) {
  if (Math.abs(amount) < EPS)
    return (
      <>
        <span className="block text-[11px] text-muted-foreground">Diferencia</span>
        <span className="block text-sm font-medium text-verde">Exacto</span>
      </>
    );
  return (
    <span className="text-rojo">
      <span className="block text-[11px]">{amount < 0 ? "Faltan" : "Sobran"}</span>
      <span className="num block text-sm">{fmtIn(currency, Math.abs(amount))}</span>
    </span>
  );
}

function TotalRow({
  label,
  value,
  strong,
  children,
}: {
  label: string;
  value: string;
  strong?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={strong ? "flex-1 text-sm font-semibold" : "flex-1 text-sm"}>{label}</span>
      <span className={"num text-right " + (strong ? "text-lg font-semibold" : "text-sm")}>
        {value}
      </span>
      <span className="w-24 text-right sm:w-28">{children}</span>
    </div>
  );
}

function Cierre() {
  const s = useAppState();
  const money = useMoney();
  const { user, can } = useSession();
  const [day, setDay] = useState(dayKey());
  const draft = useMemo(() => closureDraft(s, day), [s, day]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const closed = s.closures.find((c) => c.date === day);
  const [reabrir, setReabrir] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  /** Reabre el día: borra el cierre para volver a contar. Las ventas no cambian. */
  async function reabrirCierre() {
    if (!closed || reabriendo) return;
    setReabriendo(true);
    try {
      await reopenClosure(closed);
      // Lo que se contó y anotó queda como punto de partida del nuevo conteo.
      setNote(closed.note ?? "");
      toast.success(`Cierre del ${day} reabierto: puedes volver a contar y cerrar`);
    } catch (err) {
      toast.error("No se pudo reabrir el cierre", { description: deletionErrorText(err) });
    } finally {
      setReabriendo(false);
      setReabrir(false);
    }
  }

  const rate = draft.rate;

  // Cada método se cuenta en su moneda y se compara contra el efectivo esperado
  // (ventas del día + abonos recibidos hoy − vueltos), no contra lo facturado:
  // un abono entra en caja el día en que se recibe, aunque el pedido se facture
  // más adelante. La diferencia en Bs se lleva a USD con la tasa BCV del día.
  const rows = draft.byMethod.map((m) => {
    const raw = received[m.methodId];
    const counted = closed
      ? (closed.byMethod.find((x) => x.methodId === m.methodId)?.receivedAmount ?? m.expectedAmount)
      : raw !== undefined
        ? parseAmount(raw)
        : m.expectedAmount;
    const countedAmount = Number.isFinite(counted) ? counted : 0;
    const diffAmount = round2(countedAmount - m.expectedAmount);
    const diffUsd = m.currency === "USD" ? diffAmount : bsToUsd(diffAmount, rate);
    return { ...m, countedAmount, diffAmount, diffUsd };
  });
  const sumOf = (currency: "USD" | "BS", key: "countedAmount" | "diffAmount") =>
    round2(rows.filter((r) => r.currency === currency).reduce((a, r) => a + r[key], 0));
  const totalBs = sumOf("BS", "countedAmount");
  const totalUsd = sumOf("USD", "countedAmount");
  const totalGeneralUsd = totalUsd + bsToUsd(totalBs, rate);
  const diff = round2(rows.reduce((a, r) => a + r.diffUsd, 0));

  return (
    <>
      <PageHead
        title="Ventas y cierre"
        sub="Revisa el día y registra el cierre de caja"
        action={
          <div className="flex gap-2">
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-44"
            />
            <Btn onClick={() => window.print()}>
              <IcoImprimir /> Imprimir
            </Btn>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Ventas</p>
          <p className="num mt-1 text-2xl font-semibold">{draft.sales.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total del día</p>
          <p className="num mt-1 text-2xl font-semibold">{money.fmtBs(draft.totalUsd)}</p>
          <p className="num text-xs text-muted-foreground">{usd(draft.totalUsd)}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="@container">
          <CardHead title="Desglose por método" sub="Cada método se cuenta en su moneda" />
          <div className="divide-y divide-border">
            {rows.map((m) => (
              // Tarjeta angosta: método y diferencia arriba, esperado y campo abajo.
              // Con ancho de sobra (según la tarjeta, no la ventana): todo en una fila.
              <div
                key={m.methodId}
                className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-x-3 gap-y-2 px-4 py-2.5 @xl:grid-cols-[minmax(0,1fr)_7rem_10rem_7rem]"
              >
                <span className="col-start-1 row-start-1 min-w-0 text-sm">
                  {m.methodName}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    · {m.currency === "USD" ? "USD" : "Bs"}
                  </span>
                </span>
                <span className="col-start-1 row-start-2 @xl:col-start-2 @xl:row-start-1 @xl:text-right">
                  <span className="block text-[11px] text-muted-foreground">Esperado</span>
                  <span className="num block text-sm">{fmtIn(m.currency, m.expectedAmount)}</span>
                </span>
                <div className="relative col-start-2 row-start-2 @xl:col-start-3 @xl:row-start-1">
                  <span className="pointer-events-none absolute inset-y-0 left-[0.7rem] flex items-center text-xs text-muted-foreground">
                    {m.currency === "USD" ? "$" : "Bs"}
                  </span>
                  <Input
                    className="num pl-8 text-right"
                    inputMode="decimal"
                    aria-label={`Contado en ${m.methodName}`}
                    disabled={!!closed}
                    value={
                      closed
                        ? num(m.countedAmount)
                        : (received[m.methodId] ?? num(m.expectedAmount))
                    }
                    onChange={(e) => setReceived({ ...received, [m.methodId]: e.target.value })}
                  />
                </div>
                <span className="col-start-2 row-start-1 text-right @xl:col-start-4">
                  <Diferencia currency={m.currency} amount={m.diffAmount} />
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border px-4 py-3">
            <TotalRow label="Total Bs" value={bs(totalBs)}>
              <Diferencia currency="BS" amount={sumOf("BS", "diffAmount")} />
            </TotalRow>
            <TotalRow label="Total USD" value={usd(totalUsd)}>
              <Diferencia currency="USD" amount={sumOf("USD", "diffAmount")} />
            </TotalRow>
            <div className="border-t border-border pt-2">
              <TotalRow strong label="Total general $" value={rate ? usd(totalGeneralUsd) : "—"}>
                {rate ? <Diferencia currency="USD" amount={diff} /> : null}
              </TotalRow>
              <p className="num mt-1 text-right text-[11px] text-muted-foreground">
                {rate
                  ? `Bs llevados a dólares a tasa BCV ${num(rate)}`
                  : "Sin tasa BCV cargada: no se pueden llevar los Bs a dólares"}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Cierre del día" sub={day} />
          <div className="space-y-3 p-4">
            {closed ? (
              <>
                <Badge tone="green">Día cerrado</Badge>
                <p className="num text-sm text-muted-foreground">
                  Cerrado por {closed.userName} · {dt(closed.closedAt)}
                </p>
                <p className="num text-sm">
                  Diferencia registrada:{" "}
                  {Math.abs(closed.differenceUsd) < EPS ? (
                    <span className="font-medium text-verde">Exacto</span>
                  ) : (
                    <span className="text-rojo">{usd(closed.differenceUsd)}</span>
                  )}
                </p>
                {closed.note && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{closed.note}</p>
                )}
                {can("close_cash") && (
                  <Btn className="w-full" disabled={reabriendo} onClick={() => setReabrir(true)}>
                    Reabrir cierre
                  </Btn>
                )}
              </>
            ) : (
              <>
                <Field label="Observaciones">
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <Btn
                  variant="amber"
                  className="w-full"
                  disabled={!can("close_cash") || draft.sales.length === 0}
                  onClick={() => {
                    // Se arma el cierre una sola vez y se usa tal cual tanto para el
                    // store local como para el payload de `closure.create`: así el
                    // número que ve el cajero y el que sube a la cola son siempre el
                    // mismo (`byMethod[].received` ya viene en USD, que es justo lo
                    // que espera `CreateClosureDto`; ver `queueClosureCreate`).
                    const newClosure: DailyClosure = {
                      id: uid(),
                      date: day,
                      userId: user!.id,
                      userName: user!.fullName,
                      salesCount: draft.sales.length,
                      totalUsd: draft.totalUsd,
                      totalBs: draft.totalBs,
                      byMethod: rows.map((m) => ({
                        methodId: m.methodId,
                        methodName: m.methodName,
                        currency: m.currency,
                        expected: m.expected,
                        received: m.expected + m.diffUsd,
                        expectedAmount: m.expectedAmount,
                        receivedAmount: m.countedAmount,
                      })),
                      expectedUsd: draft.expectedUsd,
                      receivedUsd: draft.expectedUsd + diff,
                      differenceUsd: diff,
                      rate,
                      note,
                      closedAt: new Date().toISOString(),
                    };
                    mutate((st) => {
                      st.closures.unshift(newClosure);
                      logAudit("cierre_caja", "closure", day, { diff });
                    });
                    queueClosureCreate(newClosure);
                    toast.success("Caja cerrada");
                  }}
                >
                  Registrar cierre
                </Btn>
                {draft.sales.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay ventas en la fecha seleccionada.
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHead title="Cierres anteriores" />
        {s.closures.length === 0 ? (
          <Empty title="Sin cierres registrados" />
        ) : (
          <div className="divide-y divide-border">
            {s.closures.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="num flex-1">{c.date}</span>
                <span className="num">{c.salesCount} ventas</span>
                <span className="text-right">
                  <span className="num block">{money.fmtBs(c.totalUsd)}</span>
                  <span className="num block text-[11px] text-muted-foreground">
                    {usd(c.totalUsd)}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={"num block " + (c.differenceUsd === 0 ? "text-verde" : "text-rojo")}
                  >
                    {money.fmtBs(c.differenceUsd)}
                  </span>
                  <span className="num block text-[11px] text-muted-foreground">
                    {usd(c.differenceUsd)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{c.userName}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={reabrir}
        title="Reabrir cierre"
        message={`¿Reabrir el cierre del ${day}? Se borra lo contado para que puedas volver a contar y cerrar. Las ventas y los abonos del día no cambian, y el cierre anterior queda en la bitácora.`}
        verbo="Reabrir"
        onCancel={() => setReabrir(false)}
        onConfirm={() => void reabrirCierre()}
      />
    </>
  );
}
