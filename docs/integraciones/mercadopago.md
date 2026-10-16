# Mercado Pago

Medio de pago principal de las tiendas. Estado: **completo en código**; en
producción falta crear la app de Mercado Pago de la plataforma (sin ella el
botón de conectar no lleva a ningún lado y no entran webhooks).

## Qué hace en Tiendafy

- **Una app de plataforma, una cuenta por tienda.** Tiendafy es una sola app de
  Mercado Pago con modelo marketplace. Cada tienda conecta su propia cuenta con
  OAuth ("Conectá tu cuenta") y cobramos en su nombre con su `access_token`.
- **Dos modos de cobro, elegibles por tienda** desde el panel
  (Configuración → Medios de pago):
  - **Checkout Pro** (`PRO`, default): redirect a Mercado Pago.
  - **Checkout integrado** (`API`): Payment Brick embebido en la tienda; la
    tarjeta se tokeniza en el navegador y el backend cobra con el token.
- **Webhooks** con firma HMAC, guardados en un inbox durable y procesados por
  un worker con reintentos.
- **Reembolsos** totales y parciales desde Ventas, con auditoría, y sincronización
  de los que se hacen desde el panel de Mercado Pago.
- **Link de pago** para ventas manuales (`POST /orders/manual` con método
  `link`) y **vencimiento del link** al cancelar una venta pendiente.
- **Comisión real** de Mercado Pago por venta (para Rentabilidad), cuando el
  pago informa el neto acreditado. En los dos modos: con el Brick llega con el
  webhook, después de que la orden ya quedó pagada.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Config de la app de plataforma | `backend/src/Modules/Payments/Payments.Infrastructure/MercadoPago/MercadoPagoOptions.cs` |
| OAuth (authorize, code → tokens, refresh) | `.../MercadoPago/MercadoPagoOAuthClient.cs`, `Payments.Core/Features/Connect/OAuthCallbackHandler.cs` |
| Cobros, consultas, refunds, vencer preference | `.../MercadoPago/MercadoPagoCheckoutClient.cs` (`IMercadoPagoPaymentService`) |
| Firma de webhooks | `.../MercadoPago/MercadoPagoWebhookValidator.cs` |
| Conexión por tienda (tokens cifrados, modo, fee, descriptor) | `Payments.Core/Domain/MercadoPagoConnection.cs` (tabla `mp_connections`) |
| Cifrado de tokens y del `state` OAuth | `Payments.Infrastructure/Security/DataProtectionTokenProtector.cs`, `DataProtectionStateProtector.cs` |
| Endpoints de conexión y salud del inbox | `backend/src/Api/Endpoints/PaymentsEndpoints.cs` |
| Endpoint del webhook | `backend/src/Api/Endpoints/PaymentWebhookEndpoints.cs` |
| Worker del inbox | `backend/src/Api/Payments/PaymentWebhookWorker.cs` + `SharedKernel/Common/InboxEntry.cs` |
| Pagar (`/pay`, `/pay-onsite`) | `backend/src/Api/Endpoints/OrderEndpoints.cs` |
| Aplicar el resultado a la orden | `backend/src/Modules/Orders/Orders.Core/Features/SettlePaymentHandler.cs` |
| Reembolsar y cancelar | `backend/src/Api/Orders/OrderRefundService.cs` (auditoría en `payment_refunds`) |
| Panel | `admin/src/pages/Settings/MercadoPagoConnect.tsx` |
| Tienda | `storefront/src/components/store/CheckoutClient.tsx` (`@mercadopago/sdk-react`), desafío 3DS en `CardChallenge.tsx`, CSP en `storefront/src/lib/csp.ts` |

Purposes de Data Protection (no cambiarlos: se pierde todo lo cifrado):
`Tiendafy.Payments.MercadoPagoTokens.v1` y `Tiendafy.Payments.MercadoPagoOAuthState.v1`.

## Configuración

Sección `MercadoPago` (`appsettings.json` trae placeholders vacíos). En
producción las setea `infra/docker/docker-compose.stack.yml`:

| Clave | De dónde sale en prod | Notas |
|---|---|---|
| `MercadoPago:ClientId` / `ClientSecret` | `.env.prod`: `MP_CLIENT_ID`, `MP_CLIENT_SECRET` | App de la plataforma, no de una tienda |
| `MercadoPago:WebhookSecret` | `.env.prod`: `MP_WEBHOOK_SECRET` | **Sin él, todo webhook responde 401** |
| `MercadoPago:RedirectUri` | `https://api.${STACK_DOMAIN}/api/v1/payments/mercadopago/callback` | Tiene que coincidir con la registrada en la app |
| `MercadoPago:PublicApiBaseUrl` | `https://api.${STACK_DOMAIN}` | Base del `notification_url`. Vacía = no se mandan webhooks |
| `MercadoPago:AdminReturnUrl` | `https://admin.${STACK_DOMAIN}/configuracion/medios-de-pago` | A dónde vuelve el navegador tras el OAuth (`?mp=connected` o `?mp=error`) |
| `MercadoPago:AuthBaseUrl` / `ApiBaseUrl` | defaults del código | `auth.mercadopago.com.ar` y `api.mercadopago.com` |
| `DataProtection:KeyPath` | `/keys` (volumen `dpkeys`) | Obligatoria fuera de Development; sin ella la API no arranca |
| `RateLimiting:PaymentsPermitLimit` | default 15 | Cupo por IP y ruta cada 5 min en `/pay`, `/pay-onsite`, `/pay-payway` |

En local, los secretos van como variables de entorno en la consola antes de
`.\dev-up.ps1` (la API hereda el entorno): `$env:MercadoPago__ClientId`,
`$env:MercadoPago__ClientSecret` y `$env:MercadoPago__WebhookSecret`.
`dotnet user-secrets` no sirve: `Api.csproj` no tiene `UserSecretsId`.
`.\dev-up.ps1 -Tunnel` levanta cloudflared e inyecta `MercadoPago__PublicApiBaseUrl`
y `MercadoPago__RedirectUri` con la URL del túnel.

Por tienda (panel, `PUT /api/v1/payments/mercadopago/preferences`): modo
`PRO`/`API`, `marketplaceFeePercent` (0 a 100, default 0) y
`statementDescriptor` (se corta a 22 caracteres).

## Flujos

**Conectar.** `POST /payments/mercadopago/connect` devuelve la URL de
autorización con un `state` cifrado (tienda + hora, vale 15 minutos). Mercado
Pago vuelve a `GET /payments/mercadopago/callback` sin header de tienda: la
tienda sale del `state`, nunca de la request. Se canjea el `code`, se cifran
`access_token` y `refresh_token` y se crea o actualiza la conexión (una por
tienda). El `access_token` dura unos 6 meses; antes de cada uso, si vence en
menos de 7 días, se refresca solo (si el refresh falla se loguea y se sigue con
el actual).

**Checkout Pro.** `POST /checkout/{id}/pay` crea la orden desde la sesión de
checkout (monto y cupón recalculados en el servidor), arma la preference y
devuelve `initPoint`. El envío viaja como un ítem más. Con descuento, los ítems
se colapsan en uno solo por el neto, porque la preference no tiene descuento a
nivel orden. `external_reference` = id de la orden. El `returnUrl` del cliente
se valida contra dominios propios (`SafeRedirect`).

**Checkout integrado.** El Brick tokeniza con la `publicKey` del vendedor
(`GET /payments/mercadopago/public-config`), y `POST /checkout/{id}/pay-onsite`
cobra en `/v1/payments` con `three_d_secure_mode=optional`, `capture=true` y
`binary_mode=false`. El resultado se aplica en el momento; el webhook queda de
respaldo y es el que trae la comisión (la respuesta del cobro no informa el
neto).

**Desafío del banco (3DS).** Con `optional`, Mercado Pago y el banco deciden
por riesgo si el comprador tiene que confirmar el pago. Sin desafío, el pago
vuelve `approved` (o `rejected`) como siempre. Con desafío vuelve `pending` /
`pending_challenge` con `three_ds_info { external_resource_url, creq }`:

1. La API deja la orden pendiente y contesta
   `challenge: { paymentId, externalResourceUrl, creq }` (solo si la URL es
   https absoluta; si no, `challenge: null` y el pago se resuelve por webhook).
2. La tienda (`CardChallenge.tsx`) monta en el momento el **Status Screen
   Brick** con `initialization: { paymentId, additionalInfo: { externalResourceURL, creq } }`.
   El Brick arma en la página un iframe y le postea el `creq` a la URL del
   banco. El desafío tiene que empezar dentro de los 30 s de creado el pago
   y el comprador tiene unos 5 minutos para responderlo.
3. Al terminar, el iframe manda `postMessage({ status: 'COMPLETE' })`. Eso
   solo dice que terminó, no cómo salió: la tienda va a
   `/checkout/pending?order=…`, que consulta el estado real de la orden.
   Mientras el desafío está a la vista, la tienda además consulta la orden
   cada 4 s y, si el webhook ya la resolvió, va directo al resultado.
4. El resultado final llega por webhook del mismo pago: `approved` paga la
   orden; `rejected` / `cc_rejected_3ds_challenge` la marca fallida. Un pago
   que nunca se confirma queda `pending_challenge` y Mercado Pago lo pasa a
   `cancelled` / `expired` a las 24 h.

CSP de la tienda (`storefront/src/lib/csp.ts`): la URL del desafío es el
servidor de autenticación (ACS) del banco emisor de la tarjeta (en la doc
oficial, `acs-public.tp.mastercard.com`), distinto para cada banco, así que en
`/checkout`, y solo ahí, `frame-src` y `form-action` aceptan cualquier origen
`https:`. Además los Bricks bajan su código y sus textos de
`https://http2.mlstatic.com` (`script-src` y `connect-src`): eso no lo publica
Mercado Pago, sale de leer el SDK (`sdk.mercadopago.com/js/v2`, v3.19.0).

**Webhook.** `POST /api/v1/payments/webhooks/mercadopago` es público. Valida la
firma, guarda `(type, data.id, user_id)` en `payment_webhook_events` y contesta
200 sin procesar. Solo se guardan los de tipo `payment`: los demás se contestan
200 y se descartan. Hay una fila por pago (índice único `(type, data_id)`),
pero Mercado Pago avisa cada cambio del mismo pago (pendiente → aprobado,
reembolso desde su cuenta, contracargo): un aviso repetido vuelve a poner en
cola la fila ya procesada, y una que sigue pendiente queda como está (el
worker va a leer el estado nuevo). Hasta el 16-oct-2026 se descartaba y esos
cambios no llegaban nunca. El worker (cada 5 s) busca la tienda por el `user_id` de
Mercado Pago, consulta `GET /v1/payments/{id}` (nunca confía en el body ni en
el redirect) y llama a `SettlePaymentHandler`, que es idempotente:

| `status` de MP | Qué pasa |
|---|---|
| `approved` | Orden pendiente → `Paid`, confirma reservas, guarda la comisión. Si ya estaba pagada con ese mismo pago y no tenía comisión, la guarda sin volver a correr avisos, factura ni stock (el caso del Brick). Si `transaction_amount_refunded` creció, aplica la diferencia como reembolso |
| `rejected`, `cancelled` | Orden pendiente → `Failed`, libera reservas |
| `refunded` | → `Refunded` |
| `charged_back`, `in_mediation` | → `ChargedBack` |
| `pending`, `in_process` | Nada; espera el próximo aviso |

Reintentos: backoff de 30 s, 2, 10 y 45 min, 3, 6 y 12 h (8 intentos en casi
22 horas) y después `dead`. El panel ve los muertos en
`GET /payments/mercadopago/webhooks/health` y los revive con
`POST /payments/mercadopago/webhooks/{id}/retry`, acotado al `user_id` de la
tienda.

**Reembolso.** `POST /api/v1/orders/{id}/refund` con
`{ "amount": 1500.50, "reason": "...", "restock": false }`; `amount` nulo o 0 =
todo lo que queda. Lock por orden, validación contra `RemainingRefundable`,
Mercado Pago primero y estado local después (con `xmin` como token de
concurrencia: si otra instancia ya aplicó, 409). La clave de idempotencia es
**determinística**:

```
refund-{orderId:N}-{RefundedAmount ya devuelto, en centavos}-{monto de este reembolso, en centavos}
```

Un reintento o un doble click con el mismo monto da la misma clave y Mercado
Pago no devuelve dos veces; un parcial nuevo da otra, porque lo ya devuelto
cambió. El primer reembolso total va sin monto (Mercado Pago devuelve todo);
con parciales previos siempre va con monto explícito. Si el `PaymentId` empieza
con `manual-` (efectivo, transferencia, cuenta corriente) no se llama a Mercado
Pago: solo se registra. Si la venta se cobró con Payway (hay un intento de
Payway de esa orden con ese id de pago), la devolución va a Payway (ver
[payway.md](payway.md)). Al completar el total corren los avisos y la nota de
crédito automática (ver [arca.md](arca.md)); el reingreso de stock es opcional.

**Cancelar una venta pendiente.** Primero se vence la preference
(`PUT /checkout/preferences/{id}` con vencimiento en el pasado) para que el link
no acepte pagos, después se cancela la orden y se liberan las reservas.

## Lo que aprendimos de la API real

- La firma del webhook es `HMAC-SHA256(secret, "id:{data.id};request-id:{x-request-id};ts:{ts};")`
  contra el `v1` de `x-signature`. Se compara en tiempo constante y se rechaza
  si `ts` difiere más de 5 minutos del reloj del servidor.
- Hay que contestar 200 rápido y procesar después: un webhook al que ya se le
  contestó no se reenvía, por eso el inbox es durable y con backoff largo.
- El `X-Idempotency-Key` de un refund tiene que variar entre parciales: con una
  clave fija por pago, Mercado Pago deduplica el segundo parcial y no lo hace.
- `marketplace_fee` es de la preference (Pro); en `/v1/payments` (Brick) el
  campo se llama `application_fee`.
- `auto_return` y `back_urls` piden HTTPS: en local por http el regreso
  automático falla en silencio, y la orden se concilia igual por webhook.
- Los pagos se cobran con el token del vendedor, así que **el inbox no tiene
  tienda**: se resuelve por el `user_id` del body. Una tienda solo puede ver o
  revivir eventos de su propio `user_id`.
- Refunds: hasta 180 días después del pago.
- `binary_mode=false` **no pide 3DS**: el default de `three_d_secure_mode` es
  `not_supported`. Hasta el 16-oct-2026 el código mandaba solo
  `binary_mode=false` con un comentario que decía lo contrario, y el 3DS no se
  pedía nunca. La guía oficial documenta solo `not_supported` y `optional`, y
  pide `optional` con captura automática y `binary_mode` apagado.
- El 3DS solo se prueba en sandbox con credenciales de prueba: en producción
  no anda ni con usuarios de prueba.
- El cobro del Brick va por la API de pagos (`/v1/payments`). Mercado Pago
  ahora ofrece la Orders API (`/v1/orders`) para integraciones nuevas, pero no
  anunció la baja de `/v1/payments`, y su guía de migración avisa que la
  comisión de marketplace (`application_fee`) todavía no tiene equivalente en
  la Orders API. Por eso seguimos en `/v1/payments`.

## Cómo probar

Automático: `backend/tests/IntegrationTests/MercadoPagoFlowTests.cs` (con API
falsa, incluido el pago con desafío del banco), `UnitTests/Orders/SettlePaymentHandlerTests.cs`,
`UnitTests/Payments/OAuthCallbackHandlerTests.cs`,
`UnitTests/Payments/MercadoPagoCardPaymentTests.cs` (body con 3DS y lectura de
`three_ds_info`), `UnitTests/Api/OrderRefundLocksTests.cs`; en la tienda,
`storefront/src/__tests__/checkout.test.tsx`, `card-challenge.test.tsx` y
`csp.test.ts`.

A mano, con cuentas de prueba de Mercado Pago:

1. Creá dos usuarios de prueba (vendedor y comprador, sitio `MLA`).
2. Logueado como el vendedor de prueba, creá una app marketplace y exportá
   `ClientId`, `ClientSecret` y `WebhookSecret` como variables de entorno
   (`$env:MercadoPago__ClientId = '...'`, etc.) en la misma consola.
3. Poné `cloudflared.exe` en la raíz del repo y corré `.\dev-up.ps1 -Tunnel`.
4. Registrá en la app el Redirect URI que imprime el script
   (`https://xxxx.trycloudflare.com/api/v1/payments/mercadopago/callback`). La
   URL del túnel rápido cambia en cada corrida.
5. Panel → Configuración → Medios de pago → conectá la cuenta del vendedor y
   elegí el modo.
6. Comprá en la tienda con el comprador de prueba. Con
   [tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards)
   el resultado lo decide el nombre del titular: `APRO` aprueba, `OTHE`
   rechaza, `CONT` queda pendiente. Para el desafío del banco (modo `API`,
   credenciales de prueba): Mastercard `5483 9281 6457 4623` lo supera y
   `5361 9568 0611 7557` no lo autoriza (código 123, vence 11/30); en la
   pantalla del banco de prueba se aprieta "Confirmar".
7. Reembolsá desde Ventas (total o parcial) y mirá el historial
   (`GET /orders/{id}/refunds`).

| Síntoma | Causa probable |
|---|---|
| Webhook responde 401 | Falta `WebhookSecret`, es otro, o el reloj está corrido más de 5 min |
| Pago aprobado y orden pendiente | `PublicApiBaseUrl` vacía o no accesible desde internet |
| `MercadoPago.NotConnected` | La tienda no completó el OAuth o desconectó la cuenta |
| El Brick no aparece | Modo `API` sin `publicKey`: reconectar la cuenta |
| Eventos `dead` | `last_error` en `payment_webhook_events`; se reviven desde el panel |
| 429 al pagar | Cupo `payments` agotado para esa IP y ruta |

## Pendiente

- **Crear la app de Mercado Pago de producción** (marketplace), registrar el
  Redirect URI y el webhook de pagos con su secreto, y completar `MP_CLIENT_ID`,
  `MP_CLIENT_SECRET` y `MP_WEBHOOK_SECRET` en `.env.prod`. Después: una compra
  real chica aprobada y devuelta, y probar que el webhook llega cerrando el
  navegador antes de volver a la tienda. Ojo: hasta el 16-oct-2026 el código
  creaba la preference en `/v1/checkout/preferences`, una ruta que la API no
  tiene (la oficial es `POST /checkout/preferences`, sin `/v1`); ese día se
  corrigió. Nunca se había probado contra Mercado Pago de verdad: esa compra
  chica es la primera.
- **Probar el desafío del banco (3DS) en sandbox** con las dos tarjetas de
  arriba, en modo `API`: que el desafío aparezca dentro de la tienda (CSP
  incluida), que el aprobado termine en "¡Pago aprobado!" y el no autorizado
  en "No se pudo completar el pago". Está probado solo contra la API falsa.

Docs oficiales: [Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing),
[Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/landing),
3DS con [Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/how-tos/integrate-3ds)
y con [Checkout API](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/how-tos/integrate-3ds),
[OAuth](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/introduction),
[Webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks),
[referencia de la API](https://www.mercadopago.com.ar/developers/es/reference) (pagos, preferences, reembolsos).
