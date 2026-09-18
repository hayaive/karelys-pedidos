/**
 * Precios fuera del rango de Ajustes y su corrección en bloque.
 *
 * Vive aquí y no dentro de una pantalla porque lo muestran dos: Inventario (donde
 * se corrige el precio) e Inicio (donde el dueño ve lo que hay que atender hoy).
 * Un aviso de dinero que dijera cosas distintas en cada sitio sería peor que no
 * tenerlo.
 *
 * Las alertas son **derivadas** (`priceAlerts` en lib/pricing): no hay flag de
 * "visto" que apagar, así que reaparecen en cada visita hasta que alguien suba el
 * precio de verdad — y desaparecen solas en cuanto lo haga, o en cuanto suba la
 * tasa lo suficiente.
 *
 * Son muchas a la vez por naturaleza: una subida de tasa baja el equivalente en
 * USD de todos los productos con precio en Bs sujetos al rango. Por eso hay un
 * solo aviso y una sola lista que se corrige de un golpe, en vez de un aviso y un
 * formulario por producto.
 */

import { useState } from "react";
import { toast } from "sonner";
import { IcoAlerta } from "@/chasis/iconos";
import { Aviso, Btn, Input, Modal, inputCifraCls } from "@/components/ui-kit";
import { useMoney } from "@/hooks/use-money";
import { applyPriceAlertFix, type PriceFixTarget } from "@/lib/catalog";
import { num, parseAmount, usd } from "@/lib/format";
import { priceAlertKey } from "@/lib/pricing";
import { logAudit, mutate } from "@/lib/store";
import { queueProductPriceSet, queueProductUpdate } from "@/lib/sync/mutations";
import type { PriceAlert } from "@/lib/types";

export function PriceAlertsAviso({ alerts, canFix }: { alerts: PriceAlert[]; canFix: boolean }) {
  const money = useMoney();
  const [abierto, setAbierto] = useState(false);
  if (!alerts.length) return null;

  // El rango es uno solo para todos (Ajustes · Impresión y numeración), así que
  // mínimo y sugerido se leen de cualquier alerta.
  const { thresholdUsd, suggestedUsd } = alerts[0];
  const nombres = [...new Set(alerts.map((a) => a.productName))];
  const lista =
    nombres.slice(0, 3).join(", ") + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : "");

  return (
    <>
      <Aviso
        tone="red"
        icon={IcoAlerta}
        title={
          alerts.length === 1
            ? "1 precio por debajo del rango"
            : `${alerts.length} precios por debajo del rango`
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {lista}. El mínimo es {usd(thresholdUsd)}; se sugiere subirlos a {usd(suggestedUsd)}
            {!money.missing && ` (≈ ${money.fmtBsAmount(money.toBsRounded(suggestedUsd))} hoy)`}.
          </span>
          {canFix && (
            <Btn size="sm" variant="amber" className="shrink-0" onClick={() => setAbierto(true)}>
              Revisar y corregir
            </Btn>
          )}
        </div>
      </Aviso>
      {/* Se monta al abrir: así los montos nacen con el sugerido de **ahora**, que
          depende de la tasa y pudo cambiar desde que se pintó el aviso. */}
      {canFix && abierto && <PriceBandFixModal alerts={alerts} onClose={() => setAbierto(false)} />}
    </>
  );
}

type Fila = { alert: PriceAlert; on: boolean; raw: string };

/** Monto en el formato del campo: sin decimales si es entero. */
function aTexto(n: number) {
  return num(n, Number.isInteger(n) ? 0 : 2);
}

/**
 * Lista de productos fuera de rango con el precio nuevo de cada uno. Todos
 * nacen marcados y con el sugerido (el máximo del rango), así que "Aplicar"
 * corrige la lista entera de un golpe; cada fila se puede desmarcar o ajustar a
 * mano, porque quien pone el precio es el negocio.
 *
 * Los campos "para todos" (uno en Bs, otro en USD si hay productos con precio en
 * dólares) reescriben de una vez el monto de las filas de esa moneda.
 */
function PriceBandFixModal({ alerts, onClose }: { alerts: PriceAlert[]; onClose: () => void }) {
  const money = useMoney();
  // Foto al abrir: la lista no debe reordenarse ni encogerse mientras se edita.
  const [filas, setFilas] = useState<Fila[]>(() =>
    alerts.map((alert) => ({
      alert,
      on: true,
      raw: aTexto(alert.mode === "bs" ? (alert.suggestedBs ?? 0) : alert.suggestedUsd),
    })),
  );
  const hayBs = filas.some((f) => f.alert.mode === "bs");
  const hayUsd = filas.some((f) => f.alert.mode === "usd");
  const [todosBs, setTodosBs] = useState(() =>
    aTexto(filas.find((f) => f.alert.mode === "bs")?.alert.suggestedBs ?? 0),
  );
  const [todosUsd, setTodosUsd] = useState(() => aTexto(alerts[0]?.suggestedUsd ?? 0));

  const elegidas = filas.filter((f) => f.on);
  const todasMarcadas = elegidas.length === filas.length;

  function editar(i: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, ...cambio } : f)));
  }

  function paraTodos(modo: "bs" | "usd", raw: string) {
    if (modo === "bs") setTodosBs(raw);
    else setTodosUsd(raw);
    setFilas((prev) => prev.map((f) => (f.alert.mode === modo ? { ...f, raw } : f)));
  }

  function aplicar() {
    if (!elegidas.length) return toast.error("Marca al menos un producto");

    // El contrato del backend exige montos ≥ 0 (`@Min(0)`), y un rechazo suyo es
    // **permanente**: la mutación sale de la cola y el precio se queda sólo en
    // este equipo. Se valida todo antes de tocar nada.
    for (const f of elegidas) {
      const v = parseAmount(f.raw);
      if (!Number.isFinite(v) || v < 0)
        return toast.error(`Precio inválido en ${f.alert.productName}`);
    }

    const hechos: PriceFixTarget[] = [];
    mutate((st) => {
      for (const f of elegidas) {
        const amount = parseAmount(f.raw);
        const target = applyPriceAlertFix(st, f.alert, amount);
        if (!target) continue;
        hechos.push(target);
        logAudit("precio_alerta_corregida", "product", f.alert.productId, {
          mode: f.alert.mode,
          priceTypeId: f.alert.priceTypeId,
          fromUsd: f.alert.currentUsd,
          toUsd: f.alert.mode === "bs" ? money.toUsd(amount) : amount,
          fromBs: f.alert.currentBs,
          toBs: f.alert.mode === "bs" ? amount : undefined,
          rate: money.rate,
          bloque: true,
        });
      }
    });

    /* Encolar **después** del `mutate`, y por la vía que corresponde a lo que de
       verdad cambió: el precio en Bs vive en el producto (`product.update` con
       `bsOnly` + `bsPrice`), el precio en USD en la celda `(producto, tipo de
       precio)` (`productPrice.set`), que es la unidad de conflicto del servidor. */
    for (const t of hechos) {
      if (t.mode === "bs") queueProductUpdate(t.productId, { bsOnly: true, bsPrice: t.bsPrice });
      else queueProductPriceSet(t.productId, t.priceTypeId, t.amountUsd);
    }

    const faltan = elegidas.length - hechos.length;
    toast.success(
      hechos.length === 1 ? "1 precio corregido" : `${hechos.length} precios corregidos`,
      faltan ? { description: `${faltan} producto(s) ya no existían.` } : undefined,
    );
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Precios por debajo del rango"
      sub={`Mínimo ${usd(alerts[0]?.thresholdUsd ?? 0)} · sugerido ${usd(alerts[0]?.suggestedUsd ?? 0)}. El rango se configura en Ajustes · Impresión y numeración.`}
      footer={
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn className="ml-auto" variant="amber" disabled={!elegidas.length} onClick={aplicar}>
            {elegidas.length === 1
              ? "Aplicar a 1 producto"
              : `Aplicar a ${elegidas.length} productos`}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        {(hayBs || hayUsd) && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-sup-2 p-3">
            {hayBs && (
              <ParaTodos
                label="Nuevo precio para todos (Bs)"
                value={todosBs}
                onChange={(v) => paraTodos("bs", v)}
                eco={
                  money.missing
                    ? undefined
                    : `≈ ${usd(money.toUsd(parseAmount(todosBs) || 0))} con la tasa de hoy`
                }
              />
            )}
            {hayUsd && (
              <ParaTodos
                label="Nuevo precio para todos (USD)"
                value={todosUsd}
                onChange={(v) => paraTodos("usd", v)}
              />
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-[0.85rem] text-texto-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--sol)]"
            checked={todasMarcadas}
            onChange={(e) => setFilas((prev) => prev.map((f) => ({ ...f, on: e.target.checked })))}
          />
          {todasMarcadas ? "Todos marcados" : `${elegidas.length} de ${filas.length} marcados`}
        </label>

        <div className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {filas.map((f, i) => {
            const enBs = f.alert.mode === "bs";
            const v = parseAmount(f.raw);
            const valido = Number.isFinite(v) && v >= 0;
            const usdNuevo = valido ? (enBs ? money.toUsd(v) : v) : 0;
            const sigueBajo = valido && !money.missing && usdNuevo < f.alert.thresholdUsd;
            return (
              <div
                key={priceAlertKey(f.alert)}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
              >
                <label className="flex min-w-0 flex-1 basis-56 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[var(--sol)]"
                    checked={f.on}
                    onChange={(e) => editar(i, { on: e.target.checked })}
                    aria-label={`Corregir ${f.alert.productName}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {f.alert.productName}
                    </span>
                    <span className="num block text-xs text-texto-2">
                      {enBs
                        ? `Hoy ${money.fmtBsAmount(f.alert.currentBs ?? 0)} (≈ ${usd(f.alert.currentUsd)})`
                        : `Precio ${f.alert.priceTypeName || "de venta"}: ${usd(f.alert.currentUsd)}`}
                    </span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    className={`${inputCifraCls} h-11 w-32 sm:h-9`}
                    inputMode="decimal"
                    value={f.raw}
                    disabled={!f.on}
                    onChange={(e) => editar(i, { raw: e.target.value })}
                    aria-label={`Nuevo precio de ${f.alert.productName}`}
                  />
                  <span className="w-7 text-xs text-texto-2">{enBs ? "Bs" : "USD"}</span>
                </div>
                <span
                  className={`num w-28 text-right text-xs ${sigueBajo ? "text-rojo" : "text-texto-2"}`}
                >
                  {!valido
                    ? "Monto inválido"
                    : enBs
                      ? money.missing
                        ? "Sin tasa"
                        : `≈ ${usd(usdNuevo)}`
                      : `≈ ${money.fmtBsAmount(money.toBsRounded(usdNuevo))}`}
                  {sigueBajo && " · sigue bajo"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function ParaTodos({
  label,
  value,
  onChange,
  eco,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  eco?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-etiqueta font-[550] text-texto">{label}</span>
      <Input
        className={`${inputCifraCls} w-40`}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {eco && <span className="num mt-1 block text-[0.79rem] text-texto-2">{eco}</span>}
    </label>
  );
}
