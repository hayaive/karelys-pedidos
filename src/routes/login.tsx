import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login, useSession } from "@/lib/auth";
import { Logo, useHydrated } from "@/components/app-shell";
import { Btn, Field, Input } from "@/components/ui-kit";
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

  useEffect(() => {
    if (hydrated && user) navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-sol-vela px-4">
      {/* Luz de horno: dos focos cálidos detrás de la tarjeta */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_22rem_at_50%_-8%,rgba(239,157,37,0.35),transparent_65%),radial-gradient(30rem_20rem_at_15%_110%,rgba(84,40,37,0.16),transparent_60%)]"
      />
      <div className="entra relative w-full max-w-sm">
        <div className="lamina relative overflow-hidden rounded-xl border border-border bg-card p-7 shadow-flota">
          <span aria-hidden className="filo-sol absolute inset-x-0 top-0 h-0.5" />
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size={56} />
            <div>
              <h1 className="voz text-2xl">{s.company.name}</h1>
              <p className="rotulo mt-1">Sistema de mostrador</p>
            </div>
          </div>
          <form
            className="mt-7 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const res = login(u, p);
              if (!res.ok) setErr(res.error!);
              else navigate({ to: "/" });
            }}
          >
            <Field label="Usuario">
              <Input
                value={u}
                onChange={(e) => setU(e.target.value)}
                autoFocus
                autoComplete="username"
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
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Mostrar contraseña"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {err && (
              <p className="rounded-md border border-rojo-linea bg-rojo-luz px-3 py-2 text-xs text-rojo">
                {err}
              </p>
            )}
            <Btn type="submit" variant="amber" size="lg" className="w-full">
              Iniciar sesión
            </Btn>
          </form>
        </div>
        <p className="mt-5 text-center text-[11px] tracking-wide text-texto-3">Powered by HAYAI</p>
      </div>
    </div>
  );
}
