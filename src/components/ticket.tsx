import { useMemo } from "react";
import { useAppState } from "@/lib/store";
import { IcoImprimir } from "@/chasis/iconos";
import { dt, num } from "@/lib/format";
import { itemsTotals, lineBs, moneyOf, moneyOfSale, unitBs } from "@/lib/pricing";
import { orderBalance } from "@/lib/orders";
import type { Money } from "@/lib/money";
import type { Order, Sale } from "@/lib/types";
import { Btn } from "./ui-kit";

type TicketProps = { sale: Sale; order?: never } | { order: Order; sale?: never };

/**
 * Ticket de una venta ya cerrada (`{ sale }`) o comprobante de un pedido aún
 * no facturado (`{ order }`). Comparten la misma estructura (líneas + total +
 * pie), así que viven en un solo componente en vez de duplicar el JSX:
 *
 * - Venta: se imprime siempre con la tasa congelada en `sale.rateSnapshot`
 *   (`moneyOfSale`), nunca con la tasa BCV de hoy — si la venta se cobró
 *   ayer, el ticket debe seguir mostrando la tasa de ayer aunque la de hoy
 *   haya cambiado.
 * - Pedido: no tiene tasa congelada (no se ha facturado), así que se cotiza
 *   siempre a la tasa BCV vigente (`moneyOf`) y se marca claramente como
 *   comprobante de pedido pendiente, no como factura de venta — muestra el
 *   abono y el saldo pendiente vía `orderBalance()` cuando aplica.
 *
 * El bolívar es el monto principal (es lo que el cliente paga); el USD queda
 * como referencia secundaria, más pequeño, entre paréntesis.
 */
export function TicketPreview(props: TicketProps) {
  const s = useAppState();
  const { sale, order } = props;

  const money: Money = useMemo(
    () => (order ? moneyOf(s) : moneyOfSale(s, sale!)),
    [s, order, sale],
  );

  const items = order ? order.items : sale!.items;
  const { totalBs, totalUsd } = order
    ? itemsTotals(order.items, money)
    : { totalBs: sale!.totalBs, totalUsd: sale!.totalUsd };
  const balance = order ? orderBalance(order) : null;
  const cashierName = order
    ? (s.users.find((u) => u.id === order.userId)?.fullName ?? "—")
    : sale!.userName;

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
        {order ? (
          <div className="my-1 border border-black px-1 py-1 text-center text-[10px] font-bold uppercase">
            Comprobante de pedido
            <br />
            No es factura de venta
          </div>
        ) : null}
        <p>{order ? "PEDIDO" : "VENTA"}: {order ? order.number : sale!.number}</p>
        <p>FECHA: {dt(order ? order.createdAt : sale!.createdAt)}</p>
        <p>CLIENTE: {order ? order.customerName : sale!.customerName}</p>
        <p>CAJERO: {cashierName}</p>
        <Sep />
        {items.map((i, k) => {
          const unit = i.bsOnly ? (i.unitPriceBs ?? 0) : unitBs(i, money);
          const subtotal = i.bsOnly ? (i.unitPriceBs ?? 0) * i.qty : lineBs(i, money);
          return (
            <div key={k} className="mb-1">
              <p className="uppercase">{i.name}</p>
              {i.customization && <p>* {i.customization}</p>}
              <div className="flex justify-between">
                <span>
                  {i.qty} x {money.fmtBsAmount(unit)}
                </span>
                <span>{money.fmtBsAmount(subtotal)}</span>
              </div>
              {!i.bsOnly && (
                <p className="text-right text-[8px] text-black/50">≈ {money.fmtUsd(i.subtotalUsd)}</p>
              )}
            </div>
          );
        })}
        <Sep />
        <Row l="TOTAL" r={money.fmtBsAmount(totalBs)} bold />
        <p className="text-right text-[8px] text-black/50">≈ {money.fmtUsd(totalUsd)}</p>

        {order && balance ? (
          <>
            <Sep />
            {balance.deposits.length > 0 ? (
              <>
                <p>ABONOS:</p>
                {balance.deposits.map((d, k) => {
                  const isUsd = d.currency === "USD";
                  const primary = isUsd ? money.fmtBs(d.amount) : money.fmtBsAmount(d.amount);
                  const secondary = isUsd ? "$" + num(d.amount) : money.fmtUsd(money.toUsd(d.amount));
                  return (
                    <div key={k} className="mb-0.5">
                      <Row l={d.methodName + (d.reference ? " #" + d.reference : "")} r={primary} />
                      <p className="text-right text-[8px] text-black/50">≈ {secondary}</p>
                    </div>
                  );
                })}
                <Row l="ABONADO" r={money.fmtBs(balance.depositUsd)} />
                <p className="text-right text-[8px] text-black/50">≈ {money.fmtUsd(balance.depositUsd)}</p>
              </>
            ) : null}
            {balance.status === "pagado" ? (
              <Row l="SALDO" r={money.fmtBsAmount(0)} bold />
            ) : (
              <Row l="SALDO PENDIENTE" r={money.fmtBs(balance.balanceUsd)} bold />
            )}
            <Sep />
            <p>TASA BCV USD (del día): {money.fmtRate()}</p>
            <Sep />
            <p className="py-1 text-center text-[10px] font-bold uppercase">
              {balance.status !== "pagado" ? "Pendiente de pago" : "Comprobante de pedido"}
            </p>
          </>
        ) : null}

        {!order && (
          <>
            <Sep />
            <p>PAGOS:</p>
            {sale!.payments.map((p, k) => {
              const isUsd = p.currency === "USD";
              const primary = isUsd ? money.fmtBs(p.amount) : money.fmtBsAmount(p.amount);
              const secondary = isUsd ? "$" + num(p.amount) : money.fmtUsd(money.toUsd(p.amount));
              return (
                <div key={k} className="mb-0.5">
                  <Row l={p.methodName + (p.reference ? " #" + p.reference : "")} r={primary} />
                  <p className="text-right text-[8px] text-black/50">≈ {secondary}</p>
                </div>
              );
            })}
            {(sale!.changeUsd ?? 0) > 0.001 && (
              <>
                <Row l="VUELTO" r={money.fmtBs(sale!.changeUsd ?? 0)} bold />
                <p className="text-right text-[8px] text-black/50">≈ {money.fmtUsd(sale!.changeUsd ?? 0)}</p>
              </>
            )}
            <Sep />
            <p>TASA BCV USD: {num(sale!.rateSnapshot.usd)}</p>
            <Sep />
            <p className="py-1 text-center text-[11px] font-bold uppercase">{s.company.ticketFooter}</p>
          </>
        )}
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
