import { createFileRoute } from "@tanstack/react-router";
import { IcoAlerta, IcoBuscar, IcoMas } from "@/chasis/iconos";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import {
  Aviso,
  Badge,
  Btn,
  Card,
  CardHead,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { PriceAlertAviso } from "@/components/price-alert";
import { logAudit, mutate, useAppState } from "@/lib/store";
import { addMovement, priceOf } from "@/lib/business";
import { nextProductCode } from "@/lib/catalog";
import {
  companyPriceRule,
  defaultPriceType,
  isGenericColdCake,
  priceAlertKey,
  priceAlerts,
} from "@/lib/pricing";
import { queueProductCreate, queueProductUpdate } from "@/lib/sync/mutations";
import {
  categoryErrorText,
  createCategory,
  deleteCategory,
  renameCategory,
  useCategoryAccess,
} from "@/lib/sync/categories";
import { deleteProduct, deletionErrorText } from "@/lib/sync/deletions";
import { dt, num, usd } from "@/lib/format";
import { uid } from "@/lib/seed";
import type { Category, Product } from "@/lib/types";

export const Route = createFileRoute("/inventario")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventario · Karelys Delicias" },
      {
        name: "description",
        content: "Productos, precios por tipo, stock y movimientos de inventario.",
      },
      { property: "og:title", content: "Inventario · Karelys Delicias" },
      {
        property: "og:description",
        content: "Productos, precios por tipo, stock y movimientos de inventario.",
      },
    ],
  }),
  component: () => (
    <AppShell requires="view_inventory">
      <Inventario />
    </AppShell>
  ),
});

function Inventario() {
  const s = useAppState();
  const { can } = useSession();
  const [tab, setTab] = useState<"productos" | "categorias" | "movimientos">("productos");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const [borrandoProducto, setBorrandoProducto] = useState(false);
  const [mov, setMov] = useState<Product | null>(null);

  // La cifra grande es la del tipo de precio predeterminado (Ajustes); los
  // demás tipos van debajo, para no mostrar un solo precio sin decir cuál es.
  const tipoPorDefecto = defaultPriceType(s);
  const otrosTipos = s.priceTypes.filter((pt) => pt.id !== tipoPorDefecto?.id);

  const list = s.products.filter(
    (p) =>
      (cat === "all" || p.categoryId === cat) &&
      (stockFilter === "all" ||
        (stockFilter === "bajo" ? p.stock <= p.minStock : p.stock > p.minStock)) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.code.toLowerCase().includes(q.toLowerCase())),
  );

  const alerts = priceAlerts(s);

  return (
    <>
      <PageHead
        title="Inventario"
        sub="Lo que hay, lo que falta y todo lo que entra y sale del mostrador."
        dato={`${s.products.length} productos · ${s.categories.length} categorías`}
        action={
          can("edit_inventory") && (
            <Btn
              variant="amber"
              onClick={() =>
                setEdit({
                  // Sugerido según la secuencia de Ajustes · Impresión y
                  // numeración; el campo sigue siendo editable en el formulario.
                  code: nextProductCode(s),
                  name: "",
                  categoryId: s.categories[0]?.id,
                  stock: 0,
                  minStock: 5,
                  active: true,
                  prices: [],
                })
              }
            >
              <IcoMas /> Nuevo producto
            </Btn>
          )
        }
      />

      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <PriceAlertAviso key={priceAlertKey(a)} alert={a} canFix={can("edit_inventory")} />
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-[0.15rem] overflow-x-auto border-b border-border">
        {(["productos", "categorias", "movimientos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-selected={tab === t}
            role="tab"
            className={
              "-mb-px whitespace-nowrap border-b-2 px-[0.85rem] py-[0.6rem] text-[0.9rem] capitalize transition-colors duration-[140ms] " +
              (tab === t
                ? "border-sol font-semibold text-texto"
                : "border-transparent font-medium text-texto-2 hover:text-texto")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "productos" && (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3">
                <IcoBuscar />
              </span>
              <Input
                className="pl-9"
                placeholder="Buscar producto o código"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-48">
              <option value="all">Todas las categorías</option>
              {s.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="sm:w-40"
            >
              <option value="all">Todo el stock</option>
              <option value="bajo">Stock bajo</option>
              <option value="ok">Stock suficiente</option>
            </Select>
          </div>

          <Card className="overflow-x-auto">
            {list.length === 0 ? (
              <Empty title="Sin productos" />
            ) : (
              <>
                {/* Tabla desktop */}
                <table className="hidden w-full text-sm md:table">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Código</th>
                      <th className="px-4 py-2.5">Producto</th>
                      <th className="px-4 py-2.5">Categoría</th>
                      <th className="px-4 py-2.5 text-right">Stock</th>
                      <th className="px-4 py-2.5 text-right">Mínimo</th>
                      <th className="px-4 py-2.5 text-right">
                        {tipoPorDefecto ? `Precio ${tipoPorDefecto.name}` : "Precio"}
                      </th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td className="num px-4 py-2.5 text-xs text-muted-foreground">{p.code}</td>
                        <td className="px-4 py-2.5">{p.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {s.categories.find((c) => c.id === p.categoryId)?.name}
                        </td>
                        <td
                          className={
                            "num px-4 py-2.5 text-right " +
                            (p.stock <= p.minStock ? "text-rojo" : "")
                          }
                        >
                          {p.stock}
                        </td>
                        <td className="num px-4 py-2.5 text-right text-muted-foreground">
                          {p.minStock}
                        </td>
                        <td className="num px-4 py-2.5 text-right">
                          {p.bsOnly ? (
                            num(p.bsPrice ?? 0) + " Bs"
                          ) : (
                            <>
                              <span className="block">
                                {usd(priceOf(s, p, tipoPorDefecto?.id))}
                              </span>
                              {otrosTipos.map((pt) => (
                                <span
                                  key={pt.id}
                                  className="block text-[11px] text-muted-foreground"
                                >
                                  {pt.name} {usd(priceOf(s, p, pt.id))}
                                </span>
                              ))}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={p.active ? "green" : "neutral"}>
                            {p.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            {can("edit_inventory") ? (
                              <>
                                <Btn size="sm" onClick={() => setEdit(p)}>
                                  Editar
                                </Btn>
                                <Btn size="sm" variant="ghost" onClick={() => setMov(p)}>
                                  Movimiento
                                </Btn>
                                <Btn size="sm" variant="ghost" onClick={() => setDel(p)}>
                                  Eliminar
                                </Btn>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Solo lectura</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Cards móvil */}
                <div className="divide-y divide-border md:hidden">
                  {list.map((p) => (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="num text-xs text-muted-foreground">{p.code}</p>
                        </div>
                        <span className="num shrink-0 text-right text-sm">
                          {p.bsOnly ? (
                            num(p.bsPrice ?? 0) + " Bs"
                          ) : (
                            <>
                              <span className="block">
                                {usd(priceOf(s, p, tipoPorDefecto?.id))}
                              </span>
                              {otrosTipos.map((pt) => (
                                <span
                                  key={pt.id}
                                  className="block text-[11px] text-muted-foreground"
                                >
                                  {pt.name} {usd(priceOf(s, p, pt.id))}
                                </span>
                              ))}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge tone={p.stock <= p.minStock ? "red" : "neutral"}>
                          Stock {p.stock}
                        </Badge>
                        <Badge tone={p.active ? "green" : "neutral"}>
                          {p.active ? "Activo" : "Inactivo"}
                        </Badge>
                        {can("edit_inventory") && (
                          <>
                            <Btn size="sm" className="ml-auto" onClick={() => setEdit(p)}>
                              Editar
                            </Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setMov(p)}>
                              Mov.
                            </Btn>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {tab === "categorias" && <Categorias />}
      {tab === "movimientos" && <Movimientos />}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Editar producto" : "Nuevo producto"}
        wide
      >
        {edit && <ProductForm draft={edit} onClose={() => setEdit(null)} />}
      </Modal>

      <Modal open={!!mov} onClose={() => setMov(null)} title={`Movimiento · ${mov?.name ?? ""}`}>
        {mov && <MovementForm product={mov} onClose={() => setMov(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!del}
        danger
        title="Eliminar producto"
        message={`¿Eliminar ${del?.name}? Considera desactivarlo si tiene historial de ventas.`}
        onCancel={() => setDel(null)}
        onConfirm={() => {
          // Igual que categorías: primero el servidor, y sólo si confirma se
          // toca el estado local (ver `lib/sync/deletions`). El código se
          // retira ahí mismo, no hace falta duplicarlo aquí.
          if (borrandoProducto) return;
          const target = del!;
          setBorrandoProducto(true);
          deleteProduct(target)
            .then(() => {
              toast.success("Producto eliminado");
              setDel(null);
            })
            .catch((err) => {
              toast.error("No se pudo eliminar el producto", {
                description: deletionErrorText(err),
              });
            })
            .finally(() => setBorrandoProducto(false));
        }}
      />
    </>
  );
}

function ProductForm({ draft, onClose }: { draft: Partial<Product>; onClose: () => void }) {
  const s = useAppState();
  const [f, setF] = useState<Partial<Product>>({ ...draft });
  // El código con el que se abrió el formulario si es un producto nuevo (lo
  // puso `nextProductCode` al pulsar "Nuevo producto"). Sirve para distinguir,
  // al guardar, "el admin escribió este código a mano" de "sigue siendo el
  // sugerido y mientras tanto se ocupó": sólo el segundo caso se recalcula en
  // vez de rechazarse. Se congela en el primer render: no debe recalcularse
  // sólo porque el catálogo cambió mientras el formulario seguía abierto.
  const [suggestedCode] = useState<string | null>(draft.id ? null : (draft.code ?? null));
  const price = (ptId: string) => f.prices?.find((x) => x.priceTypeId === ptId)?.amount ?? 0;
  const setPrice = (ptId: string, v: number) => {
    const rest = (f.prices ?? []).filter((x) => x.priceTypeId !== ptId);
    setF({ ...f, prices: [...rest, { priceTypeId: ptId, amount: v }] });
  };
  /* El genérico de tortas frías es el único producto con alerta de precio bajo.
     El aviso es **informativo y no bloquea**: su precio se edita aquí como el de
     cualquier otro producto (la indirección del grupo de precio desapareció en
     el esquema 6); lo único que hace la regla es avisar cuando el equivalente en
     USD se queda corto. Se mira el producto ya guardado, no el borrador: es el
     que evalúa `priceAlerts`. */
  const guardado = f.id ? s.products.find((p) => p.id === f.id) : undefined;
  const conAlerta = !!guardado && isGenericColdCake(guardado);
  const regla = companyPriceRule(s);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label="Código"
        hint={!f.id ? "Automático según Ajustes · puedes cambiarlo" : undefined}
      >
        <Input
          value={f.code ?? ""}
          // El servidor guarda los códigos en mayúsculas (misma serie que
          // `nextProductCode`); pasarlo aquí evita que "p061" y "P061" se vean
          // como códigos distintos hasta que el guardado los normalice.
          onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
        />
      </Field>
      <Field label="Nombre">
        <Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Categoría">
        <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          {s.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Imagen">
        <input
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => setF({ ...f, imageUrl: String(r.result) });
            r.readAsDataURL(file);
          }}
        />
      </Field>
      <Field label="Stock actual">
        <Input
          className="num"
          type="number"
          value={f.stock ?? 0}
          onChange={(e) => setF({ ...f, stock: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Stock mínimo">
        <Input
          className="num"
          type="number"
          value={f.minStock ?? 0}
          onChange={(e) => setF({ ...f, minStock: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      {conAlerta && (
        <div className="sm:col-span-2">
          <Aviso tone="amber" icon={IcoAlerta} title="Este producto tiene alerta de precio bajo">
            Si su precio se queda por debajo de {usd(regla.minUsd)} —también porque suba la tasa,
            sin que nadie lo edite— aparece un aviso para subirlo a {usd(regla.targetUsd)}. El
            mínimo y el objetivo se configuran en <strong>Ajustes · Impresión y numeración</strong>.
            Nada de esto bloquea la venta ni la edición del precio.
          </Aviso>
        </div>
      )}
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Precios por tipo (USD)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {s.priceTypes.map((pt) => (
            <Field key={pt.id} label={pt.name}>
              <Input
                className="num"
                inputMode="decimal"
                // Input NO controlado a propósito (`defaultValue`, no `value`):
                // si se ata `value` al número ya parseado, cada tecla dispara un
                // re-render que reformatea `f.prices` de vuelta a texto y le pisa
                // al usuario lo que acaba de teclear (el punto decimal, un cero
                // final) antes de que pueda seguir escribiendo — con montos en
                // USD eso hacía prácticamente imposible escribir centavos y podía
                // terminar guardando un número muy distinto al tecleado. `f.prices`
                // sigue siendo la fuente de verdad para "Guardar": `onChange` la
                // sigue actualizando, sólo dejó de retroalimentar el campo.
                defaultValue={String(price(pt.id))}
                onChange={(e) => setPrice(pt.id, parseFloat(e.target.value.replace(",", ".")) || 0)}
              />
            </Field>
          ))}
        </div>
      </div>
      <Field label="Sólo en bolívares">
        <Select
          value={f.bsOnly ? "si" : "no"}
          onChange={(e) => setF({ ...f, bsOnly: e.target.value === "si" })}
        >
          <option value="no">No</option>
          <option value="si">Sí (precio fijo en Bs)</option>
        </Select>
      </Field>
      {f.bsOnly && (
        <Field label="Precio en Bs">
          <Input
            className="num"
            // Mismo motivo que el precio en USD de arriba: no controlado para no
            // pisarle al usuario el punto decimal mientras escribe.
            defaultValue={String(f.bsPrice ?? 0)}
            onChange={(e) =>
              setF({ ...f, bsPrice: parseFloat(e.target.value.replace(",", ".")) || 0 })
            }
          />
        </Field>
      )}
      <Field label="Estado">
        <Select
          value={f.active ? "1" : "0"}
          onChange={(e) => setF({ ...f, active: e.target.value === "1" })}
        >
          <option value="1">Activo</option>
          <option value="0">Inactivo</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Descripción">
          <Textarea
            rows={2}
            value={f.description ?? ""}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn
          variant="amber"
          onClick={() => {
            if (!f.name?.trim() || !f.code?.trim())
              return toast.error("Código y nombre son obligatorios");
            // El contrato exige cantidades no negativas. Se comprueba aquí porque
            // un rechazo del servidor es **permanente**: la mutación sale de la
            // cola, el producto se queda sólo en este navegador y el siguiente
            // bootstrap —que reemplaza el catálogo completo— se lo lleva.
            if ((f.stock ?? 0) < 0 || (f.minStock ?? 0) < 0)
              return toast.error("El stock y el stock mínimo no pueden ser negativos");

            // Validación del código: el servidor rechazaría igual un código ya
            // usado por otro producto o uno retirado, y ese rechazo es
            // permanente (ver el comentario de arriba), así que se ataja aquí.
            let code = f.code!.trim().toUpperCase();
            const retirados = new Set(s.retiredProductCodes ?? []);
            const usadoPorOtro = (c: string) =>
              s.products.some((p) => p.code === c && p.id !== f.id);

            if (!f.id && code === suggestedCode && (usadoPorOtro(code) || retirados.has(code))) {
              // El código sugerido al abrir el formulario se ocupó mientras
              // tanto (llegó un producto por sync): se recalcula en vez de
              // rechazar, la misma situación que resuelve el servidor con
              // `renumbered` cuando esto se escapa a una mutación en cola.
              code = nextProductCode(s);
              toast.info(`El código sugerido ya se había ocupado: se usa ${code}`);
            }

            if (usadoPorOtro(code)) return toast.error(`El código ${code} ya lo usa otro producto`);
            // Sólo un código **nuevo** puede chocar con un retirado. Al editar sin
            // tocar el código no se mira: un producto borrado aquí vuelve con el
            // siguiente bootstrap (el borrado no sube al servidor) y su código ya
            // quedó en `retiredProductCodes`, así que la comprobación lo dejaría
            // sin poder guardarse nunca más.
            const codigoOriginal = f.id ? s.products.find((p) => p.id === f.id)?.code : undefined;
            if (code !== codigoOriginal && retirados.has(code))
              return toast.error(`El código ${code} está retirado y no se puede reutilizar`);

            const desiredStock = f.stock ?? 0;
            let created: Product | undefined;
            let edited: Product | undefined;
            let stockBefore = desiredStock;

            mutate((st) => {
              if (f.id) {
                const ex = st.products.find((x) => x.id === f.id);
                if (ex) {
                  stockBefore = ex.stock;
                  // `code` no se toca al editar un producto existente: sólo
                  // pudo cambiar por una corrección a mano, y esa corrección
                  // ya pasó por la misma validación de arriba.
                  Object.assign(ex, f, { code });
                  edited = ex;
                }
                logAudit("producto_editado", "product", f.id);
              } else {
                const p: Product = {
                  id: uid(),
                  code,
                  name: f.name!,
                  description: f.description,
                  categoryId: f.categoryId!,
                  imageUrl: f.imageUrl,
                  stock: f.stock ?? 0,
                  minStock: f.minStock ?? 0,
                  active: f.active ?? true,
                  bsOnly: f.bsOnly,
                  bsPrice: f.bsPrice,
                  prices: f.prices ?? [],
                  createdAt: new Date().toISOString(),
                };
                st.products.unshift(p);
                created = p;
                logAudit("producto_creado", "product", p.id);
              }
            });

            /* Encolar va **después** del `mutate`, con el producto ya en su forma
               final, y en este orden: la cola se aplica en secuencia en el
               servidor, así que el producto existe allí antes del movimiento que
               le fija la existencia.

               El `stock` no viaja en `product.create` ni en `product.update` —el
               servidor es la única fuente de verdad de la existencia y sólo la
               mueve un movimiento de inventario—, así que el número del formulario
               se asienta como `ajuste`, que es la misma pieza que usa el formulario
               de movimientos de esta pantalla. Sin esto el producto se crearía en
               el servidor con stock 0 y el número local desaparecería en el
               siguiente ciclo.

               `ajuste` y no `entrada` a propósito: fija la existencia final en vez
               de sumar, así que es idempotente y no depende de en qué estado esté
               el servidor. Como `applyMovement` también lo aplica en local, un
               `entrada` duplicaría aquí el stock que ya tiene el producto. */
            if (created) {
              queueProductCreate(created);
              if (desiredStock > 0)
                addMovement(
                  created.id,
                  desiredStock,
                  "ajuste",
                  "Stock inicial",
                  "Existencia declarada al crear el producto",
                );
            } else if (edited) {
              queueProductUpdate(edited.id, edited);
              if (desiredStock !== stockBefore)
                addMovement(
                  edited.id,
                  desiredStock,
                  "ajuste",
                  "Ajuste manual",
                  "Stock corregido desde el formulario del producto",
                );
            }

            toast.success("Producto guardado");
            onClose();
          }}
        >
          Guardar
        </Btn>
      </div>
    </div>
  );
}

function MovementForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [type, setType] = useState<"entrada" | "salida" | "ajuste">("entrada");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("Entrada por compra");
  const [note, setNote] = useState("");
  const reasons: Record<string, string[]> = {
    entrada: ["Entrada por compra", "Devolución", "Producción"],
    salida: ["Producto dañado", "Merma", "Consumo interno"],
    ajuste: ["Ajuste manual", "Conteo físico"],
  };
  return (
    <div className="space-y-3">
      <p className="num text-sm text-muted-foreground">Stock actual: {product.stock}</p>
      <Field label="Tipo">
        <Select
          value={type}
          onChange={(e) => {
            const t = e.target.value as typeof type;
            setType(t);
            setReason(reasons[t][0]);
          }}
        >
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
          <option value="ajuste">Ajuste (fijar stock)</option>
        </Select>
      </Field>
      <Field label={type === "ajuste" ? "Stock final" : "Cantidad"}>
        <Input className="num" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Field label="Motivo">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons[type].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <Field label="Observación">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn
          variant="amber"
          onClick={() => {
            const n = parseFloat(qty);
            if (!Number.isFinite(n) || n < 0) return toast.error("Cantidad inválida");
            addMovement(product.id, n, type, reason, note);
            toast.success("Movimiento registrado");
            onClose();
          }}
        >
          Registrar
        </Btn>
      </div>
    </div>
  );
}

/**
 * Categorías. A diferencia del resto de la pantalla **no** se gestionan en local:
 * el backend las declara `ONLINE_ONLY` (no hay mutación de cola que las cree), así
 * que cada alta, renombrado o borrado va por HTTP y el estado local sólo se toca
 * cuando el servidor confirma. Sin conexión los controles quedan deshabilitados con
 * el motivo a la vista: crear una categoría que el servidor no conoce se lleva por
 * delante, en el siguiente bootstrap, a la categoría **y** a los productos que
 * apunten a ella. Ver `lib/sync/categories.ts`.
 */
function Categorias() {
  const s = useAppState();
  const { can } = useSession();
  const acceso = useCategoryAccess();
  const [name, setName] = useState("");
  const [creando, setCreando] = useState(false);

  const sinConexion = acceso.mode === "blocked" ? acceso.reason : undefined;
  // Los mismos permisos que exige el backend: alta y edición con `manage_settings`
  // **o** `edit_inventory`; el borrado sólo con `manage_settings`.
  const edicion = candado(
    sinConexion,
    can("manage_settings") || can("edit_inventory"),
    "Necesitas permiso de inventario o de ajustes para gestionar categorías.",
  );
  const borrado = candado(
    sinConexion,
    can("manage_settings"),
    "Sólo un administrador puede eliminar categorías.",
  );
  const bloqueado = edicion.bloqueado;
  const motivo = edicion.motivo;

  async function agregar() {
    if (bloqueado || creando || !name.trim()) return;
    setCreando(true);
    try {
      const cat = await createCategory(name);
      setName("");
      toast.success(`Categoría "${cat.name}" creada`);
    } catch (err) {
      toast.error("No se pudo crear la categoría", { description: categoryErrorText(err) });
    } finally {
      setCreando(false);
    }
  }

  return (
    <Card>
      <CardHead
        title="Categorías"
        sub={
          acceso.mode === "local" ? undefined : "Se gestionan en el servidor: hace falta conexión."
        }
      />
      {(edicion.motivo ?? borrado.motivo) && (
        <div className="px-3 pt-3">
          <Aviso tone="amber" icon={IcoAlerta}>
            {edicion.motivo ?? borrado.motivo}
          </Aviso>
        </div>
      )}
      <div className="flex gap-2 border-b border-border p-3">
        <Input
          placeholder="Nueva categoría"
          value={name}
          maxLength={80}
          disabled={bloqueado || creando}
          title={motivo}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void agregar();
          }}
        />
        <Btn
          variant="amber"
          disabled={bloqueado || !name.trim()}
          cargando={creando}
          title={motivo}
          onClick={() => void agregar()}
        >
          Agregar
        </Btn>
      </div>
      {s.categories.length === 0 ? (
        <Empty
          title="Sin categorías"
          sub="Cada producto pertenece a una: crea la primera arriba."
        />
      ) : (
        <div className="divide-y divide-border">
          {s.categories.map((c) => (
            <FilaCategoria
              key={c.id}
              cat={c}
              productos={s.products.filter((p) => p.categoryId === c.id).length}
              edicion={edicion}
              borrado={borrado}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Por qué un control de categorías está cerrado: sin conexión o sin permiso. Un
 * solo objeto por acción, para que el botón y su explicación no puedan
 * desincronizarse.
 */
interface Candado {
  bloqueado: boolean;
  motivo?: string;
}

function candado(sinConexion: string | undefined, permitido: boolean, sinPermiso: string): Candado {
  // La conexión se explica primero: es lo que el usuario puede arreglar.
  const motivo = sinConexion ?? (permitido ? undefined : sinPermiso);
  return { bloqueado: !!motivo, motivo };
}

function FilaCategoria({
  cat,
  productos,
  edicion,
  borrado,
}: {
  cat: Category;
  productos: number;
  edicion: Candado;
  borrado: Candado;
}) {
  const [name, setName] = useState(cat.name);
  /** El nombre que trajo el estado la última vez que se sincronizó con el input. */
  const [adoptado, setAdoptado] = useState(cat.name);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El nombre cambió en el estado (lo renombró otro equipo y llegó por sync, o
  // acabó de confirmarlo el servidor): el input adopta el valor autoritativo en
  // lugar de quedarse enseñando uno viejo.
  if (adoptado !== cat.name) {
    setAdoptado(cat.name);
    setName(cat.name);
  }

  const ocupado = guardando || borrando;

  async function guardarNombre() {
    const limpio = name.trim();
    if (ocupado || limpio === cat.name) {
      setName(cat.name);
      return;
    }
    if (!limpio) {
      setName(cat.name);
      toast.error("La categoría necesita un nombre");
      return;
    }
    // Red de seguridad: el input ya está deshabilitado, pero si el acceso se cayó
    // mientras se escribía, el cambio se revierte en lugar de quedarse sólo aquí.
    if (edicion.bloqueado) {
      setName(cat.name);
      toast.error("No se pudo renombrar la categoría", { description: edicion.motivo });
      return;
    }
    setGuardando(true);
    try {
      await renameCategory(cat.id, limpio);
      toast.success("Categoría actualizada");
    } catch (err) {
      setName(cat.name);
      toast.error("No se pudo renombrar la categoría", { description: categoryErrorText(err) });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (ocupado || borrado.bloqueado) return;
    // El servidor también lo niega (409 `has_history`): esto evita el viaje.
    if (productos > 0) {
      toast.error("La categoría tiene productos");
      return;
    }
    setBorrando(true);
    try {
      await deleteCategory(cat.id);
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error("No se pudo eliminar la categoría", { description: categoryErrorText(err) });
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <input
        value={name}
        maxLength={80}
        disabled={edicion.bloqueado || ocupado}
        title={edicion.motivo}
        aria-label={`Nombre de la categoría ${cat.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void guardarNombre()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setName(cat.name);
        }}
        className="flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="num text-xs text-muted-foreground">{productos} productos</span>
      <Btn
        size="sm"
        variant="ghost"
        disabled={borrado.bloqueado}
        cargando={borrando}
        title={borrado.motivo}
        onClick={() => void eliminar()}
      >
        Eliminar
      </Btn>
    </div>
  );
}

function Movimientos() {
  const s = useAppState();
  return (
    <Card>
      <CardHead title="Historial de movimientos" />
      {s.movements.length === 0 ? (
        <Empty
          title="Sin movimientos"
          sub="Cada entrada, salida o ajuste quedará registrado aquí."
        />
      ) : (
        <div className="divide-y divide-border">
          {s.movements.slice(0, 100).map((m) => {
            const p = s.products.find((x) => x.id === m.productId);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <Badge
                  tone={m.type === "entrada" ? "green" : m.type === "salida" ? "red" : "amber"}
                >
                  {m.type}
                </Badge>
                <span className="flex-1 truncate">{p?.name ?? "—"}</span>
                <span className="num">{m.qty}</span>
                <span className="text-xs text-muted-foreground">{m.reason}</span>
                <span className="num text-xs text-texto-3">{dt(m.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
