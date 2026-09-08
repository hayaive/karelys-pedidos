import { createFileRoute } from "@tanstack/react-router";
import { IcoBuscar, IcoMas } from "@/chasis/iconos";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHead } from "@/components/app-shell";
import { useSession } from "@/lib/auth";
import {
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
import { logAudit, mutate, useAppState } from "@/lib/store";
import { addMovement, priceOf } from "@/lib/business";
import { dt, num, usd } from "@/lib/format";
import { uid } from "@/lib/seed";
import type { Product } from "@/lib/types";

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
  const [mov, setMov] = useState<Product | null>(null);

  const list = s.products.filter(
    (p) =>
      (cat === "all" || p.categoryId === cat) &&
      (stockFilter === "all" ||
        (stockFilter === "bajo" ? p.stock <= p.minStock : p.stock > p.minStock)) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.code.toLowerCase().includes(q.toLowerCase())),
  );

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
                  code: "",
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
              <IcoBuscar />
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
                      <th className="px-4 py-2.5 text-right">Precio</th>
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
                          {p.bsOnly
                            ? num(p.bsPrice ?? 0) + " Bs"
                            : usd(priceOf(p, s.priceTypes[0]?.id))}
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
                        <span className="num text-sm">
                          {p.bsOnly
                            ? num(p.bsPrice ?? 0) + " Bs"
                            : usd(priceOf(p, s.priceTypes[0]?.id))}
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
          mutate((st) => {
            st.products = st.products.filter((x) => x.id !== del!.id);
            logAudit("producto_eliminado", "product", del!.id);
          });
          toast.success("Producto eliminado");
          setDel(null);
        }}
      />
    </>
  );
}

function ProductForm({ draft, onClose }: { draft: Partial<Product>; onClose: () => void }) {
  const s = useAppState();
  const [f, setF] = useState<Partial<Product>>({ ...draft });
  const price = (ptId: string) => f.prices?.find((x) => x.priceTypeId === ptId)?.amount ?? 0;
  const setPrice = (ptId: string, v: number) => {
    const rest = (f.prices ?? []).filter((x) => x.priceTypeId !== ptId);
    setF({ ...f, prices: [...rest, { priceTypeId: ptId, amount: v }] });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Código">
        <Input value={f.code ?? ""} onChange={(e) => setF({ ...f, code: e.target.value })} />
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
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Precios por tipo (USD)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {s.priceTypes.map((pt) => (
            <Field key={pt.id} label={pt.name}>
              <Input
                className="num"
                inputMode="decimal"
                value={String(price(pt.id))}
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
            value={String(f.bsPrice ?? 0)}
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
            mutate((st) => {
              if (f.id) {
                const ex = st.products.find((x) => x.id === f.id);
                if (ex) Object.assign(ex, f);
                logAudit("producto_editado", "product", f.id);
              } else {
                const p: Product = {
                  id: uid(),
                  code: f.code!,
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
                logAudit("producto_creado", "product", p.id);
              }
            });
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

function Categorias() {
  const s = useAppState();
  const [name, setName] = useState("");
  return (
    <Card>
      <CardHead title="Categorías" />
      <div className="flex gap-2 border-b border-border p-3">
        <Input
          placeholder="Nueva categoría"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Btn
          variant="amber"
          onClick={() => {
            if (!name.trim()) return;
            mutate((st) => {
              st.categories.push({ id: uid(), name: name.trim(), active: true });
              logAudit("categoria_creada", "category", name);
            });
            setName("");
            toast.success("Categoría creada");
          }}
        >
          Agregar
        </Btn>
      </div>
      <div className="divide-y divide-border">
        {s.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <input
              defaultValue={c.name}
              onBlur={(e) =>
                mutate((st) => {
                  const cat = st.categories.find((x) => x.id === c.id);
                  if (cat) cat.name = e.target.value;
                })
              }
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <span className="num text-xs text-muted-foreground">
              {s.products.filter((p) => p.categoryId === c.id).length} productos
            </span>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                if (s.products.some((p) => p.categoryId === c.id))
                  return toast.error("La categoría tiene productos");
                mutate((st) => {
                  st.categories = st.categories.filter((x) => x.id !== c.id);
                });
                toast.success("Categoría eliminada");
              }}
            >
              Eliminar
            </Btn>
          </div>
        ))}
      </div>
    </Card>
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
