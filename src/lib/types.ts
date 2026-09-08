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
  prices: ProductPrice[];
  isCombo?: boolean;
  comboItems?: ComboItem[];
  allowCustomization?: boolean;
  customizationPrice?: number;
  createdAt: string;
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
}

export interface LineItem {
  productId: ID;
  code: string;
  name: string;
  qty: number;
  priceTypeId: ID;
  unitPriceUsd: number;
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
  coldCakeMin: number;
  coldCakeMax: number;
  coldCakeCategory: string;
  bsRounding: number;
  shortcuts?: Record<string, string>;
}

export interface AppState {
  version: number;
  roles: Role[];
  users: User[];
  categories: Category[];
  priceTypes: PriceType[];
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
