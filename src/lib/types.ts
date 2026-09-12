export type ID = string;

export type Permission =
  | "view_sales"
  | "create_sale"
  | "edit_sale"
  | "cancel_sale"
  | "view_inventory"
  | "edit_inventory"
  | "view_customers"
  | "edit_customers"
  | "view_orders"
  | "edit_orders"
  | "process_orders"
  | "close_cash"
  | "manage_users"
  | "manage_settings"
  | "manage_exchange_rates";

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "view_sales", label: "Ver ventas" },
  { key: "create_sale", label: "Crear venta" },
  { key: "edit_sale", label: "Editar venta" },
  { key: "cancel_sale", label: "Anular venta" },
  { key: "view_inventory", label: "Ver inventario" },
  { key: "edit_inventory", label: "Editar inventario" },
  { key: "view_customers", label: "Ver clientes" },
  { key: "edit_customers", label: "Editar clientes" },
  { key: "view_orders", label: "Ver pedidos" },
  { key: "edit_orders", label: "Editar pedidos" },
  { key: "process_orders", label: "Procesar pedidos" },
  { key: "close_cash", label: "Cerrar caja" },
  { key: "manage_users", label: "Gestionar usuarios" },
  { key: "manage_settings", label: "Gestionar ajustes" },
  { key: "manage_exchange_rates", label: "Gestionar tasas" },
];

export interface Role {
  id: ID;
  name: string;
  permissions: Permission[];
  system?: boolean;
}

export interface User {
  id: ID;
  username: string;
  fullName: string;
  email?: string;
  password: string;
  roleId: ID;
  active: boolean;
  createdAt: string;
}

export interface Category {
  id: ID;
  name: string;
  active: boolean;
}

export interface PriceType {
  id: ID;
  name: string;
  isDefault: boolean;
}

export interface ProductPrice {
  priceTypeId: ID;
  amount: number;
}

/**
 * Regla de precio en USD aplicable a un grupo de precio o a una familia entera.
 *
 * - `minUsd`    umbral de alerta: si el precio USD queda por debajo, se dispara
 *               una alerta pidiendo subirlo (ver `priceAlerts` en lib/pricing).
 * - `targetUsd` precio objetivo que sugiere la alerta al corregir.
 * - `band`      banda dura opcional para el equivalente en Bs ya redondeado.
 *               Sólo los grupos que la declaran pueden bloquear una venta;
 *               si falta, la regla es informativa (alerta) y nunca bloquea.
 */
export interface PriceRule {
  minUsd: number;
  targetUsd: number;
  band?: { minUsd: number; maxUsd: number };
}

/**
 * Unidad de precio compartida por varios productos: el "precio general".
 * Editando el grupo se cambia el precio de todos sus miembros a la vez.
 *
 * Un grupo puede tener un único miembro: así se modelan los sabores que deben
 * conservar precio propio y diferenciado ("Oreo y Brownie", "Torta Quesillo")
 * sin sacarlos de la familia ni duplicar la lógica de precios.
 */
export interface PriceGroup {
  id: ID;
  name: string;
  /** Familia/categoría a la que pertenece el grupo (para agruparlo en la UI). */
  categoryId?: ID;
  /** Precios en USD por tipo de precio. Es la fuente de verdad de sus miembros. */
  prices: ProductPrice[];
  /** Regla propia; si falta se hereda la de `CompanySettings`. */
  rule?: PriceRule;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: ID;
  code: string;
  name: string;
  description?: string;
  categoryId: ID;
  imageUrl?: string;
  stock: number;
  minStock: number;
  active: boolean;
  /** Producto que se vende sólo en Bs (no se convierte desde USD) */
  bsOnly?: boolean;
  bsPrice?: number;
  /**
   * Precio propio en USD. Es la fuente de verdad **sólo** si el producto no
   * pertenece a un grupo de precio. Se conserva siempre como respaldo
   * histórico; usa `priceOf(state, product, priceTypeId)` para leer el precio
   * efectivo y `ownPriceOf(product, priceTypeId)` para editar el propio.
   */
  prices: ProductPrice[];
  /**
   * Cuando está definido, el precio de venta lo dicta el `PriceGroup` y NO
   * `prices`. Nunca se guarda un equivalente en Bs: los productos con precio
   * en USD (tortas de cumpleaños incluidas) se convierten en el momento de
   * mostrar o vender con la tasa BCV vigente.
   */
  priceGroupId?: ID;
  isCombo?: boolean;
  comboItems?: ComboItem[];
  allowCustomization?: boolean;
  customizationPrice?: number;
  createdAt: string;
}

/** Alerta de precio derivada (no se persiste: se calcula al vuelo). */
export type PriceAlertKind = "precio_bajo";

export interface PriceAlert {
  kind: PriceAlertKind;
  /** Grupo cuyo precio hay que corregir (si el precio lo dicta un grupo). */
  priceGroupId?: ID;
  priceGroupName?: string;
  /** Productos afectados por esa unidad de precio. */
  productIds: ID[];
  productNames: string[];
  priceTypeId: ID;
  priceTypeName: string;
  currentUsd: number;
  thresholdUsd: number;
  suggestedUsd: number;
  message: string;
}

export interface ComboItem {
  description: string;
  qty: number;
  productId?: ID;
}

export type MovementType = "entrada" | "salida" | "ajuste";

export interface InventoryMovement {
  id: ID;
  productId: ID;
  qty: number;
  type: MovementType;
  reason: string;
  note?: string;
  userId: ID;
  createdAt: string;
}

export interface Customer {
  id: ID;
  cedula: string;
  name: string;
  phone?: string;
  address?: string;
  active: boolean;
  createdAt: string;
}

export type RateSource = "BCV_USD" | "BCV_EUR" | "BINANCE";

export interface ExchangeRate {
  id: ID;
  source: RateSource;
  currency: "USD" | "EUR";
  value: number;
  automatic: boolean;
  userId: ID | null;
  createdAt: string;
}

export interface PaymentMethod {
  id: ID;
  name: string;
  currency: "USD" | "BS";
  requiresReference: boolean;
  active: boolean;
}

export interface Payment {
  methodId: ID;
  methodName: string;
  currency: "USD" | "BS";
  amount: number;
  /** equivalente en USD */
  usdEquivalent: number;
  reference?: string;
  /**
   * Momento real en que entró el dinero. Si falta, es el de la venta.
   * Un abono cobrado días antes lo conserva para que el cierre de caja lo
   * cuente en su día y no en el de la venta.
   */
  at?: string;
  /** Tasa BCV con la que se calculó `usdEquivalent` (pagos en Bs). */
  rateUsed?: number;
  /** Id del abono de pedido que originó este pago (ver `OrderDeposit`). */
  fromOrderDepositId?: ID;
}

/**
 * Abono / pago adelantado sobre un pedido. Es un `Payment` con identidad,
 * fecha propia y tasa congelada, porque el dinero entra en caja el día del
 * abono aunque la venta se cierre días después.
 */
export interface OrderDeposit extends Payment {
  id: ID;
  createdAt: string;
  /** Tasa BCV vigente al recibir el abono (congelada, para auditoría). */
  rateUsed: number;
  userId: ID;
  note?: string;
  /** Venta que finalmente consumió el abono, si el pedido ya se procesó. */
  saleId?: ID;
  /** Abono anulado o devuelto: no cuenta para el saldo ni para el cierre. */
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

export interface LineItem {
  productId: ID;
  code: string;
  name: string;
  qty: number;
  priceTypeId: ID;
  /** Precio unitario en USD. Fuente de verdad de las líneas convertibles. */
  unitPriceUsd: number;
  /**
   * Precio unitario en Bs. Se llena **sólo** cuando `bsOnly` es true (precio
   * fijado en Bs). Para el resto de líneas queda vacío a propósito: el
   * equivalente en Bs se calcula al mostrar/vender con la tasa vigente
   * (ver `lineBs`/`itemsTotals` en lib/pricing), nunca se precomputa.
   */
  unitPriceBs?: number;
  bsOnly?: boolean;
  customization?: string;
  customizationPrice?: number;
  subtotalUsd: number;
}

export type SaleStatus = "completada" | "anulada";

export interface Sale {
  id: ID;
  number: string;
  createdAt: string;
  customerId: ID | null;
  customerName: string;
  userId: ID;
  userName: string;
  items: LineItem[];
  payments: Payment[];
  totalUsd: number;
  totalBs: number;
  changeUsd?: number;
  rateSnapshot: { usd: number; eur: number; binance: number; at: string };
  status: SaleStatus;
  orderId?: ID;
  note?: string;
}

export type OrderStatus = "pendiente" | "preparacion" | "listo" | "procesado" | "cancelado";

export interface Order {
  id: ID;
  number: string;
  createdAt: string;
  customerId: ID | null;
  customerName: string;
  items: LineItem[];
  totalUsd: number;
  note?: string;
  status: OrderStatus;
  userId: ID;
  saleId?: ID;
  /**
   * Abonos recibidos. Es la única fuente de verdad del saldo: ni el total
   * abonado ni el saldo pendiente se persisten, se calculan con
   * `orderBalance(order)` (ver lib/orders) para que no puedan desincronizarse
   * cuando se editan las líneas del pedido.
   */
  deposits?: OrderDeposit[];
}

export type OrderPaymentStatus = "sin_abono" | "abonado" | "pagado";

/** Vista derivada del estado de pago de un pedido. No se persiste. */
export interface OrderBalance {
  totalUsd: number;
  /** Suma en USD de los abonos vigentes (excluye anulados). */
  depositUsd: number;
  /** Lo que falta por pagar. Nunca negativo. */
  balanceUsd: number;
  /** Excedente abonado, si el pedido se redujo después de abonar. */
  overpaidUsd: number;
  status: OrderPaymentStatus;
  deposits: OrderDeposit[];
}

export interface DailyClosure {
  id: ID;
  date: string;
  userId: ID;
  userName: string;
  salesCount: number;
  totalUsd: number;
  totalBs: number;
  byMethod: { methodId: ID; methodName: string; expected: number; received: number }[];
  expectedUsd: number;
  receivedUsd: number;
  differenceUsd: number;
  note?: string;
  closedAt: string;
}

export interface AuditLog {
  id: ID;
  userId: ID;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  data?: string;
  createdAt: string;
}

export interface CompanySettings {
  name: string;
  logoUrl: string;
  phone: string;
  address: string;
  taxId: string;
  ticketFooter: string;
  salePrefix: string;
  saleNext: number;
  orderPrefix: string;
  orderNext: number;
  /**
   * Regla de precio por defecto de las tortas frías (se hereda cuando un grupo
   * no declara la suya):
   *   `coldCakeMin` → umbral de alerta de precio bajo (por defecto 1.10 USD)
   *   `coldCakeMax` → precio objetivo sugerido por la alerta (por defecto 1.30)
   * Léelas siempre con `companyPriceRule(state)` (lib/pricing), no directo.
   */
  coldCakeMin: number;
  coldCakeMax: number;
  coldCakeCategory: string;
  bsRounding: number;
  /** Horas tras las que la tasa BCV se considera vencida y hay que refrescarla. */
  rateMaxAgeHours?: number;
  shortcuts?: Record<string, string>;
}

export interface AppState {
  version: number;
  roles: Role[];
  users: User[];
  categories: Category[];
  priceTypes: PriceType[];
  /** Precios generales compartidos. Ver `PriceGroup`. */
  priceGroups: PriceGroup[];
  products: Product[];
  movements: InventoryMovement[];
  customers: Customer[];
  rates: ExchangeRate[];
  paymentMethods: PaymentMethod[];
  sales: Sale[];
  orders: Order[];
  closures: DailyClosure[];
  audit: AuditLog[];
  company: CompanySettings;
  sessionUserId: ID | null;
}
