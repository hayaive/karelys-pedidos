import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { IcoAlerta } from "@/chasis/iconos";
import { AppShell, PageHead } from "@/components/app-shell";
import { Aviso, Btn, Card, CardHead } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import { companyErrorText, updateCompany, useCompanyAccess } from "@/lib/sync/company";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  eventCombo,
  shortcutsOf,
  type ShortcutAction,
} from "@/lib/shortcuts";

export const Route = createFileRoute("/atajos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Atajos · Karelys Delicias" },
      { name: "description", content: "Atajos de teclado configurables del punto de venta." },
      { property: "og:title", content: "Atajos · Karelys Delicias" },
      {
        property: "og:description",
        content: "Atajos de teclado configurables del punto de venta.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <Atajos />
    </AppShell>
  ),
});

function Atajos() {
  const s = useAppState();
  const acceso = useCompanyAccess();
  const map = shortcutsOf(s.company);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  // Un solo flag para las dos acciones (cambiar una tecla o restaurar todas):
  // no tiene sentido permitir las dos a la vez, y así ambas quedan protegidas
  // contra doble clic mientras `updateCompany` está en vuelo.
  const [guardando, setGuardando] = useState(false);

  const bloqueado = acceso.mode === "blocked" || guardando;
  const motivo = acceso.mode === "blocked" ? acceso.reason : undefined;

  /**
   * Guarda por `updateCompany({ shortcuts })`, igual que Empresa e Impresión:
   * primero el servidor, y sólo si confirma, el estado local. `shortcuts` viaja
   * **completo** (no el parche de una sola tecla): `CompanyService.update` lo
   * reemplaza en bloque, así que mandar sólo la tecla que cambió borraría las
   * demás en el servidor.
   */
  async function save(action: ShortcutAction, combo: string) {
    if (bloqueado) return;
    const taken = SHORTCUT_ACTIONS.find((a) => a.key !== action && map[a.key] === combo);
    if (taken) {
      toast.error(`Esa tecla ya la usa "${taken.label}". Elige otra.`);
      return;
    }
    if (combo === "Escape") {
      toast.error("ESC está reservado para cerrar ventanas");
      return;
    }
    setGuardando(true);
    try {
      await updateCompany({ shortcuts: { ...map, [action]: combo } });
      setCapturing(null);
      toast.success("Atajo actualizado");
    } catch (err) {
      toast.error("No se pudo actualizar el atajo", { description: companyErrorText(err) });
    } finally {
      setGuardando(false);
    }
  }

  async function restaurar() {
    if (bloqueado) return;
    setGuardando(true);
    try {
      await updateCompany({ shortcuts: { ...DEFAULT_SHORTCUTS } });
      toast.success("Atajos restaurados");
    } catch (err) {
      toast.error("No se pudieron restaurar los atajos", { description: companyErrorText(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHead
        title="Atajos de teclado"
        sub="Asigna las teclas a tu manera. Una tecla no puede repetirse."
        action={
          <Btn
            cargando={guardando}
            disabled={acceso.mode === "blocked"}
            title={motivo}
            onClick={() => void restaurar()}
          >
            Restaurar por defecto
          </Btn>
        }
      />
      {acceso.mode === "blocked" && (
        <div className="mb-4">
          <Aviso tone="amber" icon={IcoAlerta}>
            {acceso.reason}
          </Aviso>
        </div>
      )}
      <Card className="max-w-2xl">
        <CardHead title="Punto de venta" />
        <div className="divide-y divide-border">
          {SHORTCUT_ACTIONS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div>
                <div className="text-sm">{a.label}</div>
                <div className="text-xs text-muted-foreground">{a.hint}</div>
              </div>
              <div className="flex items-center gap-2">
                {capturing === a.key ? (
                  <input
                    autoFocus
                    readOnly
                    value="Pulsa una tecla…"
                    onBlur={() => setCapturing(null)}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      if (bloqueado) return;
                      const combo = eventCombo(e.nativeEvent);
                      if (combo) void save(a.key, combo);
                    }}
                    className="num w-44 rounded-lg border border-sol bg-sup-2 px-2 py-1 text-center text-xs outline-none"
                  />
                ) : (
                  <kbd className="num rounded border border-border bg-sup-2 px-2 py-0.5 text-xs">
                    {map[a.key]}
                  </kbd>
                )}
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={bloqueado}
                  title={motivo}
                  onClick={() => setCapturing(capturing === a.key ? null : a.key)}
                >
                  {capturing === a.key ? "Cancelar" : "Cambiar"}
                </Btn>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm">Cerrar modal o panel</span>
            <kbd className="num rounded border border-border bg-sup-2 px-2 py-0.5 text-xs">ESC</kbd>
          </div>
        </div>
      </Card>
    </>
  );
}
