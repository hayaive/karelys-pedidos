import { createFileRoute } from "@tanstack/react-router";
import { IcoImprimir, IcoMas, IcoPapelera } from "@/chasis/iconos";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import { POS } from "@/components/pos";
import { TicketPreview } from "@/components/ticket";
import {
  Aviso,
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Modal,
  PriceTypeControl,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { useAppState } from "@/lib/store";
import {
  addOrderDeposit,
  commonPriceTypeId,
  deleteOrder,
  itemsTotals,
  lineBs,
  mergeLines,
  orderBalance,
  repriceLine,
  setOrderStatus,
  updateOrder,
} from "@/lib/business";
import { clearDraft, draftHasContent, lineKeyOf, loadDraft, type PosDraft } from "@/lib/pos-draft";
import { useMoney } from "@/hooks/use-money";
import { dt, parseAmount, usd } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import { useShortcuts } from "@/lib/shortcuts";

export const Route = createFileRoute("/pedidos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pedidos · Karelys Delicias" },
      { name: "description", content: "Registro y procesamiento de pedidos por encargo." },
      { property: "og:title", content: "Pedidos · Karelys Delicias" },
      { property: "og:description", content: "Registro y procesamiento de pedidos por encargo." },
    ],
  }),
  component: () => (
    <AppShell requires="view_orders">
      <Pedidos />
    </AppShell>
  ),
});

const STATUSES: { key: OrderStatus; label: string }[] = [
  { key: "pendiente", label: "Pendiente" },
  { key: "preparacion", label: "En preparación" },
  { key: "listo", label: "Listo" },
  { key: "procesado", label: "Procesado" },
  { key: "cancelado", label: "Cancelado" },
];

function Pedidos() {
  const s = useAppState();
  const money = useMoney();
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState<Order | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [del, setDel] = useState<Order | null>(null);
  const [depositingFor, setDepositingFor] = useState<Order | null>(null);
  const [printingFor, setPrintingFor] = useState<Order | null>(null);
  const [filter, setFilter] = useState<string>("activos");
  // Borrador de "Nuevo pedido" sin terminar (ver lib/pos-draft): se relee cada
  // vez que se vuelve de "creating" a la lista, porque mientras el POS
  // estuvo montado fue él quien lo mantuvo actualizado en localStorage.
  const [orderDraft, setOrderDraft] = useState<PosDraft | null>(null);
  const [discardDraft, setDiscardDraft] = useState(false);

  useEffect(() => {
    if (creating) return;
    setOrderDraft(loadDraft("order", s.sessionUserId ?? null));
  }, [creating, s.sessionUserId]);

  useShortcuts({
    process_order: () => {
      if (!can("process_orders") || processing || creating) return;
      const next = s.orders.find((o) => ["pendiente", "preparacion", "listo"].includes(o.status));
      if (next) setProcessing(next);
      else toast.info("No hay pedidos pendientes");
    },
  });

  const orders = s.orders.filter((o) =>
    filter === "activos"
      ? !["procesado", "cancelado"].includes(o.status)
      : filter === "todos"
        ? true
        : o.status === filter,
  );

  if (creating)
    return (
      <>
        <PageHead
          title="Nuevo pedido"
          sub="Registra el encargo y déjalo pendiente"
          action={<Btn onClick={() => setCreating(false)}>Volver</Btn>}
        />
        <POS mode="order" onDone={() => setCreating(false)} />
      </>
    );

  if (processing)
    return (
      <>
        <PageHead
          title={`Procesar pedido ${processing.number}`}
          sub={`${processing.customerName} · cobra normalmente para generar la venta`}
          action={<Btn onClick={() => setProcessing(null)}>Volver</Btn>}
        />
        <POS
          initialItems={processing.items}
          initialCustomerId={processing.customerId}
          initialCustomerName={processing.customerName}
          orderId={processing.id}
          onDone={() => setProcessing(null)}
        />
      </>
    );

  return (
    <>
      <PageHead
        title="Pedidos"
        sub="Encargos por WhatsApp y mostrador"
        action={
          <div className="flex gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
              <option value="activos">Activos</option>
              <option value="todos">Todos</option>
              {STATUSES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </Select>
            {can("edit_orders") && (
              <Btn variant="amber" onClick={() => setCreating(true)}>
                <IcoMas /> Nuevo pedido
              </Btn>
            )}
          </div>
        }
      />

      {orderDraft && draftHasContent(orderDraft) && (
        <div className="mb-4">
          <Aviso tone="amber" title="Tienes un pedido sin terminar">
            <p className="num">
              {orderDraft.items.length} producto{orderDraft.items.length === 1 ? "" : "s"} ·{" "}
              {orderDraft.customerName || "Consumidor final"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn size="sm" variant="amber" onClick={() => setCreating(true)}>
                Continuar
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => setDiscardDraft(true)}>
                Descartar
              </Btn>
            </div>
          </Aviso>
        </div>
      )}

      {orders.length === 0 ? (
        <Card>
          <Empty
            title="No hay pedidos"
            sub="Registra el primer encargo cuando un cliente escriba."
            action={
              can("edit_orders") ? (
                <Btn variant="amber" className="mt-2" onClick={() => setCreating(true)}>
                  Nuevo pedido
                </Btn>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const balance = orderBalance(s, o);
            // El total en Bs del pedido, no `money.fmtBs(o.totalUsd)`: ese campo
            // excluye a propósito las líneas `bsOnly` (torta fría), así que un
            // pedido compuesto sólo por ellas mostraba siempre "0,00 Bs" aquí.
            // `itemsTotals` sí las convierte con la tasa vigente (mismo patrón
            // que usa el ticket); la referencia en USD usa `balance.totalUsd`,
            // que por la misma razón ya no es `o.totalUsd`.
            const { totalBs: orderTotalBs } = itemsTotals(o.items, money);
            return (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="num text-sm font-semibold">{o.number}</p>
                    <p className="text-sm">{o.customerName}</p>
                    <p className="num text-xs text-muted-foreground">{dt(o.createdAt)}</p>
                  </div>
                  <Badge
                    tone={
                      o.status === "procesado"
                        ? "green"
                        : o.status === "cancelado"
                          ? "red"
                          : "amber"
                    }
                  >
                    {STATUSES.find((x) => x.key === o.status)?.label}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                  {o.items.slice(0, 4).map((i, k) => (
                    <li key={k} className="num">
                      {i.qty} × {i.name}
                    </li>
                  ))}
                  {o.items.length > 4 && <li>+{o.items.length - 4} más</li>}
                </ul>
                {o.note && (
                  // `whitespace-pre-line`: la nota se escribe con saltos de línea y
                  // tiene que leerse igual que se escribió.
                  <p className="mt-2 whitespace-pre-line break-words rounded bg-sol-vela px-2 py-1.5 text-sm font-bold text-sol-70">
                    {o.note}
                  </p>
                )}
                <p className="mt-3">
                  <span className="num block text-lg font-semibold">
                    {money.fmtBsAmount(orderTotalBs)}
                  </span>
                  <span className="num block text-xs text-muted-foreground">
                    {usd(balance.totalUsd)}
                  </span>
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <Badge
                    liso
                    tone={
                      balance.status === "pagado"
                        ? "green"
                        : balance.status === "abonado"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {balance.status === "pagado"
                      ? "Pagado"
                      : balance.status === "abonado"
                        ? `Abonado ${money.fmtBs(balance.depositUsd)}`
                        : "Sin abono"}
                  </Badge>
                  {balance.status === "abonado" && (
                    <span className="num text-xs font-semibold text-muted-foreground">
                      Saldo {money.fmtBs(balance.balanceUsd)}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <Btn
                    size="sm"
                    variant="ghost"
                    className="h-11 w-full sm:h-[1.95rem] sm:w-auto"
                    onClick={() => setPrintingFor(o)}
                  >
                    <IcoImprimir /> Imprimir ticket
                  </Btn>
                </div>
                {o.status !== "procesado" && o.status !== "cancelado" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {can("process_orders") && (
                      <Btn
                        size="sm"
                        variant="amber"
                        className="h-11 flex-1 sm:h-[1.95rem] sm:flex-none"
                        onClick={() => setProcessing(o)}
                      >
                        Procesar
                      </Btn>
                    )}
                    {can("edit_orders") && balance.status !== "pagado" && (
                      <Btn
                        size="sm"
                        className="h-11 flex-1 sm:h-[1.95rem] sm:flex-none"
                        onClick={() => setDepositingFor(o)}
                      >
                        Abonar
                      </Btn>
                    )}
                    {can("edit_orders") && (
                      <>
                        <Btn
                          size="sm"
                          className="h-11 flex-1 sm:h-[1.95rem] sm:flex-none"
                          onClick={() => setEditing(o)}
                        >
                          Editar
                        </Btn>
                        <Btn
                          icono
                          size="sm"
                          variant="ghost"
                          className="size-11 shrink-0 sm:size-[1.95rem]"
                          onClick={() => setDel(o)}
                          aria-label={`Eliminar pedido ${o.number}`}
                        >
                          <IcoPapelera />
                        </Btn>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar ${editing?.number ?? ""}`}
      >
        {editing && <EditOrder order={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!del}
        danger
        title="Eliminar pedido"
        message={`¿Eliminar el pedido ${del?.number}? Esta acción no se puede deshacer.`}
        onCancel={() => setDel(null)}
        onConfirm={() => {
          const res = deleteOrder(del!.id);
          if (!res.ok) toast.error(res.error!);
          else toast.success("Pedido eliminado");
          setDel(null);
        }}
      />

      <ConfirmDialog
        open={discardDraft}
        danger
        title="Descartar pedido sin terminar"
        message="¿Descartar el pedido sin terminar? Se perderán los productos, el cliente y la nota."
        verbo="Descartar"
        onCancel={() => setDiscardDraft(false)}
        onConfirm={() => {
          clearDraft("order", s.sessionUserId ?? null);
          setOrderDraft(null);
          setDiscardDraft(false);
          toast.success("Pedido sin terminar descartado");
        }}
      />

      <Modal
        open={!!depositingFor}
        onClose={() => setDepositingFor(null)}
        title={`Abonar · ${depositingFor?.number ?? ""}`}
      >
        {depositingFor && (
          <AddDeposit orderId={depositingFor.id} onClose={() => setDepositingFor(null)} />
        )}
      </Modal>

      <Modal
        open={!!printingFor}
        onClose={() => setPrintingFor(null)}
        title={`Ticket · ${printingFor?.number ?? ""}`}
      >
        {printingFor && <TicketPreview order={printingFor} />}
      </Modal>
    </>
  );
}

function AddDeposit({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const s = useAppState();
  const money = useMoney();
  const order = s.orders.find((o) => o.id === orderId);
  const methods = s.paymentMethods.filter((m) => m.active);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const method = methods.find((m) => m.id === methodId);

  if (!order) return null;
  const balance = orderBalance(s, order);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-sup-2 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total del pedido</span>
          <span className="text-right">
            <span className="num block font-medium">{money.fmtBs(balance.totalUsd)}</span>
            <span className="num block text-[11px] text-muted-foreground">
              {usd(balance.totalUsd)}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Ya abonado</span>
          <span className="text-right">
            <span className="num block font-medium">{money.fmtBs(balance.depositUsd)}</span>
            <span className="num block text-[11px] text-muted-foreground">
              {usd(balance.depositUsd)}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-medium">Saldo pendiente</span>
          <span className="text-right">
            <span className="num block font-semibold">{money.fmtBs(balance.balanceUsd)}</span>
            <span className="num block text-[11px] text-muted-foreground">
              {usd(balance.balanceUsd)}
            </span>
          </span>
        </div>
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
      <Field label={`Monto en ${method?.currency === "USD" ? "USD" : "Bs"}`}>
        <Input
          className="num"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {method?.requiresReference && (
        <Field label="Referencia">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Btn size="lg" className="w-full sm:w-auto" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          size="lg"
          variant="amber"
          className="w-full sm:w-auto"
          onClick={() => {
            if (!method) return toast.error("Selecciona la forma de pago");
            const val = parseAmount(amount);
            if (!Number.isFinite(val) || val <= 0) return toast.error("Monto inválido");
            const res = addOrderDeposit(orderId, {
              methodId: method.id,
              amount: val,
              reference: reference.trim() || undefined,
            });
            if (!res.ok) return toast.error(res.error!);
            toast.success("Abono registrado");
            onClose();
          }}
        >
          Registrar abono
        </Btn>
      </div>
    </div>
  );
}

function EditOrder({ order, onClose }: { order: Order; onClose: () => void }) {
  const s = useAppState();
  const money = useMoney();
  const [items, setItems] = useState(order.items);
  const [note, setNote] = useState(order.note ?? "");
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const variosTipos = s.priceTypes.length > 1;
  const pricedItems = items.filter((i) => !i.bsOnly);
  const cartPriceType = commonPriceTypeId(items);
  // Texto a medio tipear en el campo de cantidad de cada línea, igual que en
  // el mostrador (ver LineRows en components/pos.tsx): permite borrar el
  // dígito y tipear el número nuevo sin que salte de vuelta a 1.
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  function forgetQtyDraft(key: string) {
    setQtyDrafts((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function setQty(idx: number, qty: number) {
    setItems((prev) =>
      prev.map((x, j) =>
        j === idx
          ? { ...x, qty, subtotalUsd: (x.unitPriceUsd + (x.customizationPrice ?? 0)) * qty }
          : x,
      ),
    );
  }

  /** Repricea todo el pedido a un tipo, igual que en el mostrador (POS). */
  function applyPriceTypeToAll(id: string) {
    setItems((prev) => mergeLines(prev.map((i) => repriceLine(s, i, id))));
  }

  /** Cambia el tipo de precio de una sola línea. */
  function setLinePriceType(idx: number, id: string) {
    setItems((prev) => mergeLines(prev.map((i, k) => (k === idx ? repriceLine(s, i, id) : i))));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Artículos ({items.length})</p>
        {/* Mismo control general que en el mostrador: repricea todo el pedido
            de un golpe y refleja "Mixto" si las líneas quedaron con tipos
            distintos. Sin líneas con tipo (solo tortas frías) no hay nada que
            comparar, así que no se muestra. */}
        {variosTipos && pricedItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Todo a</span>
            <PriceTypeControl
              priceTypes={s.priceTypes}
              value={cartPriceType}
              onChange={applyPriceTypeToAll}
              ariaLabel="Tipo de precio de todo el pedido"
              mixedLabel="Mixto"
            />
          </div>
        )}
      </div>
      <div className="space-y-2">
        {items.map((i, k) => (
          <div key={lineKeyOf(i)} className="space-y-2 rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
              <button
                onClick={() => {
                  setItems(items.filter((_, j) => j !== k));
                  forgetQtyDraft(lineKeyOf(i));
                }}
                className="-mr-1 grid size-11 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-sup-2 hover:text-rojo sm:size-8"
                aria-label={`Quitar ${i.name} del pedido`}
              >
                <IcoPapelera />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  inputMode="numeric"
                  value={qtyDrafts[lineKeyOf(i)] ?? String(i.qty)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    // Igual criterio que en el mostrador: se guarda el texto
                    // tal cual (permite dejarlo vacío un instante) y, si ya
                    // parsea a un número válido, se aplica de una vez.
                    const raw = e.target.value.replace(/\D/g, "");
                    const key = lineKeyOf(i);
                    setQtyDrafts((prev) => ({ ...prev, [key]: raw }));
                    if (raw !== "") {
                      const qty = parseInt(raw, 10);
                      if (Number.isFinite(qty) && qty > 0) setQty(k, qty);
                    }
                  }}
                  onBlur={() => {
                    // Vacío o 0 al salir: vuelve a la cantidad anterior (no
                    // elimina la línea, para eso está la papelera).
                    forgetQtyDraft(lineKeyOf(i));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  aria-label={`Cantidad de ${i.name}`}
                  className="num h-11 w-14 shrink-0 rounded border border-border bg-card px-2 text-center text-sm sm:h-9"
                />
                {/* Tipo de precio de esta línea sola, con el mismo control que el
                    mostrador: único selector interactivo para esta línea. */}
                {variosTipos && !i.bsOnly && (
                  <PriceTypeControl
                    priceTypes={s.priceTypes}
                    value={i.priceTypeId}
                    onChange={(id) => setLinePriceType(k, id)}
                    ariaLabel={`Tipo de precio de ${i.name}`}
                  />
                )}
                {variosTipos && i.bsOnly && (
                  <span className="text-[11px] text-texto-3">Precio fijo Bs</span>
                )}
              </div>
              <span className="text-right">
                <span className="num block text-sm">{money.fmtBsAmount(lineBs(i, money))}</span>
                {!i.bsOnly && (
                  <span className="num block text-[10px] text-muted-foreground">
                    {usd(i.subtotalUsd)}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
      <Field label="Estado">
        <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
          {STATUSES.filter((x) => x.key !== "procesado").map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notas">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Btn size="lg" className="w-full sm:w-auto" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          size="lg"
          variant="amber"
          className="w-full sm:w-auto"
          onClick={() => {
            if (!items.length) return toast.error("El pedido debe tener productos");
            updateOrder(order.id, { items, note, status });
            toast.success("Pedido actualizado");
            onClose();
          }}
        >
          Guardar
        </Btn>
      </div>
      <button
        className="-mx-1 -my-1 rounded px-1 py-1 text-xs text-rojo hover:underline"
        onClick={() => {
          setOrderStatus(order.id, "cancelado");
          toast.success("Pedido cancelado");
          onClose();
        }}
      >
        Cancelar pedido
      </button>
    </div>
  );
}
