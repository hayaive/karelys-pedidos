import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IcoAlerta, IcoOjo, IcoOjoTachado } from "@/chasis/iconos";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { login, useSession } from "@/lib/auth";
import { Logo, useHydrated } from "@/components/app-shell";
import { Aviso, Btn, Field, Input } from "@/components/ui-kit";
import { useAppState } from "@/lib/store";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Karelys Delicias" },
      { name: "description", content: "Acceso al sistema de mostrador de Karelys Delicias." },
      { property: "og:title", content: "Iniciar sesión · Karelys Delicias" },
      {
        property: "og:description",
        content: "Acceso al sistema de mostrador de Karelys Delicias.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const hydrated = useHydrated();
  const { user } = useSession();
  const s = useAppState();
  const navigate = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Entrar contra el servidor. Sin red se cae al verificador de este dispositivo,
   * y el aviso lo dice: se está trabajando con la copia local, que es exactamente
   * lo que el negocio pidió (la caja abre aunque no haya internet).
   */
  async function submit() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const res = await login(u, p);
      if (!res.ok) {
        setErr(res.error ?? "No se pudo iniciar sesión");
        return;
      }
      if (res.mode === "offline" || res.mode === "local") {
        toast.warning("Sin conexión con el servidor", {
          description:
            "Entraste con los datos guardados en este equipo. Lo que registres se sincronizará al volver la conexión.",
          duration: 8000,
        });
      } else if (res.staleData) {
        toast.warning("No se pudo traer el estado del servidor", {
          description: "Se abre con la copia local; se reintentará en el próximo ciclo.",
        });
      }
      navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (hydrated && user) navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-sol-vela px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-7 shadow-2">
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size={56} />
            <div>
              <h1 className="marca text-[1.85rem] leading-tight">{s.company.name}</h1>
              {/* La voz: la frase que explica qué hace la pantalla. */}
              <p className="voz mt-[0.15rem] text-voz">Sistema de mostrador</p>
            </div>
          </div>
          <form
            className="mt-7 flex flex-col gap-[0.9rem]"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Usuario">
              <Input
                value={u}
                onChange={(e) => setU(e.target.value)}
                autoFocus
                autoComplete="username"
                disabled={busy}
              />
            </Field>
            <Field label="Contraseña">
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-sm text-texto-3 transition-colors duration-[140ms] hover:bg-sup-2 hover:text-texto"
                  aria-label="Mostrar contraseña"
                >
                  {show ? <IcoOjoTachado /> : <IcoOjo />}
                </button>
              </div>
            </Field>
            {err && (
              <Aviso tone="red" icon={IcoAlerta} title={err}>
                Revisa el usuario y la contraseña, o pídele acceso a un administrador.
              </Aviso>
            )}
            <Btn type="submit" variant="amber" size="lg" bloque cargando={busy}>
              Iniciar sesión
            </Btn>
          </form>
        </div>
        <p className="mt-5 text-center text-[0.75rem] text-texto-3">Powered by HAYAI</p>
      </div>
    </div>
  );
}
