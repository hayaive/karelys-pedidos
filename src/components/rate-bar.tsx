import { useState } from "react";
import { RefreshCw, Pencil } from "lucide-react";
import { useAppState } from "@/lib/store";
import { currentRate, fetchRatesFromApi, setRate } from "@/lib/business";
import { num, dt } from "@/lib/format";
import { Btn, Field, Input, Modal } from "./ui-kit";
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
    setVals(Object.fromEntries(SOURCES.map((x) => [x.key, String(currentRate(s, x.key)?.value ?? 0)])));
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
      <div className="flex w-full items-center justify-between gap-1 rounded-md border border-border bg-sup-2 px-1.5 py-1 lg:w-auto lg:justify-start">
        {SOURCES.map((x) => (
          <div key={x.key} className="px-1.5 leading-tight">
            <p className="text-[9px] uppercase tracking-wide text-texto-3">{x.label}</p>
            <p className="num text-xs font-medium text-foreground">{num(currentRate(s, x.key)?.value ?? 0)}</p>
          </div>
        ))}
        {can("manage_exchange_rates") && (
          <button
            onClick={openModal}
            className="ml-1 grid size-7 place-items-center rounded text-muted-foreground hover:bg-card hover:text-sol-70"
            aria-label="Editar tasas"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Tasas de cambio">
        <div className="space-y-3">
          {SOURCES.map((x) => {
            const r = currentRate(s, x.key);
            return (
              <Field
                key={x.key}
                label={x.label}
                hint={r ? `${r.automatic ? "Automática" : "Manual"} · ${dt(r.createdAt)}` : undefined}
              >
                <Input
                  className="num"
                  inputMode="decimal"
                  value={vals[x.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [x.key]: e.target.value })}
                />
              </Field>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Btn
            disabled={busy}
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
            <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} /> Traer de API
          </Btn>
          <div className="flex gap-2">
            <Btn onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn variant="amber" onClick={save}>
              Guardar
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
