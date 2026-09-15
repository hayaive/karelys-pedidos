/**
 * El cable: las formas exactas que produce y consume el backend
 * (`hayai-sistema-de-pedidos-backend`, ARCHITECTURE.md §6).
 *
 * Se declaran aquí y no se reutilizan los tipos de `lib/types` porque no son lo
 * mismo: las entidades del servidor son **supersets** de las locales (traen `rev`,
 * `businessDate`, `clientNumber`…) y el día que divergan de verdad, este archivo
 * es el único que hay que ajustar.
 */

import type {
  AuditLog,
  Category,
  CompanySettings,
  Customer,
  DailyClosure,
  ExchangeRate,
  ID,
  InventoryMovement,
  Order,
  OrderDeposit,
  PaymentMethod,
  Permission,
  PriceType,
  Product,
  Role,
  Sale,
  User,
} from "../types";

/* ── Autenticación (§6.2) ─────────────────────────────── */

export interface RemoteUser {
  id: ID;
  username: string;
  fullName: string;
  email?: string;
  roleId: ID;
  active: boolean;
}

export interface LoginResponse {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  user: RemoteUser;
  permissions: Permission[];
  cursor: number;
  serverTime: string;
  schemaVersion: number;
  offlineSessionMaxDays?: number;
}

export interface RefreshResponse {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  serverTime?: string;
}

/* ── Estado inicial (§6.3) ────────────────────────────── */

/**
 * `GET /bootstrap`. La forma es la de `AppState` sin `sessionUserId` y con
 * `cursor`, para hidratar la caché local directamente.
 *
 * **Es una ventana, no el libro mayor**: catálogo, configuración, clientes,
 * usuarios y roles van completos; ventas, movimientos, cierres y bitácora vienen
 * recortados.
 */
export interface BootstrapResponse {
  cursor: number;
  serverTime: string;
  schemaVersion: number;
  window: { days: number; from: string; to: string };
  company: CompanySettings;
  roles: Role[];
  users: User[];
  categories: Category[];
  priceTypes: PriceType[];
  /**
   * Grupos de precio. **El cliente ya no los usa** desde el esquema 6 (el precio
   * es del producto, ver `toV6` en lib/migrations), pero el servidor puede
   * seguir mandando la clave un tiempo: se declara sin forma para que quede
   * documentado que llega y se ignora a propósito, en vez de desaparecer en
   * silencio y parecer un olvido.
   */
  priceGroups?: unknown[];
  products: Product[];
  paymentMethods: PaymentMethod[];
  rates: ExchangeRate[];
  customers: Customer[];
  orders: Order[];
  orderDeposits: OrderDeposit[];
  sales: Sale[];
  movements: InventoryMovement[];
  closures: DailyClosure[];
  audit: AuditLog[];
  retiredProductCodes: { code: string; formerName?: string; reason?: string; retiredAt: string }[];
}

/* ── Delta (§6.4) ─────────────────────────────────────── */

/**
 * Las colecciones del delta. Las claves llegan **en orden de dependencia por FK**
 * y en ese mismo orden se aplican; `lib/sync/apply` lo respeta explícitamente en
 * lugar de confiar en el orden de las claves del JSON.
 */
export interface DeltaChanges {
  company?: CompanySettings;
  categories?: Category[];
  priceTypes?: PriceType[];
  /** Ignorada desde el esquema 6, igual que en `BootstrapResponse`. */
  priceGroups?: unknown[];
  products?: Product[];
  paymentMethods?: PaymentMethod[];
  roles?: Role[];
  users?: User[];
  customers?: Customer[];
  orders?: Order[];
  orderDeposits?: OrderDeposit[];
  sales?: Sale[];
  movements?: InventoryMovement[];
  closures?: DailyClosure[];
  audit?: AuditLog[];
}

/** Tombstone: la entidad borrada en el servidor. Un cliente que sólo recibe altas nunca se enteraría. */
export interface DeltaDeletion {
  entity: string;
  id: ID;
}

export interface DeltaResponse {
  cursor: number;
  hasMore: boolean;
  serverTime: string;
  changes: DeltaChanges;
  deletions: DeltaDeletion[];
  bootstrapRequired?: boolean;
}

/* ── Subida de la cola (§6.5) ─────────────────────────── */

/**
 * Las operaciones de `POST /sync` que este cliente puede producir. El motor es
 * genérico; ver `lib/sync/queue`.
 *
 * Las tres de grupo de precio (`priceGroup.create`, `priceGroup.update`,
 * `priceGroupPrice.set`) salieron de la lista con el esquema 6: ya no hay nada
 * en la app que las pueda encolar, y `toV6` purga las que quedaran pendientes.
 */
export type MutationOp =
  | "sale.create"
  | "sale.void"
  | "order.create"
  | "order.update"
  | "order.status"
  | "order.delete"
  | "orderDeposit.create"
  | "orderDeposit.void"
  | "movement.create"
  | "customer.create"
  | "customer.update"
  | "product.create"
  | "product.update"
  | "productPrice.set"
  | "rate.create"
  | "closure.create"
  | "audit.append";

/** Una mutación tal como viaja en el cuerpo de `POST /sync`. */
export interface WireMutation {
  mutationId: string;
  entity: string;
  op: string;
  at?: string;
  baseRev?: number;
  offline?: boolean;
  payload: Record<string, unknown>;
}

export type MutationStatus = "applied" | "duplicate" | "conflict" | "rejected";

export interface IdMapEntry {
  entity: string;
  localId: ID;
  serverId: ID;
}

/**
 * Resultado de una mutación. La distinción que el cliente **tiene que** respetar
 * para no entrar en bucle infinito (§5, "Retryable vs permanente"):
 *
 *  · `applied` / `duplicate` → fuera de la cola, se adopta `serverEntity`.
 *  · `conflict`              → fuera de la cola, se adopta `serverEntity` y se avisa.
 *  · `rejected` + `retryable: false` → fuera de la cola, se avisa. **Nunca** se reintenta.
 *  · `rejected` + `retryable: true`  → se queda en la cola, con espera creciente.
 */
export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  entityId?: ID;
  serverEntity?: unknown;
  idMap?: IdMapEntry[];
  renumbered?: { from: string; to: string };
  reason?: string;
  retryable: boolean;
}

export interface PushResponse {
  cursor: number;
  serverTime: string;
  results: MutationResult[];
}

/* ── Errores del contrato (§6.1) ──────────────────────── */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
