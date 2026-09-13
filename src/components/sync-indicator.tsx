import { useState } from "react";
import { IcoRecargar } from "@/chasis/iconos";
import { cn } from "@/lib/utils";
import { syncNow, useSyncStatus, type SyncPhase } from "@/lib/sync/engine";

/**
 * Estado de la sincronización, en la cabecera.
 *
 * Lo que el cajero necesita saber es una sola cosa: **si lo que acaba de registrar
 * ya está a salvo o todavía no**. Por eso el indicador no muestra detalles del
 * protocolo, sino tres situaciones y un número:
 *
 *   · al día        — no hay nada pendiente
 *   · N pendientes  — hay ventas o abonos esperando para subir
 *   · sin conexión  — el servidor no responde (y la caja sigue funcionando)
 *
 * Es un botón: pulsarlo fuerza un ciclo, que es lo que uno intenta hacer cuando ve
 * "sin conexión" y sabe que el wifi ya volvió. En pantalla estrecha se queda sólo
 * el punto de color y el número, que es lo que de verdad no puede faltar.
 *
 * Vive sobre la cabecera oscura del chasis, así que usa su paleta (#C4B7A4 /
 * #9B8D7B / #2E251A) en lugar de los tonos de superficie clara.
 */
export function SyncIndicator() {
  const status = useSyncStatus();
  const [forcing, setForcing] = useState(false);

  // Una build sin backend no debe mostrar un indicador de algo que no existe.
  if (status.phase === "disabled") return null;

  const busy = forcing || status.phase === "syncing" || status.bootstrapping;
  const look = appearance(status.phase, status.pending, status.bootstrapping);

  async function force() {
    if (busy) return;
    setForcing(true);
    try {
      await syncNow("manual");
    } finally {
      setForcing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void force()}
      disabled={busy}
      title={tooltip(status.lastSyncAt, status.lastError)}
      aria-label={`Sincronización: ${look.label}. Pulsa para sincronizar ahora.`}
      className={cn(
        "inline-flex h-[1.85rem] shrink-0 items-center gap-[0.4rem] rounded-full border px-[0.6rem]",
        "text-[0.72rem] font-[550] leading-none transition-colors duration-[140ms]",
        "focus-visible:shadow-[var(--foco)] focus-visible:outline-none disabled:pointer-events-none",
        "border-[#2E251A] bg-[#1F1810] text-[#C4B7A4] hover:border-[#3C3024] hover:text-[#F2EADE]",
      )}
    >
      {busy ? (
        <span aria-hidden className="girador size-[0.7rem] border-[#9B8D7B] border-t-transparent" />
      ) : (
        <span aria-hidden className={cn("size-[0.45rem] shrink-0 rounded-full", look.dot)} />
      )}
      <span className="hidden sm:inline">{busy ? look.busyLabel : look.label}</span>
      {status.pending > 0 && (
        <span className="num text-[#F2EADE] sm:hidden">{status.pending}</span>
      )}
      {!busy && status.phase !== "syncing" && (
        <span aria-hidden className="hidden text-[#9B8D7B] lg:inline">
          <IcoRecargar />
        </span>
      )}
    </button>
  );
}

interface Appearance {
  label: string;
  busyLabel: string;
  dot: string;
}

function appearance(phase: SyncPhase, pending: number, bootstrapping: boolean): Appearance {
  const busyLabel = bootstrapping ? "Cargando datos…" : "Sincronizando…";

  switch (phase) {
    case "synced":
      return { label: "Al día", busyLabel, dot: "bg-verde" };
    case "pending":
    case "syncing":
      return {
        label: pending === 1 ? "1 pendiente" : `${pending} pendientes`,
        busyLabel,
        dot: "bg-sol",
      };
    case "offline":
      return {
        label: pending > 0 ? `Sin conexión · ${pending}` : "Sin conexión",
        busyLabel,
        dot: "bg-[#9B8D7B]",
      };
    // Se entró sin red: se está registrando todo, pero para subirlo hace falta
    // iniciar sesión con conexión. Es importante que no se lea como "al día".
    case "needs-auth":
      return {
        label: pending > 0 ? `Sin subir · ${pending}` : "Sesión sin conexión",
        busyLabel,
        dot: "bg-sol",
      };
    case "error":
      return { label: "Error de sincronización", busyLabel, dot: "bg-rojo" };
    case "local":
    default:
      return { label: "Sólo local", busyLabel, dot: "bg-[#9B8D7B]" };
  }
}

function tooltip(lastSyncAt?: string, lastError?: string): string {
  const parts: string[] = [];
  if (lastSyncAt) {
    const d = new Date(lastSyncAt);
    parts.push(
      `Última sincronización: ${d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}`,
    );
  } else {
    parts.push("Todavía no se ha sincronizado");
  }
  if (lastError) parts.push(lastError);
  parts.push("Pulsa para sincronizar ahora");
  return parts.join(" · ");
}
