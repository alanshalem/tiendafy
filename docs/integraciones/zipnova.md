# Zipnova

Agregador logístico: con una sola cuenta cotiza y despacha con varios correos
(el que elija la tienda según precio y plazo). En Tiendafy cotiza en vivo en el
checkout y crea envíos con etiqueta y seguimiento desde el panel. Usa la API
v2 de Zipnova.

Documentación oficial: <https://docs.zipnova.com/envios/> (hosts y
autenticación en
[URLs y autenticación](https://docs.zipnova.com/envios/principios/urls-y-autenticacion.md),
revisado el 18-oct-2026).

## Qué hace en Tiendafy

- **Cotiza en el checkout** a domicilio con los correos que tenga habilitados
  la cuenta: muestra las 4 opciones más baratas, con plazo estimado cuando
  Zipnova lo da. En "Calcular envío" de la ficha del producto no cotiza:
  Zipnova necesita ciudad y provincia, que se piden recién en el checkout.
- **Crea el envío desde una venta** (panel → detalle de la venta → Zipnova).
- **Baja la etiqueta PDF** (proxied: las credenciales nunca llegan al
  navegador), suelta o en lote junto con las de Andreani.
- **Actualiza el estado** del envío desde la venta ("Actualizar estado") y le
  muestra al comprador el correo, el número y la URL de seguimiento que
  devuelve Zipnova.

Todo es **por tienda**. No hay env vars de plataforma para Zipnova.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Cliente HTTP (quote, shipments, label, tracking) | `backend/src/Modules/Checkout/Checkout.Infrastructure/Carriers/ZipnovaClient.cs` |
| Config por tienda y `ZipnovaShipment` (guard de idempotencia) | `backend/src/Modules/Checkout/Checkout.Core/Domain/ZipnovaConfig.cs` |
| Endpoints | `backend/src/Api/Endpoints/ZipnovaEndpoints.cs` |
| Token firmado de la cotización | `backend/src/Api/Shipping/ZipnovaQuoteToken.cs` (motor común en `SignedQuoteToken.cs`) |
| Etiquetas en lote | `backend/src/Api/Fulfillment/CarrierLabels.cs` |
| Seguimiento para el comprador | `backend/src/Api/Shipping/CarrierTrackingLink.cs`, `backend/src/Api/Orders/OrderTrackingView.cs` |
| Persistencia | `backend/src/Modules/Checkout/Checkout.Infrastructure/Persistence/ZipnovaRepository.cs`, migración `20260729154823_AddZipnova` |
| Panel: configuración | `admin/src/pages/Settings/Zipnova.tsx` |
| Panel: crear envío, etiqueta, "Actualizar estado" | `admin/src/components/ZipnovaShipment.tsx` (aviso de envío a revisar: `ShipmentReview.tsx`) |
| Tienda: cotización | `storefront/src/components/store/checkout-carriers.ts` |
| Tests | `backend/tests/UnitTests/Checkout/ZipnovaTests.cs`, `backend/tests/IntegrationTests/ZipnovaFlowTests.cs` |

`HttpClient` registrado en `CheckoutModule.cs` con timeout de 20 s y **sin
reintentos** (la creación no es idempotente). La cotización corta antes, a los
**8 s** (`ZipnovaClient.QuoteTimeout`, desde el 16-oct): el checkout deja de
esperarla a los 10 s. Crear envíos y bajar etiquetas, desde el panel, siguen
con los 20 s.

### Endpoints (bajo `/api/v1`)

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET/PUT/DELETE /admin/shipping/zipnova` | `shipping.config` | Config. Token y secret nunca vuelven; vacíos = conservar los guardados |
| `POST /admin/shipping/zipnova/test` | `shipping.config` | Cotización real de prueba (por defecto Rosario, Santa Fe, CP 2000). Leer no crea nada ni consume saldo |
| `POST /shipping/zipnova/quote` | público (tenant) | Cotización del checkout |
| `POST /admin/orders/{id}/zipnova-shipment` | `orders.fulfill` | Crea el envío |
| `GET /admin/orders/{id}/zipnova-shipment` | `orders.read` | Envío de esa venta (o el aviso de un envío a revisar) |
| `POST /admin/orders/{id}/zipnova-shipment/review/record` | `orders.fulfill` | Envío a revisar: "Se creó", registra el id del envío en Zipnova |
| `POST /admin/orders/{id}/zipnova-shipment/review/release` | `orders.fulfill` | Envío a revisar: "No se creó", suelta la reserva |
| `GET /admin/orders/{id}/zipnova-label` | `orders.fulfill` | PDF de la etiqueta |
| `GET /admin/orders/{id}/zipnova-tracking` | `orders.read` | Historial; actualiza el estado guardado |

## Configuración

Se carga en **Configuración → Medios de envío → Zipnova**:

- **API Token y API Secret**: panel de Zipnova → Configuración → Integraciones
  → Gestionar credenciales y webhooks. Van por Basic auth (el modo que Zipnova
  indica para una cuenta propia; OAuth2 es para apps que usan muchas cuentas
  ajenas). Se guardan cifrados con Data Protection (purpose
  `tiendafy.correo.tokens`, compartido por todos los carriers: no cambiarlo
  nunca).
- **País** (`AR`, `CL` o `MX`): define el host (`api.zipnova.com.ar/v2`,
  `api.zipnova.cl/v2`, `api.zipnova.com.mx/v2`).
- **ID de cuenta** (el número que se ve en el panel de Zipnova; es la unidad
  de facturación).
- **Origen**: ID numérico del address book de Zipnova, o `auto` para el origen
  por defecto de la cuenta.
- **Paquete por defecto por unidad** (500 g, 30 × 20 × 10 cm si no se carga
  nada; peso entre 10 g y 10.000 kg, lados hasta 500 cm): para las variantes
  sin peso o medidas.
- **Activo**: apagado, el checkout no cotiza con Zipnova.

## Flujos

### Cotización en el checkout

1. El storefront manda CP, ciudad, provincia, ítems y valor declarado a
   `POST /shipping/zipnova/quote`. Zipnova necesita ciudad y provincia además
   del CP.
2. Un paquete por unidad (hasta 200), con el peso y las medidas de su
   variante. Del CP se mandan solo los dígitos.
3. `POST /shipments/quote` con `sort_by=price`. Se filtran las opciones
   `selectable`, se descartan las de `pickup_point` y quedan las 4 más
   baratas, por precio con impuestos (`price_incl_tax`).
4. Cada opción vuelve con un token firmado (purpose
   `Tiendafy.Shipping.ZipnovaQuote.v1`, 30 minutos, atado al tenant y a la
   huella del carrito). Al confirmar, el precio sale del token; si el carrito
   cambió, se pide recotizar. Lo mismo si la entrega es a domicilio y el código postal de la dirección
   (el campo `postalCode` del submit y el "CP …" de la dirección) no es el
   cotizado: se comparan los 4 dígitos, así que un CPA como `C1425ABC` vale
   como `1425` (`Api/Shipping/ShippingPostalCode.cs`). El rechazo es
   `Checkout.PostalCodeChanged` y la tienda vuelve al paso de envío con las
   opciones borradas; cambiar el CP de la cotización también las borra.
5. Si Zipnova contesta con error, no contesta en 8 s, la red está caída o la
   respuesta no se puede leer, la cotización vuelve sin opciones y con un
   mensaje: el checkout sigue con los demás medios. Lo que no es un error de
   su API queda como warning en el log (no como un 500 nuestro en Sentry). La
   prueba de conexión, la etiqueta y el seguimiento hacen lo mismo ("Zipnova
   no respondió a tiempo"). Si el que cortó fue el navegador, no cuenta como
   falla de Zipnova.

### Envío desde una venta

1. **Guard de idempotencia**: si la venta ya tiene envío en
   `zipnova_shipments` (índice único por tienda y venta), se devuelve ese.
   Esa fila se graba después de crear el envío, así que dos pedidos
   simultáneos los frena una **reserva previa** en `shipment_claims`, grabada
   antes de llamar a Zipnova: el segundo recibe 409 "Ya hay un envío en curso
   para esta venta" sin llamar. Si Zipnova rechaza, la reserva se suelta; si
   no responde, 502 avisando que hay que revisar su panel antes de reintentar.
   El detalle está en [andreani.md](andreani.md) (mismo mecanismo,
   `backend/src/Api/Shipping/ShipmentWriteAhead.cs`). Si quedó a revisar,
   "Se creó: cargar el número" pide el id numérico del envío en Zipnova
   (`#123` también vale) y con eso andan la etiqueta y el seguimiento.
2. Se exigen nombre, documento, email, teléfono y dirección completa.
3. `POST /shipments` con `external_id` = `TF-` + 16 hex de la venta (Zipnova
   acepta hasta 30 caracteres alfanuméricos y guiones), `service_type`
   (`standard_delivery` por defecto) y un paquete por unidad vendida. Lo que
   se cargue a mano (cantidad, peso o medidas) manda.
4. Se guarda el id del envío en Zipnova, el correo asignado, su número de
   seguimiento, la URL de seguimiento y el estado.

### Etiqueta y seguimiento

- `GET /shipments/{id}/label.pdf?no_status_change=1`. Un **409** quiere decir
  que la etiqueta todavía no está lista: se le pide al operador que pruebe en
  unos minutos.
- `GET /shipments/{id}/tracking`, a pedido desde el panel con "Actualizar
  estado" en la venta (lo ve quien ve la venta, `orders.read`; no hay polling
  ni webhook). Muestra el último estado al lado del número y avisa si no hay
  movimientos. Hasta el 16-oct el endpoint existía pero el panel no lo
  llamaba, así que el estado guardado nunca cambiaba. La especificación no
  dice en qué orden vienen los eventos: se ordenan por fecha
  (`TrackingEvents.NewestFirst`) y se guarda el estado del más nuevo; si es
  `delivered`, "Seguí tu pedido" marca el pedido como entregado. El link
  "Seguimiento" abre la página del transporte.

## Lo que aprendimos de la API real

Confirmado por el soporte de Zipnova por escrito (julio 2026):

- **La creación de envíos no tiene idempotencia.** Repetir el mismo
  `external_id` duplica el envío, con costo. Por eso nunca se reintenta un
  `POST /shipments` y el guard vive de nuestro lado.
- **Las dimensiones van en centímetros en todos los endpoints.** La
  especificación pública decía milímetros para la creación; el soporte lo
  desmintió. No convertir.
- **No hay ambiente de pruebas aparte**: se le pide al soporte que habilite la
  modalidad "testing" sobre la cuenta registrada (se desactiva al operar en
  serio). Fuera de testing, crear envíos consume saldo real.
- **Rate limits por IP**: 500 por minuto para cotizar y 100 por minuto para
  crear. Un 429 se traduce a "Zipnova está limitando el tráfico".
- **Mandar solo la parte numérica del CP**: un CPA como `C1414BAI` geolocaliza
  mal.

De la especificación, y manejado a la defensiva:

- La etiqueta no declara media type: puede venir como PDF binario, como JSON
  con el base64 en `content`, `data`, `document` o `file`, o como base64
  suelto. El cliente acepta las tres formas.
- El tracking puede venir como array suelto o envuelto en `data[]`.
- La especificación no documenta valores por defecto en la cotización: por eso
  se mandan `sort_by` y el destino explícitos.

Contra la documentación y la API real, el 18-oct-2026:

- Hosts `api.zipnova.com.ar/v2`, `api.zipnova.cl/v2` y `api.zipnova.com.mx/v2`,
  Basic con API Token y API Secret, `Accept: application/json` siempre y
  `Content-Type: application/json` con cuerpo: coincide con el cliente. Los
  dominios viejos de Zippin (`api.zippin.*`) dejaron de valer el 1-abr-2026.
- Sin credenciales, `POST /shipments/quote`, `POST /shipments`,
  `GET /shipments/{id}/label.pdf` y `GET /shipments/{id}/tracking` responden
  403 "Unauthenticated" (una ruta inventada da 404): las cuatro existen.

## Cómo probar

1. Registrá una cuenta en Zipnova y pedile al soporte la modalidad "testing".
2. Cargá token, secret, país e ID de cuenta, y tocá **Probar**: hace una
   cotización real que no consume saldo.
3. En la tienda, cotizá con CP, ciudad y provincia.
4. Con testing activo, creá un envío desde una venta y bajá la etiqueta.
5. Tests: `backend/tests/UnitTests/Checkout/ZipnovaTests.cs` y
   `backend/tests/IntegrationTests/ZipnovaFlowTests.cs` (incluye Zipnova caído
   o sin responder, dos pedidos simultáneos, el envío a revisar y el orden del
   tracking).

## Pendiente

- **Retiro en punto de Zipnova** (`pickup_point`): necesita un selector de
  puntos en el checkout. Hoy esas opciones se descartan.
- No hay cancelación desde el panel ni seguimiento automático: el estado se
  actualiza solo cuando alguien toca "Actualizar estado" en la venta.
- Confirmar en producción el formato de `created_at` del tracking: se ordena
  por esa fecha; un evento sin fecha legible queda al final.
- Confirmar que la creación acepte `origin_id: "auto"`: la cotización omite el
  campo con "auto" y lo manda numérico; la creación lo manda tal cual está en
  la config (texto, también "auto").
- Zipnova ofrece webhooks de cambio de estado (se configuran en el mismo
  lugar que las credenciales); hoy no se usan.
