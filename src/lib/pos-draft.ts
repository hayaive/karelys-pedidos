/**
 * Borrador de trabajo en curso del mostrador (Venta directa / Nuevo pedido).
 *
 * Vive en su propia clave de localStorage, **fuera** de AppState: es trabajo
 * a medio hacer de este equipo en este dispositivo, no un dato del negocio
 * que deba sincronizarse (ver lib/sync/*). Por eso nunca pasa por
 * `mutate`/`getState` de lib/store.
 *
 * Un borrador por modo ("sale" | "order") y por usuario de la sesión: si dos
 * cajeros comparten el mismo equipo, cada uno conserva el suyo.
 */
import { defaultPriceType, repriceLine } from "./business";
import type { AppState, LineItem } from "./types";

export type PosDraftMode = "sale" | "order";

export interface PosDraftDeposit {
  on: boolean;
  methodId: string;
  amount: string;
  reference: string;
}

export interface PosDraft {
  items: LineItem[];
  customerId: string | null;
  customerName: string | null;
  note: string;
  priceTypeId: string;
  /** Sólo tiene sentido en modo "order" (abono adelantado). */
  deposit?: PosDraftDeposit;
}

function draftKey(mode: PosDraftMode, userId: string | null) {
  return `karelys.posDraft.${mode}.${userId ?? "anon"}`;
}

/**
 * Clave estable de una línea (mismo criterio que `add()` en components/pos.tsx
 * usa para detectar duplicados al agregar). Vive aquí, no en pos.tsx, para no
 * mezclar un helper puro con el archivo de componentes (evita el aviso de
 * Fast Refresh) y para poder compartirla también con pedidos.tsx. Sirve para
 * asociar el texto que se está tipeando en el campo de cantidad con su línea
 * aunque el arreglo se reordene, se fusione o se elimine otra línea mientras
 * se edita.
 */
export function lineKeyOf(i: LineItem) {
  return i.productId + "|" + i.priceTypeId + "|" + (i.customization ?? "");
}

/** Lectura tolerante: cualquier localStorage bloqueado o JSON corrupto se lee como "no hay borrador". */
export function loadDraft(mode: PosDraftMode, userId: string | null): PosDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(mode, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PosDraft> | null;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      customerId: parsed.customerId ?? null,
      customerName: parsed.customerName ?? null,
      note: parsed.note ?? "",
      priceTypeId: parsed.priceTypeId ?? "",
      deposit: parsed.deposit,
    };
  } catch {
    return null;
  }
}

export function saveDraft(mode: PosDraftMode, userId: string | null, draft: PosDraft) {
  try {
    localStorage.setItem(draftKey(mode, userId), JSON.stringify(draft));
  } catch {
    /* cuota llena o localStorage no disponible: el borrador simplemente no persiste */
  }
}

export function clearDraft(mode: PosDraftMode, userId: string | null) {
  try {
    localStorage.removeItem(draftKey(mode, userId));
  } catch {
    /* noop */
  }
}

/** Un borrador vacío (sin líneas, cliente, nota ni abono) no vale la pena mostrar ni conservar. */
export function draftHasContent(
  draft: Pick<PosDraft, "items" | "customerId" | "note" | "deposit"> | null,
): boolean {
  if (!draft) return false;
  return (
    draft.items.length > 0 || !!draft.customerId || draft.note.trim() !== "" || !!draft.deposit?.on
  );
}

export interface RevalidatedDraft {
  items: LineItem[];
  customerId: string | null;
  customerName: string | null;
  note: string;
  priceTypeId: string;
  deposit: PosDraftDeposit;
  /** Líneas quitadas por producto inexistente o inactivo. */
  removedCount: number;
  /** true si algún precio (USD o Bs fijo) cambió respecto al que traía el borrador. */
  pricesChanged: boolean;
  /** true si el cliente guardado ya no existe/está inactivo y se volvió consumidor final. */
  customerReset: boolean;
}

/**
 * Revalida un borrador contra el catálogo/clientes/tipos de precio vigentes
 * al montar el POS. Nunca confía en lo guardado: el borrador pudo quedar
 * viejo por días (producto desactivado, cliente eliminado, precio subido).
 */
export function revalidateDraft(s: AppState, draft: PosDraft): RevalidatedDraft {
  let pricesChanged = false;
  let removedCount = 0;
  const items: LineItem[] = [];
  for (const it of draft.items) {
    const p = s.products.find((x) => x.id === it.productId);
    if (!p || !p.active) {
      removedCount++;
      continue;
    }
    if (it.bsOnly) {
      // Las líneas bsOnly no pasan por repriceLine (no tienen tipo de
      // precio): su precio vigente es el bsPrice actual del producto.
      const unitPriceBs = p.bsPrice ?? 0;
      if (unitPriceBs !== it.unitPriceBs) pricesChanged = true;
      items.push({ ...it, unitPriceBs });
      continue;
    }
    const repriced = repriceLine(s, it, it.priceTypeId);
    if (repriced.unitPriceUsd !== it.unitPriceUsd) pricesChanged = true;
    items.push(repriced);
  }

  let customerId = draft.customerId;
  let customerName = draft.customerName;
  let customerReset = false;
  if (customerId) {
    const c = s.customers.find((x) => x.id === customerId && x.active);
    if (!c) {
      customerId = null;
      customerName = null;
      customerReset = true;
    } else {
      customerName = c.name;
    }
  }

  const priceTypeId = s.priceTypes.some((p) => p.id === draft.priceTypeId)
    ? draft.priceTypeId
    : (defaultPriceType(s)?.id ?? draft.priceTypeId);

  const deposit: PosDraftDeposit = draft.deposit
    ? {
        ...draft.deposit,
        on:
          draft.deposit.on &&
          s.paymentMethods.some((m) => m.id === draft.deposit!.methodId && m.active),
      }
    : { on: false, methodId: "", amount: "", reference: "" };

  return {
    items,
    customerId,
    customerName,
    note: draft.note,
    priceTypeId,
    deposit,
    removedCount,
    pricesChanged,
    customerReset,
  };
}
