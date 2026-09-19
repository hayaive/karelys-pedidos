import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { POS } from "@/components/pos";
import { shortcutsOf } from "@/lib/shortcuts";
import { useAppState } from "@/lib/store";

export const Route = createFileRoute("/venta")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Venta · Karelys Delicias" },
      {
        name: "description",
        content: "Punto de venta: catálogo, carrito, multipagos y ticket 58mm.",
      },
      { property: "og:title", content: "Venta · Karelys Delicias" },
      {
        property: "og:description",
        content: "Punto de venta: catálogo, carrito, multipagos y ticket 58mm.",
      },
    ],
  }),
  component: () => (
    <AppShell requires="create_sale">
      <Venta />
    </AppShell>
  ),
});

function Venta() {
  const sc = shortcutsOf(useAppState().company);
  // El encabezado lo pinta el POS: así "Limpiar todo" queda junto al título.
  return (
    <POS
      head={{
        title: "Venta",
        sub: `Selecciona productos y cobra. ${sc.search_product} buscar · ${sc.search_customer} cliente · ${sc.checkout} cobrar`,
      }}
    />
  );
}
