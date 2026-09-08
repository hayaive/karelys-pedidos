import React from "react";

/* Iconos de un solo trazo, mismo grosor, extremos redondeados.
   Cada uno dibuja el mecanismo, no una metáfora. */

const base = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** El tipo de un icono del chasis: no recibe props, hereda el color del texto. */
export type Icono = React.ComponentType;

/** Inicio: la portada, con su titular y sus dos columnas. */
export const IcoInicio = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M11 9v11" />
  </svg>
);

/** Venta: el mostrador con lo que se va sumando encima. */
export const IcoVenta = () => (
  <svg {...base}>
    <path d="M3 11h18l-1.5 9h-15z" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Pedidos: una hoja con renglones. */
export const IcoPedidos = () => (
  <svg {...base}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);

/** Inventario: cajas apiladas. */
export const IcoInventario = () => (
  <svg {...base}>
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <rect x="8" y="3" width="8" height="8" rx="1" />
  </svg>
);

/** Clientes: una ficha con su persona. */
export const IcoClientes = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2.2" />
    <path d="M5.6 16.4c.6-1.7 1.9-2.6 3.4-2.6s2.8.9 3.4 2.6" />
    <path d="M15 9.5h3.5M15 13h3.5" />
  </svg>
);

/** Facturación: el ticket que sale de la tiquera. */
export const IcoFacturacion = () => (
  <svg {...base}>
    <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </svg>
);

/** Ventas y cierre: el día que se cierra. */
export const IcoCierre = () => (
  <svg {...base}>
    <path d="M4 19V9M10 19V5M16 19v-7M4 19h16" />
    <path d="M20 8.5V4h-4.5" />
  </svg>
);

/** Ajustes: los tres controles que se corren. */
export const IcoAjustes = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);

/** Mercado: la calculadora de tasas. */
export const IcoMercado = () => (
  <svg {...base}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h1M9 16h1M14 12h1M14 16h1" />
  </svg>
);

/* ── El resto de la familia ───────────────────────────────────
   Mismo viewBox, mismo grosor, mismos extremos. Ningún icono de
   otra familia entra en una pantalla del sistema. */

/** Menú: las tres barras del cajón lateral. */
export const IcoMenu = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

/** Más opciones: lo que no cupo en la barra de abajo. */
export const IcoMasOpciones = () => (
  <svg {...base}>
    <circle cx="5" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="19" cy="12" r="1.3" />
  </svg>
);

/** Cerrar: las dos aspas. */
export const IcoCerrar = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Buscar: la lente con su mango. */
export const IcoBuscar = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6" />
    <path d="M15.5 15.5L21 21" />
  </svg>
);

/** Agregar: la cruz. */
export const IcoMas = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Quitar uno: la raya. */
export const IcoMenos = () => (
  <svg {...base}>
    <path d="M5 12h14" />
  </svg>
);

/** Seguir: la punta hacia la derecha. */
export const IcoChevron = () => (
  <svg {...base}>
    <path d="M9.5 5l7 7-7 7" />
  </svg>
);

/** Salir: la puerta y quien sale por ella. */
export const IcoSalir = () => (
  <svg {...base}>
    <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
    <path d="M9 8l-4 4 4 4M5 12h10" />
  </svg>
);

/** Editar: el lápiz sobre el renglón. */
export const IcoLapiz = () => (
  <svg {...base}>
    <path d="M4 20h4L19.4 8.6a2.5 2.5 0 0 0-3.5-3.5L4 16.5z" />
    <path d="M14.5 6.5l3.5 3.5" />
  </svg>
);

/** Eliminar: la papelera con su tapa. */
export const IcoPapelera = () => (
  <svg {...base}>
    <path d="M4 7h16" />
    <path d="M9.5 7V4.8h5V7" />
    <path d="M6.5 7l1 13h9l1-13" />
    <path d="M10.5 11v5M13.5 11v5" />
  </svg>
);

/** Volver a consultar: la vuelta completa. */
export const IcoRecargar = () => (
  <svg {...base}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 3.5V9h-5.5" />
  </svg>
);

/** Imprimir: la tiquera y el papel que sale. */
export const IcoImprimir = () => (
  <svg {...base}>
    <path d="M7 8.5V3.5h10v5" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14.5h10V21H7z" />
  </svg>
);

/** Noche: la luna. */
export const IcoLuna = () => (
  <svg {...base}>
    <path d="M20 14.7A8.2 8.2 0 0 1 9.3 4 8.4 8.4 0 1 0 20 14.7z" />
  </svg>
);

/** Día: el sol con sus rayos. */
export const IcoDia = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </svg>
);

/** Ver: el ojo abierto. */
export const IcoOjo = () => (
  <svg {...base}>
    <path d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.7" />
  </svg>
);

/** Ocultar: el ojo tachado. */
export const IcoOjoTachado = () => (
  <svg {...base}>
    <path d="M4 4l16 16" />
    <path d="M9.6 6.6A9.6 9.6 0 0 1 12 6.2c6 0 9.5 5.8 9.5 5.8a16.4 16.4 0 0 1-3.6 4.1" />
    <path d="M6.3 8.2A16.3 16.3 0 0 0 2.5 12S6 17.8 12 17.8a9.7 9.7 0 0 0 3.1-.5" />
    <path d="M10.1 10.2a2.7 2.7 0 0 0 3.7 3.7" />
  </svg>
);

/** Atención: el triángulo con su signo. */
export const IcoAlerta = () => (
  <svg {...base}>
    <path d="M12 4L21 20H3z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

/** Una persona: la ficha del cliente. */
export const IcoPersona = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 19.5c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5" />
  </svg>
);

/** Registrar a alguien: la persona y la cruz. */
export const IcoPersonaMas = () => (
  <svg {...base}>
    <circle cx="10" cy="8" r="3.2" />
    <path d="M3.5 19.5c.9-3.3 3.4-5 6.5-5 .8 0 1.6.1 2.3.4" />
    <path d="M17.5 14v6M14.5 17h6" />
  </svg>
);

/** El equipo: dos personas. */
export const IcoUsuarios = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.8-3 3-4.6 5.5-4.6S13.7 16 14.5 19" />
    <path d="M16 5.4a3 3 0 0 1 0 5.5M17.6 14.7c2 .6 3.2 2.1 3.5 4.3" />
  </svg>
);

/** Entra mercancía: baja hasta la línea. */
export const IcoEntrada = () => (
  <svg {...base}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M5 20h14" />
  </svg>
);

/** Sale mercancía: sube desde la línea. */
export const IcoSalida = () => (
  <svg {...base}>
    <path d="M12 20V10M8 13.5l4-4 4 4" />
    <path d="M5 4h14" />
  </svg>
);

/** Lo que sube: la línea que remonta. */
export const IcoTendencia = () => (
  <svg {...base}>
    <path d="M4 16l5-5 3.5 3.5L20 7" />
    <path d="M20 11.5V7h-4.5" />
  </svg>
);

/** Queda poco: la caja que hay que mirar. */
export const IcoStockBajo = () => (
  <svg {...base}>
    <path d="M12 20.5l-7.5-4V7.5L12 3.5l7.5 4v3.5" />
    <path d="M4.5 7.5L12 11.5l7.5-4M12 11.5v9" />
    <circle cx="17" cy="17" r="2.7" />
    <path d="M19 19l2 2" />
  </svg>
);

/** La caja del día: la gaveta del dinero. */
export const IcoCaja = () => (
  <svg {...base}>
    <path d="M6 8.5V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2.5" />
    <rect x="3" y="8.5" width="18" height="11" rx="2" />
    <path d="M3 12.5h18" />
    <path d="M10 16h4" />
  </svg>
);

/** Formas de pago: la tarjeta con su banda. */
export const IcoTarjeta = () => (
  <svg {...base}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <path d="M2.5 10h19" />
    <path d="M6 14.5h4" />
  </svg>
);

/** La tasa: la moneda. */
export const IcoMoneda = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 6.8v10.4" />
    <path d="M14.6 9.6c0-1-1.2-1.8-2.6-1.8s-2.6.8-2.6 1.8 1.2 1.6 2.6 1.9 2.6.8 2.6 1.9-1.2 1.8-2.6 1.8-2.6-.8-2.6-1.8" />
  </svg>
);

/** El negocio: la fachada. */
export const IcoNegocio = () => (
  <svg {...base}>
    <path d="M4 21V6.5L12 3l8 3.5V21" />
    <path d="M3 21h18" />
    <path d="M9.5 21v-5h5v5" />
    <path d="M8 9.5h2M14 9.5h2M8 13h2M14 13h2" />
  </svg>
);

/** Los datos: el depósito. */
export const IcoDatos = () => (
  <svg {...base}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </svg>
);

/** Los precios: la etiqueta colgada. */
export const IcoEtiquetas = () => (
  <svg {...base}>
    <path d="M4 4h7l9 9-7 7-9-9z" />
    <circle cx="8" cy="8" r="1.3" />
  </svg>
);

/** Los atajos: el teclado. */
export const IcoAtajos = () => (
  <svg {...base}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 9.8h.01M9.5 9.8h.01M13 9.8h.01M16.5 9.8h.01" />
    <path d="M6 12.9h.01M9.5 12.9h.01M13 12.9h.01M16.5 12.9h.01" />
    <path d="M8.5 15.6h7" />
  </svg>
);
