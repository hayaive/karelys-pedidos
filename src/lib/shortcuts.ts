import { useEffect } from "react";
import { useAppState } from "./store";

export type ShortcutAction =
  | "new_sale"
  | "search_product"
  | "search_customer"
  | "open_orders"
  | "process_order"
  | "checkout";

export const SHORTCUT_ACTIONS: { key: ShortcutAction; label: string; hint: string }[] = [
  { key: "new_sale", label: "Nueva venta", hint: "Abre el módulo de venta" },
  { key: "search_product", label: "Buscar producto", hint: "Enfoca el buscador del catálogo" },
  { key: "search_customer", label: "Buscar / crear cliente", hint: "Abre el selector de clientes" },
  { key: "open_orders", label: "Abrir pedidos", hint: "Va a la lista de pedidos" },
  { key: "process_order", label: "Procesar pedido", hint: "Procesa el primer pedido pendiente" },
  { key: "checkout", label: "Cobrar", hint: "Abre el cobro de la venta actual" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  new_sale: "F1",
  search_product: "F2",
  search_customer: "F3",
  open_orders: "F4",
  process_order: "F5",
  checkout: "F6",
};

export const AVAILABLE_KEYS = [
  "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
  "Ctrl+1","Ctrl+2","Ctrl+3","Ctrl+4","Ctrl+5","Ctrl+6",
  "Alt+1","Alt+2","Alt+3","Alt+4","Alt+5","Alt+6",
  "Alt+V","Alt+P","Alt+C","Alt+B","Alt+K","Alt+N",
];

export function shortcutsOf(company: { shortcuts?: Record<string, string> } | undefined): Record<ShortcutAction, string> {
  return { ...DEFAULT_SHORTCUTS, ...((company?.shortcuts ?? {}) as Record<ShortcutAction, string>) };
}

export function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key.length === 1) key = key.toUpperCase();
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return "";
  parts.push(key);
  return parts.join("+");
}

export function useShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>) {
  const s = useAppState();
  const map = shortcutsOf(s.company);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const combo = eventCombo(e);
      if (!combo) return;
      for (const [action, fn] of Object.entries(handlers)) {
        if (fn && map[action as ShortcutAction] === combo) {
          e.preventDefault();
          fn();
          return;
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
}
