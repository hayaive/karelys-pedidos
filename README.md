# Karelys POS System

Quiero construir una aplicación web POS + administración para una pastelería llamada:

KARELYS DELICIAS

La aplicación debe ser funcional, responsive y estar preparada para producción.

IMPORTANTE:

NO quiero un dashboard SaaS genérico.

NO quiero una interfaz llena de colores.

NO quiero gradientes.

NO quiero un diseño moderno genérico separado del sistema visual.

Debes adaptar TODO el producto al Design System de HAYAI que te describo abajo.

==================================================

1. IDENTIDAD VISUAL

==================================================

La aplicación debe sentirse como un producto HAYAI personalizado para Karelys Delicias.

MARCA PRINCIPAL:

- Karelys Delicias es el cliente.

- Su logo debe poder configurarse/cargarse desde Ajustes.

- Mostrar el logo de Karelys Delicias en login, navegación y documentos cuando corresponda.

- HAYAI debe aparecer de forma muy sutil, por ejemplo:

  "Powered by HAYAI"

  en el footer, login o configuración.

- HAYAI nunca debe competir visualmente con Karelys Delicias.

PALETA PRINCIPAL:

Ámbar principal:

#EF9D25

Ámbar hover:

#E08F16

Ámbar oscuro:

#BC7810

Ámbar claro:

#FBE3C0

Ámbar muy claro:

#FDF4E6

Blanco:

#FFFFFF

Superficie secundaria:

#F7F5F2

Superficie terciaria:

#EFEBE5

Línea:

#E7E1D9

Línea secundaria:

#D3CBC0

Texto principal:

#16110B

Texto secundario:

#6B6157

Texto terciario:

#9B9187

Verde semántico:

#2C7A57

Rojo semántico:

#BE3B1F

REGLA VISUAL:

El color principal de acción es ÁMBAR.

El fondo principal debe ser BLANCO.

No utilizar azul, morado, cyan ni otros colores de marca.

El verde y rojo solamente pueden utilizarse como estados semánticos:

- éxito

- disponible

- confirmado

- error

- alerta

El color "night" #16110B debe utilizarse principalmente para texto/chrome y para el tema oscuro.

La interfaz LIGHT debe sentirse principalmente blanca + ámbar.

Debe existir un switch LIGHT / DARK.

El modo DARK debe adaptar superficies, textos y bordes manteniendo el ámbar como color de acción.

==================================================

2. TIPOGRAFÍA

==================================================

Utilizar:

Fraunces:

- títulos importantes

- branding

- headings destacados

Geist:

- navegación

- botones

- formularios

- tablas

- labels

- UI general

Geist Mono:

- precios

- tasas de cambio

- cantidades

- totales

- números importantes

- códigos de productos

La tipografía debe tener jerarquía clara.

No utilizar demasiados tamaños de fuente.

==================================================

3. LAYOUT GENERAL

==================================================

La aplicación debe tener:

DESKTOP:

- navegación lateral

- contenido principal amplio

- header superior

- contenido organizado mediante cards, tablas y módulos

MOBILE:

- navegación adaptada

- prioridad absoluta al módulo de Venta/POS

- controles grandes y fáciles de tocar

- tablas convertidas en cards/listas cuando sea necesario

- posibilidad de navegar rápidamente entre Venta, Pedidos, Inventario y Clientes

La navegación principal debe contener:

Inicio

Venta

Pedidos

Inventario

Clientes

Facturación

Ventas y cierre

Ajustes

Dentro de Ajustes:

- Usuarios y permisos

- Tasas de cambio

- Categorías

- Tipos de precio

- Métodos de pago

- Configuración de empresa

- Configuración de impresión

En desktop puede existir una navegación lateral.

En mobile debe colapsarse y convertirse en una navegación compacta.

El diseño debe respetar el comportamiento responsive definido por el Design System de HAYAI. 

==================================================

4. LOGIN

==================================================

Crear pantalla de login.

Debe ser visualmente elegante y sencilla.

Mostrar:

- Logo Karelys Delicias

- Nombre Karelys Delicias

- campo usuario/email

- contraseña

- botón "Iniciar sesión"

- opción mostrar/ocultar contraseña

No colocar sidebar de administración en el login.

Mostrar HAYAI discretamente.

==================================================

5. DASHBOARD / INICIO

==================================================

Crear un dashboard operativo.

No debe parecer un dashboard financiero corporativo.

Debe estar orientado a una pastelería.

Mostrar:

KPI:

- Ventas de hoy

- Pedidos pendientes

- Productos con stock bajo

- Caja actual

Mostrar también:

VENTAS DEL DÍA

- gráfico sencillo

- ventas por hora

PEDIDOS PENDIENTES

- número de pedido

- cliente

- hora

- total

- estado

- botón "Procesar"

MÉTODOS DE PAGO

- USD

- Bolívares

- Pago Móvil

- Transferencia

- otros métodos configurables

ACCESOS RÁPIDOS:

Nueva venta

Nuevo pedido

Nuevo cliente

Registrar entrada

Registrar salida

Cerrar caja

ACTIVIDAD RECIENTE:

- ventas

- pedidos

- movimientos de inventario

- cierres

- usuarios

Usar cards limpias, bordes finos y mucho espacio.

==================================================

6. TASAS DE CAMBIO

==================================================

IMPORTANTE:

Siempre deben mostrarse las 3 tasas:

1. BCV USD

2. BCV EUR

3. Binance

Estas tasas deben ser visibles en el header de la aplicación.

Ejemplo:

BCV USD

412,50

BCV EUR

485,30

BINANCE

415,20

Agregar botón:

"Editar tasas"

La tasa debe venir de API cuando sea posible.

Pero el administrador también debe poder modificarla manualmente.

Cada tasa debe guardar:

- valor

- moneda

- fuente

- fecha/hora

- usuario que la modificó

- si fue automática o manual

Crear historial de tasas.

MUY IMPORTANTE:

Cuando se realice una venta, guardar una copia/snapshot de la tasa utilizada.

Nunca recalcular una venta histórica usando una tasa actual.

==================================================

7. INVENTARIO

==================================================

Crear módulo de Inventario.

TABLA:

Código

Producto

Categoría

Imagen

Stock

Stock mínimo

Precio

Estado

Acciones

Permitir:

- crear producto

- editar producto

- desactivar producto

- eliminar producto

- cargar imagen

- crear categorías

- editar categorías

- eliminar categorías

- filtrar por categoría

- buscar productos

- filtrar por stock

PRODUCTO:

- código

- nombre

- descripción

- categoría

- imagen

- stock actual

- stock mínimo

- activo/inactivo

PRECIOS:

El sistema debe soportar múltiples tipos de precio.

Por ejemplo:

Tipo A

$1.10

Tipo B

$1.20

Tipo C

etc.

Los tipos de precio deben ser configurables.

No hardcodear solamente dos precios.

Crear:

price_types

product_prices

para poder tener tantos tipos como sean necesarios.

==================================================

8. IMPORTACIÓN DE PRODUCTOS

==================================================

Existe un Excel proporcionado con el catálogo inicial de productos.

Utilizar ese Excel como fuente de datos inicial.

El archivo contiene aproximadamente 59 productos.

Importar los productos conservando sus nombres y valores originales.

Las columnas de precios existentes deben convertirse en tipos de precio configurables.

NO asumir nombres para las columnas de precio si el Excel no los define claramente.

Crear una estructura de importación que permita posteriormente importar Excel/CSV.

==================================================

9. MOVIMIENTOS DE INVENTARIO

==================================================

Cada entrada o salida de inventario debe quedar registrada.

Registrar:

- producto

- cantidad

- tipo: entrada / salida / ajuste

- motivo

- usuario

- fecha

- observación

Ejemplos:

Entrada por compra

Salida por venta

Ajuste manual

Producto dañado

Merma

Nunca modificar stock sin generar un movimiento.

Mostrar historial.

==================================================

10. CLIENTES

==================================================

Crear módulo Clientes.

Campos:

- Cédula

- Nombre

- Dirección

- Estado

Funciones:

Crear

Editar

Desactivar

Eliminar

Buscar

Filtrar

La cédula debe tener validación.

Los clientes desactivados no deben aparecer como clientes activos al crear una venta nueva.

==================================================

11. VENTA / POS

==================================================

Este es uno de los módulos MÁS IMPORTANTES.

Debe funcionar como un POS real.

En desktop:

IZQUIERDA:

catálogo de productos

DERECHA:

carrito

En mobile:

el catálogo debe ocupar la mayor parte de la pantalla y el carrito debe poder abrirse como panel inferior/drawer.

==================================================

12. CATÁLOGO POS

==================================================

Mostrar productos en una cuadrícula limpia.

Cada producto:

imagen

nombre

precio

stock

El nombre puede ocupar máximo dos líneas.

Mostrar alerta de stock solamente cuando sea necesario.

Permitir:

- buscar

- filtrar por categoría

- seleccionar tipo de precio

- agregar al carrito con un toque

No llenar las tarjetas con información innecesaria.

==================================================

13. CARRITO

==================================================

El carrito debe mostrar:

Producto

Cantidad

Precio unitario

Subtotal

Eliminar

Modificar cantidad

Mostrar:

Subtotal USD

Subtotal Bs

Total USD

Total Bs

La conversión debe utilizar la tasa correspondiente del día.

==================================================

14. CLIENTE EN VENTA

==================================================

Antes de finalizar una venta permitir seleccionar cliente.

Buscar por:

- cédula

- nombre

Permitir crear cliente desde la venta sin abandonar el POS.

==================================================

15. MULTIPAGOS

==================================================

Una venta puede pagarse con múltiples métodos.

Ejemplo:

Total:

$20

Pago 1:

$10 USD efectivo

Pago 2:

$10 equivalente en Bs mediante Pago Móvil

O:

$5 USD

$5 Pago Móvil

$10 transferencia

El sistema debe permitir agregar múltiples pagos.

Cada pago debe registrar:

- método

- moneda

- monto

- equivalente

- referencia cuando aplique

Métodos de pago configurables.

Ejemplos iniciales:

USD efectivo

Bs efectivo

Pago Móvil

Transferencia

Binance

Validar que la suma de los pagos cubra exactamente el total de la venta.

Mostrar:

Total

Pagado

Restante

Vuelto

==================================================

16. FACTURACIÓN / HISTORIAL DE VENTAS

==================================================

Cada venta debe generar un registro histórico.

Mostrar:

Número de venta

Fecha

Cliente

Usuario

Total USD

Total Bs

Métodos de pago

Estado

Permitir:

- ver detalle

- imprimir

- buscar

- filtrar por fecha

- filtrar por cliente

- filtrar por usuario

- filtrar por método de pago

No modificar ventas históricas sin generar un registro de auditoría.

==================================================

17. TICKET 58MM

==================================================

Crear ticket térmico optimizado para impresoras de 58mm.

El diseño debe ser extremadamente simple.

Ancho aproximado:

55mm.

Solo utilizar:

negro + blanco.

No utilizar colores en el ticket térmico.

Debe contener:

Logo

Karelys Delicias

Número de venta

Fecha/hora

Cliente

Productos

Cantidades

Precios

Subtotal

Total USD

Total Bs

Detalle de pagos

Tasa utilizada

Gracias por su compra

Crear botón:

"Imprimir ticket"

Preparar el sistema para impresión térmica mediante window.print() / CSS de impresión.

==================================================

18. PEDIDOS

==================================================

Crear módulo Pedidos.

Caso de uso principal:

Un cliente escribe por WhatsApp.

La persona encargada registra el pedido.

El pedido queda:

PENDIENTE

El cajero puede verlo posteriormente.

Estados:

Pendiente

En preparación

Listo

Procesado

Cancelado

Mientras esté pendiente:

- editar

- agregar productos

- eliminar productos

- cambiar cliente

- modificar cantidades

- agregar notas

- eliminar pedido

Mostrar:

Número

Cliente

Fecha

Hora

Productos

Total

Notas

Estado

==================================================

19. PROCESAR PEDIDO

==================================================

Cuando el cliente llegue:

El cajero abre el pedido.

Presiona:

"Procesar pedido"

El sistema debe convertir el pedido en una venta.

MUY IMPORTANTE:

No duplicar movimientos de inventario.

El proceso debe ser transaccional.

Una vez convertido:

Pedido = procesado

Venta = creada

Inventario = actualizado

Pagos = registrados mediante el flujo normal de venta

El cajero debe poder completar el pago mediante el mismo módulo POS.

==================================================

20. NOTAS DE PEDIDOS

==================================================

Permitir notas como:

"Sin arequipe"

"Es para las 4pm"

"Colocar mensaje de cumpleaños"

"Cliente retira en tienda"

Las notas deben quedar asociadas al pedido.

==================================================

21. TORTAS FRÍAS

==================================================

Existe una regla especial para las tortas frías.

El precio equivalente en USD debe estar SIEMPRE dentro del rango:

$1.10 - $1.20

El rango es inclusivo.

El sistema debe impedir guardar una venta cuyo equivalente USD quede fuera de ese rango.

La lógica debe:

1. Tener el precio USD de referencia.

2. Obtener la tasa del día.

3. Calcular el monto en Bs.

4. Aplicar el redondeo correspondiente.

5. Verificar nuevamente el equivalente USD resultante.

6. No permitir guardar si queda fuera de $1.10 - $1.20.

Mostrar claramente al usuario:

Precio USD

Tasa utilizada

Precio Bs

Si el redondeo produce un equivalente fuera del rango permitido, ajustar el monto de Bs de forma que permanezca dentro del rango o bloquear la operación y pedir un valor válido.

Por defecto utilizar BCV USD para esta conversión, salvo que el administrador configure explícitamente otra regla.

==================================================

22. COMBOS

==================================================

Crear soporte real para combos.

Los combos deben ser productos vendibles que puedan tener componentes.

No hardcodear los combos directamente en el frontend.

Crear estructura para:

Combo

Componentes

Cantidad

Precio

Modificadores

COMBOS INICIALES:

PONQUESITOS DECORADOS

4 unidades = 900 Bs

Este producto se vende únicamente en bolívares.

No convertirlo automáticamente a USD.

------------------------------------------

CUMPLEAÑOS

MINI CAKE

0.5 kg plain

$5

MINI COMBO 1

0.5kg decorada

+ refresco

+ 30 tequeños

+ galletas

+ caja

+ vela

$7

MINI COMBO 2

Todo lo anterior

+ quesillo 900g

$9

MINI COMBO 3

Todo lo anterior

+ quesillo 900g

+ gelatina

+ 12 suspiros

$11

Personalización:

+$2 dependiendo del modelo.

------------------------------------------

TORTA PEQUEÑA

1kg plain

$7

COMBO 1

$9

COMBO 2

$11

COMBO 3

$13

Personalización:

+$2

------------------------------------------

TORTA MEDIANA

2kg plain

$11

COMBO 1

$13

COMBO 2

$15

COMBO 3

$17

Personalización:

+$2

------------------------------------------

TORTA GRANDE

3kg plain

$13

COMBO 1

$15

COMBO 2

$17

COMBO 3

$19

Personalización:

+$2

La personalización debe ser un modificador configurable.

Permitir agregar una nota/modelo de personalización.

==================================================

23. CIERRE DE CAJA

==================================================

Crear módulo:

VENTAS Y CIERRE

Permitir seleccionar día.

Mostrar:

Ventas totales

Total USD

Total Bs

Desglose por método:

USD efectivo

Bs efectivo

Pago Móvil

Transferencia

Binance

etc.

Mostrar:

Esperado

Recibido

Diferencia

Permitir registrar cierre.

Guardar:

- fecha

- usuario

- ventas

- métodos de pago

- total esperado

- total recibido

- diferencia

- observaciones

- fecha/hora de cierre

Una vez cerrado el día, no permitir modificarlo sin permisos especiales.

Permitir imprimir/exportar cierre.

==================================================

24. USUARIOS

==================================================

Crear sistema de usuarios y permisos.

Funciones:

Crear usuario

Editar usuario

Desactivar usuario

Eliminar usuario

Crear roles.

Ejemplos:

Administrador

Cajero

Encargado de pedidos

Inventario

Los permisos deben ser configurables.

Ejemplos:

view_sales

create_sale

edit_sale

cancel_sale

view_inventory

edit_inventory

view_customers

edit_customers

view_orders

edit_orders

process_orders

close_cash

manage_users

manage_settings

manage_exchange_rates

Implementar control de acceso por rol.

Si utilizamos Supabase:

usar Auth + Row Level Security.

==================================================

25. AJUSTES

==================================================

Crear sección de configuración.

Configuración de empresa:

- nombre

- logo

- teléfono

- dirección

- datos fiscales si posteriormente son necesarios

Configuración de:

- categorías

- tipos de precio

- métodos de pago

- tasas

- usuarios

- roles

- permisos

- impresora

- numeración de ventas

==================================================

26. BASE DE DATOS

==================================================

Recomiendo utilizar SUPABASE.

Crear una arquitectura limpia.

Tablas principales:

users / profiles

roles

permissions

role_permissions

categories

products

product_prices

price_types

inventory_movements

customers

orders

order_items

sales

sale_items

payments

exchange_rates

exchange_rate_history

daily_closures

combos

combo_items

company_settings

audit_logs

Las relaciones deben estar correctamente normalizadas.

No guardar información importante únicamente en JSON si puede ser una relación real.

==================================================

27. AUDITORÍA

==================================================

Registrar acciones importantes:

- creación de productos

- edición de productos

- cambios de precios

- movimientos de inventario

- creación de ventas

- cancelaciones

- cambios de tasas

- cierres de caja

- cambios de usuarios/permisos

Guardar:

usuario

acción

entidad

entidad_id

fecha

datos relevantes

==================================================

28. EXPERIENCIA DE USUARIO

==================================================

La interfaz debe sentirse rápida.

Prioridades:

1. Venta rápida

2. Pedidos rápidos

3. Consulta rápida de inventario

4. Consulta rápida de clientes

5. Cierre rápido

Agregar:

- estados de loading

- skeletons

- empty states

- toast notifications

- confirmación antes de eliminar

- confirmación antes de cancelar ventas

- búsqueda rápida

- filtros

- atajos de teclado

Los botones principales deben utilizar ÁMBAR.

==================================================

29. ATAJOS DE TECLADO

==================================================

Preparar atajos para POS.

Ejemplos:

F1 = Nueva venta

F2 = Buscar producto

F3 = Buscar cliente

F4 = Abrir pedidos

F5 = Procesar pedido

F6 = Cobrar

ESC = cerrar modal/panel

Los atajos deben ser configurables posteriormente.

Mostrar una sección:

"Ata​​jos"

para consultar los shortcuts.

==================================================

30. COMPONENTES VISUALES

==================================================

Utilizar:

- cards limpias

- bordes finos

- tablas limpias

- botones compactos

- inputs consistentes

- badges discretos

- modales

- drawers

- dropdowns

- tabs

- tooltips

Border radius:

4px

8px

12px

18px

999px

No hacer todas las tarjetas excesivamente redondeadas.

No usar sombras gigantes.

No usar glassmorphism.

No usar gradientes.

No usar neumorphism.

No usar fondos con patrones.

Debe sentirse como un sistema profesional y cálido.

==================================================

31. DASHBOARD VISUAL

==================================================

El dashboard debe tener una jerarquía similar a:

HEADER

Logo / nombre

Tasas:

BCV USD

BCV EUR

Binance

Editar tasas

Theme toggle

CONTENIDO

Bienvenida / fecha

KPI cards

Ventas de hoy

Pedidos pendientes

Stock bajo

Caja

Después:

Ventas del día

Pedidos pendientes

Después:

Métodos de pago

Actividad reciente

Acciones rápidas

El contenido debe poder reorganizarse en mobile.

==================================================

32. MOBILE POS

==================================================

El módulo Venta debe ser especialmente bueno en móvil.

En mobile:

Header compacto

Buscar producto

Filtros de categorías

Grid de productos

Cada producto debe tener:

imagen

nombre

precio

stock

Botón flotante o sticky:

"Ver carrito"

Al abrir carrito:

productos

cantidad

subtotal

total

Botón principal:

"Continuar al pago"

Pantalla de pago:

Total

Método de pago

Agregar otro pago

Pagado

Restante

Vuelto

Botón:

"Finalizar venta"

==================================================

33. DISEÑO DARK

==================================================

Agregar switch:

Claro / Oscuro

LIGHT:

- predominio blanco

- ámbar como acción

- texto oscuro

- superficies claras

DARK:

- superficies oscuras

- texto claro

- ámbar como acción

- conservar jerarquía visual

No crear una segunda identidad visual completamente diferente.

==================================================

34. RESPONSIVE

==================================================

Breakpoints adecuados para:

desktop

tablet

mobile

El sistema debe funcionar correctamente en:

1920px

1440px

1024px

768px

430px

390px

No permitir:

overflow horizontal

tablas imposibles de leer

botones demasiado pequeños

formularios que se rompan

==================================================

35. DATOS DEMO

==================================================

Utilizar los productos reales del Excel proporcionado para crear el catálogo inicial.

No inventar clientes reales.

Para dashboard se pueden utilizar datos demo claramente identificados si son necesarios para visualizar el sistema.

Los datos demo deben poder eliminarse fácilmente.

==================================================

36. ARQUITECTURA FRONTEND

==================================================

Utilizar React + TypeScript.

Crear componentes reutilizables.

Por ejemplo:

AppShell

Sidebar

MobileNav

Header

ExchangeRateBar

ProductCard

ProductGrid

Cart

PaymentModal

CustomerSelector

OrderCard

InventoryTable

CustomerTable

KpiCard

DataTable

ConfirmDialog

Toast

ThemeToggle

TicketPreview

No duplicar componentes.

Crear un sistema de diseño reutilizable.

==================================================

37. REGLA MUY IMPORTANTE SOBRE EL DISEÑO

==================================================

Quiero que la aplicación parezca una evolución natural del Design System de HAYAI.

No simplemente "usar naranja".

Debe aplicar:

- jerarquía tipográfica

- espaciado consistente

- superficies blancas

- líneas finas

- ámbar como acción

- componentes sobrios

- densidad adecuada

- navegación clara

- responsive

- UI orientada a operación

La sensación debe ser:

"software profesional hecho específicamente para una pastelería"

y no:

"template administrativo comprado de internet".

==================================================

38. PRIORIDAD DE IMPLEMENTACIÓN

==================================================

Implementar primero una versión funcional completa de:

1. Login

2. Dashboard

3. Venta/POS

4. Clientes

5. Inventario

6. Pedidos

7. Conversión Pedido → Venta

8. Multipagos

9. Tasas de cambio

10. Historial de ventas

11. Cierre de caja

12. Usuarios y permisos

13. Configuración

No dejar botones sin funcionalidad.

Si una integración externa todavía no puede implementarse, crear la arquitectura y un fallback manual.

==================================================

39. RESULTADO FINAL

==================================================

El resultado debe ser una aplicación funcional y navegable.

Quiero poder:

Iniciar sesión

→ entrar al dashboard

→ ver tasas

→ crear clientes

→ consultar productos

→ crear una venta

→ seleccionar cliente

→ agregar productos

→ elegir precios

→ calcular USD/Bs

→ agregar múltiples métodos de pago

→ finalizar venta

→ actualizar inventario

→ imprimir ticket 58mm

→ consultar historial

También:

Crear pedido

→ dejarlo pendiente

→ editarlo

→ abrirlo posteriormente

→ procesarlo

→ convertirlo en venta

→ cobrarlo

→ actualizar inventario

Y:

Consultar ventas del día

→ ver métodos de pago

→ cerrar caja

→ obtener diferencia.

==================================================

40. IMPORTANTE: NO GENERAR SOLO LA UI

==================================================

No quiero únicamente pantallas visuales.

Quiero que construyas:

Frontend

Backend

Base de datos

Autenticación

Permisos

Persistencia

Validaciones

Estados

Relaciones

Lógica de negocio

La interfaz debe estar conectada a datos reales.

Utilizar Supabase para:

Auth

Database

Storage

RLS

si está disponible.

==================================================

41. CALIDAD

==================================================

Antes de finalizar:

Revisar todos los flujos.

Probar:

- crear producto

- editar producto

- modificar stock

- crear cliente

- crear pedido

- editar pedido

- procesar pedido

- crear venta

- multipago

- conversión USD/Bs

- tasas manuales

- tasas históricas

- cierre de caja

- impresión

- permisos

- responsive

- dark/light

Corregir errores de TypeScript.

No dejar errores de consola.

No dejar links o botones muertos.

No utilizar información ficticia como si fuera información real.

==================================================

OBJETIVO:

Construir el sistema operativo de Karelys Delicias siguiendo fielmente el lenguaje visual de HAYAI, con una experiencia especialmente optimizada para ventas, pedidos, inventario y caja.

La aplicación debe verse premium, cálida, profesional, limpia y extremadamente práctica.

El ámbar debe ser la acción.

El blanco debe ser el espacio.

La interfaz debe respirar.

Karelys Delicias debe ser la protagonista.

HAYAI debe estar presente de forma sutil.

Recuerda registrar de una vez los productos del excel

Como necesito es el repositorio para llevarlo a otra plataforma, no es necesario activar el cloud, pero si quiero hacer las pruebas, el primer usuario administrador debe ser

usuario: admin
Clave: Duser123

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/911ed56b-9bf2-4f51-a6f3-701a8b36ba15).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
