import { createFileRoute } from "@tanstack/react-router";
import { IcoImprimir } from "@/chasis/iconos";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { Badge, Btn, Card, CardHead, Empty, Field, Input, Textarea } from "@/components/ui-kit";
import { logAudit, mutate, useAppState } from "@/lib/store";
import { closureDraft } from "@/lib/business";
import { dayKey, dt, usd } from "@/lib/format";
import { uid } from "@/lib/seed";
import { useSession } from "@/lib/auth";
import { useMoney } from "@/hooks/use-money";

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

function Cierre() {
  const s = useAppState();
  const money = useMoney();
  const { user, can } = useSession();
  const [day, setDay] = useState(dayKey());
  const draft = useMemo(() => closureDraft(s, day), [s, day]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const closed = s.closures.find((c) => c.date === day);

  const recTotal = draft.byMethod.reduce(
    (a, m) =>
      a +
      (received[m.methodId] !== undefined ? parseFloat(received[m.methodId] || "0") : m.expected),
    0,
  );
  // Se compara contra el efectivo esperado (ventas del día + abonos recibidos
  // hoy − vueltos), no contra lo facturado: un abono entra en caja el día en
  // que se recibe, aunque el pedido se facture más adelante.
  const diff = recTotal - draft.expectedUsd;

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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHead title="Desglose por método" sub="Equivalente en bolívares" />
          <div className="divide-y divide-border">
            {draft.byMethod.map((m) => (
              <div key={m.methodId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm">{m.methodName}</span>
                <span className="w-24 text-right">
                  <span className="num block text-sm">{money.fmtBs(m.expected)}</span>
                  <span className="num block text-[11px] text-muted-foreground">
                    {usd(m.expected)}
                  </span>
                </span>
                <Input
                  className="num w-28 text-right"
                  disabled={!!closed}
                  value={received[m.methodId] ?? String(m.expected.toFixed(2))}
                  onChange={(e) => setReceived({ ...received, [m.methodId]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-sm font-medium">Esperado / Recibido / Diferencia</span>
            <span className="text-right">
              <span className="num block text-sm">
                {money.fmtBs(draft.expectedUsd)} · {money.fmtBs(recTotal)} ·{" "}
                <span className={diff === 0 ? "text-verde" : "text-rojo"}>{money.fmtBs(diff)}</span>
              </span>
              <span className="num block text-[11px] text-muted-foreground">
                {usd(draft.expectedUsd)} · {usd(recTotal)} · {usd(diff)}
              </span>
            </span>
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
                  Diferencia registrada: {money.fmtBs(closed.differenceUsd)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({usd(closed.differenceUsd)})
                  </span>
                </p>
                {closed.note && <p className="text-sm text-muted-foreground">{closed.note}</p>}
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
                    mutate((st) => {
                      st.closures.unshift({
                        id: uid(),
                        date: day,
                        userId: user!.id,
                        userName: user!.fullName,
                        salesCount: draft.sales.length,
                        totalUsd: draft.totalUsd,
                        totalBs: draft.totalBs,
                        byMethod: draft.byMethod.map((m) => ({
                          ...m,
                          received:
                            received[m.methodId] !== undefined
                              ? parseFloat(received[m.methodId] || "0")
                              : m.expected,
                        })),
                        expectedUsd: draft.expectedUsd,
                        receivedUsd: recTotal,
                        differenceUsd: diff,
                        note,
                        closedAt: new Date().toISOString(),
                      });
                      logAudit("cierre_caja", "closure", day, { diff });
                    });
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
    </>
  );
}
