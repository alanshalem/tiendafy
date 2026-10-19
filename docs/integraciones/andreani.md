# Andreani

Tercer correo de Tiendafy, al lado de Correo Argentino y Zipnova. Este doc
reemplaza al relevamiento previo (16 archivos escritos antes de implementar,
borrados en el commit `efb5fecd`): lo que sigue es lo que hay en el código y lo
que se verificó contra la API real. El relevamiento queda en la historia de git.

Documentación oficial: <https://developers.andreani.com/document> (es una
aplicación web: hay que abrirla en el navegador, no se lee con un fetch). Cada
API trae una planilla `.xlsx` descargable con las URL de QA y producción, el
método y ejemplos de pedido y respuesta: ahí están las rutas que usa el
cliente (ver "Lo que aprendimos", punto 17).

## Qué hace en Tiendafy

- **Cotiza en vivo en el checkout**: el comprador pone su código postal y ve
  "Andreani · Envío a domicilio" y/o "Andreani · Retiro en sucursal", según los
  contratos que tenga la tienda. También cotiza en "Calcular envío" de la
  ficha del producto (`storefront/src/components/store/ShippingEstimate.tsx`).
- **Genera la orden de envío desde una venta** (panel → detalle de la venta),
  con un bulto por unidad vendida.
- **Baja la etiqueta en PDF**, suelta o en lote junto con las de Zipnova
  (Despacho o acción masiva en Ventas, vía `POST /api/v1/fulfillment/labels`).
- **Consulta el seguimiento** a pedido desde el panel y le muestra al
  comprador el link público `andreani.com/envio/{número}`.

Todo es **por tienda**: cada una carga sus credenciales y contratos. No hay env
vars de plataforma para Andreani.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Cliente HTTP (cotizar, login, crear orden, etiqueta, trazas) | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/AndreaniClient.cs` |
| Config por tienda + `AndreaniShipment` + estados neutros | `backend/src/Modules/Checkout/Checkout.Core/Domain/AndreaniConfig.cs` |
| Mapeo de estados de Andreani a los nuestros | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/AndreaniStatusMap.cs` |
| Endpoints (config, cotización, envío, etiqueta, tracking) | `backend/src/Api/Endpoints/AndreaniEndpoints.cs` |
| Token firmado de la cotización | `backend/src/Api/Shipping/AndreaniQuoteToken.cs` (motor común en `SignedQuoteToken.cs`) |
| Bultos del carrito (peso y medidas por variante) | `backend/src/Api/Shipping/CartParcels.cs` |
| Etiquetas en lote | `backend/src/Api/Fulfillment/CarrierLabels.cs` |
| Cifrado de la contraseña | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/ShippingSecretProtector.cs` |
| Persistencia | `backend/src/Modules/Checkout/Checkout.Infrastructure/Persistence/AndreaniRepository.cs`, migración `20260821124030_AddAndreaniShipping` |
| Reserva previa a crear el envío (común a los tres carriers) | `backend/src/Api/Shipping/ShipmentWriteAhead.cs`, `Checkout.Core/Domain/ShipmentClaim.cs`, migración `20261015161205_AddShipmentClaimsAndCorreoShipments` |
| Panel: configuración | `admin/src/pages/Settings/Andreani.tsx` (tarjeta dentro de Medios de envío) |
| Panel: crear envío, etiqueta, seguimiento | `admin/src/components/AndreaniShipment.tsx` |
| Panel: aviso de envío a revisar (común a los tres carriers) | `admin/src/components/ShipmentReview.tsx` |
| Tienda: cotización (checkout y ficha del producto) | `storefront/src/components/store/checkout-carriers.ts` |
| Tests | `backend/tests/UnitTests/Checkout/AndreaniTests.cs`, `backend/tests/IntegrationTests/AndreaniFlowTests.cs` (incluye dos pedidos simultáneos) |

`HttpClient` registrado en `CheckoutModule.cs` con timeout de 40 s; el cliente
además corta cada cotización a los **6 s** y el resto de las llamadas a los
20 s. Con los dos contratos cargados, las dos cotizaciones van en paralelo:
en el peor caso son 6 s, por debajo de los 10 s que espera el checkout
(`FETCH_TIMEOUT_MS` de `CheckoutClient.tsx`; la ficha, 12 s). Hasta el 19-oct
iban una después de la otra y podían sumar 12 s.

### Endpoints (bajo `/api/v1`)

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET/PUT/DELETE /admin/shipping/andreani` | `shipping.config` | Leer, guardar o borrar la config. La contraseña nunca vuelve; vacía = conservar la guardada |
| `POST /admin/shipping/andreani/test` | `shipping.config` | Hace un login real: valida usuario, contraseña y habilitación de IP |
| `POST /shipping/andreani/quote` | público (tenant) | Cotización del checkout. Está en la lista de rutas públicas de `AdminWriteAuthMiddleware` |
| `POST /admin/orders/{id}/andreani-shipment` | `orders.fulfill` | Crea la orden de envío |
| `GET /admin/orders/{id}/andreani-shipment` | `orders.read` | Estado del envío de esa venta (o el aviso de un envío a revisar) |
| `POST /admin/orders/{id}/andreani-shipment/review/record` | `orders.fulfill` | Envío a revisar: "Se creó", registra los números de seguimiento que figuran en Andreani |
| `POST /admin/orders/{id}/andreani-shipment/review/release` | `orders.fulfill` | Envío a revisar: "No se creó", suelta la reserva |
| `GET /admin/orders/{id}/andreani-label` | `orders.fulfill` | PDF de la etiqueta |
| `GET /admin/orders/{id}/andreani-tracking` | `orders.read` | Trazas; actualiza el estado guardado |

## Configuración

Se carga en el panel: **Configuración → Medios de envío → Andreani**. Lo que
pide (todo sale del alta comercial con Andreani; no hay registro autogestionado):

- **Usuario y contraseña de la API.** La contraseña se guarda cifrada con Data
  Protection (purpose `tiendafy.correo.tokens`, compartido por todos los
  carriers: no cambiarlo nunca, invalidaría los secretos guardados). Si se
  pierde el volumen `dpkeys`, cada tienda tiene que volver a cargarla.
- **Código de cliente** (opcional, va como `cliente` en la cotización).
- **Contrato de domicilio y/o contrato de sucursal.** Cada modalidad es un
  contrato distinto y una cotización aparte. Hace falta al menos uno.
- **Sucursal de origen** (opcional, `sucursalOrigen`).
- **Ambiente QA** (`UseQa`): cambia el host de `https://apis.andreani.com` a
  `https://apisqa.andreani.com`.
- **Datos del remitente y dirección de origen**: no hacen falta para cotizar,
  sí para despachar. El panel avisa si faltan (`CanCreateShipments`).
- **Paquete por defecto por unidad** (peso entre 1 g y 1000 kg; largo, ancho y
  alto entre 1 y 200 cm): se usa para las variantes que no tienen peso o
  medidas cargadas. Volumen máximo por bulto ~1 m³ (999.999 cm³).
- **Coeficiente de aforo** en g/cm³, en el mismo bloque del paquete: el que
  figure en el contrato; vacío = 0,35 (ver abajo). Mayor a 0 y hasta 10, con
  coma o punto. Hasta el 16-oct el panel no tenía el campo y al guardar pisaba
  cualquier coeficiente con el de fábrica.
- **Activo**: apagado, el checkout no cotiza con Andreani.

## Flujos

### Cotización en el checkout

1. El storefront manda CP, ítems del carrito y valor declarado a
   `POST /shipping/andreani/quote`.
2. El backend valida que el CP tenga 4 dígitos (acepta el CPA y se queda con
   los dígitos). **Andreani no valida el destino**, así que esto es lo único que
   evita cotizar a un CP inexistente.
3. Arma un bulto por unidad (hasta 200; más, se pide coordinar con la tienda) y
   reparte el valor declarado entre los bultos.
4. Llama `GET /v1/tarifas` una vez por contrato, las dos a la vez. Sin tarifa
   o con error, esa opción no se ofrece y el checkout sigue con los demás
   medios.
5. Cada opción vuelve con un token firmado (purpose
   `Tiendafy.Shipping.AndreaniQuote.v1`, 30 minutos, atado al tenant y a la
   huella del carrito). En el submit, `CheckoutEndpoints` desprotege el token y
   el precio sale de ahí, nunca del navegador. Si el carrito cambió, el submit
   pide recotizar.

Andreani no devuelve plazo de entrega en la cotización: no se inventa uno.

### Envío desde una venta

1. El operador abre "Crear envío en Andreani" en la venta, revisa destinatario
   y dirección (o marca retiro en sucursal con el id de sucursal). Retiro en
   sucursal exige el id de sucursal; a domicilio, calle, número, localidad y
   CP de 4 dígitos (si falta, 400 sin llamar a Andreani).
2. **Guard de idempotencia**: si la venta ya tiene envío, se devuelve el que
   hay. Andreani no deduplica ni tiene cancelación, así que un segundo envío no
   se puede anular y se factura igual. Como la fila de `andreani_shipments` se
   graba recién cuando Andreani contestó, dos pedidos simultáneos (doble clic,
   dos operadores) los frena una **reserva previa** en `shipment_claims`
   (índice único por tienda, venta y carrier), grabada ANTES de llamar: el
   segundo recibe 409 "Ya hay un envío en curso para esta venta" sin llamar a
   Andreani. Ver `backend/src/Api/Shipping/ShipmentWriteAhead.cs`:
   - Andreani rechaza (error con respuesta): la reserva se suelta y se puede
     reintentar.
   - Andreani no responde a la orden (timeout, red): 502 avisando que el envío
     pudo haberse creado y que hay que mirarlo en su panel antes de reintentar;
     la reserva se suelta. Si el que no responde es el login, la orden ni se
     mandó: 400 "Andreani no respondió a tiempo. Probá de nuevo en unos
     minutos." y se puede reintentar.
   - Andreani lo creó pero no se pudo guardar: la reserva queda `needs_review`
     (log crítico con el número) y la venta no deja crear otro. La venta lo
     avisa en lugar de "Crear envío", con dos salidas (permiso de despacho,
     quedan en la actividad del equipo): **"Se creó: cargar el número"** (se
     registra el envío con el número de Andreani; sin etiqueta, el seguimiento
     anda) o **"Ya lo revisé: no se creó"** (suelta la reserva y se puede
     crear de nuevo). Lógica en `Api/Shipping/ShipmentReview.cs`.
   - El proceso murió a mitad de camino: la reserva vence a los 5 minutos.
3. Login (`GET /login`, Basic) → token en el header de respuesta
   `x-authorization-token` (si no viene, se lee `token` del cuerpo), que se
   reenvía en ese mismo header (no Bearer).
4. `POST /v2/ordenes-de-envio`, **sin reintentos**. Un bulto por unidad
   vendida; si se carga a mano la cantidad de bultos, manda eso.
5. Se guarda el número de seguimiento del primer bulto (el que ve el
   comprador), todos los números y la URL de la etiqueta tal cual vino.

### Etiqueta y seguimiento

- La etiqueta se baja de la URL que devolvió Andreani al crear el envío (el
  path cambió entre versiones de la API; armarlo a mano da 404). En lote, se
  hace un login por lote y los PDF se unen en uno (`CarrierLabels.Merge`).
- El seguimiento es **a pedido** desde el botón "Seguimiento" de la venta
  (`GET /v2/envios/{n}/trazas`); no hay polling ni webhook. Con el estado `DELIVERED`, "Seguí tu pedido" marca
  el pedido como entregado. El último evento se traduce con `AndreaniStatusMap` y
  se guarda junto con el estado crudo. Lo que no se reconoce queda como
  `UNKNOWN` y se loguea ("Estado de Andreani sin mapear") para poder sumarlo.
- Si Andreani no contesta (timeout, red caída o respuesta ilegible), la prueba
  de conexión, la etiqueta y el seguimiento dicen "Andreani no respondió a
  tiempo. Probá de nuevo en unos minutos." en vez de un 500, y queda un
  warning en el log. En la impresión en lote, esa venta sale con ese motivo y
  las demás etiquetas siguen (`CarrierNoAnswer`, común a los carriers).

## Lo que aprendimos de la API real

Verificado el 2026-08-21 contra `apis.andreani.com` y `apisqa.andreani.com` con
el contrato de ejemplo de la documentación pública:

1. **El path de cotización es `/v1/tarifas`, no `/tarifas`.** La documentación
   escribe el segundo, que daba 403 (el 18-oct da 404); el primero da 200 con
   la tarifa.
2. **Cotizar no requiere token.** Se puede cotizar sin credenciales; crear
   envíos, etiquetas y trazas sí las piden.
3. **El formato de bultos es `bultos[N][kilos]`, `bultos[N][volumen]`,
   `bultos[N][valorDeclarado]`** en la query string. Kilos y cm³.
4. **Los importes vienen como texto con punto decimal** (`"654.78"`). Hay que
   parsearlos con cultura invariante: con la del servidor, "5806.97" se lee
   580697.
5. **Peso aforado = `max(kilos × 1000, volumen × 0,35)`, en gramos.** El 0,35
   g/cm³ se midió con el contrato de ejemplo (9000 cm³ con 1 kg dio 3150 g). Es
   un parámetro del contrato, por eso es editable por tienda.
6. **La tarifa varía por zona, no por valor declarado.** `seguroDistribucion`
   dio siempre 0 con el contrato de ejemplo.
7. **Un CP inexistente no da error**: devuelve la tarifa genérica. La
   validación del destino es nuestra.
8. **`/localidades` sin versión no existe.** El 18-oct, `GET /v1/localidades`
   respondió 200 sin token en producción (404 en QA) y `GET /v2/sucursales`,
   200 sin token en los dos hosts: sirve para un selector de sucursales en el
   checkout (ver Pendiente).
9. **Los errores vienen en dos formas**: ProblemDetails (`{title, detail,
   status}`) y un array `[{code, property, message}]`. El cliente entiende las
   dos (`DescribeError`).
10. **Las trazas usan campos en mayúscula** (`Fecha`, `EstadoId`, `Estado`,
    `MotivoId`, `Motivo`, `Sucursal`), al revés del resto de la API, y la fecha
    viene sin zona: es hora argentina.
11. **No hay cancelación ni idempotencia** en la creación de órdenes.
12. **Un número de seguimiento por bulto.** Los bultos se agrupan en un mismo
    envío con la referencia `idCliente` repetida.
13. **Teléfonos con numeración distinta**: remitente Trabajo=0, Celular=1,
    Casa=2, Otros=3; destinatario Trabajo=1, Celular=2, Casa=3, Otros=4.
14. **Email del destinatario: máximo 40 caracteres.** Es la causa más común de
    rechazo; el panel lo avisa antes de enviar.
15. **`volumenCm` es obligatorio** en la orden y las tres medidas no; se mandan
    las cuatro.
16. Andreani no publica su catálogo de estados. Solo se conocen los ids 1
    (pendiente de ingreso), 5 (ingreso al circuito), 6 (en distribución) y 11
    (visita); el resto se interpreta por el nombre, de forma conservadora.
17. **Crear envíos y trazas también llevan versión.** Sondeo sin credenciales
    del 18 y el 19-oct-2026 (producción / QA): `POST /ordenes-de-envio` da
    404 / 403 y `POST /v2/ordenes-de-envio`, 401; `GET /envios/{n}/trazas` da
    404 / 403 y `GET /v2/envios/{n}/trazas`, 401. Un 401 quiere decir que la
    ruta existe y pide token; el 404 o el 403 sin versión es el mismo síntoma
    que tenía `/tarifas`. Las planillas oficiales dicen lo mismo: la orden es
    `POST /v2/ordenes-de-envio` (y `GET /v2/ordenes-de-envio/{numero}` para
    consultarla), la etiqueta `GET /v2/ordenes-de-envio/{numero}/etiquetas`
    (el cliente usa la URL que viene en la respuesta de la orden, que es esa)
    y las trazas `GET /v2/envios/{n}/trazas`. Esa versión de las trazas está
    marcada "a deprecar": hay una `GET /v3/envios/{n}/trazas` (también da 401)
    cuyos eventos traen `Evento`, `Motivo` y `Estado` pero **no `EstadoId`**;
    pasarse obliga a mapear por nombre (ver Pendiente). `/v1/envios/{n}/trazas`
    también contesta 401, pero no figura en la documentación. El login es
    `GET /login` con Basic según la documentación: el `POST` existe pero
    valida un cuerpo con `userName` y contraseña ("parámetros incorrectos en
    el cuerpo").

Sin credenciales reales quedó sin verificar: el TTL del token de login, el
esquema vigente del cuerpo de `POST /v2/ordenes-de-envio`, si hay etiqueta ZPL
además de PDF, el catálogo completo de estados y si la API nacional restringe
por IP (el cliente traduce un 403 en el login como "falta habilitar la IP del
servidor").

## Cómo probar

- **Sin credenciales**: la cotización funciona contra la API real con un
  contrato de ejemplo, porque `/v1/tarifas` no pide token. Sirve para ver el
  checkout andando, no para validar precios.
- **Con credenciales de QA**: marcá "Ambiente QA" en la config y usá **Probar
  conexión** (hace el login real). Las tarifas de QA no son las de producción.
  Según la documentación de Andreani GlobAllPack (mismo host), QA tiene
  restricción por IP y horario de 08 a 20 h; no lo confirmamos para la API
  nacional.
- **Tests**: `dotnet test` en `backend/tests/UnitTests` cubre el cliente, el
  aforo y el mapeo de estados (`Checkout/AndreaniTests.cs`); el flujo por HTTP,
  con dos pedidos simultáneos y Andreani sin responder, está en
  `IntegrationTests/AndreaniFlowTests.cs`.
- **Ojo en producción**: crear una orden de envío genera un envío real que no
  se puede anular por API.

No hay homologación formal publicada: las credenciales y la habilitación de
cada endpoint (por ejemplo, el seguimiento) las da Andreani a mano, primero las
de QA y después las de producción.

## Pendiente

- Pasar las trazas a `/v3/envios/{n}/trazas` antes de que Andreani apague la
  v2 (punto 17): la v3 no trae `EstadoId` y `AndreaniStatusMap` tendría que
  mapear por `Evento`/`Estado`.
- Conseguir credenciales reales (alta comercial) y probar de punta a punta:
  login, orden de envío, etiqueta y trazas.
- Confirmar con Andreani el cuerpo vigente de `POST /v2/ordenes-de-envio`, el
  TTL del token (la documentación dice 24 h), la restricción por IP y el catálogo de
  estados.
- El comprador no elige la sucursal en el checkout: si cotizó retiro en
  sucursal, el operador carga el id de sucursal al despachar. `GET
  /v2/sucursales` responde sin token y alcanzaría para un selector.
- No hay seguimiento automático ni avisos al comprador por cambio de estado
  (el seguimiento se consulta a pedido desde el panel).
- Si el proceso muere justo después de que Andreani creó el envío, la reserva
  vence a los 5 minutos y un reintento podría duplicarlo: sin idempotencia del
  lado de Andreani no hay forma de saberlo.
- Cancelaciones: se gestionan por fuera, con el ejecutivo de Andreani.
