# Payway (ex Decidir)

Segundo medio de pago con tarjeta, para tiendas que cobran con su propio
comercio de Payway en vez de (o además de) Mercado Pago. Estado: **completo en
código y probado contra el sandbox público**; falta el alta comercial con
Payway (credenciales propias y certificación) y dos arreglos antes del primer
cobro real (ver [Pendiente](#pendiente)).

## Qué hace en Tiendafy

- **API directa con tokenización.** El comprador tipea la tarjeta en un
  formulario nuestro; `decidir.js` la cambia por un token de un solo uso
  directo contra Payway y el backend cobra con ese token y la clave privada de
  la tienda. El número de tarjeta y el código de seguridad nunca pasan por
  nuestro servidor (PCI SAQ A-EP).
- **Credenciales por tienda**, cargadas a mano en el panel (Configuración →
  Medios de pago): número de comercio (`site_id`), clave pública, clave privada,
  ambiente (`SANDBOX` / `PRODUCTION`), host alternativo opcional, nombre que ve
  el comprador en el resumen y cuotas ofrecidas. No hay OAuth.
- **Cuotas fijas** elegidas por la tienda (`installmentOptions`, default 1).
  Payway no tiene API de promociones ni de planes: no hay cálculo de interés ni
  CFT; las cuotas van como las configure el comercio con Payway.
- **Rechazos con motivo legible** para el comprador y aviso de si tiene
  sentido reintentar con otra tarjeta.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Credenciales de la tienda (tabla `payway_connections`) | `backend/src/Modules/Payments/Payments.Core/Domain/PaywayConnection.cs` |
| Un intento de cobro (tabla `payway_payment_attempts`) | `Payments.Core/Domain/PaywayPaymentAttempt.cs` |
| Contrato y estados propios | `Payments.Contracts/PaywayContracts.cs` (`IPaywayPaymentService`, `PaywayPaymentStatus`) |
| Cliente HTTP | `Payments.Infrastructure/Payway/PaywayClient.cs` |
| Estados, rechazos, BIN y `payment_method_id` | `Payments.Infrastructure/Payway/PaywayMaps.cs` |
| Cifrado de la clave privada | `Payments.Infrastructure/Security/PaywayCredentialProtector.cs` |
| Endpoints de configuración | `backend/src/Api/Endpoints/PaywayEndpoints.cs` |
| Cobrar (`POST /checkout/{id}/pay-payway`) | `backend/src/Api/Endpoints/OrderEndpoints.cs` |
| Panel | `admin/src/pages/Settings/PaywayConnect.tsx` |
| Formulario de tarjeta | `storefront/src/components/store/PaywayCardForm.tsx` (carga `https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js`) |

Purpose de Data Protection: `Tiendafy.Payments.PaywayCredentials.v1`, separado
del de Mercado Pago a propósito. No cambiarlo.

## Configuración

No hay variables de entorno: todo es por tienda y vive en la base.

| Dato | Endpoint | Notas |
|---|---|---|
| Ver la conexión | `GET /api/v1/payments/payway/connection` | Nunca devuelve la clave privada, solo `hasPrivateKey` |
| Guardar | `PUT /api/v1/payments/payway/connection` | `privateKey` vacía al editar = "dejá la que está" |
| Probar el host | `POST /api/v1/payments/payway/test` | Pega a `/healthcheck`; no prueba que se pueda cobrar |
| Borrar | `DELETE /api/v1/payments/payway/connection` | |
| Config pública para la tienda | `GET /api/v1/payments/payway/public-config` | Clave pública, host y cuotas |

Hosts (`PaywayConnection.BaseUrl`):

- Sandbox: `https://developers.decidir.com/api/v2`
- Producción: `https://live.decidir.com/api/v2` (ver el gotcha del host abajo)
- `baseUrlOverride`: reemplaza al anterior sin deploy. Solo HTTPS.

## Flujo de un cobro

1. La tienda pide `public-config`, carga `decidir.js` y tokeniza la tarjeta
   contra el host de la tienda. Del navegador al backend viajan solo el token,
   el BIN (6 dígitos), los últimos 4, la marca, si es débito y las cuotas.
2. `POST /checkout/{id}/pay-payway` crea la orden desde la sesión de checkout:
   el monto sale de la orden, nunca del navegador, y ya está en centavos.
3. `PaywayClient.ChargeAsync` **abre la fila del intento antes de llamar a
   Payway**, con `site_transaction_id = TF-{orderId:N}-{intento}` e índice
   único `(tenant, site_transaction_id)` y `(tenant, order, attempt_number)`.
   Si la orden ya tiene un intento aprobado, no cobra (`Payway.AlreadyPaid`).
4. `POST /payments` con `payment_type: "single"`, la IP real del comprador,
   `establishment_name` y el `payment_method_id` deducido de la marca. Timeout
   de 35 s (Payway admite entre 20 y 30 s con carga).
5. La respuesta se traduce y se guarda en el intento:

| Payway | Nuestro estado | Qué pasa con la orden |
|---|---|---|
| `approved` | `Approved` | Se marca pagada (`SettlePaymentHandler`) y corren los avisos y la factura |
| `rejected`, `group_rejected` | `Declined` | Queda pendiente; la tienda muestra el motivo y deja probar otra tarjeta |
| `review` | `UnderReview` | Queda pendiente. No despachar |
| `challenge pending`, `fingerprint pending` | `RequiresAction` | Queda pendiente (3DS no está implementado) |
| `pre_approved` | `Authorized` | Queda pendiente |
| `annulled`, `refunded`, `refund_approved`… | `Refunded` | |
| cualquier otro, timeout, 5xx | `Unknown` | Queda pendiente; se loguea el estado crudo |

6. **Timeout o caída de red: no se reintenta.** Se consulta
   `GET /payments?siteOperationId={site_transaction_id}&pageSize=1` y se adopta
   lo que Payway diga. Si tampoco contesta, el intento queda `Unknown` y el
   comprador ve "No vuelvas a intentar: lo estamos verificando".

Devoluciones: `PaywayClient.RefundAsync` existe (`POST /payments/{id}/refunds`,
cuerpo vacío = total, `{ amount }` en centavos = parcial) pero **todavía no está
conectado al reembolso del panel** (ver Pendiente).

## Lo que aprendimos de la API real

Verificado el 2026-08-21 contra el sandbox con las claves de ejemplo que
publican los SDK oficiales (`public_key e9cdb99f…`, `private_key 92b71cf7…`, en
el README de [payway-ar/sdk-net-ventaonline](https://github.com/payway-ar/sdk-net-ventaonline)).
Sirven para desarrollar; no reemplazan a las propias.

- **No hay idempotencia.** No existe un `X-Idempotency-Key`. La defensa es
  nuestra: `site_transaction_id` determinístico con índice único, nunca
  reintentar un `POST /payments` y, ante la duda, consultar por
  `siteOperationId` (funciona: devuelve `{ limit, offset, results: [pago] }`).
- **El token dura 15 minutos exactos** (`date_due` − `date_created`) y **es de
  un solo uso**: reusarlo da `400` con
  `validation_errors: [{ code: "repeated", param: "token" }]`. Se detecta
  (`PaywayMaps.IsRepeatedToken`) y se responde `409 Payway.TokenAlreadyUsed`
  con "volvé a cargar los datos": casi siempre es un formulario reenviado. Un
  formulario abierto más de 15 minutos tiene que poder volver a tokenizar.
- **Un rechazo es `402` con el pago completo en el cuerpo**
  (`status: "rejected"`, `status_details.error.reason.{id, description}`). Se
  procesa como resultado de negocio, no como error HTTP: si no, se pierde el
  motivo que hay que mostrar.
- **Montos en centavos** (`125045` ida y vuelta), igual que
  `Money.AmountInMinorUnits`: no hay conversión en ningún lado y tiene que
  seguir así. La moneda se manda `"ARS"` y vuelve `"ars"`.
- `tid` no vino en un aprobado de prueba: se lee como opcional.
  `customer_token` vuelve `null` si no se manda `user_id` (no guardamos
  tarjetas).
- Los estados con espacio (`challenge pending`) vienen así, no con guion bajo.
- **Política de Payway: no reintentar automáticamente una transacción
  denegada.** El comprador puede probar con otra tarjeta; el sistema no
  reintenta solo.
- Visa Débito no acepta devoluciones parciales en e-commerce (según el README
  del SDK .NET).
- Anulación y devolución son la misma llamada; lo decide el cierre de lote
  (mismo día = `annulled`, después = `refunded`). El horario del cierre no está
  documentado.

Lo que sigue **sin confirmar** (pedirlo por escrito a Payway en el alta):

- **Host de producción.** El SDK .NET y ActiveMerchant usan `live.decidir.com`;
  los SDK de Node y Java, `ventasonline.payway.com.ar`. El código toma el
  primero y el override por tienda permite corregirlo sin deploy.
- **Tabla de `payment_method_id`.** Conviven la clásica (Visa 1, Visa Débito 31,
  Mastercard 15, Mastercard Débito 66, Amex 65, Cabal 27, Naranja 24) y otra más
  nueva (Mastercard 104, Maestro 106…). Se usa la clásica y el id va guardado
  en cada intento para ver rápido si una marca empieza a rechazar en masa.
- Webhooks (no se encontraron para la API directa), API de promociones,
  pre-autorización, 3DS (qué hace el navegador con `instruction_value`),
  rate limits y tabla completa de códigos de rechazo.

## Cómo probar

Automático: `backend/tests/IntegrationTests/PaywayFlowTests.cs` (configurar,
cobrar, rechazos, timeout con recuperación por `siteOperationId`, orden ya
cobrada) contra una API simulada, `backend/tests/UnitTests/Payments/PaywayTests.cs`
(mapeos) y `storefront/src/__tests__/payway-card-form.test.tsx`.

A mano en sandbox: cargá en el panel ambiente `SANDBOX` con las claves de
ejemplo (o las propias de sandbox) y un `site_id` cualquiera, y pagá con
tarjetas de prueba. No hay tabla oficial publicada; estas salen de la suite
remota de [ActiveMerchant](https://github.com/activemerchant/active_merchant/blob/master/test/remote/gateways/remote_decidir_test.rb),
que corre contra el sandbox:

| Caso | Tarjeta |
|---|---|
| Visa aprobada | `4507990000004905` |
| Mastercard | `5299910010000015` |
| Amex (en sandbox solo montos de $1 o $10) | `373953192351004` |
| Rechazo | `4000300011112220` |

Cualquier vencimiento futuro, cualquier código de seguridad, DNI cualquiera.

Para la certificación con Payway conviene tener a mano, con el
`site_transaction_id` y el id de Payway de cada una: aprobado en 1 cuota,
aprobado en N cuotas, rechazado, devolución total, devolución parcial, consulta
por id, consulta por `siteOperationId` y timeout con recuperación.

## Pendiente

- **Alta comercial con Payway**: `site_id` y claves propias de sandbox y de
  producción, confirmar por escrito el host productivo y la tabla de medios de
  pago, y pasar la certificación. Después: un cobro real hecho y devuelto.
- **La CSP de la tienda bloquea Payway.** `storefront/src/lib/csp.ts` no incluye
  `https://ventasonline.payway.com.ar` en `script-src` ni los hosts de la API de
  Payway en `connect-src`, y `proxy.ts` aplica esa política en todas las
  páginas. Con un navegador real, `decidir.js` no carga y la tokenización no
  sale. Hay que sumarlos antes del primer cobro.
- **Devolver desde el panel.** `OrderRefundService` llama siempre a Mercado
  Pago para los pagos que no son manuales; un pedido cobrado con Payway termina
  en un error de Mercado Pago. `PaywayClient.RefundAsync` está listo para
  conectarse (y conviene bloquear el parcial con Visa Débito).
- **Nada reconcilia lo que quedó en el medio.** Un intento `Unknown`,
  `UnderReview` o `RequiresAction` deja la orden pendiente y no hay webhook ni
  worker que vuelva a consultar a Payway. Hoy se resuelve a mano en el portal
  de Payway.
- El número de intento casi siempre es 1: cada envío del checkout crea una
  orden nueva, así que la protección por orden no cruza intentos. Contra el
  doble cobro real hoy cuentan el token de un solo uso y el botón que se
  deshabilita mientras paga.
- Sin implementar a propósito: 3D Secure, antifraude Cybersource, cuotas con
  interés, pagos offline (Rapipago, Pago Fácil), pre-autorización, pago
  distribuido y modelo agregador.

Docs oficiales: el portal de developers de Payway es una SPA que no siempre
carga; la referencia más confiable es el código de los SDK oficiales en
[github.com/payway-ar](https://github.com/payway-ar). Soporte de alta y
credenciales: soporte@payway.com.ar.
