import { useAppState } from "@/lib/store";
import { IcoImprimir } from "@/chasis/iconos";
import { dt, num } from "@/lib/format";
import { lineBs, unitBs } from "@/lib/pricing";
import { useSaleMoney } from "@/hooks/use-money";
import type { Sale } from "@/lib/types";
import { Btn } from "./ui-kit";

/**
 * Ticket de una venta ya cerrada. Se imprime siempre con la tasa congelada en
 * `sale.rateSnapshot` (`useSaleMoney`), nunca con la tasa BCV de hoy: si la
 * venta se cobró ayer, el ticket debe seguir mostrando la tasa de ayer aunque
 * la de hoy haya cambiado.
 *
 * El bolívar es el monto principal (es lo que el cliente paga); el USD queda
 * como referencia secundaria, más pequeño, entre paréntesis.
 */
export function TicketPreview({ sale }: { sale: Sale }) {
  const s = useAppState();
  const m = useSaleMoney(sale);
  return (
    <div className="space-y-3">
      <div
        id="ticket-print"
        className="mx-auto w-[58mm] max-w-full border border-border bg-white p-3 text-[10px] leading-tight text-black"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <div className="text-center">
          {s.company.logoUrl && (
            <img src={s.company.logoUrl} alt="" className="mx-auto mb-1 h-10 w-10 object-contain" />
          )}
          <p className="text-[13px] font-bold uppercase">{s.company.name}</p>
          {s.company.address && <p>{s.company.address}</p>}
          {s.company.phone && <p>{s.company.phone}</p>}
          {s.company.taxId && <p>{s.company.taxId}</p>}
        </div>
        <Sep />
        <p>VENTA: {sale.number}</p>
        <p>FECHA: {dt(sale.createdAt)}</p>
        <p>CLIENTE: {sale.customerName}</p>
        <p>CAJERO: {sale.userName}</p>
        <Sep />
        {sale.items.map((i, k) => {
          const unit = i.bsOnly ? (i.unitPriceBs ?? 0) : unitBs(i, m);
          const subtotal = i.bsOnly ? (i.unitPriceBs ?? 0) * i.qty : lineBs(i, m);
          return (
            <div key={k} className="mb-1">
              <p className="uppercase">{i.name}</p>
              {i.customization && <p>* {i.customization}</p>}
              <div className="flex justify-between">
                <span>
                  {i.qty} x {m.fmtBsAmount(unit)}
                </span>
                <span>{m.fmtBsAmount(subtotal)}</span>
              </div>
              {!i.bsOnly && (
                <p className="text-right text-[8px] text-black/50">≈ {m.fmtUsd(i.subtotalUsd)}</p>
              )}
            </div>
          );
        })}
        <Sep />
        <Row l="TOTAL" r={m.fmtBsAmount(sale.totalBs)} bold />
        <p className="text-right text-[8px] text-black/50">≈ {m.fmtUsd(sale.totalUsd)}</p>
        <Sep />
        <p>PAGOS:</p>
        {sale.payments.map((p, k) => {
          const isUsd = p.currency === "USD";
          const primary = isUsd ? m.fmtBs(p.amount) : m.fmtBsAmount(p.amount);
          const secondary = isUsd ? "$" + num(p.amount) : m.fmtUsd(m.toUsd(p.amount));
          return (
            <div key={k} className="mb-0.5">
              <Row l={p.methodName + (p.reference ? " #" + p.reference : "")} r={primary} />
              <p className="text-right text-[8px] text-black/50">≈ {secondary}</p>
            </div>
          );
        })}
        {(sale.changeUsd ?? 0) > 0.001 && (
          <>
            <Row l="VUELTO" r={m.fmtBs(sale.changeUsd ?? 0)} bold />
            <p className="text-right text-[8px] text-black/50">≈ {m.fmtUsd(sale.changeUsd ?? 0)}</p>
          </>
        )}
        <Sep />
        <p>TASA BCV USD: {num(sale.rateSnapshot.usd)}</p>
        <Sep />
        <p className="py-1 text-center text-[11px] font-bold uppercase">{s.company.ticketFooter}</p>
        <p className="text-center text-[8px]">Powered by HAYAI</p>
      </div>
      <div className="flex justify-center">
        <Btn variant="amber" onClick={() => window.print()}>
          <IcoImprimir /> Imprimir ticket
        </Btn>
      </div>
    </div>
  );
}

const Sep = () => <div className="my-1 border-t border-dashed border-black" />;

function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-bold" : "")}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
}
