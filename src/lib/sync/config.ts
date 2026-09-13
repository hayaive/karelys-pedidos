/**
 * Configuración del motor de sincronización.
 *
 * La URL del backend sale de `VITE_API_URL` en tiempo de build (el wrapper de
 * Vite de este proyecto inyecta las variables `VITE_*` como `define`, ver
 * `vite.config.ts`). Hoy el valor por defecto apunta al **backend de test**, que
 * es el único desplegado.
 *
 * Cuando exista un backend de producción no hay que tocar este archivo: basta
 * definir `VITE_API_URL` en el entorno de build de esa rama, p.ej. en un
 * `.env.production` o en las variables del servicio:
 *
 *     VITE_API_URL="https://karelys-backend-production.up.railway.app/api/v1"
 *
 * Si la variable está vacía o vale "off", el motor queda **desactivado** y la app
 * funciona exactamente como antes, sólo contra localStorage.
 */

const TEST_API_URL = "https://karelys-backend-test-production.up.railway.app/api/v1";

const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? TEST_API_URL;

/** Base de la API, sin barra final. Cadena vacía ⇒ sync desactivado. */
export const API_URL =
  RAW_API_URL.trim() === "" || RAW_API_URL.trim().toLowerCase() === "off"
    ? ""
    : RAW_API_URL.trim().replace(/\/+$/, "");

/** `true` si esta build tiene un backend al que hablar. */
export const SYNC_ENABLED = API_URL !== "";

/**
 * Periodo del ciclo de sincronización. Es el requisito explícito del negocio:
 * **un minuto**, sin websockets. El mismo ciclo empuja la cola y trae los cambios
 * de los otros dispositivos.
 */
export const SYNC_INTERVAL_MS = 60_000;

/** Filas por página de `GET /sync`. El backend admite hasta 2000. */
export const PULL_PAGE_LIMIT = 500;

/**
 * Tope de páginas por ciclo. Evita que un dispositivo que estuvo semanas apagado
 * bloquee la interfaz encadenando peticiones sin fin: lo que quede se trae en el
 * ciclo siguiente.
 */
export const MAX_PULL_PAGES = 20;

/** Mutaciones por lote de `POST /sync`. Se aplican en orden, cada una en su transacción. */
export const MAX_PUSH_BATCH = 50;

/** Tiempo máximo de una petición. Sin esto un socket colgado congela el ciclo. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Espera mínima y máxima entre reintentos de una mutación que falló de forma transitoria. */
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;
