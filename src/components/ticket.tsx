import { useAppState } from "@/lib/store";
import { IcoImprimir } from "@/chasis/iconos";
import { dt, num } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { Btn } from "./ui-kit";
export function TicketPreview({ sale }: { sale: Sale }) {
  const s = useAppState();
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
        {sale.items.map((i, k) => (
          <div key={k} className="mb-1">
            <p className="uppercase">{i.name}</p>
            {i.customization && <p>* {i.customization}</p>}
            <div className="flex justify-between">
              <span>
                {i.qty} x {i.bsOnly ? num(i.unitPriceBs ?? 0) + " Bs" : "$" + num(i.unitPriceUsd)}
              </span>
              <span>
                {i.bsOnly ? num((i.unitPriceBs ?? 0) * i.qty) + " Bs" : "$" + num(i.subtotalUsd)}
              </span>
            </div>
          </div>
        ))}
        <Sep />
        <Row l="SUBTOTAL USD" r={"$" + num(sale.totalUsd)} />
        <Row l="TOTAL USD" r={"$" + num(sale.totalUsd)} bold />
        <Row l="TOTAL BS" r={num(sale.totalBs)} bold />
        <Sep />
        <p>PAGOS:</p>
        {sale.payments.map((p, k) => (
          <Row
            key={k}
            l={p.methodName + (p.reference ? " #" + p.reference : "")}
            r={p.currency === "USD" ? "$" + num(p.amount) : num(p.amount) + " Bs"}
          />
        ))}
        {(sale.changeUsd ?? 0) > 0.001 && (
          <Row l="VUELTO" r={"$" + num(sale.changeUsd ?? 0)} bold />
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
