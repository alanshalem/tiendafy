# Correo Argentino (MiCorreo)

Integración con la API **MiCorreo** de Correo Argentino: cotización en vivo en
el checkout, sucursales para retiro y alta de envíos desde el panel. Está
completa en código y **todavía no se probó con credenciales reales**.

Alta de la cuenta y pedido de credenciales: desde
[MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) y su formulario
de contacto. La documentación de la API la entrega Correo Argentino junto con
las credenciales.

## Qué hace en Tiendafy

- **Cotiza en el checkout** (y en "Calcular envío" de la ficha del producto):
  con el CP del comprador devuelve, en una sola llamada, las opciones a
  domicilio (`D`) y a sucursal (`S`), con plazo mínimo y máximo. La tienda
  elige cuáles ofrecer.
- **Lista sucursales** por provincia para que el comprador elija dónde retirar.
- **Da de alta el envío** en MiCorreo desde la venta (panel → detalle de la
  venta → Correo Argentino), con la reserva previa contra altas duplicadas.
- **Consulta el seguimiento** desde el panel, con el número que cargó el
  comercio, y le muestra al comprador el link del formulario público de
  Correo Argentino.
- **No baja etiquetas**: MiCorreo no las entrega por API, se imprimen desde su
  web. La impresión en lote lo dice ("imprimila desde MiCorreo") en vez de
  fallar.

Todo es **por tienda**. No hay env vars de plataforma para Correo Argentino.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Cliente HTTP (auth, rates, agencies, import, tracking) | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/MiCorreoClient.cs` |
| Armado del paquete único (suma pesos, apila alturas) | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/CorreoPackage.cs` |
| Config por tienda y límites (25 kg / 150 cm) | `backend/src/Modules/Checkout/Checkout.Core/Domain/CorreoArgentinoConfig.cs` |
| Endpoints | `backend/src/Api/Endpoints/CorreoArgentinoEndpoints.cs` |
| Token firmado de la cotización | `backend/src/Api/Shipping/CorreoQuoteToken.cs` (motor común en `SignedQuoteToken.cs`) |
| Resolución de la sucursal elegida al confirmar | `backend/src/Api/Endpoints/CheckoutEndpoints.cs` |
| Link público de seguimiento para el comprador | `backend/src/Api/Shipping/CarrierTrackingLink.cs` |
| Cifrado de los tokens | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/ShippingSecretProtector.cs` |
| Panel: configuración | `admin/src/pages/Settings/CorreoArgentino.tsx` |
| Panel: alta de envío y seguimiento | `admin/src/components/CorreoShipment.tsx` (aviso de alta a revisar: `ShipmentReview.tsx`) |
| Tienda: cotización | `storefront/src/components/store/checkout-carriers.ts` |
| Tienda: selector de sucursal | `storefront/src/components/store/CheckoutShipping.tsx` |
| Persistencia del alta | `CorreoShipment` en `CorreoArgentinoConfig.cs`, `CorreoArgentinoConfigRepository.cs`, migración `20261015161205_AddShipmentClaimsAndCorreoShipments` |
| Tests | `backend/tests/UnitTests/Checkout/CorreoArgentinoTests.cs`, `backend/tests/IntegrationTests/CorreoArgentinoFlowTests.cs` |

`HttpClient` registrado en `CheckoutModule.cs` con timeout de 15 s. La
cotización corta antes, a los **8 s** contando el pedido del JWT
(`MiCorreoClient.QuoteTimeout`, desde el 16-oct): el checkout deja de esperarla
a los 10 s, y con 15 s una respuesta lenta llegaba cuando el comprador ya no
estaba. Sucursales, alta y seguimiento siguen con los 15 s.

### Endpoints (bajo `/api/v1`)

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET/PUT/DELETE /admin/shipping/correo` | `shipping.config` | Config. Los tokens nunca vuelven; vacíos = conservar los guardados |
| `POST /admin/shipping/correo/test` | `shipping.config` | Cotización real de prueba (CP destino opcional, por defecto 1425) |
| `POST /shipping/correo/quote` | público (tenant) | Cotización del checkout |
| `GET /shipping/correo/agencies?province=X` | público (tenant) | Sucursales que reciben paquetes, por código de provincia de una letra |
| `POST /admin/orders/{id}/correo-shipment` | `orders.fulfill` | Alta del envío en MiCorreo (una sola vez por venta) |
| `GET /admin/orders/{id}/correo-shipment` | `orders.read` | El alta de esa venta, si se hizo desde el panel (o el aviso de un alta a revisar) |
| `POST /admin/orders/{id}/correo-shipment/review/record` | `orders.fulfill` | Alta a revisar: "Se creó", la registra sin número |
| `POST /admin/orders/{id}/correo-shipment/review/release` | `orders.fulfill` | Alta a revisar: "No se creó", suelta la reserva |
| `GET /admin/shipping/correo/tracking?shippingId=` | `orders.read` | Eventos de seguimiento, del más nuevo al más viejo |

## Configuración

Se carga en **Configuración → Medios de envío → Correo Argentino**:

- **userToken y passwordToken** que da Correo Argentino. Son distintos para
  TEST y PROD. Se guardan cifrados con Data Protection (purpose
  `tiendafy.correo.tokens`; no cambiarlo nunca).
- **customerId**: se carga directo, o se obtiene una sola vez con el email y la
  contraseña de la cuenta MiCorreo (`POST /users/validate`). Ese email y esa
  contraseña **no se guardan**.
- **Ambiente**: `TEST` (homologación, `https://apitest.correoargentino.com.ar/micorreo/v1`)
  o `PROD` (`https://api.correoargentino.com.ar/micorreo/v1`).
- **CP de origen** (numérico).
- **Paquete por defecto por unidad** (500 g, 30 × 20 × 10 cm si no se carga
  nada): se usa para las variantes sin peso o medidas.
- **Ofrecer a domicilio / a sucursal** y el interruptor **Activo**.

## Flujos

### Cotización en el checkout

1. El storefront manda CP e ítems a `POST /shipping/correo/quote`.
2. Se valida el CP: tienen que quedar 4 dígitos (un CPA como `B1842ZAB` se
   reduce a `1842`).
3. Los ítems se agregan en **un solo paquete**: el peso se suma, las alturas
   se apilan y el largo y el ancho son los del más grande. Si supera 25 kg o
   150 cm por lado, no se cotiza online y se pide coordinar con la tienda (ese
   es el único tope: no hay límite de unidades como en Andreani y Zipnova).
4. `POST /rates` devuelve las opciones; se filtran según lo que la tienda
   ofrece y se ordenan por precio.
5. Cada opción vuelve con un token firmado (purpose
   `Tiendafy.Shipping.CorreoQuote.v1`, 30 minutos, atado al tenant, la cantidad
   de unidades y la huella del carrito). El precio sale del token al confirmar;
   si el carrito cambió, se pide recotizar.
6. Si MiCorreo falla (error, timeout de 8 s, red caída o respuesta ilegible),
   la cotización devuelve sin opciones y con un mensaje: el checkout sigue con
   los medios manuales. El timeout y la red caída quedan logueados como
   warning. Las sucursales se degradan igual (lista vacía).

### Retiro en sucursal

El storefront pide `GET /shipping/correo/agencies?province=B` (cacheado 12 h
por ambiente y provincia; solo activas que reciben paquetes). Al confirmar una
opción `S`, `CheckoutEndpoints` exige el código de sucursal y guarda su
dirección legible en el pedido.

### Alta del envío

El operador completa destinatario y dirección (o sucursal) y se manda
`POST /shipping/import` con `extOrderId` = id de la venta y `orderNumber` = el
número visible. No se manda `sender`: MiCorreo usa el remitente del perfil del
`customerId`. El paquete se calcula con lo vendido (mismo cálculo que la
cotización); lo que se cargue a mano manda. El valor declarado es el que se
cargue en el formulario (si no, 0). MiCorreo no devuelve número de
seguimiento al dar de alta (aparece después, cuando se paga el envío en su
web): lo carga el comercio en la venta con "Marcar enviada", y el comprador
recibe el link del formulario público de Correo Argentino.

El alta queda registrada en `correo_shipments` (una fila por venta, índice
único) y un segundo pedido devuelve el alta que hay sin llamar. Según un
cliente de terceros (`YamilEzequiel/correo-argentino`), MiCorreo rechaza un
`extOrderId` repetido con "La orden ya fue importada con anterioridad"; no lo
confirmamos, y el guard nuestro no depende de eso. Dos pedidos simultáneos
los frena la reserva previa en `shipment_claims` (409 "Ya hay un envío en
curso para esta venta"); el mecanismo es el mismo que el de Andreani y Zipnova
(`backend/src/Api/Shipping/ShipmentWriteAhead.cs`, ver [andreani.md](andreani.md)).
Si el alta quedó a revisar, la venta lo avisa en lugar del botón de alta:
"Se creó: registrarlo" la anota sin número (queda como entrega a domicilio,
porque el tipo no se sabe) y "Ya lo revisé: no se creó" suelta la reserva.

### Seguimiento en el panel

Con el alta hecha, el botón de Correo de la venta (también ya despachada)
muestra "alta en MiCorreo" y, si la venta tiene número de seguimiento cargado,
un botón **Seguimiento** que consulta `GET /admin/shipping/correo/tracking` y
muestra el último evento. Sin número, dice que hay que cargarlo en la venta.
Las altas hechas antes de que se registraran (o directo en la web de MiCorreo)
no muestran el seguimiento desde el panel.

### Autenticación

`POST /token` con Basic (`userToken:passwordToken`) devuelve un JWT que dura
~2,5 h. Se cachea en memoria **30 minutos** (más simple que parsear la fecha
de vencimiento, que viene en hora del server sin zona) y ante un 401 se
renueva y se reintenta **una sola vez**.

## Lo que aprendimos de la API

Esto sale de la documentación de MiCorreo y del desarrollo contra ella; falta
confirmarlo con una cuenta real. Lo único probado contra los hosts reales es
un sondeo sin credenciales del 18-oct-2026 (ver el último punto).

- **La cotización trae domicilio y sucursal en una sola llamada**
  (`deliveredType` `D` / `S`), con `deliveryTimeMin` y `deliveryTimeMax`.
- **Pesos y medidas van en enteros**: gramos y centímetros.
- **El tracking responde en tres formas**: array con eventos, objeto suelto
  sin eventos u objeto de error `{date, error, code}`. El cliente normaliza las
  tres.
- **Las provincias van como código de una letra** (`B`, `C`, `X`...).
- **No hay endpoint de etiquetas**: se imprimen desde la web de MiCorreo.
- **El import solo devuelve `createdAt`**, sin número de seguimiento.
- **El seguimiento espera el `shippingId` en el cuerpo, no en la query.**
  Sondeo del 18-oct contra `apitest` y `api`: las rutas `/token`, `/rates`,
  `/agencies`, `/shipping/import` y `/users/validate` existen (una ruta
  inventada da 404). `GET /shipping/tracking?shippingId=…` sin cuerpo da
  **415**, y con `Content-Type: application/json` pero sin cuerpo, 500; con
  el cuerpo `{"shippingId": "…"}` pasa a validar el token (401 con uno
  falso). `MiCorreoClient.GetTrackingAsync` manda la query sin cuerpo: con
  credenciales reales, el botón Seguimiento fallaría. Hay que pasarlo al
  cuerpo antes de probar.

## Cómo probar

1. Pedí credenciales de TEST a Correo Argentino y cargalas con ambiente
   **Prueba (homologación)**.
2. Tocá **Probar** en la tarjeta: hace una cotización real con el paquete por
   defecto.
3. En la tienda, cotizá con un CP real y elegí domicilio y sucursal.
4. Desde una venta, dá de alta el envío en TEST.
5. Tests: `backend/tests/UnitTests/Checkout/CorreoArgentinoTests.cs` (armado
   del paquete, config, tokens) e `IntegrationTests/CorreoArgentinoFlowTests.cs`
   (flujo por HTTP con MiCorreo simulado: alta única, dos altas simultáneas,
   cotización con timeout y red caída).

## Pendiente

- **Mandar el `shippingId` del seguimiento en el cuerpo** (ver "Lo que
  aprendimos") y ajustar el MiCorreo simulado de los tests.
- **Probar con credenciales reales** (TEST y después PROD): auth, rates,
  agencies, import y tracking.
- Confirmar el rechazo de un `extOrderId` repetido (hoy no importa: el guard
  es nuestro) y el formato real de la fecha de los eventos de tracking (se
  lee `dd-mm-aaaa hh:mm`, ISO o `aaaa-mm-dd`).
- La prueba de conexión y el seguimiento del panel solo atrapan los errores
  con respuesta de MiCorreo: un timeout o la red caída salen como 500 (Zipnova
  ya los trata como falla del proveedor).
- Despacho y la impresión en lote reconocen las ventas de Correo por el
  nombre del medio de envío, no por el alta registrada: no muestran si ya se
  dio de alta en MiCorreo (y la etiqueta no existe por API).
- Etiquetas: no hay API; seguir imprimiéndolas desde MiCorreo.
