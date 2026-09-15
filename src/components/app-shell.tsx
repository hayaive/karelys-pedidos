import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  IcoAjustes,
  IcoAtajos,
  IcoChevron,
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
import { startSyncEngine } from "@/lib/sync/engine";
import type { Permission } from "@/lib/types";
import { SyncIndicator } from "./sync-indicator";
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

/** Ancho del rail en escritorio: expandido y colapsado (solo íconos). La
 *  banda de divisas fija al pie se alinea contra estas mismas constantes. */
const RAIL_ANCHO = 236;
const RAIL_ANCHO_COLAPSADO = 72;
const RAIL_COLAPSADO_KEY = "karelys.rail-colapsado";

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    loadFromDisk();
    setH(true);
  }, []);
  return h;
}

/** Preferencia de rail colapsado/expandido: por dispositivo, en localStorage. */
function useRailColapsado() {
  const [colapsado, setColapsado] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(RAIL_COLAPSADO_KEY) === "1") setColapsado(true);
  }, []);
  const alternar = () => {
    setColapsado((prev) => {
      const next = !prev;
      localStorage.setItem(RAIL_COLAPSADO_KEY, next ? "1" : "0");
      return next;
    });
  };
  return { colapsado, alternar };
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
  const { colapsado, alternar: alternarRail } = useRailColapsado();

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/login" });
  }, [hydrated, user, navigate]);

  /**
   * El motor de sync vive mientras haya una pantalla de la aplicación montada: el
   * ciclo de un minuto, el disparo al recuperar la conexión y la puesta al día al
   * volver a la pestaña. No se arranca en el login porque ahí todavía no hay sesión.
   *
   * Sólo en el cliente: `loadFromDisk` y localStorage no existen en el render del
   * servidor.
   */
  useEffect(() => {
    if (!hydrated) return;
    return startSyncEngine();
  }, [hydrated]);

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
      {/* ── Barra lateral: 236 px expandida, 72 px colapsada. El estado se
          guarda por dispositivo y el ancho transiciona con suavidad. ── */}
      <aside
        className="sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-[#2E251A] bg-[#16110B] transition-[width] duration-[220ms] ease-[var(--ease-menu)] lg:flex"
        style={{ width: colapsado ? RAIL_ANCHO_COLAPSADO : RAIL_ANCHO }}
      >
        {/* La marca del cliente: el sello encima, el nombre debajo y con permiso
            para partirse en dos líneas. En 236 px no cabe en una sola.
            Colapsada, sólo el sello se centra; el nombre vive en el tooltip. */}
        <div className={cn("pt-6", colapsado ? "flex flex-col items-center pb-4" : "px-5 pb-5")}>
          {colapsado ? (
            <div className="group relative flex w-full justify-center">
              <Logo size={32} />
              <EtiquetaFlotante>{s.company.name}</EtiquetaFlotante>
            </div>
          ) : (
            <>
              <Logo size={40} />
              <p
                className="mt-3 text-[17px] leading-[1.25] text-[#F2EADE]"
                style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600 }}
              >
                {s.company.name}
              </p>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto pb-2">
          {nav.map((n) => (
            <EnlaceRail
              key={n.to}
              to={n.to}
              label={n.label}
              icon={n.icon}
              active={isActive(pathname, n.to)}
              colapsado={colapsado}
            />
          ))}
        </nav>

        <div
          className={cn(
            "border-t border-[#2E251A]",
            colapsado ? "flex flex-col items-center gap-1 py-4" : "px-5 py-4",
          )}
        >
          {colapsado ? (
            <>
              <div className="group relative flex w-full justify-center py-1">
                <div className="grid size-8 place-items-center rounded-full border border-rail-linea bg-rail-2 text-[12px] font-[600] text-rail-texto-2">
                  <span aria-hidden>{iniciales(user.fullName)}</span>
                </div>
                <span className="sr-only">
                  {user.fullName} · {role?.name ?? "Sin rol"}
                </span>
                <EtiquetaFlotante>
                  {user.fullName} · {role?.name ?? "Sin rol"}
                </EtiquetaFlotante>
              </div>

              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                aria-label="Salir"
                className="group relative flex w-full items-center justify-center py-2 text-[#9B8D7B] transition-colors duration-[140ms] hover:text-[#C4B7A4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol/60"
              >
                <IcoSalir />
                <EtiquetaFlotante>Salir</EtiquetaFlotante>
              </button>

              <div className="group relative flex w-full justify-center pt-1 text-[#9B8D7B]">
                <SelloSol />
                <span className="sr-only">Sistema hecho por HAYAI, versión {VERSION}</span>
                <EtiquetaFlotante>HAYAI · v{VERSION}</EtiquetaFlotante>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* El botón de colapso: a caballo del borde, siempre visible. */}
        <button
          type="button"
          onClick={alternarRail}
          aria-label={colapsado ? "Expandir barra lateral" : "Contraer barra lateral"}
          aria-expanded={!colapsado}
          className="absolute -right-3 top-1/2 z-30 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-rail-linea bg-rail-2 text-rail-texto-2 shadow-2 transition-colors duration-[140ms] hover:bg-rail-linea hover:text-rail-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol/60"
        >
          <span
            aria-hidden
            className={cn(
              "[&>svg]:size-3 transition-transform duration-200",
              !colapsado && "rotate-180",
            )}
          >
            <IcoChevron />
          </span>
        </button>
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
              <SyncIndicator />
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

      {/* En pantalla grande la banda queda fija al pie, a la derecha del rail.
          El offset sigue el ancho real del aside en cada estado. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 hidden transition-[left] duration-[220ms] ease-[var(--ease-menu)] lg:block"
        style={{ left: colapsado ? RAIL_ANCHO_COLAPSADO : RAIL_ANCHO }}
      >
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

/** El módulo activo: fondo #2E251A, icono ámbar y un puntito ámbar a la derecha.
 *  Colapsado, el punto se vuelve una barrita ámbar contra el borde y la
 *  etiqueta se muestra al pasar el mouse o al enfocar con teclado. */
function EnlaceRail({
  to,
  label,
  icon: Icon,
  active,
  colapsado,
}: {
  to: string;
  label: string;
  icon: Icono;
  active: boolean;
  colapsado: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={colapsado ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center py-[0.55rem] text-[14px] transition-colors duration-[140ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol/60 focus-visible:ring-inset",
        colapsado ? "justify-center px-0" : "gap-3 px-5",
        active ? "bg-[#2E251A] text-[#F2EADE]" : "text-[#C4B7A4] hover:bg-[#1F1810]",
      )}
    >
      {active && colapsado && (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-sol" />
      )}
      <span className={cn("flex-none", active ? "text-sol" : "text-[#9B8D7B]")}>
        <Icon />
      </span>
      {!colapsado && <span className="min-w-0 flex-1">{label}</span>}
      {active && !colapsado && (
        <span aria-hidden className="size-1.5 flex-none rounded-full bg-sol" />
      )}
      {colapsado && <EtiquetaFlotante>{label}</EtiquetaFlotante>}
    </Link>
  );
}

/** La etiqueta flotante del rail colapsado: aparece a la derecha del ícono al
 *  pasar el mouse o al enfocar con teclado. Decorativa (el control ya trae su
 *  propio nombre accesible), así que se oculta del árbol de accesibilidad. */
function EtiquetaFlotante({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-rail-linea bg-rail-2 px-2.5 py-1 text-[12px] text-rail-texto opacity-0 shadow-2 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
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
