import { useEffect, useMemo, useState } from "react";
import {
  IcoBuscar,
  IcoCerrar,
  IcoMas,
  IcoMenos,
  IcoPapelera,
  IcoPersonaMas,
  IcoVenta,
} from "@/chasis/iconos";
import { toast } from "sonner";
import { useAppState } from "@/lib/store";
import {
  commonPriceTypeId,
  createOrder,
  createSale,
  defaultPriceType,
  itemsTotals,
  lineBs,
  mergeLines,
  orderBalance,
  priceOf,
  repriceLine,
  unitBs,
} from "@/lib/business";
import { upsertCustomer } from "@/lib/business";
import { useMoney } from "@/hooks/use-money";
import type { Money } from "@/lib/money";
import { bs, num, parseAmount, usd, validCedula } from "@/lib/format";
import type { Customer, LineItem, Payment, Product } from "@/lib/types";
import {
  Badge,
  Btn,
  Card,
  Field,
  Input,
  Modal,
  PriceTypeControl,
  Select,
  Textarea,
  inputCls,
} from "./ui-kit";
import { TicketPreview } from "./ticket";
import type { Sale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shortcutsOf, useShortcuts } from "@/lib/shortcuts";

/**
 * Sólo informativo: marca un producto para las etiquetas "Sin stock"/"Se
 * agotó" en la búsqueda y en el carrito. NO bloquea seleccionarlo, subir su
 * cantidad ni cobrar — el negocio decide vender lo que el conteo dice que no
 * hay y lo cuadra después con un ajuste de inventario (mismo criterio que ya
 * aplica el backend, ver inventory.service.ts: "stock puede quedar negativo
 * a propósito").
 *
 * Excepción: los combos (`isCombo`) usan su campo `stock` como un valor
 * placeholder que el motor de negocio nunca decrementa al vender (ver
 * `applyMovement`/`createSale` en `lib/business.ts`, que saltan explícitamente
 * los combos al mover inventario) ni repone; el seed los crea con `stock: 999`
 * como "sin límite" — no es inventario real, así que nunca deben mostrarse
 * como agotados. `bsOnly` NO se excluye: son productos con stock real igual
 * que cualquier otro.
 */
function isOutOfStock(p: Product) {
  return !p.isCombo && p.stock <= 0;
}

export function POS({
  initialItems,
  initialCustomerId,
  initialCustomerName,
  orderId,
  onDone,
  mode = "sale",
}: {
  initialItems?: LineItem[];
  initialCustomerId?: string | null;
  initialCustomerName?: string;
  orderId?: string;
  onDone?: () => void;
  mode?: "sale" | "order";
}) {
  const s = useAppState();
  const money = useMoney();
  const rate = money.rate;
  const sc = shortcutsOf(s.company);
  const [items, setItems] = useState<LineItem[]>(initialItems ?? []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  // Arranca en el tipo de precio predeterminado del negocio (Ajustes · Tipos
  // de precio): si ahí está marcado "Mayor", el mostrador cobra al mayor.
  // Al procesar un pedido arranca en el tipo común de sus líneas en vez del
  // predeterminado: si no lo hiciera, el control general (que sí lee las
  // líneas reales) podría mostrar un tipo mientras este estado —el que se
  // usa para reprecios y productos nuevos— arranca en otro.
  const [priceTypeId, setPriceTypeId] = useState(() => {
    const common = initialItems?.length ? commonPriceTypeId(initialItems) : null;
    return common ?? defaultPriceType(s)?.id ?? "";
  });
  const variosTipos = s.priceTypes.length > 1;
  const [customer, setCustomer] = useState<Customer | null>(() =>
    initialCustomerId ? (s.customers.find((c) => c.id === initialCustomerId) ?? null) : null,
  );
  const lockedCustomer = !!orderId;
  const checkoutOnly = !!orderId; // Procesar pedido: solo cobrar, sin catálogo
  const displayCustomerName = customer?.name ?? initialCustomerName ?? "Consumidor final";
  // Al procesar un pedido la venta arranca con la nota del pedido, para que no
  // se pierda en el ticket; en venta directa arranca vacía.
  const [note, setNote] = useState(() =>
    orderId ? (s.orders.find((o) => o.id === orderId)?.note ?? "") : "",
  );
  const [payOpen, setPayOpen] = useState(false);
  const [custQ, setCustQ] = useState("");
  const [custFocus, setCustFocus] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [customizeFor, setCustomizeFor] = useState<Product | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const depositMethods = s.paymentMethods.filter((m) => m.active);
  const [depositOn, setDepositOn] = useState(false);
  const [depositMethodId, setDepositMethodId] = useState(depositMethods[0]?.id ?? "");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositReference, setDepositReference] = useState("");
  const depositMethod = depositMethods.find((m) => m.id === depositMethodId);
  const depositRaw = parseAmount(depositAmount);
  const depositUsdPreview =
    Number.isFinite(depositRaw) && depositRaw > 0
      ? depositMethod?.currency === "USD"
        ? depositRaw
        : money.toUsd(depositRaw)
      : 0;

  const products = useMemo(
    () =>
      s.products.filter(
        (p) =>
          p.active &&
          (cat === "all" || p.categoryId === cat) &&
          (q.trim() === "" ||
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            p.code.toLowerCase().includes(q.toLowerCase())),
      ),
    [s.products, cat, q],
  );

  const showResults = q.trim() !== "" || cat !== "all";

  const { totalUsd, totalBs } = itemsTotals(items, money);
  const liveOrder = orderId ? s.orders.find((o) => o.id === orderId) : undefined;
  // El saldo se calcula con las líneas que se están cobrando, no con las que se
  // guardaron en el pedido: al facturar se puede cambiar el tipo de precio
  // (Mayor/Detal) y el monto a cobrar tiene que moverse con él. Con las del
  // pedido, el cobro pedía el total viejo y `createSale` rechazaba la venta
  // ("los pagos no cubren el total") o daba un vuelto que no correspondía.
  const balance = liveOrder ? orderBalance(s, { ...liveOrder, items }) : null;
  const hasDeposits = !!balance && balance.depositUsd > 0.001;
  // Si el nuevo total quedó por debajo de lo ya abonado (se quitaron líneas al
  // facturar), no hay saldo que cobrar: hay que devolver la diferencia.
  const overpaidUsd = balance?.overpaidUsd ?? 0;
  const amountDueUsd = balance ? balance.balanceUsd : totalUsd;
  const amountDueBs = money.toBs(amountDueUsd);
  // Estado real del carrito para el control general: con el carrito vacío (o
  // sin líneas con tipo, p. ej. solo tortas frías) no hay nada que comparar,
  // así que se muestra el tipo pendiente para lo próximo que se agregue en vez
  // de leerlo como "Mixto".
  const pricedItems = items.filter((i) => !i.bsOnly);
  const cartPriceType = pricedItems.length ? commonPriceTypeId(items) : priceTypeId;

  useShortcuts({
    search_product: () => {
      if (!checkoutOnly) document.getElementById("pos-search")?.focus();
    },
    search_customer: () => {
      if (!lockedCustomer) document.getElementById("cust-search")?.focus();
    },
    checkout: () => {
      if (items.length) setPayOpen(true);
    },
  });

  function add(p: Product, customization?: string) {
    // El stock nunca bloquea: es informativo (etiqueta "Sin stock"/"Se agotó"),
    // no un límite duro. El negocio decide vender lo que el conteo dice que no
    // hay y lo cuadra después con un ajuste de inventario — mismo criterio que
    // ya aplica el backend (ver inventory.service.ts, "stock puede quedar
    // negativo a propósito").
    if (p.allowCustomization && customization === undefined && !customizeFor) {
      setCustomizeFor(p);
      return;
    }
    /* Sin tasa BCV no se puede armar ninguna línea: el equivalente en Bs —el que
       se asienta en la venta, en el cierre y en el ticket— sale de la tasa para
       cualquier producto, no sólo los de precio fijo en Bs. Se para aquí y no al
       cobrar para no dejar al cajero montar el carrito entero antes del "no".
       `createSale` conserva el mismo guard como última línea de defensa (una
       venta puede llegar por otro camino), así que esto no lo sustituye.
       Decisión del dueño del negocio: bloquea toda venta, alineado con el mismo
       guard del backend. Sustituye a la validación de banda del esquema ≤5, que
       en la práctica sólo llegaba a bloquear en este mismo caso pero lo
       explicaba como un problema de rango. */
    if (money.missing) {
      toast.error(`No hay tasa BCV vigente: no se puede vender "${p.name}"`, {
        description: "Carga la tasa del día en Mercado y vuelve a intentarlo.",
      });
      return;
    }
    const unit = p.bsOnly ? 0 : priceOf(s, p, priceTypeId);
    const extra = customization ? (p.customizationPrice ?? 0) : 0;
    setItems((prev) => {
      const key = p.id + "|" + priceTypeId + "|" + (customization ?? "");
      const idx = prev.findIndex(
        (i) => i.productId + "|" + i.priceTypeId + "|" + (i.customization ?? "") === key,
      );
      if (idx >= 0) {
        const copy = [...prev];
        const it = { ...copy[idx], qty: copy[idx].qty + 1 };
        it.subtotalUsd = (it.unitPriceUsd + (it.customizationPrice ?? 0)) * it.qty;
        copy[idx] = it;
        return copy;
      }
      return [
        ...prev,
        {
          productId: p.id,
          code: p.code,
          name: p.name,
          qty: 1,
          priceTypeId,
          unitPriceUsd: unit,
          unitPriceBs: p.bsOnly ? p.bsPrice : undefined,
          bsOnly: p.bsOnly,
          customization,
          customizationPrice: extra,
          subtotalUsd: unit + extra,
        },
      ];
    });
    setCustomizeFor(null);
    // Colapsa la búsqueda (texto y categoría) tras agregar: el resultado ya
    // cumplió su propósito y debe quedar listo para el siguiente producto,
    // no seguir mostrando la misma lista filtrada tapando el resto de la
    // pantalla.
    setQ("");
    setCat("all");
    document.getElementById("pos-search")?.focus();
  }

  /**
   * Pone todo el carrito en un tipo de precio, y deja ese tipo para lo que se
   * agregue después. Pisa los cambios hechos línea por línea: es una acción
   * explícita ("cóbrale todo al detal"), no un efecto secundario.
   */
  function applyPriceTypeToAll(id: string) {
    setPriceTypeId(id);
    setItems((prev) => mergeLines(prev.map((i) => repriceLine(s, i, id))));
  }

  /** Cambia el tipo de precio de una sola línea, sin tocar las demás. */
  function setLinePriceType(idx: number, id: string) {
    setItems((prev) => mergeLines(prev.map((i, k) => (k === idx ? repriceLine(s, i, id) : i))));
  }

  const setQty = (idx: number, qty: number) =>
    setItems((prev) =>
      prev
        .map((i, k) =>
          k === idx
            ? { ...i, qty, subtotalUsd: (i.unitPriceUsd + (i.customizationPrice ?? 0)) * qty }
            : i,
        )
        .filter((i) => i.qty > 0),
    );

  function saveOrder() {
    if (!items.length) return toast.error("Agrega productos al pedido");
    let deposit: { methodId: string; amount: number; reference?: string } | undefined;
    if (depositOn) {
      if (!depositMethod) return toast.error("Selecciona la forma de pago del abono");
      const val = parseAmount(depositAmount);
      if (!Number.isFinite(val) || val <= 0)
        return toast.error("Ingresa el monto del abono o quítalo");
      if (depositMethod.requiresReference && !depositReference.trim())
        return toast.error(`"${depositMethod.name}" requiere número de referencia`);
      deposit = {
        methodId: depositMethod.id,
        amount: val,
        reference: depositReference.trim() || undefined,
      };
    }
    const res = createOrder({
      items,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? "Consumidor final",
      note,
      deposit,
    });
    if (!res.ok) return toast.error(res.error!);
    toast.success(deposit ? "Pedido registrado con abono" : "Pedido registrado como pendiente");
    setItems([]);
    setCustomer(null);
    setNote("");
    setDepositOn(false);
    setDepositAmount("");
    setDepositReference("");
    onDone?.();
  }

  const LineRows = (
    <div className="divide-y divide-border">
      {items.map((i, k) => {
        // El producto pudo agotarse (stock 0) después de agregarse a este
        // carrito, por ejemplo por una venta sincronizada desde otro
        // dispositivo mientras el pedido seguía abierto. No retiramos la
        // línea sola (el usuario decide si la completa o la quita), pero
        // avisamos y evitamos que suba más la cantidad de algo sin stock.
        // El cobro NO se bloquea: el negocio decide vender lo que el conteo
        // dice que no hay y lo cuadra después con un ajuste de inventario
        // (mismo criterio que ya usa el backend, ver inventory.service.ts).
        const lineProduct = s.products.find((pr) => pr.id === i.productId);
        const lineOutOfStock = lineProduct ? isOutOfStock(lineProduct) : false;
        return (
          <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            {/* El nombre ocupa toda la fila en teléfono para que el resto no se apriete. */}
            <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <span className="min-w-0 truncate">{i.name}</span>
                {lineOutOfStock && <Badge tone="red">Se agotó</Badge>}
              </p>
              {i.customization && <p className="text-xs text-sol-70">{i.customization}</p>}
              <p className="num text-xs text-muted-foreground">
                {money.fmtBsAmount(unitBs(i, money))}
                {!i.bsOnly && (
                  <span> ({usd(i.unitPriceUsd + (i.customizationPrice ?? 0))})</span>
                )} × {i.qty} und
              </p>
              {/* Tipo de precio de esta línea sola: único control interactivo para
                  ella (el general de arriba repricea todo el carrito de un golpe,
                  este ajusta solo esta línea). Las líneas bsOnly no tienen tipo. */}
              {variosTipos && !i.bsOnly && (
                <div className="mt-1.5">
                  <PriceTypeControl
                    priceTypes={s.priceTypes}
                    value={i.priceTypeId}
                    onChange={(id) => setLinePriceType(k, id)}
                    ariaLabel={`Tipo de precio de ${i.name}`}
                  />
                </div>
              )}
              {variosTipos && i.bsOnly && (
                <p className="mt-1 text-[11px] text-texto-3">Precio fijo Bs</p>
              )}
            </div>
            {/* Contador y precio: en teléfono en fila propia, separados a los extremos. */}
            <div className="flex flex-1 items-center justify-between gap-3 sm:flex-none sm:justify-normal">
              <div className="flex items-center gap-1.5">
                <Btn
                  icono
                  size="sm"
                  className="size-11 sm:size-[1.95rem]"
                  onClick={() => setQty(k, i.qty - 1)}
                  aria-label={`Quitar una unidad de ${i.name}`}
                >
                  <IcoMenos />
                </Btn>
                <input
                  className={cn(inputCls, "num h-11 w-12 text-center sm:h-9 sm:w-14")}
                  value={i.qty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    if (Number.isFinite(v)) setQty(k, v);
                  }}
                />
                <Btn
                  icono
                  size="sm"
                  className="size-11 sm:size-[1.95rem]"
                  onClick={() => setQty(k, i.qty + 1)}
                  aria-label={`Agregar una unidad de ${i.name}`}
                >
                  <IcoMas />
                </Btn>
              </div>
              <div className="flex items-center gap-1">
                <div className="text-right sm:w-24">
                  <p className="num text-sm font-semibold">{money.fmtBsAmount(lineBs(i, money))}</p>
                  {!i.bsOnly && (
                    <p className="num text-[11px] text-muted-foreground">{usd(i.subtotalUsd)}</p>
                  )}
                </div>
                <Btn
                  icono
                  variant="ghost"
                  size="sm"
                  className="size-11 shrink-0 text-muted-foreground hover:text-rojo sm:size-[1.95rem]"
                  onClick={() => setQty(k, 0)}
                  aria-label={`Quitar ${i.name} del pedido`}
                >
                  <IcoPapelera />
                </Btn>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn("grid gap-4", checkoutOnly ? "mx-auto max-w-md" : "lg:grid-cols-[1fr_380px]")}
    >
      <div className={cn("min-w-0 space-y-4", checkoutOnly && "hidden")}>
        {/* Paso 1 · Cliente */}
        {!lockedCustomer && (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <IcoPersonaMas />
              <h2 className="text-sm font-semibold">Paso 1: Cliente</h2>
            </div>
            {customer ? (
              <div className="flex items-center gap-3 rounded-md border border-verde/30 bg-verde/10 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold uppercase">{customer.name}</p>
                  <p className="num text-xs text-muted-foreground">
                    {customer.cedula} · {customer.phone || "S/NUM"}
                  </p>
                </div>
                <button
                  onClick={() => setCustomer(null)}
                  className="-mr-1 grid size-10 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-sup-2 hover:text-rojo sm:size-7"
                  aria-label="Quitar cliente seleccionado"
                >
                  <IcoCerrar />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
                    <IcoBuscar />
                  </span>
                  <Input
                    id="cust-search"
                    className="pl-9"
                    placeholder={`Buscar cliente por nombre o cédula (${sc.search_customer})`}
                    value={custQ}
                    onFocus={() => setCustFocus(true)}
                    onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                    onChange={(e) => setCustQ(e.target.value)}
                  />
                  {custFocus && custQ.trim() !== "" && (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card shadow-md">
                      {(() => {
                        const norm = (t: string) =>
                          t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                        const term = norm(custQ.trim());
                        const matches = s.customers
                          .filter(
                            (c) =>
                              c.active &&
                              (norm(c.name).includes(term) || norm(c.cedula).includes(term)),
                          )
                          .slice(0, 20);
                        if (matches.length === 0) {
                          return (
                            <p className="px-3 py-3 text-sm text-muted-foreground">
                              Sin coincidencias. Registra un cliente nuevo abajo.
                            </p>
                          );
                        }
                        return matches.map((c) => (
                          <button
                            key={c.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setCustomer(c);
                              setCustQ("");
                              setCustFocus(false);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-sol-vela"
                          >
                            <span className="min-w-0 truncate font-medium uppercase">{c.name}</span>
                            <span className="num shrink-0 text-xs text-muted-foreground">
                              {c.cedula}
                            </span>
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                {/* En teléfono se apilan: «Registrar nuevo cliente» no cabe a media fila. */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Btn
                    className="h-11 sm:h-[2.45rem] sm:flex-1"
                    onClick={() => {
                      setCustomer(null);
                      setCustQ("");
                      setCustFocus(false);
                    }}
                  >
                    Consumidor final
                  </Btn>
                  <Btn
                    variant="amber"
                    className="h-11 sm:h-[2.45rem] sm:flex-1"
                    onClick={() => setNewCustOpen(true)}
                  >
                    <IcoPersonaMas /> Registrar nuevo cliente
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Paso 2 · Productos */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <IcoVenta />
            <h2 className="text-sm font-semibold">
              {lockedCustomer ? "Productos" : "Paso 2: Productos"}
            </h2>

            <span className="num ml-auto text-xs text-muted-foreground">{items.length} líneas</span>
          </div>
          {/* El tipo de precio del catálogo (y de lo próximo que se agregue) se
              decide en el control general del Resumen, no aquí: tenerlo también
              junto al buscador era un segundo control para la misma decisión. */}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
              <IcoBuscar />
            </span>
            <Input
              id="pos-search"
              className="pl-9"
              placeholder={`Buscar por nombre o código (${sc.search_product})`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              Todo
            </Chip>
            {s.categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>

          {showResults && (
            <div className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {products.slice(0, 40).map((p) => {
                const price = p.bsOnly ? null : priceOf(s, p, priceTypeId);
                const outOfStock = isOutOfStock(p);
                const low = !p.isCombo && !outOfStock && p.stock <= p.minStock;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => add(p)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sol-vela"
                  >
                    <span className="num w-16 shrink-0 text-xs text-muted-foreground">
                      {p.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {outOfStock && <Badge tone="red">Sin stock</Badge>}
                    {low && <Badge tone="red">{p.stock}</Badge>}
                    <span className="w-24 shrink-0 text-right">
                      <span className="num block text-sm font-semibold text-sol-70">
                        {p.bsOnly
                          ? bs(p.bsPrice ?? 0)
                          : money.fmtBsAmount(money.toBsRounded(price ?? 0))}
                      </span>
                      {!p.bsOnly && (
                        <span className="num block text-[11px] text-muted-foreground">
                          {usd(price ?? 0)}
                        </span>
                      )}
                    </span>
                    {!outOfStock && <IcoMas />}
                  </button>
                );
              })}
              {products.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados</p>
              )}
              {products.length > 40 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Mostrando 40 de {products.length}. Afina la búsqueda.
                </p>
              )}
            </div>
          )}

          {items.length > 0 ? (
            <div className="mt-3 border-t border-border">{LineRows}</div>
          ) : (
            <p className="mt-4 py-6 text-center text-sm text-muted-foreground">
              Aún no has agregado productos.
            </p>
          )}
        </Card>
      </div>

      {/* Resumen */}
      <Card className="p-4 lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-3 text-[0.95rem] font-semibold">
          {mode === "order" ? "Resumen del pedido" : "Resumen de la venta"}
        </h2>
        <div className="border-t border-border py-3">
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p className="truncate text-sm font-semibold uppercase">{displayCustomerName}</p>
          {customer && <p className="num text-xs text-muted-foreground">{customer.cedula}</p>}
        </div>
        <div className="border-t border-border py-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Artículos ({items.length})</p>
            {/* Único control general de la venta: vive aquí (no sólo junto al
                catálogo) porque al procesar un pedido la tarjeta Productos se
                oculta y este es el único lugar donde siempre está presente.
                Muestra la verdad del carrito (mezclado = "Mixto"), no sólo la
                última elección; al tocarlo repricea todo y queda fijo para lo
                próximo que se agregue. */}
            {variosTipos && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Todo a</span>
                <PriceTypeControl
                  priceTypes={s.priceTypes}
                  value={cartPriceType}
                  onChange={applyPriceTypeToAll}
                  ariaLabel="Tipo de precio de toda la venta"
                  mixedLabel="Mixto"
                />
              </div>
            )}
          </div>
          {items.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          <div className="space-y-2">
            {items.map((i, k) => (
              <div key={k}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{i.name}</span>
                  <span className="num shrink-0 text-right">
                    {money.fmtBsAmount(lineBs(i, money))}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {/* En Venta/Pedido la línea ya se edita en la tarjeta Productos
                      (LineRows): aquí solo se etiqueta, para no tener dos
                      controles interactivos para la misma línea a la vez. Al
                      facturar (checkoutOnly) esa tarjeta está oculta, así que
                      este es el único lugar donde se puede cambiar la línea. */}
                  {variosTipos &&
                    !i.bsOnly &&
                    (checkoutOnly ? (
                      <PriceTypeControl
                        priceTypes={s.priceTypes}
                        value={i.priceTypeId}
                        onChange={(id) => setLinePriceType(k, id)}
                        ariaLabel={`Tipo de precio de ${i.name}`}
                      />
                    ) : (
                      <Badge tone="hueco" liso>
                        {s.priceTypes.find((p) => p.id === i.priceTypeId)?.name ?? ""}
                      </Badge>
                    ))}
                  {variosTipos && i.bsOnly && (
                    <span className="text-[11px] text-texto-3">Precio fijo Bs</span>
                  )}
                  <span className="num text-[11px] text-muted-foreground">
                    × {i.qty} und
                    {!i.bsOnly && ` · ${usd(i.unitPriceUsd + (i.customizationPrice ?? 0))}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 border-t border-border py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-right">
              <span className="num block text-lg font-semibold">{bs(totalBs)}</span>
              <span className="num block text-xs text-muted-foreground">{usd(totalUsd)}</span>
            </span>
          </div>
          {hasDeposits && (
            <>
              <div className="flex items-center justify-between text-sol-70">
                <span className="text-sm">Abonado</span>
                <span className="text-right">
                  <span className="num block text-sm font-semibold">
                    - {money.fmtBs(balance!.depositUsd)}
                  </span>
                  <span className="num block text-[11px] opacity-80">
                    - {usd(balance!.depositUsd)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="text-sm font-medium">Saldo a cobrar</span>
                <span className="text-right">
                  <span className="num block text-lg font-semibold">{bs(amountDueBs)}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {usd(amountDueUsd)}
                  </span>
                </span>
              </div>
              {/* Cambiar a un tipo de precio más barato al facturar puede dejar el
                  nuevo total por debajo de lo ya abonado: no falta nada por
                  cobrar, sobra, y hay que devolverlo. */}
              {overpaidUsd > 0.001 && (
                <div className="flex items-center justify-between text-verde">
                  <span className="text-sm">A favor del cliente</span>
                  <span className="text-right">
                    <span className="num block text-sm font-semibold">
                      {money.fmtBs(overpaidUsd)}
                    </span>
                    <span className="num block text-[11px] opacity-80">{usd(overpaidUsd)}</span>
                  </span>
                </div>
              )}
            </>
          )}
          <p className="num text-right text-[11px] text-muted-foreground">Tasa BCV: {num(rate)}</p>
        </div>
        <Textarea
          className={cn("mt-3", mode !== "order" && "mb-3")}
          rows={2}
          placeholder={
            mode === "order"
              ? "Notas del pedido (ej: sin arequipe, para las 4pm)"
              : "Notas de la venta (ej: para llevar, retira otra persona)"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {mode === "order" && (
          <>
            <div className="mb-3 space-y-2 border-t border-border py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Abono adelantado</span>
                {depositOn && (
                  <button
                    type="button"
                    className="-my-1.5 -mr-1 rounded px-1 py-1.5 text-xs text-muted-foreground hover:text-rojo"
                    onClick={() => {
                      setDepositOn(false);
                      setDepositAmount("");
                      setDepositReference("");
                    }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {!depositOn ? (
                <Btn
                  className="h-11 w-full sm:h-[2.45rem]"
                  disabled={!depositMethods.length}
                  onClick={() => setDepositOn(true)}
                >
                  <IcoMas /> El cliente adelantó dinero
                </Btn>
              ) : (
                <div className="space-y-2">
                  <Select
                    value={depositMethodId}
                    onChange={(e) => setDepositMethodId(e.target.value)}
                  >
                    {depositMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.currency === "USD" ? "USD" : "Bs"})
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="num"
                    inputMode="decimal"
                    placeholder={depositMethod?.currency === "USD" ? "Monto en USD" : "Monto en Bs"}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                  {depositMethod?.requiresReference && (
                    <Input
                      placeholder="Referencia"
                      value={depositReference}
                      onChange={(e) => setDepositReference(e.target.value)}
                    />
                  )}
                  {depositUsdPreview > 0 && (
                    <p className="num text-xs text-muted-foreground">
                      ≈ {usd(depositUsdPreview)}
                      {depositUsdPreview > totalUsd + 0.02 && " · supera el total del pedido"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        <Btn
          variant="amber"
          size="lg"
          className="w-full"
          disabled={!items.length}
          onClick={() => (mode === "order" ? saveOrder() : setPayOpen(true))}
        >
          {mode === "order"
            ? "Guardar pedido"
            : hasDeposits
              ? `Cobrar saldo (${sc.checkout})`
              : `Procesar pago (${sc.checkout})`}
        </Btn>
      </Card>

      <Modal open={newCustOpen} onClose={() => setNewCustOpen(false)} title="Nuevo cliente">
        <CustomerPickerBody
          startNew
          onPick={(c) => {
            setCustomer(c);
            setNewCustOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={!!customizeFor}
        onClose={() => setCustomizeFor(null)}
        title={`Personalizar · ${customizeFor?.name ?? ""}`}
      >
        <CustomizeForm
          product={customizeFor}
          money={money}
          onSkip={() => customizeFor && add(customizeFor, "")}
          onConfirm={(txt) => customizeFor && add(customizeFor, txt)}
        />
      </Modal>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        totalUsd={amountDueUsd}
        totalBs={amountDueBs}
        money={money}
        onConfirm={(payments) => {
          const res = createSale({
            items,
            customerId: customer?.id ?? initialCustomerId ?? null,
            customerName: displayCustomerName,
            payments,
            note,
            orderId,
          });
          if (!res.ok) return toast.error(res.error!);
          toast.success("Venta " + res.sale!.number + " registrada");
          setLastSale(res.sale!);
          setItems([]);
          setCustomer(null);
          setNote("");
          setPayOpen(false);
          onDone?.();
        }}
      />

      <Modal
        open={!!lastSale}
        onClose={() => setLastSale(null)}
        title={"Venta " + (lastSale?.number ?? "")}
      >
        {lastSale && <TicketPreview sale={lastSale} />}
      </Modal>
    </div>
  );
}

function CustomizeForm({
  product,
  money,
  onConfirm,
  onSkip,
}: {
  product: Product | null;
  money: Money;
  onConfirm: (t: string) => void;
  onSkip: () => void;
}) {
  const [txt, setTxt] = useState("");
  if (!product) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        La personalización agrega {money.fmtBs(product.customizationPrice ?? 0)} (
        {usd(product.customizationPrice ?? 0)}) al precio según el modelo.
      </p>
      <Field label="Modelo / mensaje">
        <Input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="Ej: Modelo unicornio, Feliz cumple Ana"
        />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Btn size="lg" className="w-full sm:w-auto" onClick={onSkip}>
          Sin personalización
        </Btn>
        <Btn
          size="lg"
          variant="amber"
          className="w-full sm:w-auto"
          onClick={() => onConfirm(txt || "Personalizado")}
        >
          Agregar
        </Btn>
      </div>
    </div>
  );
}

export function CustomerPickerBody({
  onPick,
  startNew = false,
}: {
  onPick: (c: Customer | null) => void;
  startNew?: boolean;
}) {
  const s = useAppState();
  const [q, setQ] = useState("");
  const [newMode, setNewMode] = useState(startNew);
  const [form, setForm] = useState({ cedula: "", name: "", phone: "", address: "" });
  const list = s.customers.filter(
    (c) => c.active && (c.name.toLowerCase().includes(q.toLowerCase()) || c.cedula.includes(q)),
  );
  if (newMode)
    return (
      <div className="space-y-3">
        <Field label="Cédula" hint="Formato V-12345678">
          <Input
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
          />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Dirección">
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={() => setNewMode(false)}>Volver</Btn>
          <Btn
            variant="amber"
            onClick={() => {
              if (!validCedula(form.cedula)) return toast.error("Cédula inválida (ej: V-12345678)");
              if (!form.name.trim()) return toast.error("El nombre es obligatorio");
              const c = upsertCustomer(form);
              toast.success("Cliente creado");
              onPick(c);
              setNewMode(false);
              setForm({ cedula: "", name: "", phone: "", address: "" });
            }}
          >
            Crear y usar
          </Btn>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar por cédula o nombre"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-64 space-y-1 overflow-y-auto">
        <button
          onClick={() => onPick(null)}
          className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-secondary"
        >
          Consumidor final
        </button>
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-sol-vela"
          >
            <span className="font-medium">{c.name}</span>
            <span className="num ml-2 text-xs text-muted-foreground">{c.cedula}</span>
          </button>
        ))}
      </div>
      <Btn className="w-full" onClick={() => setNewMode(true)}>
        <IcoPersonaMas /> Nuevo cliente
      </Btn>
    </div>
  );
}

export function CustomerPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: Customer | null) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Cliente">
      <CustomerPickerBody onPick={onPick} />
    </Modal>
  );
}

export function PaymentModal({
  open,
  onClose,
  totalUsd,
  totalBs,
  money,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  totalUsd: number;
  totalBs: number;
  money: Money;
  onConfirm: (p: Payment[]) => void;
}) {
  const s = useAppState();
  const rate = money.rate;
  const methods = s.paymentMethods.filter((m) => m.active);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (open) {
      setPayments([]);
      setAmount("");
      setReference("");
    }
  }, [open]);

  const paid = payments.reduce((a, p) => a + p.usdEquivalent, 0);
  const remaining = Math.max(0, totalUsd - paid);
  const change = Math.max(0, paid - totalUsd);
  const method = methods.find((m) => m.id === methodId);

  function addPayment() {
    if (!method) return;
    const val = parseAmount(amount);
    if (!Number.isFinite(val) || val <= 0) return toast.error("Monto inválido");
    if (method.requiresReference && !reference.trim())
      return toast.error("Esta forma de pago requiere referencia");
    const usdEq = method.currency === "USD" ? val : money.toUsd(val);
    setPayments([
      ...payments,
      {
        methodId: method.id,
        methodName: method.name,
        currency: method.currency,
        amount: val,
        usdEquivalent: usdEq,
        reference: reference.trim() || undefined,
      },
    ]);
    setAmount("");
    setReference("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Cobrar" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-sup-2 p-3">
            <Row l="Total" r={bs(totalBs)} sub={usd(totalUsd)} strong />
            <div className="my-2 border-t border-border" />
            <Row l="Pagado" r={money.fmtBs(paid)} sub={usd(paid)} />
            <Row l="Restante" r={money.fmtBs(remaining)} sub={usd(remaining)} strong />
            <Row l="Vuelto" r={money.fmtBs(change)} sub={usd(change)} />
            <p className="num mt-2 text-[11px] text-texto-3">Tasa BCV USD {num(rate)}</p>
          </div>
          <Field label="Forma de pago">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.currency === "USD" ? "USD" : "Bs"})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Monto en ${method?.currency === "USD" ? "USD" : "Bs"}`}
            hint={
              method?.currency === "BS"
                ? `Equivale a ${usd(money.toUsd(parseAmount(amount)) || 0)}`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                className="num"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  method?.currency === "USD" ? num(remaining) : num(money.toBs(remaining))
                }
              />
              {remaining > 0.001 && (
                <Btn
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 sm:h-[2.45rem]"
                  onClick={() =>
                    setAmount(
                      method?.currency === "USD"
                        ? num(remaining)
                        : num(Math.round(money.toBs(remaining) * 100) / 100),
                    )
                  }
                >
                  Pagar resto
                </Btn>
              )}
            </div>
          </Field>
          {method?.requiresReference && (
            <Field label="Referencia">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          <Btn className="w-full" onClick={addPayment}>
            <IcoMas /> Agregar pago
          </Btn>
        </div>
        <div className="flex flex-col">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Pagos registrados</p>
          <div className="flex-1 space-y-1.5">
            {payments.length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay pagos</p>
            )}
            {payments.map((p, k) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm">{p.methodName}</p>
                  {p.reference && (
                    <p className="text-xs text-muted-foreground">Ref. {p.reference}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="num text-sm">
                    {p.currency === "USD" ? money.fmtBs(p.amount) : bs(p.amount)}
                  </p>
                  <p className="num text-[11px] text-muted-foreground">
                    {p.currency === "USD" ? usd(p.amount) : usd(p.usdEquivalent)}
                  </p>
                </div>
                <button
                  onClick={() => setPayments(payments.filter((_, i) => i !== k))}
                  className="-mr-1 ml-1 grid size-10 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-sup-2 hover:text-rojo sm:size-7"
                  aria-label={`Quitar pago de ${p.methodName}`}
                >
                  <IcoPapelera />
                </button>
              </div>
            ))}
          </div>
          <Btn
            variant="amber"
            size="lg"
            className="mt-4 w-full"
            disabled={paid + 0.02 < totalUsd}
            onClick={() => onConfirm(payments)}
          >
            Finalizar venta
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function Row({ l, r, sub, strong }: { l: string; r: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn("text-sm", strong ? "font-medium text-foreground" : "text-muted-foreground")}
      >
        {l}
      </span>
      <span className="text-right">
        <span className={cn("num block text-sm", strong && "font-semibold")}>{r}</span>
        {sub && <span className="num block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-xs transition-colors sm:px-3 sm:py-1",
        active
          ? "border-sol bg-sol-vela text-sol-70"
          : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
