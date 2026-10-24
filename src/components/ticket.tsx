import { useEffect, useMemo } from "react";
import { useAppState } from "@/lib/store";
import { IcoImprimir } from "@/chasis/iconos";
import { dt } from "@/lib/format";
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
 * El bolívar es el único monto que se imprime (es lo que el cliente paga):
 * no lleva ninguna referencia en dólares, ni por línea ni en los totales,
 * abonos, pagos o vuelto. La nota del pedido/venta (`order.note`/`sale.note`),
 * si existe, se imprime al final (justo antes de "Powered by") respetando sus
 * saltos de línea.
 */
export function TicketPreview(props: TicketProps) {
  const s = useAppState();
  const { sale, order } = props;

  const money: Money = useMemo(
    () => (order ? moneyOf(s) : moneyOfSale(s, sale!)),
    [s, order, sale],
  );

  const items = order ? order.items : sale!.items;
  const { totalBs } = order ? itemsTotals(order.items, money) : { totalBs: sale!.totalBs };
  const balance = order ? orderBalance(s, order) : null;
  const cashierName = order
    ? (s.users.find((u) => u.id === order.userId)?.fullName ?? "—")
    : sale!.userName;
  const note = order ? order.note : sale!.note;

  usePaginaDelAltoDelTicket();

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
        <p>
          {order ? "PEDIDO" : "VENTA"}: {order ? order.number : sale!.number}
        </p>
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
            </div>
          );
        })}
        <Sep />
        <Row l="TOTAL" r={money.fmtBsAmount(totalBs)} bold />

        {order && balance ? (
          <>
            <Sep />
            {balance.deposits.length > 0 ? (
              <>
                <p>ABONOS:</p>
                {balance.deposits.map((d, k) => {
                  const primary =
                    d.currency === "USD" ? money.fmtBs(d.amount) : money.fmtBsAmount(d.amount);
                  return (
                    <div key={k} className="mb-0.5">
                      <Row l={d.methodName + (d.reference ? " #" + d.reference : "")} r={primary} />
                    </div>
                  );
                })}
                <Row l="ABONADO" r={money.fmtBs(balance.depositUsd)} />
              </>
            ) : null}
            {balance.status === "pagado" ? (
              <Row l="SALDO" r={money.fmtBsAmount(0)} bold />
            ) : (
              <Row l="SALDO PENDIENTE" r={money.fmtBs(balance.balanceUsd)} bold />
            )}
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
              const primary =
                p.currency === "USD" ? money.fmtBs(p.amount) : money.fmtBsAmount(p.amount);
              return (
                <div key={k} className="mb-0.5">
                  <Row l={p.methodName + (p.reference ? " #" + p.reference : "")} r={primary} />
                </div>
              );
            })}
            {(sale!.changeUsd ?? 0) > 0.001 && (
              <Row l="VUELTO" r={money.fmtBs(sale!.changeUsd ?? 0)} bold />
            )}
            <Sep />
            <p className="py-1 text-center text-[11px] font-bold uppercase">
              {s.company.ticketFooter}
            </p>
          </>
        )}
        {/* La nota va siempre al final, justo antes de "Powered by", y con sus
            saltos de línea tal como se escribieron. */}
        {note && (
          <p className="my-1 whitespace-pre-line break-words border border-black px-1 py-1 text-[10px]">
            <span className="font-bold uppercase">Nota:</span>
            {"\n"}
            {note}
          </p>
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

/** Papel que se deja correr tras la última línea para poder cortarlo en la
 *  sierra sin llevarse el pie: es la distancia cabezal → sierra de la POS-58C
 *  (~20 mm medidos: con 10 mm el corte se comía la nota y el "Powered by", que
 *  salían arriba del ticket siguiente). Si el pie queda dentro de la
 *  impresora, súbelo; si sobra papel, bájalo. */
const PIE_MM = 25;

/**
 * Pide a Chrome una página exactamente del alto del ticket. El rollo no tiene
 * alto fijo, pero CSS no deja decirlo: `@page { size: 58mm auto }` es inválido
 * (el alto no admite `auto`) y Chrome descartaba la regla entera, así que caía
 * en la hoja del driver (58 × 210 mm) y todo lo que el ticket no llenaba salía
 * en blanco. `beforeprint` corre antes de maquetar la impresión — tanto con el
 * botón como con Ctrl+P —, mide el ticket con la caja que tendrá en papel
 * (48 mm sin padding ni borde, ver `#ticket-print` en `@media print`) y fija
 * ese alto; `afterprint` lo retira.
 */
function usePaginaDelAltoDelTicket() {
  useEffect(() => {
    const page = document.createElement("style");
    const measure = () => {
      const el = document.getElementById("ticket-print");
      if (!el) return;
      const screen = el.style.cssText;
      el.style.cssText += ";width:48mm;padding:0;border:0";
      const mm = (el.getBoundingClientRect().height * 25.4) / 96;
      el.style.cssText = screen;
      page.textContent = `@page { size: 58mm ${Math.ceil(mm + PIE_MM)}mm; margin: 0 }`;
      document.head.append(page);
    };
    const reset = () => page.remove();
    window.addEventListener("beforeprint", measure);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", measure);
      window.removeEventListener("afterprint", reset);
      reset();
    };
  }, []);
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
