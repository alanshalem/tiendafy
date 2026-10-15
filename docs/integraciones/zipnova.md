# Zipnova

Agregador logístico: con una sola cuenta cotiza y despacha con varios correos
(el que elija la tienda según precio y plazo). En Tiendafy cotiza en vivo en el
checkout y crea envíos con etiqueta y seguimiento desde el panel. Usa la API
v2 de Zipnova.

Documentación oficial: <https://docs.zipnova.com/>.

## Qué hace en Tiendafy

- **Cotiza en el checkout** a domicilio con los correos que tenga habilitados
  la cuenta: muestra las 4 opciones más baratas, con plazo estimado cuando
  Zipnova lo da.
- **Crea el envío desde una venta** (panel → detalle de la venta → Zipnova).
- **Baja la etiqueta PDF** (proxied: las credenciales nunca llegan al
  navegador), suelta o en lote junto con las de Andreani.
- **Consulta el seguimiento** desde el panel y le muestra al comprador el
  correo, el número y la URL de seguimiento que devuelve Zipnova.

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
| Panel: crear envío | `admin/src/components/ZipnovaShipment.tsx` |
| Tienda: cotización | `storefront/src/components/store/checkout-carriers.ts` |
| Tests | `backend/tests/UnitTests/Checkout/ZipnovaTests.cs` |

`HttpClient` registrado en `CheckoutModule.cs` con timeout de 20 s y **sin
reintentos** (la creación no es idempotente).

### Endpoints (bajo `/api/v1`)

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET/PUT/DELETE /admin/shipping/zipnova` | `shipping.config` | Config. Token y secret nunca vuelven; vacíos = conservar los guardados |
| `POST /admin/shipping/zipnova/test` | `shipping.config` | Cotización real de prueba (por defecto Rosario, Santa Fe, CP 2000). Leer no crea nada ni consume saldo |
| `POST /shipping/zipnova/quote` | público (tenant) | Cotización del checkout |
| `POST /admin/orders/{id}/zipnova-shipment` | `orders.fulfill` | Crea el envío |
| `GET /admin/orders/{id}/zipnova-shipment` | `orders.read` | Envío de esa venta |
| `GET /admin/orders/{id}/zipnova-label` | `orders.fulfill` | PDF de la etiqueta |
| `GET /admin/orders/{id}/zipnova-tracking` | `orders.read` | Historial; actualiza el estado guardado |

## Configuración

Se carga en **Configuración → Medios de envío → Zipnova**:

- **API Token y API Secret**: panel de Zipnova → Configuración → Integraciones
  → Gestionar credenciales. Se guardan cifrados con Data Protection (purpose
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
   cambió, se pide recotizar.
5. Si Zipnova falla, la cotización vuelve sin opciones y con un mensaje: el
   checkout sigue con los demás medios.

### Envío desde una venta

1. **Guard de idempotencia**: si la venta ya tiene envío en
   `zipnova_shipments` (índice único por tienda y venta), se devuelve ese.
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
- `GET /shipments/{id}/tracking`, a pedido desde el panel (no hay polling ni
  webhook). El estado del primer evento queda guardado; si es `delivered`, la
  vista de seguimiento del comprador marca el pedido como entregado.

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

## Cómo probar

1. Registrá una cuenta en Zipnova y pedile al soporte la modalidad "testing".
2. Cargá token, secret, país e ID de cuenta, y tocá **Probar**: hace una
   cotización real que no consume saldo.
3. En la tienda, cotizá con CP, ciudad y provincia.
4. Con testing activo, creá un envío desde una venta y bajá la etiqueta.
5. Tests: `backend/tests/UnitTests/Checkout/ZipnovaTests.cs`.

## Pendiente

- **Retiro en punto de Zipnova** (`pickup_point`): necesita un selector de
  puntos en el checkout. Hoy esas opciones se descartan.
- No hay cancelación desde el panel ni seguimiento automático: el estado se
  actualiza solo cuando alguien abre el seguimiento de la venta.
- Confirmar en producción el orden de los eventos de tracking: se toma el
  primero como el último estado.
