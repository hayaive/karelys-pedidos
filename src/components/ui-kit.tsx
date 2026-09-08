import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  alza,
  destacada,
}: {
  className?: string;
  children: ReactNode;
  /** Levanta la tarjeta al pasar el cursor: úsalo solo si la tarjeta es accionable. */
  alza?: boolean;
  /** Hairline ámbar superior para la tarjeta principal de la vista. */
  destacada?: boolean;
}) {
  return (
    <div
      className={cn(
        "lamina relative rounded-lg border border-border bg-card shadow-sutil",
        alza &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-linea-2 hover:shadow-alza",
        className,
      )}
    >
      {destacada && <span aria-hidden className="filo-sol absolute inset-x-0 top-0 h-px" />}
      {children}
    </div>
  );
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
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-sol-luz bg-sol-vela text-sol-70">
            <Icon className="size-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <h2
            className="truncate text-sm font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {title}
          </h2>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "amber" | "outline" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
};

export function Btn({ variant = "outline", size = "md", className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "amber" && "bg-sol text-noche shadow-sol hover:bg-sol-90 hover:shadow-flota",
        variant === "outline" &&
          "border border-border bg-card text-foreground shadow-sutil hover:border-linea-2 hover:bg-secondary",
        variant === "ghost" && "text-muted-foreground hover:bg-secondary hover:text-foreground",
        variant === "danger" && "bg-rojo text-white hover:opacity-90",
        variant === "dark" && "bg-noche text-rail-texto hover:opacity-90",
        className,
      )}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-texto-3">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-texto-3 hover:border-linea-2 focus:border-sol focus:ring-2 focus:ring-sol/30";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "h-auto py-2", props.className)} />;
}

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: "neutral" | "amber" | "green" | "red";
  /** Punto de estado a la izquierda: para estados vivos (pendiente, listo…). */
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-border bg-sup-2 text-texto-2",
        tone === "amber" && "border-sol-luz bg-sol-vela text-sol-70",
        tone === "green" && "border-verde-linea bg-verde-luz text-verde",
        tone === "red" && "border-rojo-linea bg-rojo-luz text-rojo",
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "neutral" && "bg-texto-3",
            tone === "amber" && "bg-sol",
            tone === "green" && "bg-verde",
            tone === "red" && "bg-rojo",
          )}
        />
      )}
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Congela el scroll del fondo mientras el diálogo está abierto.
  useEffect(() => {
    if (!open) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [open]);

  if (!open) return null;
  // Se monta en <body>: el header tiene backdrop-blur y sería el bloque contenedor
  // de un fixed descendiente, lo que recortaba y descuadraba el modal por arriba.
  return createPortal(
    <div
      className="velo fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-noche/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "sube flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-flota sm:brota sm:rounded-xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-linea-2 sm:hidden"
        />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <h3 className="voz truncate text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Empty({
  title,
  sub,
  action,
  icon: Icon,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      {Icon && (
        <span className="mb-1 grid size-11 place-items-center rounded-full border border-sol-luz bg-sol-vela text-sol-70">
          <Icon className="size-5" />
        </span>
      )}
      <p className="voz text-base text-foreground">{title}</p>
      {sub && <p className="max-w-sm text-sm text-muted-foreground">{sub}</p>}
      {action}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancelar</Btn>
        <Btn variant={danger ? "danger" : "amber"} onClick={onConfirm}>
          Confirmar
        </Btn>
      </div>
    </Modal>
  );
}
