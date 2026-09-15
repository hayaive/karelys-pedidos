/**
 * Aviso de precio bajo y su corrección rápida.
 *
 * Vive aquí y no dentro de una pantalla porque lo muestran dos: Inventario (donde
 * se corrige el precio) e Inicio (donde el dueño ve lo que hay que atender hoy).
 * Un aviso de dinero que dijera cosas distintas en cada sitio sería peor que no
 * tenerlo.
 *
 * La alerta es **derivada** (`priceAlerts` en lib/pricing): no hay flag de
 * "visto" que apagar, así que reaparece en cada visita hasta que alguien suba el
 * precio de verdad — y desaparece sola en cuanto lo haga, o en cuanto suba la
 * tasa lo suficiente.
 */

import { useState } from "react";
import { toast } from "sonner";
import { IcoAlerta } from "@/chasis/iconos";
import { Aviso, Btn, Field, Input, Modal, inputCifraCls } from "@/components/ui-kit";
import { useMoney } from "@/hooks/use-money";
import { applyPriceAlertFix, type PriceFixTarget } from "@/lib/catalog";
import { num, parseAmount, usd } from "@/lib/format";
import { logAudit, mutate } from "@/lib/store";
import { queueProductPriceSet, queueProductUpdate } from "@/lib/sync/mutations";
import type { PriceAlert } from "@/lib/types";

export function PriceAlertAviso({ alert, canFix }: { alert: PriceAlert; canFix: boolean }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Aviso tone="red" icon={IcoAlerta} title={`Precio bajo · ${alert.productName}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{alert.message}</span>
          {canFix && (
            <Btn size="sm" variant="amber" className="shrink-0" onClick={() => setAbierto(true)}>
              Corregir precio
            </Btn>
          )}
        </div>
      </Aviso>
      {/* Se monta al abrir: así el campo nace con el sugerido de **ahora**, que
          depende de la tasa y pudo cambiar desde que se pintó el aviso. */}
      {canFix && abierto && <PriceFixModal alert={alert} onClose={() => setAbierto(false)} />}
    </>
  );
}

/**
 * Corrección con el monto a la vista y editable: el sugerido es una propuesta,
 * no una imposición, y quien pone el precio es el negocio. Por eso el campo se
 * precarga pero se puede cambiar, y un valor que sigue por debajo del umbral
 * avisa sin bloquear.
 */
function PriceFixModal({ alert, onClose }: { alert: PriceAlert; onClose: () => void }) {
  const money = useMoney();
  const enBs = alert.mode === "bs";
  const sugerido = enBs ? (alert.suggestedBs ?? 0) : alert.suggestedUsd;
  const [raw, setRaw] = useState(() => num(sugerido, Number.isInteger(sugerido) ? 0 : 2));

  const valor = parseAmount(raw);
  const valido = Number.isFinite(valor) && valor >= 0;
  /* Equivalente en USD de lo que hay tecleado: en modo `bs` es lo único que
     dice si el precio sigue estando bajo, porque el umbral es en USD. */
  const usdTecleado = valido ? (enBs ? money.toUsd(valor) : valor) : 0;
  /* Sin tasa, el equivalente USD de un precio en Bs es 0 y el aviso diría que
     todo está bajo. Callarse es lo correcto: no se sabe. */
  const sigueBajo = valido && !(enBs && money.missing) && usdTecleado < alert.thresholdUsd;

  function aplicar(amount: number): PriceFixTarget | null {
    /* La corrección se lee de vuelta desde `applyPriceAlertFix` en lugar de
       darla por hecha: si el producto de la alerta ya no existe no cambió nada
       y no hay nada que encolar. Se devuelve desde una función para que el tipo
       sobreviva al cierre del `mutate`. */
    let target: PriceFixTarget | null = null;
    mutate((st) => {
      target = applyPriceAlertFix(st, alert, amount);
      if (!target) return;
      logAudit("precio_alerta_corregida", "product", alert.productId, {
        mode: alert.mode,
        priceTypeId: alert.priceTypeId,
        fromUsd: alert.currentUsd,
        toUsd: enBs ? money.toUsd(amount) : amount,
        fromBs: alert.currentBs,
        toBs: enBs ? amount : undefined,
        rate: money.rate,
      });
    });
    return target;
  }

  function confirmar() {
    const amount = parseAmount(raw);
    // El contrato del backend exige un monto ≥ 0 (`@Min(0)`), y un rechazo suyo
    // es **permanente**: la mutación sale de la cola y el precio corregido se
    // queda sólo en este navegador hasta que el siguiente bootstrap se lo lleve.
    if (!Number.isFinite(amount) || amount < 0)
      return toast.error(
        enBs ? "Escribe un precio en Bs válido" : "Escribe un precio en USD válido",
      );

    const target = aplicar(amount);
    if (!target) {
      toast.error("El producto de la alerta ya no existe");
      onClose();
      return;
    }

    /* Encolar **después** del `mutate`, y por la vía que corresponde a lo que de
       verdad cambió: el precio en Bs vive en el producto (`product.update` con
       `bsOnly` + `bsPrice`), el precio en USD en la celda `(producto, tipo de
       precio)` (`productPrice.set`), que es la unidad de conflicto del servidor.
       Mandar `productPrice.set` para un producto que se vende en Bs no tocaría
       el precio que se cobra. */
    if (target.mode === "bs")
      queueProductUpdate(target.productId, { bsOnly: true, bsPrice: target.bsPrice });
    else queueProductPriceSet(target.productId, target.priceTypeId, target.amountUsd);

    toast.success(
      target.mode === "bs"
        ? `${alert.productName} quedó en ${money.fmtBsAmount(target.bsPrice)} (≈ ${usd(money.toUsd(target.bsPrice))})`
        : `${alert.productName} quedó en ${usd(target.amountUsd)}`,
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Corregir precio · ${alert.productName}`}
      sub={
        enBs
          ? `Está en ${money.fmtBsAmount(alert.currentBs ?? 0)} (≈ ${usd(alert.currentUsd)}); el mínimo es ${usd(alert.thresholdUsd)}.`
          : `Precio ${alert.priceTypeName || "de venta"}: ${usd(alert.currentUsd)}; el mínimo es ${usd(alert.thresholdUsd)}.`
      }
      narrow
      footer={
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn className="ml-auto" variant="amber" disabled={!valido} onClick={confirmar}>
            Guardar precio
          </Btn>
        </>
      }
    >
      <div className="space-y-2">
        <Field
          label={
            enBs ? "Nuevo precio en Bs" : `Nuevo precio en USD · ${alert.priceTypeName || "venta"}`
          }
          error={valido ? undefined : "Escribe un número igual o mayor que cero"}
        >
          <Input
            autoFocus
            className={inputCifraCls}
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valido) confirmar();
            }}
          />
        </Field>

        {/* Eco en vivo: el umbral es en USD y el precio se teclea en Bs, así que
            sin esto no hay forma de saber si el número que se está escribiendo
            resuelve la alerta o la deja igual. Con el campo vacío o sin tasa se
            calla en vez de decir "≈ $0,00", que sería una cifra inventada. */}
        <p className="num text-[0.79rem] text-texto-2" aria-live="polite">
          {!valido
            ? "Escribe un monto para ver el equivalente."
            : money.missing
              ? "Sin tasa BCV cargada: no se puede mostrar el equivalente."
              : enBs
                ? `≈ ${usd(usdTecleado)} con la tasa de hoy (${num(money.rate)} Bs/USD)`
                : `≈ ${money.fmtBsAmount(money.toBsRounded(usdTecleado))} con la tasa de hoy`}
        </p>

        {sigueBajo && (
          <p className="text-[0.79rem] text-sol-70">
            Sigue por debajo del mínimo de {usd(alert.thresholdUsd)}. Puedes guardarlo igual, pero
            la alerta seguirá apareciendo.
          </p>
        )}

        <p className="text-[0.79rem] text-texto-3">
          Sugerido: {enBs ? money.fmtBsAmount(alert.suggestedBs ?? 0) : usd(alert.suggestedUsd)}
          {enBs && ` (≈ ${usd(alert.suggestedUsd)})`}. El mínimo y el objetivo se configuran en
          Ajustes · Impresión y numeración.
        </p>
      </div>
    </Modal>
  );
}
