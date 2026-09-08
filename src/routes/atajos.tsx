import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { Btn, Card, CardHead } from "@/components/ui-kit";
import { mutate, useAppState } from "@/lib/store";
import { logAudit } from "@/lib/store";
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
  const map = shortcutsOf(s.company);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  function save(action: ShortcutAction, combo: string) {
    const taken = SHORTCUT_ACTIONS.find((a) => a.key !== action && map[a.key] === combo);
    if (taken) {
      toast.error(`Esa tecla ya la usa "${taken.label}". Elige otra.`);
      return;
    }
    if (combo === "Escape") {
      toast.error("ESC está reservado para cerrar ventanas");
      return;
    }
    mutate((st) => {
      st.company.shortcuts = { ...shortcutsOf(st.company), [action]: combo };
      logAudit("atajo_actualizado", "company", action);
    });
    setCapturing(null);
    toast.success("Atajo actualizado");
  }

  return (
    <>
      <PageHead
        title="Atajos de teclado"
        sub="Asigna las teclas a tu manera. Una tecla no puede repetirse."
        action={
          <Btn
            onClick={() => {
              mutate((st) => {
                st.company.shortcuts = { ...DEFAULT_SHORTCUTS };
              });
              toast.success("Atajos restaurados");
            }}
          >
            Restaurar por defecto
          </Btn>
        }
      />
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
                      const combo = eventCombo(e.nativeEvent);
                      if (combo) save(a.key, combo);
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
