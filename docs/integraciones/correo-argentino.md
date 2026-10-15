# Correo Argentino (MiCorreo)

Integración con la API **MiCorreo** de Correo Argentino: cotización en vivo en
el checkout, sucursales para retiro y alta de envíos desde el panel. Está
completa en código y **todavía no se probó con credenciales reales**.

Alta de la cuenta y pedido de credenciales: desde
[MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) y su formulario
de contacto. La documentación de la API la entrega Correo Argentino junto con
las credenciales.

## Qué hace en Tiendafy

- **Cotiza en el checkout**: con el CP del comprador devuelve, en una sola
  llamada, las opciones a domicilio (`D`) y a sucursal (`S`), con plazo mínimo
  y máximo. La tienda elige cuáles ofrecer.
- **Lista sucursales** por provincia para que el comprador elija dónde retirar.
- **Da de alta el envío** en MiCorreo desde la venta (panel → detalle de la
  venta → Correo Argentino).
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
| Panel: alta de envío | `admin/src/components/CorreoShipment.tsx` |
| Tienda: cotización | `storefront/src/components/store/checkout-carriers.ts` |
| Persistencia del alta | `CorreoShipment` en `CorreoArgentinoConfig.cs`, `CorreoArgentinoConfigRepository.cs`, migración `20261015161205_AddShipmentClaimsAndCorreoShipments` |
| Tests | `backend/tests/UnitTests/Checkout/CorreoArgentinoTests.cs`, `backend/tests/IntegrationTests/CorreoArgentinoFlowTests.cs` |

`HttpClient` registrado en `CheckoutModule.cs` con timeout de 15 s.

### Endpoints (bajo `/api/v1`)

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET/PUT/DELETE /admin/shipping/correo` | `shipping.config` | Config. Los tokens nunca vuelven; vacíos = conservar los guardados |
| `POST /admin/shipping/correo/test` | `shipping.config` | Cotización real de prueba (CP destino opcional, por defecto 1425) |
| `POST /shipping/correo/quote` | público (tenant) | Cotización del checkout |
| `GET /shipping/correo/agencies?province=X` | público (tenant) | Sucursales que reciben paquetes, por código de provincia de una letra |
| `POST /admin/orders/{id}/correo-shipment` | `orders.fulfill` | Alta del envío en MiCorreo (una sola vez por venta) |
| `GET /admin/orders/{id}/correo-shipment` | `orders.read` | El alta de esa venta, si se hizo desde el panel |
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
2. Se valida el CP (4 dígitos).
3. Los ítems se agregan en **un solo paquete**: el peso se suma, las alturas
   se apilan y el largo y el ancho son los del más grande. Si supera 25 kg o
   150 cm por lado, no se cotiza online y se pide coordinar con la tienda.
4. `POST /rates` devuelve las opciones; se filtran según lo que la tienda
   ofrece y se ordenan por precio.
5. Cada opción vuelve con un token firmado (purpose
   `Tiendafy.Shipping.CorreoQuote.v1`, 30 minutos, atado al tenant, la cantidad
   de unidades y la huella del carrito). El precio sale del token al confirmar;
   si el carrito cambió, se pide recotizar.
6. Si MiCorreo falla (error, timeout o red caída), la cotización devuelve sin
   opciones y con un mensaje: el checkout sigue con los medios manuales. El
   timeout y la red caída quedan logueados como warning. Las sucursales se
   degradan igual (lista vacía).

### Retiro en sucursal

El storefront pide `GET /shipping/correo/agencies?province=B` (cacheado 12 h
por ambiente y provincia; solo activas que reciben paquetes). Al confirmar una
opción `S`, `CheckoutEndpoints` exige el código de sucursal y guarda su
dirección legible en el pedido.

### Alta del envío

El operador completa destinatario y dirección (o sucursal) y se manda
`POST /shipping/import` con `extOrderId` = id de la venta y `orderNumber` = el
número visible. El paquete se calcula con lo vendido (mismo cálculo que la
cotización); lo que se cargue a mano manda. El número de seguimiento lo carga
el comercio en la venta, y el comprador recibe el link del formulario público
de Correo Argentino.

El alta queda registrada en `correo_shipments` (una fila por venta, índice
único): no se sabe si MiCorreo deduplica por `extOrderId`, así que un segundo
pedido devuelve el alta que hay sin llamar. Dos pedidos simultáneos los frena
la reserva previa en `shipment_claims` (409 "Ya hay un envío en curso para
esta venta"); el mecanismo es el mismo que el de Andreani y Zipnova
(`backend/src/Api/Shipping/ShipmentWriteAhead.cs`, ver [andreani.md](andreani.md)).
Si el alta quedó a revisar, "Se creó: registrarlo" la anota sin número
(MiCorreo no devuelve uno al dar de alta); el número de seguimiento se carga,
como siempre, con "Marcar enviada".

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
confirmarlo con una cuenta real.

- **La cotización trae domicilio y sucursal en una sola llamada**
  (`deliveredType` `D` / `S`), con `deliveryTimeMin` y `deliveryTimeMax`.
- **Pesos y medidas van en enteros**: gramos y centímetros.
- **El tracking responde en tres formas**: array con eventos, objeto suelto
  sin eventos u objeto de error `{date, error, code}`. El cliente normaliza las
  tres.
- **Las provincias van como código de una letra** (`B`, `C`, `X`...).
- **No hay endpoint de etiquetas**: se imprimen desde la web de MiCorreo.
- **El import solo devuelve `createdAt`**, sin número de seguimiento.

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

- **Probar con credenciales reales** (TEST y después PROD): auth, rates,
  agencies, import y tracking.
- Confirmar si MiCorreo deduplica por `extOrderId` (hoy no importa: el guard
  es nuestro) y el formato real de la fecha de los eventos de tracking (se
  lee `dd-mm-aaaa hh:mm`, ISO o `aaaa-mm-dd`).
- El alta registrada no entra en Despacho ni en la impresión en lote (no hay
  etiqueta por API).
- Etiquetas: no hay API; seguir imprimiéndolas desde MiCorreo.
