import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  IcoAjustes,
  IcoAtajos,
  IcoCierre,
  IcoClientes,
  IcoFacturacion,
  IcoInicio,
  IcoInventario,
  IcoMasOpciones,
  IcoPedidos,
  IcoSalir,
  IcoVenta,
  type Icono,
} from "@/chasis/iconos";
import { BandaDivisas, SelloSol, VentanaMercado } from "@/chasis/banda";
import { VERSION } from "@/chasis/version";
import { cn } from "@/lib/utils";
import { loadFromDisk, useAppState } from "@/lib/store";
import { logout, useSession } from "@/lib/auth";
import { ThemeToggle } from "./theme";
import { longDate } from "@/lib/format";
import { useShortcuts } from "@/lib/shortcuts";
import type { Permission } from "@/lib/types";
import { Card } from "./ui-kit";

export const NAV: { to: string; label: string; icon: Icono; perm: Permission | null }[] = [
  { to: "/", label: "Inicio", icon: IcoInicio, perm: null },
  { to: "/venta", label: "Venta", icon: IcoVenta, perm: "create_sale" },
  { to: "/pedidos", label: "Pedidos", icon: IcoPedidos, perm: "view_orders" },
  { to: "/inventario", label: "Inventario", icon: IcoInventario, perm: "view_inventory" },
  { to: "/clientes", label: "Clientes", icon: IcoClientes, perm: "view_customers" },
  { to: "/facturacion", label: "Facturación", icon: IcoFacturacion, perm: "view_sales" },
  { to: "/cierre", label: "Ventas y cierre", icon: IcoCierre, perm: "close_cash" },
  { to: "/ajustes", label: "Ajustes", icon: IcoAjustes, perm: "manage_settings" },
];

/** En el teléfono sólo caben tres módulos: el resto vive en la hoja «Más». */
const MOVIL_DIRECTOS = ["/", "/venta", "/pedidos"];

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    loadFromDisk();
    setH(true);
  }, []);
  return h;
}

/** El sello del cliente. Sin logo propio, un círculo con borde ámbar y las iniciales. */
export function Logo({ size = 36 }: { size?: number }) {
  const s = useAppState();
  if (s.company.logoUrl)
    return (
      <img
        src={s.company.logoUrl}
        alt={s.company.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full border-2 border-sol text-sol"
      style={{
        width: size,
        height: size,
        fontFamily: "'Fraunces', Georgia, serif",
        fontWeight: 600,
        fontSize: size * 0.4,
      }}
    >
      {iniciales(s.company.name)}
    </div>
  );
}

export function AppShell({ children, requires }: { children: ReactNode; requires?: Permission }) {
  const hydrated = useHydrated();
  const { user, role, can } = useSession();
  const s = useAppState();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [hoja, setHoja] = useState(false);
  const [mercado, setMercado] = useState(false);

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/login" });
  }, [hydrated, user, navigate]);

  useEffect(() => setHoja(false), [pathname]);

  useShortcuts({
    new_sale: () => {
      if (can("create_sale")) navigate({ to: "/venta" });
    },
    open_orders: () => {
      if (can("view_orders")) navigate({ to: "/pedidos" });
    },
  });

  const nav = NAV.filter((n) => !n.perm || can(n.perm));
  const directos = nav.filter((n) => MOVIL_DIRECTOS.includes(n.to)).slice(0, 3);
  const enHoja = nav.filter((n) => !directos.some((d) => d.to === n.to));
  const allowed = !requires || can(requires);

  if (!hydrated)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Barra lateral: 236 px, nunca se contrae ── */}
      <aside className="sticky top-0 z-20 hidden h-screen w-[236px] shrink-0 flex-col border-r border-[#2E251A] bg-[#16110B] lg:flex">
        {/* La marca del cliente: el sello encima, el nombre debajo y con permiso
            para partirse en dos líneas. En 236 px no cabe en una sola. */}
        <div className="px-5 pb-5 pt-6">
          <Logo size={40} />
          <p
            className="mt-3 text-[17px] leading-[1.25] text-[#F2EADE]"
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600 }}
          >
            {s.company.name}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto pb-2">
          {nav.map((n) => (
            <EnlaceRail
              key={n.to}
              to={n.to}
              label={n.label}
              icon={n.icon}
              active={isActive(pathname, n.to)}
            />
          ))}
        </nav>

        <div className="border-t border-[#2E251A] px-5 py-4">
          <p className="mb-1 text-[13px] text-[#C4B7A4]">
            {user.fullName} <span className="text-[#9B8D7B]">· {role?.name ?? "Sin rol"}</span>
          </p>

          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-[#9B8D7B] transition-colors hover:text-[#C4B7A4]"
          >
            <IcoSalir /> Salir
          </button>

          <p className="mt-3 text-[10px] uppercase tracking-[0.08em] text-[#9B8D7B]">
            Sistema hecho por
          </p>
          <p
            className="mt-1 flex items-center gap-2 text-[#F2EADE]"
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: 13 }}
          >
            HAYAI
            <SelloSol />
          </p>
          <p
            className="mt-1 text-[11px] text-[#9B8D7B]"
            style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
          >
            v{VERSION}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[#2E251A] bg-[#16110B] text-rail-texto">
          <div className="flex items-center gap-3 px-3 py-2 sm:px-[1.6rem]">
            {/* En el teléfono la cabecera lleva la marca; el menú vive abajo. */}
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <Logo size={28} />
              <span
                className="min-w-0 truncate text-[15px] text-[#F2EADE]"
                style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600 }}
              >
                {s.company.name}
              </span>
            </div>
            <div className="hidden text-etiqueta text-[#C4B7A4] lg:block">{longDate()}</div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
          {/* En el teléfono la banda va debajo de la cabecera. */}
          <div className="lg:hidden">
            <BandaDivisas onMercado={() => setMercado(true)} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 pb-28 pt-5 sm:px-[1.6rem] lg:pb-[4.5rem]">
          {allowed ? (
            children
          ) : (
            <Card className="mx-auto mt-10 max-w-md p-6 text-center">
              <h2 className="text-pantalla">Sin acceso</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu rol {role ? `“${role.name}”` : ""} no tiene permiso para ver esta sección.
                Solicítalo a un administrador.
              </p>
            </Card>
          )}
        </main>
      </div>

      {/* En pantalla grande la banda queda fija al pie, a la derecha del rail. */}
      <div className="fixed inset-x-0 bottom-0 z-20 hidden lg:left-[236px] lg:block">
        <BandaDivisas onMercado={() => setMercado(true)} />
      </div>

      {/* ── Barra inferior del teléfono: tres módulos y «Más» ── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {directos.map((n) => (
          <BotonMovil
            key={n.to}
            to={n.to}
            label={n.label}
            icon={n.icon}
            active={isActive(pathname, n.to)}
          />
        ))}
        <BotonMovil
          label="Más"
          icon={IcoMasOpciones}
          active={hoja || enHoja.some((n) => isActive(pathname, n.to))}
          onClick={() => setHoja(true)}
        />
      </nav>

      {/* La hoja con el resto de los módulos */}
      {hoja && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setHoja(false)}>
          <div className="velo-entra absolute inset-0 bg-noche/55" />
          <div
            className="cajon-entra absolute inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-3"
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden className="mx-auto mt-2 block h-1 w-9 rounded-full bg-linea-2" />
            <div className="p-2">
              {enHoja.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[0.93rem] transition-colors duration-[140ms]",
                    isActive(pathname, n.to)
                      ? "bg-sol-vela font-[550] text-sol-70"
                      : "text-texto hover:bg-sup-2",
                  )}
                >
                  <n.icon />
                  {n.label}
                </Link>
              ))}
              <Link
                to="/atajos"
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[0.93rem] text-texto transition-colors duration-[140ms] hover:bg-sup-2"
              >
                <IcoAtajos />
                Atajos de teclado
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[0.93rem] text-texto-2 transition-colors duration-[140ms] hover:bg-sup-2"
              >
                <IcoSalir />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <VentanaMercado open={mercado} onClose={() => setMercado(false)} />
    </div>
  );
}

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

/** El módulo activo: fondo #2E251A, icono ámbar y un puntito ámbar a la derecha. */
function EnlaceRail({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: Icono;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-5 py-[0.55rem] text-[14px] transition-colors duration-[140ms]",
        active ? "bg-[#2E251A] text-[#F2EADE]" : "text-[#C4B7A4] hover:bg-[#1F1810]",
      )}
    >
      <span className={cn("flex-none", active ? "text-sol" : "text-[#9B8D7B]")}>
        <Icon />
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {active && <span aria-hidden className="size-1.5 flex-none rounded-full bg-sol" />}
    </Link>
  );
}

function BotonMovil({
  to,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  to?: string;
  label: string;
  icon: Icono;
  active: boolean;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span aria-hidden className={cn("absolute inset-x-5 top-0 h-0.5", active && "bg-sol")} />
      <Icon />
      <span className="text-[0.7rem]">{label}</span>
    </>
  );
  const clase = cn(
    "relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 transition-colors duration-[140ms]",
    active ? "font-[550] text-sol-70" : "text-texto-2",
  );
  if (to)
    return (
      <Link to={to} className={clase}>
        {contenido}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={clase}>
      {contenido}
    </button>
  );
}

export function PageHead({
  title,
  sub,
  dato,
  action,
}: {
  title: string;
  /** La voz del sistema: la frase que explica qué hace la pantalla. */
  sub?: string;
  /** Cifras de contexto. Nunca van en Tinta: la voz no cuenta cosas. */
  dato?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-4">
      <div className="min-w-0">
        <h1 className="text-pantalla">{title}</h1>
        {sub && <p className="voz mt-[0.15rem] max-w-[56ch] text-voz leading-snug">{sub}</p>}
        {dato && <p className="num mt-[0.2rem] text-etiqueta text-texto-2">{dato}</p>}
      </div>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? "")
    .join("")
    .toUpperCase();
}
