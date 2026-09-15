import { ensureColdCakeFamily } from "./catalog";
import { SEED_PRODUCTS } from "./data/products.seed";
import { slug, uid } from "./ids";
import { SCHEMA_VERSION } from "./migrations";
import {
  COLD_CAKE_ALERT_USD,
  COLD_CAKE_CATEGORY_ID,
  COLD_CAKE_TARGET_USD,
  DEFAULT_BS_ROUNDING,
  DEFAULT_RATE_MAX_AGE_HOURS,
} from "./pricing-rules";
import { ALL_PERMISSIONS, type AppState, type Product } from "./types";

// `uid` y `slug` viven en lib/ids; se reexportan porque media app los importa
// desde aquí.
export { slug, uid };

const now = () => new Date().toISOString();

const SEED_CUSTOMERS: Array<{ cedula: string; name: string; phone?: string; address?: string }> = [
  { cedula: "V-12345678", name: "María Fernanda Rodríguez", phone: "0414-1234567", address: "Av. Bolívar, Casa 12" },
  { cedula: "V-18900456", name: "José Gregorio Paredes", phone: "0424-7654321", address: "Calle Sucre, Res. Las Flores" },
  { cedula: "V-20789123", name: "Ana Carolina Márquez", phone: "0412-3344556", address: "Urb. El Prado, Torre B, Apto 4" },
  { cedula: "V-15456789", name: "Luis Alberto Hernández", phone: "0416-9988776", address: "Calle 8, Quinta Los Pinos" },
  { cedula: "V-22109876", name: "Gabriela Sofía Castillo", phone: "0426-1122334", address: "Av. Libertador, Local 3" },
  { cedula: "V-17654321", name: "Carlos Eduardo Ramos", phone: "0414-5566778", address: "Sector Centro, Casa 45" },
  { cedula: "V-23876543", name: "Daniela Alejandra Vargas", phone: "0412-6677889", address: "Urb. La Trigaleña, Calle 2" },
  { cedula: "V-19876123", name: "Pedro Antonio Salazar", phone: "0424-8877665", address: "Av. Lara, Edificio Central" },
  { cedula: "V-16234567", name: "Valentina Isabel Rojas", phone: "0416-2233445", address: "Calle Comercio, N° 21" },
  { cedula: "V-24567890", name: "Andrés Felipe Moreno", phone: "0414-7788990", address: "Urb. Santa Rosa, Manzana 7" },
  { cedula: "V-13765432", name: "Carmen Elena Sánchez", phone: "0426-4455667", address: "Av. Universidad, Casa 9" },
  { cedula: "V-21456789", name: "Ricardo José Molina", phone: "0412-9911223", address: "Sector La Mora, Calle 5" },
  { cedula: "V-18765098", name: "Paola Andrea Guzmán", phone: "0416-3344221", address: "Urb. Las Acacias, Bloque C" },
  { cedula: "V-25678901", name: "Miguel Ángel Torres", phone: "0424-6655443", address: "Calle 3, Local El Centro" },
  { cedula: "V-17098765", name: "Isabella Victoria León", phone: "0414-2211334", address: "Av. Intercomunal, Casa 18" },
  { cedula: "V-22908765", name: "Fernando José Bravo", phone: "0416-8899001", address: "Urb. El Bosque, Calle 6" },
  { cedula: "V-14890234", name: "Rosa Amelia Duarte", phone: "0412-5566887", address: "Calle Zamora, Quinta Rosa" },
  { cedula: "V-26123456", name: "Javier Enrique Cordero", phone: "0426-7788992", address: "Sector 24 de Julio, Casa 2" },
  { cedula: "V-19567234", name: "Alejandra Beatriz Fuentes", phone: "0414-4433221", address: "Av. Principal, Edificio Sol" },
  { cedula: "V-20876543", name: "Héctor Manuel Ortega", phone: "0416-8877112", address: "Calle Mariño, N° 33" },
];

export function seedCustomers(): AppState["customers"] {
  return SEED_CUSTOMERS.map((c) => ({ id: uid(), ...c, active: true, createdAt: now() }));
}

export function buildSeed(): AppState {
  const adminRole = {
    id: "role-admin",
    name: "Administrador",
    permissions: ALL_PERMISSIONS.map((p) => p.key),
    system: true,
  };
  const cajeroRole = {
    id: "role-cajero",
    name: "Cajero",
    permissions: [
      "view_sales",
      "create_sale",
      "view_inventory",
      "view_customers",
      "edit_customers",
      "view_orders",
      "process_orders",
      "close_cash",
    ] as never,
  };
  const pedidosRole = {
    id: "role-pedidos",
    name: "Encargado de pedidos",
    permissions: ["view_orders", "edit_orders", "view_customers", "edit_customers", "view_inventory"] as never,
  };
  const invRole = {
    id: "role-inventario",
    name: "Inventario",
    permissions: ["view_inventory", "edit_inventory"] as never,
  };

  const catNames = ["Tortas Frías", "Postres", "Panadería", "Bebidas", "Tortas", "Fiesta", "Combos"];
  const categories = catNames.map((name) => ({ id: "cat-" + slug(name), name, active: true }));

  const priceTypes = [
    { id: "pt-mayor", name: "Mayor", isDefault: true },
    { id: "pt-detal", name: "Detal", isDefault: false },
  ];

  const products: Product[] = SEED_PRODUCTS.map((p) => ({
    id: "prod-" + p.code,
    code: p.code,
    name: p.name,
    categoryId: "cat-" + slug(p.category),
    stock: 20,
    minStock: 5,
    active: true,
    prices: [
      { priceTypeId: "pt-mayor", amount: p.mayor },
      { priceTypeId: "pt-detal", amount: p.detal },
    ],
    createdAt: now(),
  }));

  products.push(...buildCombos());

  // Referencia BCV (tipo de cambio de referencia) — se actualiza con "Traer de API"
  const rates = [
    rate("BCV_USD", "USD", 814.6908),
    rate("BCV_EUR", "EUR", 947.29802151),
    rate("BINANCE", "USD", 836.5),
  ];


  const paymentMethods = [
    { id: "pm-usd", name: "USD efectivo", currency: "USD" as const, requiresReference: false, active: true },
    { id: "pm-bs", name: "Bs efectivo", currency: "BS" as const, requiresReference: false, active: true },
    { id: "pm-pm", name: "Pago Móvil", currency: "BS" as const, requiresReference: true, active: true },
    { id: "pm-tr", name: "Transferencia", currency: "BS" as const, requiresReference: true, active: true },
    { id: "pm-bin", name: "Binance", currency: "USD" as const, requiresReference: true, active: true },
    { id: "pm-pos", name: "Punto de venta", currency: "BS" as const, requiresReference: true, active: true },
  ];

  const state: AppState = {
    version: SCHEMA_VERSION,
    roles: [adminRole, cajeroRole, pedidosRole, invRole] as AppState["roles"],
    users: [
      {
        id: "user-admin",
        username: "admin",
        fullName: "Administrador",
        email: "admin@karelysdelicias.com",
        password: "Duser123",
        roleId: "role-admin",
        active: true,
        createdAt: now(),
      },
    ],
    categories,
    priceTypes,
    // Se llenan más abajo con ensureColdCakeFamily(), la misma función que usa
    // la migración, para que semilla e instalación migrada queden idénticas.
    priceGroups: [],
    products,
    movements: [],
    customers: seedCustomers(),
    rates,
    paymentMethods,
    sales: [],
    orders: [],
    closures: [],
    audit: [],
    company: {
      name: "Karelys Delicias",
      logoUrl: "",
      phone: "",
      address: "",
      taxId: "",
      ticketFooter: "Gracias por su compra",
      salePrefix: "V-",
      saleNext: 1,
      orderPrefix: "P-",
      orderNext: 1,
      // Umbral de alerta y precio objetivo de tortas frías (ver pricing-rules).
      coldCakeMin: COLD_CAKE_ALERT_USD,
      coldCakeMax: COLD_CAKE_TARGET_USD,
      coldCakeCategory: COLD_CAKE_CATEGORY_ID,
      bsRounding: DEFAULT_BS_ROUNDING,
      rateMaxAgeHours: DEFAULT_RATE_MAX_AGE_HOURS,
    },
    sessionUserId: null,
  };

  ensureColdCakeFamily(state);
  return state;
}

function rate(source: "BCV_USD" | "BCV_EUR" | "BINANCE", currency: "USD" | "EUR", value: number) {
  return { id: uid(), source, currency, value, automatic: true, userId: null, createdAt: now() };
}

function combo(
  code: string,
  name: string,
  usd: number,
  items: { description: string; qty: number }[],
  opts: { bsOnly?: boolean; bsPrice?: number; custom?: boolean } = {},
): Product {
  return {
    id: "prod-" + code,
    code,
    name,
    categoryId: "cat-combos",
    stock: 999,
    minStock: 0,
    active: true,
    isCombo: true,
    comboItems: items,
    bsOnly: opts.bsOnly,
    bsPrice: opts.bsPrice,
    allowCustomization: opts.custom ?? false,
    customizationPrice: opts.custom ? 2 : 0,
    prices: [
      { priceTypeId: "pt-mayor", amount: usd },
      { priceTypeId: "pt-detal", amount: usd },
    ],
    createdAt: now(),
  };
}

const BASE_COMBO_1 = [
  { description: "Torta decorada", qty: 1 },
  { description: "Refresco", qty: 1 },
  { description: "Tequeños", qty: 30 },
  { description: "Galletas", qty: 1 },
  { description: "Caja", qty: 1 },
  { description: "Vela", qty: 1 },
];
const C2 = [...BASE_COMBO_1, { description: "Quesillo 900g", qty: 1 }];
const C3 = [...C2, { description: "Gelatina", qty: 1 }, { description: "Suspiros", qty: 12 }];

function buildCombos(): Product[] {
  const out: Product[] = [
    combo("C000", "Ponquesitos decorados (4 und)", 0, [{ description: "Ponquesito decorado", qty: 4 }], {
      bsOnly: true,
      bsPrice: 900,
    }),
    combo("C010", "Mini Cake 0.5kg plain", 5, [{ description: "Mini cake 0.5 kg", qty: 1 }], { custom: true }),
    combo("C011", "Mini Combo 1", 7, BASE_COMBO_1, { custom: true }),
    combo("C012", "Mini Combo 2", 9, C2, { custom: true }),
    combo("C013", "Mini Combo 3", 11, C3, { custom: true }),
    combo("C020", "Torta Pequeña 1kg plain", 7, [{ description: "Torta 1 kg", qty: 1 }], { custom: true }),
    combo("C021", "Torta Pequeña · Combo 1", 9, BASE_COMBO_1, { custom: true }),
    combo("C022", "Torta Pequeña · Combo 2", 11, C2, { custom: true }),
    combo("C023", "Torta Pequeña · Combo 3", 13, C3, { custom: true }),
    combo("C030", "Torta Mediana 2kg plain", 11, [{ description: "Torta 2 kg", qty: 1 }], { custom: true }),
    combo("C031", "Torta Mediana · Combo 1", 13, BASE_COMBO_1, { custom: true }),
    combo("C032", "Torta Mediana · Combo 2", 15, C2, { custom: true }),
    combo("C033", "Torta Mediana · Combo 3", 17, C3, { custom: true }),
    combo("C040", "Torta Grande 3kg plain", 13, [{ description: "Torta 3 kg", qty: 1 }], { custom: true }),
    combo("C041", "Torta Grande · Combo 1", 15, BASE_COMBO_1, { custom: true }),
    combo("C042", "Torta Grande · Combo 2", 17, C2, { custom: true }),
    combo("C043", "Torta Grande · Combo 3", 19, C3, { custom: true }),
  ];
  return out;
}
