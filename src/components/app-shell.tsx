import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Boxes,
  CalendarClock,
  Home,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadFromDisk, useAppState } from "@/lib/store";
import { logout, useSession } from "@/lib/auth";
import { ThemeToggle } from "./theme";
import { RateBar } from "./rate-bar";
import { longDate } from "@/lib/format";
import { useShortcuts } from "@/lib/shortcuts";
import type { Permission } from "@/lib/types";
import { Avatar, Card } from "./ui-kit";

export const NAV: { to: string; label: string; icon: typeof Home; perm: Permission | null }[] = [
  { to: "/", label: "Inicio", icon: Home, perm: null },
  { to: "/venta", label: "Venta", icon: ShoppingCart, perm: "create_sale" },
  { to: "/pedidos", label: "Pedidos", icon: CalendarClock, perm: "view_orders" },
  { to: "/inventario", label: "Inventario", icon: Boxes, perm: "view_inventory" },
  { to: "/clientes", label: "Clientes", icon: Users, perm: "view_customers" },
  { to: "/facturacion", label: "Facturación", icon: Receipt, perm: "view_sales" },
  { to: "/cierre", label: "Ventas y cierre", icon: Wallet, perm: "close_cash" },
  { to: "/ajustes", label: "Ajustes", icon: Settings, perm: "manage_settings" },
];

const MOBILE_PATHS = ["/", "/venta", "/pedidos", "/inventario", "/clientes"];

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    loadFromDisk();
    setH(true);
  }, []);
  return h;
}

export function Logo({ size = 36 }: { size?: number }) {
  const s = useAppState();
  const initials = "KD";
  if (s.company.logoUrl)
    return (
      <img
        src={s.company.logoUrl}
        alt={s.company.name}
        style={{ width: size, height: size }}
        className="rounded-md object-cover"
      />
    );
  return (
    <div
      className="marca grid shrink-0 place-items-center rounded-md bg-sol text-noche"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </div>
  );
}

export function AppShell({ children, requires }: { children: ReactNode; requires?: Permission }) {
  const hydrated = useHydrated();
  const { user, role, can } = useSession();
  const s = useAppState();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/login" });
  }, [hydrated, user, navigate]);

  useEffect(() => setOpen(false), [pathname]);

  useShortcuts({
    new_sale: () => {
      if (can("create_sale")) navigate({ to: "/venta" });
    },
    open_orders: () => {
      if (can("view_orders")) navigate({ to: "/pedidos" });
    },
  });

  const nav = NAV.filter((n) => !n.perm || can(n.perm));
  const mobileNav = nav.filter((n) => MOBILE_PATHS.includes(n.to));
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
      {/* Sidebar desktop */}
      <aside className="sticky top-0 z-20 hidden h-screen w-[236px] shrink-0 flex-col border-r border-rail-linea bg-rail lg:flex">
        <div className="flex items-center gap-[0.55rem] px-[1.15rem] pb-[1.1rem] pt-5">
          <Logo size={32} />
          <div className="min-w-0">
            {/* En Noche la marca se aclara: Tinta no se lee sobre fondo oscuro. */}
            <p className="marca truncate text-[1.22rem] leading-tight text-[#F6E7CE]">
              {s.company.name}
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto pb-2">
          <p className="rotulo px-[1.15rem] pb-[0.2rem] pt-[0.9rem] text-rail-texto-2">Operación</p>
          {nav.map((n) => (
            <SideLink
              key={n.to}
              to={n.to}
              label={n.label}
              icon={n.icon}
              active={isActive(pathname, n.to)}
            />
          ))}
        </nav>
        <div className="border-t border-rail-linea px-[1.15rem] py-4">
          <div className="flex items-center gap-[0.6rem]">
            <Avatar size="sm" tone="noche" className="border-rail-linea bg-rail-2 text-sol">
              {iniciales(user.fullName)}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-etiqueta font-[550] text-rail-texto">{user.fullName}</p>
              <p className="truncate text-[0.75rem] text-rail-texto-2">{role?.name ?? "Sin rol"}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="mt-[0.7rem] inline-flex w-full items-center gap-2 rounded-md border border-rail-linea px-[0.7rem] py-[0.4rem] text-[0.82rem] text-rail-texto-2 transition-colors duration-[140ms] hover:bg-rail-2 hover:text-rail-texto"
          >
            <LogOut className="size-4" strokeWidth={1.75} /> Salir
          </button>
          <p className="mt-3 text-[0.75rem] text-rail-texto-2">Powered by HAYAI</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-rail-linea bg-rail text-rail-texto">
          <div className="flex flex-wrap items-center gap-[0.6rem] px-3 py-[0.62rem] sm:gap-4 sm:px-[1.6rem]">
            <button
              className="grid size-9 shrink-0 place-items-center rounded-md border border-rail-linea text-rail-texto-2 transition-colors duration-[140ms] hover:bg-rail-2 hover:text-rail-texto lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="size-4" strokeWidth={1.75} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <Logo size={28} />
              <span className="marca truncate text-[1.05rem] text-[#F6E7CE]">{s.company.name}</span>
            </div>
            <div className="hidden text-etiqueta text-rail-texto-2 lg:block">{longDate()}</div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="hidden lg:block">
                <RateBar />
              </div>
              <ThemeToggle />
            </div>
          </div>
          <div className="overflow-x-auto px-3 pb-2 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <RateBar />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-[1.6rem] lg:pb-10">
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

      {/* Nav móvil inferior */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, mobileNav.length)}, minmax(0,1fr))` }}
      >
        {mobileNav.map((n) => {
          const active = isActive(pathname, n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 text-[0.7rem] transition-colors duration-[140ms]",
                active ? "font-[550] text-texto" : "text-texto-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-5 top-0 h-0.5",
                  active ? "bg-sol" : "bg-transparent",
                )}
              />
              <n.icon className="size-5" strokeWidth={1.75} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="velo-entra absolute inset-0 bg-noche/55" />
          <div
            className="hoja-entra absolute inset-y-0 left-0 z-50 flex w-[236px] flex-col bg-rail shadow-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-[0.55rem] px-[1.15rem] pb-[1.1rem] pt-5">
              <Logo size={32} />
              <p className="marca truncate text-[1.22rem] text-[#F6E7CE]">{s.company.name}</p>
            </div>
            <nav className="flex-1 overflow-y-auto pb-2">
              {nav.map((n) => (
                <SideLink
                  key={n.to}
                  to={n.to}
                  label={n.label}
                  icon={n.icon}
                  active={isActive(pathname, n.to)}
                />
              ))}
            </nav>
            <div className="border-t border-rail-linea px-[1.15rem] py-4">
              <button
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                className="inline-flex items-center gap-2 text-[0.82rem] text-rail-texto-2 transition-colors duration-[140ms] hover:text-rail-texto"
              >
                <LogOut className="size-4" strokeWidth={1.75} /> Cerrar sesión
              </button>
              <p className="mt-3 text-[0.75rem] text-rail-texto-2">Powered by HAYAI</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function SideLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-[0.6rem] border-l-2 px-[1.15rem] py-[0.42rem] text-[0.92rem] transition-[color,background-color] duration-[140ms]",
        active
          ? "border-sol bg-rail-2 text-white"
          : "border-transparent text-rail-texto-2 hover:bg-rail-2 hover:text-rail-texto",
      )}
    >
      <Icon className="size-[1.15em]" strokeWidth={1.75} />
      {label}
    </Link>
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
