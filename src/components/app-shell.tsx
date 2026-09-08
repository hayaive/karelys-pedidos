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
import { Card } from "./ui-kit";

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
      className="grid shrink-0 place-items-center rounded-md bg-sol font-semibold text-noche"
      style={{ width: size, height: size, fontFamily: "var(--font-voz)", fontSize: size * 0.42 }}
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
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Cargando…</div>;
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-rail-linea bg-rail lg:flex">
        <div className="flex items-center gap-3 border-b border-rail-linea px-4 py-4">
          <Logo />
          <div className="min-w-0">
            <p className="voz truncate text-sm text-rail-texto">{s.company.name}</p>
            <p className="text-[11px] text-rail-texto-2">Sistema de mostrador</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map((n) => (
            <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={isActive(pathname, n.to)} />
          ))}
        </nav>
        <div className="border-t border-rail-linea p-3">
          <p className="truncate text-xs text-rail-texto">{user.fullName}</p>
          <p className="truncate text-[11px] text-rail-texto-2">{role?.name ?? "Sin rol"}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="inline-flex flex-1 items-center gap-2 rounded-md border border-rail-linea px-2.5 py-1.5 text-xs text-rail-texto-2 transition-colors hover:text-rail-texto"
            >
              <LogOut className="size-3.5" /> Salir
            </button>
          </div>
          <p className="mt-3 text-[10px] tracking-wide text-rail-texto-2">Powered by HAYAI</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
            <button
              className="grid size-9 shrink-0 place-items-center rounded-md border border-border lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="size-4" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <Logo size={28} />
              <span className="voz truncate text-sm">{s.company.name}</span>
            </div>
            <div className="hidden text-xs text-muted-foreground lg:block">{longDate()}</div>
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

        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8">
          {allowed ? (
            children
          ) : (
            <Card className="mx-auto mt-10 max-w-md p-6 text-center">
              <h2 className="voz text-lg">Sin acceso</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu rol {role ? `“${role.name}”` : ""} no tiene permiso para ver esta sección. Solicítalo a un
                administrador.
              </p>
            </Card>
          )}
        </main>
      </div>

      {/* Nav móvil inferior */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card lg:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, mobileNav.length)}, minmax(0,1fr))` }}
      >
        {mobileNav.map((n) => {
          const active = isActive(pathname, n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[10px]",
                active ? "text-sol-70" : "text-muted-foreground",
              )}
            >
              <n.icon className={cn("size-5", active && "text-sol")} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-noche/50" />
          <div
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-rail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-rail-linea px-4 py-4">
              <Logo />
              <p className="voz text-sm text-rail-texto">{s.company.name}</p>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {nav.map((n) => (
                <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={isActive(pathname, n.to)} />
              ))}
            </nav>
            <div className="border-t border-rail-linea p-3">
              <button
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                className="inline-flex items-center gap-2 text-xs text-rail-texto-2"
              >
                <LogOut className="size-3.5" /> Cerrar sesión
              </button>
              <p className="mt-3 text-[10px] text-rail-texto-2">Powered by HAYAI</p>
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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-rail-2 text-rail-texto" : "text-rail-texto-2 hover:bg-rail-2 hover:text-rail-texto",
      )}
    >
      <Icon className={cn("size-4", active && "text-sol")} />
      {label}
    </Link>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="voz text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
