import { useState } from "react";
import { RefreshCw, Pencil } from "lucide-react";
import { useAppState } from "@/lib/store";
import { currentRate, fetchRatesFromApi, setRate } from "@/lib/business";
import { num, dt } from "@/lib/format";
import { Btn, Field, Input, Modal, inputCifraCls } from "./ui-kit";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import type { RateSource } from "@/lib/types";

const SOURCES: { key: RateSource; label: string }[] = [
  { key: "BCV_USD", label: "BCV USD" },
  { key: "BCV_EUR", label: "BCV EUR" },
  { key: "BINANCE", label: "Binance" },
];

export function RateBar() {
  const s = useAppState();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});

  const openModal = () => {
    setVals(
      Object.fromEntries(SOURCES.map((x) => [x.key, String(currentRate(s, x.key)?.value ?? 0)])),
    );
    setOpen(true);
  };

  const save = () => {
    SOURCES.forEach((x) => {
      const v = parseFloat(vals[x.key].replace(",", "."));
      const cur = currentRate(s, x.key)?.value;
      if (Number.isFinite(v) && v > 0 && v !== cur) setRate(x.key, v, false);
    });
    toast.success("Tasas actualizadas");
    setOpen(false);
  };

  return (
    <>
      {/* Vive en el chrome Noche: colores de rail, no de papel. */}
      <div className="flex w-full items-center justify-between gap-1 rounded-md border border-rail-linea bg-rail-2 px-[0.35rem] py-[0.2rem] lg:w-auto lg:justify-start">
        {SOURCES.map((x) => (
          <div key={x.key} className="px-[0.4rem] leading-tight">
            <p className="rotulo text-rail-texto-2">{x.label}</p>
            <p className="num text-[0.82rem] font-[550] text-sol">
              {num(currentRate(s, x.key)?.value ?? 0)}
            </p>
          </div>
        ))}
        {can("manage_exchange_rates") && (
          <button
            onClick={openModal}
            className="ml-1 grid size-7 shrink-0 place-items-center rounded-sm text-rail-texto-2 transition-colors duration-[140ms] hover:bg-rail hover:text-rail-texto"
            aria-label="Editar tasas"
          >
            <Pencil className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tasas de cambio"
        sub="La tasa manual sustituye a la automática hasta la próxima consulta."
        footer={
          <>
            <Btn
              cargando={busy}
              onClick={async () => {
                setBusy(true);
                const r = await fetchRatesFromApi();
                setBusy(false);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                } else toast.error(r.message);
              }}
            >
              <RefreshCw className="size-4" strokeWidth={1.75} /> Traer de API
            </Btn>
            <Btn className="ml-auto" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Btn>
            <Btn variant="amber" onClick={save}>
              Guardar
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-[0.9rem]">
          {SOURCES.map((x) => {
            const r = currentRate(s, x.key);
            return (
              <Field
                key={x.key}
                label={x.label}
                hint={
                  r ? `${r.automatic ? "Automática" : "Manual"} · ${dt(r.createdAt)}` : undefined
                }
              >
                <Input
                  className={inputCifraCls}
                  inputMode="decimal"
                  value={vals[x.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })}
                />
              </Field>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
