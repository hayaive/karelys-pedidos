import { useState } from "react";
import { IcoMercado, IcoRecargar } from "@/chasis/iconos";
import { useAppState } from "@/lib/store";
import { currentRate, fetchRatesFromApi, setRate } from "@/lib/business";
import { num, dt } from "@/lib/format";
import { Btn, Field, Input, Modal, inputCifraCls } from "@/components/ui-kit";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import type { RateSource } from "@/lib/types";

const FUENTES: { key: RateSource; label: string }[] = [
  { key: "BCV_USD", label: "BCV USD" },
  { key: "BCV_EUR", label: "BCV EUR" },
  { key: "BINANCE", label: "Binance" },
];

/** El sol del logo: un círculo deliberadamente irregular, no una bolita perfecta. */
export function SelloSol({ size = 7 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        background: "#EF9D25",
        borderRadius: "50% 47% 53% 50% / 50% 52% 48% 50%",
        flex: "none",
      }}
    />
  );
}

/** La banda de divisas: estado, tasas y la puerta al Mercado. */
export function BandaDivisas({ onMercado }: { onMercado: () => void }) {
  const s = useAppState();
  const bcv = currentRate(s, "BCV_USD")?.value ?? 0;
  const eur = currentRate(s, "BCV_EUR")?.value ?? 0;

  return (
    <div className="flex h-9 items-center gap-3 border-t border-[#2E251A] bg-[#1F1810] px-3 text-[13px] sm:px-4">
      <span className="flex flex-none items-center gap-2 text-[#C4B7A4]">
        <SelloSol />
        <span className="hidden sm:inline">Al día · todo guardado</span>
        <span className="sm:hidden">Al día</span>
      </span>

      <span className="num ml-auto flex items-center gap-3 text-[#F2EADE] sm:gap-4">
        <span>
          <span className="text-[#9B8D7B]">BCV </span>
          {num(bcv)}
        </span>
        <span className="hidden sm:inline">
          <span className="text-[#9B8D7B]">EUR </span>
          {num(eur)}
        </span>
      </span>

      <button
        onClick={onMercado}
        className="-mr-2 flex min-h-[36px] flex-none items-center gap-2 px-2 font-medium text-[#EF9D25] transition-colors hover:text-[#E08F16]"
      >
        <IcoMercado />
        <span className="hidden sm:inline">Mercado</span>
      </button>
    </div>
  );
}

/** La calculadora de tasas que abre el botón Mercado. */
export function VentanaMercado({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const { can } = useSession();
  const [busy, setBusy] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const puedeEditar = can("manage_exchange_rates");

  // Al abrir, la ventana toma las tasas vigentes.
  const [abiertoCon, setAbiertoCon] = useState(false);
  if (open && !abiertoCon) {
    setAbiertoCon(true);
    setVals(
      Object.fromEntries(FUENTES.map((x) => [x.key, String(currentRate(s, x.key)?.value ?? 0)])),
    );
  }
  if (!open && abiertoCon) setAbiertoCon(false);

  const guardar = () => {
    FUENTES.forEach((x) => {
      const v = parseFloat((vals[x.key] ?? "").replace(",", "."));
      const actual = currentRate(s, x.key)?.value;
      if (Number.isFinite(v) && v > 0 && v !== actual) setRate(x.key, v, false);
    });
    toast.success("Tasas actualizadas");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mercado"
      sub="La tasa manual sustituye a la automática hasta la próxima consulta."
      footer={
        puedeEditar ? (
          <>
            <Btn
              cargando={busy}
              onClick={async () => {
                setBusy(true);
                const r = await fetchRatesFromApi();
                setBusy(false);
                if (r.ok) {
                  toast.success(r.message);
                  onClose();
                } else toast.error(r.message);
              }}
            >
              <IcoRecargar /> Traer de API
            </Btn>
            <Btn className="ml-auto" variant="ghost" onClick={onClose}>
              Cancelar
            </Btn>
            <Btn variant="amber" onClick={guardar}>
              Guardar
            </Btn>
          </>
        ) : (
          <Btn className="ml-auto" onClick={onClose}>
            Cerrar
          </Btn>
        )
      }
    >
      <div className="flex flex-col gap-[0.9rem]">
        {FUENTES.map((x) => {
          const r = currentRate(s, x.key);
          const pie = r
            ? `${r.automatic ? "Automática" : "Manual"} · ${dt(r.createdAt)}`
            : undefined;
          return (
            <Field key={x.key} label={x.label} hint={pie}>
              <Input
                className={inputCifraCls}
                inputMode="decimal"
                readOnly={!puedeEditar}
                value={vals[x.key] ?? ""}
                onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })}
              />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}
