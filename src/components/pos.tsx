import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useAppState } from "@/lib/store";
import {
  coldCakeCheck,
  createOrder,
  createSale,
  currentRate,
  isColdCake,
  priceOf,
  totalsOf,
} from "@/lib/business";
import { upsertCustomer } from "@/lib/business";
import { bs, num, usd, validCedula } from "@/lib/format";
import type { Customer, LineItem, Payment, Product } from "@/lib/types";
import { Badge, Btn, Card, Field, Input, Modal, Select, Textarea, inputCls } from "./ui-kit";
import { TicketPreview } from "./ticket";
import type { Sale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shortcutsOf, useShortcuts } from "@/lib/shortcuts";

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
  const rate = currentRate(s, "BCV_USD")?.value ?? 0;
  const sc = shortcutsOf(s.company);
  const [items, setItems] = useState<LineItem[]>(initialItems ?? []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [priceTypeId, setPriceTypeId] = useState(s.priceTypes.find((p) => p.isDefault)?.id ?? s.priceTypes[0]?.id);
  const [customer, setCustomer] = useState<Customer | null>(
    () => (initialCustomerId ? s.customers.find((c) => c.id === initialCustomerId) ?? null : null),
  );
  const lockedCustomer = !!orderId;
  const checkoutOnly = !!orderId; // Procesar pedido: solo cobrar, sin catálogo
  const displayCustomerName = customer?.name ?? initialCustomerName ?? "Consumidor final";
  const [note, setNote] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [custQ, setCustQ] = useState("");
  const [custFocus, setCustFocus] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [customizeFor, setCustomizeFor] = useState<Product | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);


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

  const { totalUsd, totalBs } = totalsOf(items, rate);

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
    if (p.allowCustomization && customization === undefined && !customizeFor) {
      setCustomizeFor(p);
      return;
    }
    const unit = p.bsOnly ? 0 : priceOf(p, priceTypeId);
    if (isColdCake(s, p)) {
      const chk = coldCakeCheck(s, unit, rate);
      if (!chk.ok) {
        toast.error(`Precio fuera del rango $${chk.min} – $${chk.max} para tortas frías`);
        return;
      }
    }
    const extra = customization ? (p.customizationPrice ?? 0) : 0;
    setItems((prev) => {
      const key = p.id + "|" + priceTypeId + "|" + (customization ?? "");
      const idx = prev.findIndex((i) => i.productId + "|" + i.priceTypeId + "|" + (i.customization ?? "") === key);
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
    createOrder({ items, customerId: customer?.id ?? null, customerName: customer?.name ?? "Consumidor final", note });
    toast.success("Pedido registrado como pendiente");
    setItems([]);
    setCustomer(null);
    setNote("");
    onDone?.();
  }

  const LineRows = (
    <div className="divide-y divide-border">
      {items.map((i, k) => (
        <div key={k} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{i.name}</p>
            {i.customization && <p className="text-xs text-sol-70">{i.customization}</p>}
            <p className="num text-xs text-muted-foreground">
              {i.bsOnly ? bs(i.unitPriceBs ?? 0) : usd(i.unitPriceUsd + (i.customizationPrice ?? 0))} × {i.qty} und
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Btn size="sm" onClick={() => setQty(k, i.qty - 1)}>
              <Minus className="size-3" />
            </Btn>
            <input
              className={cn(inputCls, "num h-9 w-14 text-center")}
              value={i.qty}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                if (Number.isFinite(v)) setQty(k, v);
              }}
            />
            <Btn size="sm" onClick={() => setQty(k, i.qty + 1)}>
              <Plus className="size-3" />
            </Btn>
          </div>
          <span className="num w-20 text-right text-sm font-semibold">
            {i.bsOnly ? bs((i.unitPriceBs ?? 0) * i.qty) : usd(i.subtotalUsd)}
          </span>
          <button onClick={() => setQty(k, 0)} className="text-muted-foreground hover:text-rojo">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className={cn("grid gap-4", checkoutOnly ? "mx-auto max-w-md" : "lg:grid-cols-[1fr_380px]")}>
      <div className={cn("min-w-0 space-y-4", checkoutOnly && "hidden")}>
        {/* Paso 1 · Cliente */}
        {!lockedCustomer && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="size-4 text-sol" />
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
              <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-rojo">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
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
                        t
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[̀-ͯ]/g, "");
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
                          <span className="num shrink-0 text-xs text-muted-foreground">{c.cedula}</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCustomer(null);
                    setCustQ("");
                    setCustFocus(false);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2"
                >
                  Consumidor final
                </button>
                <button
                  onClick={() => setNewCustOpen(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-sol/40 bg-sol/5 px-3 py-2 text-sm font-medium text-sol hover:bg-sol/10"
                >
                  <UserPlus className="size-4" /> Registrar nuevo cliente
                </button>
              </div>
            </div>
          )}
        </Card>
        )}

        {/* Paso 2 · Productos */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingCart className="size-4 text-sol" />
            <h2 className="text-sm font-semibold">{lockedCustomer ? "Productos" : "Paso 2: Productos"}</h2>

            <span className="num ml-auto text-xs text-muted-foreground">{items.length} líneas</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
              <Input
                id="pos-search"
                className="pl-9"
                placeholder={`Buscar por nombre o código (${sc.search_product})`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={priceTypeId} onChange={(e) => setPriceTypeId(e.target.value)} className="sm:w-40">
              {s.priceTypes.map((p) => (
                <option key={p.id} value={p.id}>
                  Precio {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
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
                const price = p.bsOnly ? null : priceOf(p, priceTypeId);
                const low = !p.isCombo && p.stock <= p.minStock;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sol-vela"
                  >
                    <span className="num w-16 shrink-0 text-xs text-muted-foreground">{p.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {low && <Badge tone="red">{p.stock}</Badge>}
                    <span className="num w-24 shrink-0 text-right text-sm font-semibold text-sol-70">
                      {p.bsOnly ? num(p.bsPrice ?? 0) + " Bs" : usd(price ?? 0)}
                    </span>
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
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
        <h2 className="voz mb-3 text-base">{mode === "order" ? "Resumen del pedido" : "Resumen de la venta"}</h2>
        <div className="border-t border-border py-3">
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p className="truncate text-sm font-semibold uppercase">{displayCustomerName}</p>
          {customer && <p className="num text-xs text-muted-foreground">{customer.cedula}</p>}
        </div>
        <div className="border-t border-border py-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Artículos ({items.length})</p>
          {items.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          <div className="space-y-1">
            {items.map((i, k) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{i.name}</span>
                <span className="num shrink-0">
                  {i.bsOnly ? bs((i.unitPriceBs ?? 0) * i.qty) : usd(i.subtotalUsd)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 border-t border-border py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total USD</span>
            <span className="num text-lg font-semibold">{usd(totalUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Bs</span>
            <span className="num text-lg font-semibold">{bs(totalBs)}</span>
          </div>
          <p className="num text-right text-[11px] text-muted-foreground">Tasa BCV: {num(rate)}</p>
        </div>
        {mode === "order" && (
          <Textarea
            className="mb-3"
            rows={2}
            placeholder="Notas del pedido (ej: sin arequipe, para las 4pm)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <Btn
          variant="amber"
          size="lg"
          className="w-full"
          disabled={!items.length}
          onClick={() => (mode === "order" ? saveOrder() : setPayOpen(true))}
        >
          {mode === "order" ? "Guardar pedido" : `Procesar pago (${sc.checkout})`}
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
          onSkip={() => customizeFor && add(customizeFor, "")}
          onConfirm={(txt) => customizeFor && add(customizeFor, txt)}
        />
      </Modal>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        totalUsd={totalUsd}
        totalBs={totalBs}
        rate={rate}
        onConfirm={(payments) => {
          const res = createSale({
            items,
            customerId: customer?.id ?? initialCustomerId ?? null,
            customerName: displayCustomerName,
            payments,
            orderId,
          });
          if (!res.ok) return toast.error(res.error!);
          toast.success("Venta " + res.sale!.number + " registrada");
          setLastSale(res.sale!);
          setItems([]);
          setCustomer(null);
          setPayOpen(false);
          onDone?.();
        }}
      />

      <Modal open={!!lastSale} onClose={() => setLastSale(null)} title={"Venta " + (lastSale?.number ?? "")}>
        {lastSale && <TicketPreview sale={lastSale} />}
      </Modal>
    </div>
  );
}

function CustomizeForm({
  product,
  onConfirm,
  onSkip,
}: {
  product: Product | null;
  onConfirm: (t: string) => void;
  onSkip: () => void;
}) {
  const [txt, setTxt] = useState("");
  if (!product) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        La personalización agrega {usd(product.customizationPrice ?? 0)} al precio según el modelo.
      </p>
      <Field label="Modelo / mensaje">
        <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej: Modelo unicornio, Feliz cumple Ana" />
      </Field>
      <div className="flex justify-end gap-2">
        <Btn onClick={onSkip}>Sin personalización</Btn>
        <Btn variant="amber" onClick={() => onConfirm(txt || "Personalizado")}>
          Agregar
        </Btn>
      </div>
    </div>
  );
}

export function CustomerPickerBody({ onPick, startNew = false }: { onPick: (c: Customer | null) => void; startNew?: boolean }) {
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
          <Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Dirección">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
      <Input placeholder="Buscar por cédula o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
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
        <UserPlus className="size-4" /> Nuevo cliente
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
  rate,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  totalUsd: number;
  totalBs: number;
  rate: number;
  onConfirm: (p: Payment[]) => void;
}) {
  const s = useAppState();
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
    if (method.requiresReference && !reference.trim()) return toast.error("Esta forma de pago requiere referencia");
    const usdEq = method.currency === "USD" ? val : rate ? val / rate : 0;
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
            <Row l="Total USD" r={usd(totalUsd)} strong />
            <Row l="Total Bs" r={bs(totalBs)} />
            <div className="my-2 border-t border-border" />
            <Row l="Pagado" r={usd(paid)} />
            <Row l="Restante" r={usd(remaining)} strong />
            <Row l="Vuelto" r={usd(change)} />
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
                ? `Equivale a ${usd(parseAmount(amount) / (rate || 1) || 0)}`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                className="num"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={method?.currency === "USD" ? num(remaining) : num(remaining * rate)}
              />
              {remaining > 0.001 && (
                <Btn
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setAmount(
                      method?.currency === "USD"
                        ? num(remaining)
                        : num(Math.round(remaining * rate * 100) / 100),
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
            <Plus className="size-4" /> Agregar pago
          </Btn>
        </div>
        <div className="flex flex-col">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Pagos registrados</p>
          <div className="flex-1 space-y-1.5">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay pagos</p>}
            {payments.map((p, k) => (
              <div key={k} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm">{p.methodName}</p>
                  {p.reference && <p className="text-xs text-muted-foreground">Ref. {p.reference}</p>}
                </div>
                <div className="text-right">
                  <p className="num text-sm">{p.currency === "USD" ? usd(p.amount) : bs(p.amount)}</p>
                  <p className="num text-[11px] text-muted-foreground">≈ {usd(p.usdEquivalent)}</p>
                </div>
                <button
                  onClick={() => setPayments(payments.filter((_, i) => i !== k))}
                  className="ml-2 text-muted-foreground hover:text-rojo"
                >
                  <Trash2 className="size-4" />
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

function Row({ l, r, strong }: { l: string; r: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm", strong ? "font-medium text-foreground" : "text-muted-foreground")}>{l}</span>
      <span className={cn("num text-sm", strong && "font-semibold")}>{r}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-sol bg-sol-vela text-sol-70" : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function parseAmount(raw: string): number {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return NaN;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  let norm = t;
  if (hasComma && hasDot) {
    norm = t.lastIndexOf(",") > t.lastIndexOf(".")
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  } else if (hasComma) {
    norm = t.replace(",", ".");
  } else if (hasDot) {
    const parts = t.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || last.length === 3) norm = parts.join("");
  }
  return parseFloat(norm);
}
