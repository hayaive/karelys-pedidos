import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════
   Primitivos del Sistema Ámbar.
   Cada bloque traduce una pieza de design-system.html; la regla
   que lo gobierna va citada encima.
   ═══════════════════════════════════════════════════════════ */

/* ── Superficies ─────────────────────────────────────────────
   «La sombra dice esto flota encima. Una tarjeta que no flota
   lleva línea, no sombra.» */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-card", className)}>{children}</div>;
}

export function CardHead({
  title,
  action,
  sub,
  icon: Icon,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {/* Los iconos heredan el color del texto: nunca son ámbar fuera de un botón ámbar. */}
        {Icon && <Icon className="size-4 shrink-0 text-texto-2" strokeWidth={1.75} />}
        <div className="min-w-0">
          <h4 className="truncate text-[0.95rem] font-semibold">{title}</h4>
          {sub && <p className="truncate text-etiqueta text-texto-2">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Botón ───────────────────────────────────────────────────
   Ámbar para la acción principal, contorno para la alterna,
   fantasma para la terciaria, rojo sólo para anular y borrar.
   Un solo ámbar por vista. */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "amber" | "outline" | "ghost" | "danger" | "dark" | "link";
  size?: "sm" | "md" | "lg" | "xl";
  /** Cuadrado, para el botón que sólo lleva icono. */
  icono?: boolean;
  bloque?: boolean;
  cargando?: boolean;
};

export function Btn({
  variant = "outline",
  size = "md",
  icono,
  bloque,
  cargando,
  className,
  children,
  disabled,
  ...props
}: BtnProps) {
  const enlace = variant === "link";
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(
        "relative inline-flex items-center justify-center gap-[0.45rem] whitespace-nowrap rounded-md border border-transparent font-[550] leading-none",
        "transition-[background-color,border-color,transform,box-shadow] duration-[140ms] ease-out",
        "active:translate-y-px focus-visible:shadow-[var(--foco)] focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-[0.42]",
        !enlace && size === "sm" && "h-[1.95rem] rounded-sm px-[0.65rem] text-etiqueta",
        !enlace && size === "md" && "h-[2.45rem] px-[0.95rem] text-control",
        !enlace && size === "lg" && "h-[2.9rem] px-5 text-base",
        !enlace &&
          size === "xl" &&
          "h-[3.5rem] rounded-lg px-[1.6rem] text-[1.12rem] font-semibold",
        icono && "gap-0 px-0",
        icono && size === "sm" && "w-[1.95rem]",
        icono && size === "md" && "w-[2.45rem]",
        icono && size === "lg" && "w-[2.9rem]",
        bloque && "w-full",
        variant === "amber" &&
          "bg-sol text-noche shadow-[inset_0_-1px_0_rgba(22,17,11,.18)] hover:bg-sol-90",
        variant === "dark" &&
          "bg-noche text-[#FBF2E4] hover:bg-[#241B12] dark:bg-sup-3 dark:text-texto",
        variant === "outline" &&
          "border-linea-2 bg-transparent text-texto hover:border-texto-3 hover:bg-sup-2",
        variant === "ghost" && "bg-transparent text-texto-2 hover:bg-sup-2 hover:text-texto",
        variant === "danger" && "bg-rojo text-white hover:brightness-[0.94] dark:text-[#2B1913]",
        enlace && "h-auto p-0 text-sol-70 underline underline-offset-[3px]",
        cargando && "pointer-events-none text-transparent",
        className,
      )}
    >
      {children}
      {cargando && (
        <span
          aria-hidden
          className={cn(
            "girador absolute size-4",
            (variant === "dark" || variant === "danger") && "border-white/55 border-t-transparent",
          )}
        />
      )}
    </button>
  );
}

/** El girador suelto, para la carga que no vive dentro de un botón. */
export function Girador({ className }: { className?: string }) {
  return <span aria-hidden className={cn("girador inline-block size-[1.15rem]", className)} />;
}

/* ── Entradas ────────────────────────────────────────────────
   Etiqueta encima siempre. La ayuda va debajo y sólo aparece si
   de verdad ayuda; el error la sustituye. */

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.34rem]">
      <span className="text-etiqueta font-[550] text-texto">{label}</span>
      {children}
      {error ? (
        <span className="text-[0.79rem] text-rojo">{error}</span>
      ) : (
        hint && <span className="text-[0.79rem] text-texto-2">{hint}</span>
      )}
    </label>
  );
}

export const inputCls =
  "h-[2.45rem] w-full rounded-md border border-linea-2 bg-card px-[0.7rem] text-control text-texto outline-none transition-[border-color,box-shadow] duration-[140ms] placeholder:text-texto-3 hover:border-texto-3 focus:border-sol focus:shadow-[var(--foco)] disabled:cursor-not-allowed disabled:bg-sup-2 disabled:text-texto-3 read-only:bg-sup-2";

/** Campo de cifra: monoespaciada, tabular y alineada a la derecha. */
export const inputCifraCls = "num text-right text-[1.05rem] font-[550]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

const flechaSelect = {
  backgroundImage:
    "linear-gradient(45deg,transparent 50%,var(--texto-3) 50%),linear-gradient(135deg,var(--texto-3) 50%,transparent 50%)",
  backgroundPosition: "calc(100% - 1.05rem) 55%, calc(100% - 0.72rem) 55%",
  backgroundSize: "0.33rem 0.33rem, 0.33rem 0.33rem",
  backgroundRepeat: "no-repeat",
} as const;

export function Select({ style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{ ...flechaSelect, ...style }}
      className={cn(inputCls, "cursor-pointer appearance-none pr-8", props.className)}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        inputCls,
        "h-auto min-h-20 resize-y py-[0.55rem] leading-normal",
        props.className,
      )}
    />
  );
}

/* ── Dinero y cifras ─────────────────────────────────────────
   El dinero siempre en monoespaciada y alineado a la derecha. */

export function Cifra({
  children,
  size = "md",
  moneda,
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Prefijo de moneda: más pequeño y apagado que la cifra. */
  moneda?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num font-[550]",
        size === "sm" && "text-etiqueta",
        size === "md" && "text-[1.15rem]",
        size === "lg" && "text-[1.6rem] leading-[1.1]",
        size === "xl" && "text-dia font-semibold leading-[1.05]",
        className,
      )}
    >
      {moneda && (
        <span className="mr-[0.15em] text-[0.62em] font-medium text-texto-2">{moneda}</span>
      )}
      {children}
    </span>
  );
}

/* ── Etiquetas y chips ───────────────────────────────────────
   El punto de color va delante para que el estado se lea sin
   leer la palabra. El chip nunca se pulsa. */

export function Badge({
  tone = "neutral",
  liso,
  children,
}: {
  tone?: "neutral" | "amber" | "green" | "red" | "noche" | "hueco";
  /** Quita el punto: para chips que no son de estado. */
  liso?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-full border border-transparent px-[0.6rem] py-[0.32rem] text-chip font-[550] leading-none",
        tone === "neutral" && "bg-sup-3 text-texto-2",
        tone === "amber" && "border-sol-luz bg-sol-vela text-sol-70",
        tone === "green" && "border-verde-linea bg-verde-luz text-verde",
        tone === "red" && "border-rojo-linea bg-rojo-luz text-rojo",
        tone === "noche" &&
          "border-noche bg-noche text-[#F2E7D6] dark:border-linea-2 dark:bg-sup-3 dark:text-texto",
        tone === "hueco" && "border-linea-2 text-texto-2",
      )}
    >
      {!liso && <span aria-hidden className="size-[0.42rem] shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Contador: ámbar cuando cuenta trabajo pendiente, noche cuando sólo informa. */
export function Contador({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: "amber" | "noche";
}) {
  return (
    <span
      className={cn(
        "num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-[0.35rem] text-[0.72rem] font-[650]",
        tone === "amber"
          ? "bg-sol text-noche"
          : "bg-noche text-[#F2E7D6] dark:bg-sup-3 dark:text-texto",
      )}
    >
      {children}
    </span>
  );
}

/** Tecla: se muestra al lado de la acción que reemplaza, no en una leyenda aparte. */
export function Tecla({ children }: { children: ReactNode }) {
  return (
    <span className="num inline-flex h-[1.55rem] min-w-[1.55rem] items-center justify-center rounded-sm border border-b-2 border-linea-2 bg-card px-[0.4rem] text-[0.76rem] font-medium text-texto-2">
      {children}
    </span>
  );
}

export function Avatar({
  children,
  size = "md",
  tone = "sol",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "sol" | "noche";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-semibold",
        size === "sm" && "size-[1.7rem] text-[0.7rem]",
        size === "md" && "size-[2.2rem] text-[0.82rem]",
        size === "lg" && "size-12 text-[1.05rem]",
        tone === "sol" && "border-sol-luz bg-sol-vela text-sol-70",
        tone === "noche" &&
          "border-noche bg-noche text-[#F2E7D6] dark:border-linea-2 dark:bg-sup-3 dark:text-texto",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Retroalimentación ───────────────────────────────────────
   El aviso se queda en pantalla porque describe una condición,
   no un suceso. Siempre dice qué hacer a continuación. */

export function Aviso({
  tone = "neutral",
  title,
  children,
  icon: Icon,
}: {
  tone?: "neutral" | "amber" | "green" | "red";
  title?: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-[0.7rem] rounded-md border px-[0.9rem] py-[0.8rem]",
        tone === "neutral" && "border-border bg-sup-2",
        tone === "amber" && "border-sol-luz bg-sol-vela",
        tone === "green" && "border-verde-linea bg-verde-luz",
        tone === "red" && "border-rojo-linea bg-rojo-luz",
      )}
    >
      {Icon && (
        <Icon
          strokeWidth={1.75}
          className={cn(
            "mt-[0.1rem] size-4 shrink-0",
            tone === "neutral" && "text-texto-2",
            tone === "amber" && "text-sol-70",
            tone === "green" && "text-verde",
            tone === "red" && "text-rojo",
          )}
        />
      )}
      <div className="min-w-0">
        {title && <p className="text-[0.9rem] font-semibold">{title}</p>}
        {children && <div className="text-etiqueta text-texto-2">{children}</div>}
      </div>
    </div>
  );
}

/** Barra de progreso. Verde cuando mide algo ya cumplido. */
export function BarraProg({
  valor,
  tone = "amber",
  fina,
}: {
  valor: number;
  tone?: "amber" | "green";
  fina?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-sup-3", fina ? "h-[0.3rem]" : "h-2")}>
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-[400ms]",
          tone === "amber" ? "bg-sol" : "bg-verde",
        )}
        style={{ width: `${Math.max(0, Math.min(100, valor))}%` }}
      />
    </div>
  );
}

/* ── Lo que va encima ────────────────────────────────────────
   Título, cuerpo y pie. La acción principal a la derecha del
   pie, siempre en el mismo sitio. Esc cierra. */

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
  narrow,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  /** Pie de la ventana: la acción principal va a la derecha. */
  footer?: ReactNode;
  wide?: boolean;
  narrow?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Congela el scroll del fondo mientras la ventana está abierta.
  useEffect(() => {
    if (!open) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [open]);

  if (!open) return null;
  // Se monta en <body>: el chrome pegado crea bloque contenedor para un
  // fixed descendiente y la ventana quedaría anclada a la cabecera.
  return createPortal(
    <div
      className="velo-entra fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-noche/55 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "cajon-entra sm:vent-entra relative z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-3 sm:rounded-xl",
          wide ? "sm:max-w-[44rem]" : narrow ? "sm:max-w-[23rem]" : "sm:max-w-[30rem]",
        )}
      >
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-linea-2 sm:hidden"
        />
        <div className="flex shrink-0 items-start gap-[0.7rem] px-[1.2rem] pb-[0.8rem] pt-[1.05rem]">
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[1.05rem] font-semibold">{title}</h4>
            {sub && <p className="mt-[0.15rem] text-etiqueta text-texto-2">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid size-7 shrink-0 place-items-center rounded-sm text-texto-2 transition-colors hover:bg-sup-2 hover:text-texto"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[1.2rem] pb-[1.1rem]">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center gap-[0.6rem] border-t border-border bg-sup-2 px-[1.2rem] py-[0.85rem]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Vacío ───────────────────────────────────────────────────
   El vacío se diseña antes que el lleno. Vacío inicial y vacío
   por filtro son pantallas distintas. */

export function Empty({
  title,
  sub,
  action,
  icon: Icon,
  variant = "inicial",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  variant?: "inicial" | "filtro" | "error";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-[0.55rem] rounded-lg border px-6 py-10 text-center",
        variant === "error"
          ? "border-rojo-linea bg-rojo-luz"
          : "border-dashed border-linea-2 bg-card",
      )}
    >
      {Icon && (
        <span
          className={cn(
            "mb-[0.2rem] grid size-12 place-items-center rounded-full",
            variant === "inicial" && "bg-sol-vela text-sol-70",
            variant === "filtro" && "bg-sup-2 text-texto-3",
            variant === "error" && "border border-rojo-linea text-rojo",
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <h4 className="text-base font-semibold">{title}</h4>
      {sub && <p className="max-w-[38ch] text-[0.88rem] text-texto-2">{sub}</p>}
      {action}
    </div>
  );
}

/* ── Confirmación ────────────────────────────────────────────
   Sólo para lo que no se puede deshacer. El botón repite el
   verbo exacto, nunca dice «Aceptar». */

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger,
  verbo = "Confirmar",
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** El verbo exacto de la acción: «Anular», «Eliminar», «Cerrar caja». */
  verbo?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      narrow
      footer={
        <>
          <Btn onClick={onCancel}>Cancelar</Btn>
          <Btn className="ml-auto" variant={danger ? "danger" : "amber"} onClick={onConfirm}>
            {verbo}
          </Btn>
        </>
      }
    >
      <p className="text-etiqueta text-texto-2">{message}</p>
    </Modal>
  );
}
