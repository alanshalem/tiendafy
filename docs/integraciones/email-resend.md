# Email (Resend)

Todos los emails de Tiendafy salen por [Resend](https://resend.com/docs) con su API HTTP: los transaccionales de cada tienda (pagos, envíos, reembolsos, factura con el PDF, cuenta), los avisos automáticos (stock, favoritos, reseñas, carritos, stock bajo al equipo) y las campañas de email marketing. Los de la plataforma (verificación y reset del admin, invitaciones al panel) usan el mismo transporte sin el layout de la tienda.

WhatsApp tiene su propia integración (Cloud API de Meta, credenciales por tienda): ver [whatsapp.md](whatsapp.md).

## Qué hace en Tiendafy

- **Envío**: una sola cuenta de Resend para toda la plataforma. El remitente visible es el nombre de la tienda ("Mi Tienda" <no-responder@dominio>) y la dirección es la de `Email:From`, que tiene que ser de un dominio verificado en Resend.
- **Layout brandeado**: todo email de una tienda va envuelto en un layout de 600 px con el logo y el color primario del tema publicado, y un footer con el nombre de la tienda.
- **Plantillas editables**: 13 plantillas con asunto y cuerpo editables por tienda (Configuración > Emails automáticos). Cada una se prende o se apaga, salvo las dos de seguridad de la cuenta (activación y cambio de contraseña), que salen siempre: de esas la tienda solo cambia el texto.
- **Supresión**: bajas voluntarias, rebotes y quejas van a una lista por tienda (`email_suppressions`) que excluye esas direcciones de campañas y avisos de marketing (stock, favoritos, reseñas, carritos abandonados).
- **Campañas**: audiencias segmentadas, envío inmediato o programado, cards de productos, cupón con atribución de ventas y ganancia, tracking de aperturas y clicks, link de baja obligatorio.
- **Costos**: cada envío de una tienda suma un `NotificationEvent`; el panel muestra uso del mes y costo estimado.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Transporte crudo (Resend, reintentos, Idempotency-Key, adjuntos, modo dev) | `backend/src/Api/Notifications/EmailSender.cs` (`EmailOptions`, `IEmailSender`, `EmailSender`, `EmailAttachment`) |
| Layout brandeado + contador de uso | `backend/src/Api/Notifications/BrandedEmailSender.cs` (`BrandedEmailSender`, `EmailLayout`) |
| Catálogo de plantillas (defaults) | `backend/src/Modules/Notifications/Notifications.Infrastructure/EmailTemplateCatalog.cs` |
| Render: override del tenant o default + variables `{{var}}` | `backend/src/Modules/Notifications/Notifications.Infrastructure/EmailTemplates.cs` |
| Emails de pedido | `backend/src/Api/Notifications/OrderNotifier.cs`, `OrderEmail.cs` |
| Emails de la cuenta del comprador (verificar, cambiar contraseña) | `backend/src/Api/Notifications/ShopperAccountEmails.cs`, llamado desde `Api/Endpoints/ShopAuthEndpoints.cs` |
| Carritos abandonados | `backend/src/Api/Notifications/AbandonedCartWorker.cs` |
| Factura con el PDF adjunto | `backend/src/Api/Fiscal/InvoiceEmail.cs` |
| Webhook de Resend (firma svix, tag del tenant) | `backend/src/Api/Notifications/ResendWebhook.cs` |
| Endpoints de campañas, baja, tracking y webhook | `backend/src/Api/Endpoints/CampaignEndpoints.cs` |
| Endpoints de plantillas y uso | `backend/src/Api/Endpoints/EmailTemplateEndpoints.cs` |
| Worker de campañas | `backend/src/Api/Notifications/CampaignWorker.cs` |
| Audiencias y filtros | `backend/src/Api/Notifications/CampaignAudience.cs` |
| Cuerpo de la campaña (links trackeados, pixel, cards, footer de baja) | `backend/src/Api/Notifications/CampaignEmailComposer.cs` (`TrackToken`) |
| Token de baja | `backend/src/Api/Notifications/UnsubscribeToken.cs` |
| Links públicos (URL de la tienda, base de la API) | `backend/src/Api/Notifications/StoreLinks.cs` |
| Entidades (campaña, destinatario, supresión) | `backend/src/Modules/Notifications/Notifications.Infrastructure/EmailCampaign.cs` |
| Registro en DI | `backend/src/Api/Startup/ServiceRegistration.cs` (`AddHttpClient<IEmailSender, EmailSender>`, `BrandedEmailSender`, workers) |
| Admin | `admin/src/pages/Settings/AutoEmails.tsx` (`/configuracion/emails-automaticos`), `admin/src/pages/Marketing.tsx` (`/marketing`) |

Reglas del código:

- `IEmailSender` es el transporte crudo; **todo email de una tienda pasa por `BrandedEmailSender`**, que agrega el layout, el tag `tenant` y el contador de uso. Solo los emails de la plataforma (`AuthEndpoints`, `MembersEndpoints`) usan `IEmailSender` directo.
- `EmailSender` **no tira excepciones** ante errores de Resend: un 4xx definitivo o los reintentos agotados se loguean y el método devuelve `false` (`true` si Resend lo aceptó o, en modo dev, si quedó en el log). `BrandedEmailSender` devuelve lo mismo. Los transaccionales ignoran el resultado: un email nunca rompe el flujo que lo dispara. Las campañas lo usan para contar fallidos.
- Las direcciones de relleno de las ventas sin email (`...@sin-email.local`) nunca reciben nada: `BrandedEmailSender` las descarta (devuelve `false`).
- El destinatario en los logs va siempre enmascarado (`LogValue.MaskEmail`).
- Los purposes de los tokens firmados (`Tiendafy.Marketing.Unsubscribe.v1`, `Tiendafy.Marketing.Track.v1`) no se tocan nunca: cambiarlos invalida todos los links de baja y de tracking que ya están en bandejas de entrada. El de baja no vence a propósito.

## Configuración

| Clave (.NET) | Variable del stack (`infra/docker/docker-compose.stack.yml`) | Para qué | Si falta |
|---|---|---|---|
| `Email:ResendApiKey` | `RESEND_API_KEY` | API key de Resend | Modo dev: el email se escribe en el log (`[email:dev]`) y no sale |
| `Email:From` | `EMAIL_FROM` | Dirección remitente, de un dominio verificado en Resend | Default `Tiendafy <onboarding@resend.dev>` (solo sirve para probar) |
| `Email:MaxRetries` | (no está en el compose) | Reintentos ante 429/5xx/red, backoff 1 s, 3 s, 8 s | Default 2 |
| `Email:WebhookSecret` | `EMAIL_WEBHOOK_SECRET` | Signing secret (`whsec_...`) del webhook de Resend | `POST /api/v1/webhooks/resend` devuelve 404 |
| `PublicApiBaseUrl` | la arma el compose: `https://api.${STACK_DOMAIN}` | Base de los links de baja, pixel y clicks de campañas | `http://localhost:5080`: los links salen rotos en prod |
| `Notifications:EmailCostUsdPer1000` | (no está en el compose) | Tarifa para el costo estimado del panel | Default 0.40 |

Ojo: `PublicApiBaseUrl` va en la raíz, no adentro de `MercadoPago` (existe también `MercadoPago:PublicApiBaseUrl`, que es otra cosa). Va sin `/api` al final: el código le agrega `/api/v1/marketing/...`.

En `.env.staging.example` `RESEND_API_KEY` queda vacía a propósito: staging no le manda mails a nadie.

Del lado de Resend (detalle en [configuracion.md](../configuracion.md) y en la guía de publicación [publicar-en-la-vps.md](../publicar-en-la-vps.md) §1.6):

1. Dominio verificado (SPF y DKIM). Ver [Domains](https://resend.com/docs/dashboard/domains/introduction).
2. API key con permiso de envío.
3. Webhook a `https://api.TUDOMINIO/api/v1/webhooks/resend` con los eventos `email.bounced` y `email.complained`. El signing secret va en `EMAIL_WEBHOOK_SECRET`.

## Flujos

### Emails automáticos y plantillas

`EmailTemplates.RenderAsync` busca el override de la tienda en `email_templates`; si no hay, usa el default del catálogo. Asunto o cuerpo vacíos en el override caen al default. Si la plantilla está apagada, no se envía. Las `AlwaysOn` (activación y cambio de contraseña) cuentan siempre como prendidas, aunque haya una fila guardada apagada; el panel no les muestra el interruptor y el `PUT` las guarda prendidas.

Las variables llegan HTML-encodeadas (van al cuerpo); el asunto se decodifica después de sustituir, porque es texto plano ("Café", no "Caf&#233;").

Variables: `{{store}}`, `{{name}}`, `{{order_id}}` (sin `#`), `{{total}}`, `{{items}}` (tabla con fotos en los pedidos, lista de productos en el carrito abandonado), `{{tracking_link}}` (link firmado a `/seguimiento`), `{{link}}`, `{{product}}`, `{{price}}`, `{{payment_instructions}}`, `{{refund_amount}}` (lo devuelto en ese reembolso) y `{{refund_method}}` (por dónde vuelve la plata, en una frase: `RefundMediums.BuyerText`) según la plantilla.

| Plantilla | Default | Quién la dispara |
|---|---|---|
| `instrucciones-pago` | prendida | `Api/Orders/OfflinePayments.cs` (transferencia o efectivo) |
| `confirmacion-pago` | prendida | `Api/Orders/PaidOrderSideEffects.cs` |
| `confirmacion-envio` / `lista-para-retirar` | prendidas | `Api/Orders/OrderFulfillment.cs` (según sea envío o retiro) |
| `pedir-resena` | prendida | `ReviewRequestWorker` (días después del despacho) |
| `aviso-stock` | prendida | `BackInStockWorker` (los pedidos de "Avisame cuando ingrese") |
| `cancelacion-compra` | apagada | `RefundedOrderSideEffects` (reembolso total), `OrderRefundService.CancelAsync` (cancelación a mano) y `OfflinePayments` (venció el plazo de una transferencia o efectivo). Apagada, el reembolso total avisa igual con un texto genérico (`OrderEmail.Refund`) y la cancelación a mano con el texto de fábrica de la plantilla; la que vence sola, no |
| `reembolso-parcial` | apagada | `RefundedOrderSideEffects.NotifyPartialAsync`, desde `OrderRefundService` (panel) y `PaymentWebhookWorker` (parcial hecho en Mercado Pago). Apagada, sale igual con el texto de fábrica. Uno por reembolso: el webhook solo avisa cuando creció lo devuelto |
| `favorito-baja-precio` / `favorito-repuesto` | apagadas | `FavoriteAlertWorker` |
| `carritos-abandonados` | prendida | `AbandonedCartWorker` (1 h después de un checkout con email que no terminó en una venta pagada; una sola vez) |
| `activacion-cuenta` | siempre (no se apaga) | `ShopAuthEndpoints` `/shop/auth/register` |
| `cambio-contrasena` | siempre (no se apaga) | `ShopAuthEndpoints` `/shop/auth/forgot` |
| `factura` | apagada | `Api/Fiscal/InvoiceEmail.cs`, cuando la venta obtiene el CAE (desde `FiscalEmissionWorker` o el botón "Facturar"), con el PDF adjunto. Sale una sola vez por comprobante (se reclama con `BuyerNotifiedAtUtc`), nunca para notas de crédito, ventas de Mercado Libre ni ventas sin email |

El aviso de **stock bajo** al equipo de la tienda (`Api/Purchasing/StockAlertService.cs`) también pasa por `BrandedEmailSender` (tag de uso `stock-bajo`), pero no es una plantilla editable: no figura en el catálogo.

Los avisos de marketing (stock, favoritos, reseñas, carritos abandonados) respetan la lista de supresión. Los transaccionales (pago, envío, reembolso) y los de la cuenta (activación, cambio de contraseña) salen siempre.

Cancelar una venta a mano o devolver plata siempre le avisa al comprador, aunque la plantilla esté apagada: la cancelación y el parcial pasan por `OrderNotifier.NotifyWithDefaultAsync` (la de la tienda si la prendió; si no, el texto de fábrica del catálogo) y el reembolso total cae en `OrderEmail.Refund`. Prenderla sirve para mandar el texto propio. `reembolso-parcial` es una plantilla aparte (y no variables en `cancelacion-compra`) porque dice otra cosa: la compra sigue en pie.

En las dos de la cuenta, `{{link}}` es el link con el token. Si la tienda lo borró del cuerpo, `ShopperAccountEmails` agrega al final el botón y el link en texto: sin el link el email no sirve.

Se sacaron del catálogo (oct-2026) `confirmacion-compra` y `bienvenida`: no tenían un evento propio (la compra ya avisa con `instrucciones-pago` o `confirmacion-pago`; el registro, con `activacion-cuenta`) y conectarlas habría mandado un segundo email por la misma cosa, a tiendas que nunca lo mandaron. Las filas que alguna tienda guardó con esas claves quedan en `email_templates` sin uso: el panel lista el catálogo, no la tabla, y un `PUT` a esas claves da 404.

`carritos-abandonados` viene prendida de fábrica porque el worker la mandaba siempre (con un texto fijo e ignorando el interruptor). La migración `EnableAbandonedCartTemplate` prendió las filas guardadas apagadas: esas tiendas también la estaban mandando. Desde ahí, apagarla la apaga de verdad.

### Webhook de Resend: rebotes y quejas

1. Cada envío de una tienda lleva el tag `tenant=<TenantId>` (`BrandedEmailSender` → `EmailSender`).
2. Resend pega en `POST /api/v1/webhooks/resend` con headers `svix-id`, `svix-timestamp` y `svix-signature`.
3. `ResendWebhook.VerifySvix` valida el HMAC-SHA256 de `{id}.{timestamp}.{payload}` con el secret (sin el prefijo `whsec_`). Firma inválida: 401. Después, `IsFreshTimestamp` exige que `svix-timestamp` esté a menos de 5 minutos de la hora del servidor (la tolerancia estándar de svix), para atrás o para adelante: si no, 400. Sin eso, un aviso capturado se podía reenviar tal cual cuando fuera.
4. Solo procesa `email.bounced` (motivo `bounce`) y `email.complained` (motivo `complaint`); el resto responde 200 y se ignora.
5. Saca el tenant del tag y agrega cada destinatario a `email_suppressions` de esa tienda. Sin tag (emails viejos) no se puede atribuir y se ignora. Payload malformado: 200 igual, para que Resend no reintente.

### Campañas

1. El merchant arma la campaña en `/marketing`: asunto, cuerpo, productos (cards), cupón opcional y audiencia.
2. Audiencias (`AudienceSpec`): `buyers` (compradores, default), `customers` (compradores + contactos + suscriptores del newsletter), `subscribers` (newsletter) y `custom` (lista a mano). Filtros: gasto mínimo, cantidad de compras, compró en los últimos N días, inactivo hace N días, compró ciertos productos, tiene ciertos productos en favoritos. Siempre se excluyen las direcciones suprimidas.
3. `POST /api/v1/admin/campaigns/{id}/send` sin fecha snapshotea la audiencia en `campaign_recipients` y pasa a `sending`. Con `scheduleAtUtc` queda `scheduled` y el worker resuelve la audiencia recién al momento de enviar.
4. `CampaignWorker` (polling cada 20 s, solo con `Workers:Enabled`) manda lotes de 25 con 600 ms entre emails, por el rate limit de Resend. Es resumible: el estado vive en cada fila de `campaign_recipients`. Si Resend rechaza un email (o se agotan los reintentos), el destinatario queda `failed` y suma a `FailedCount`; el detalle de la campaña muestra hasta 20 direcciones fallidas.
5. Cada email lleva: los `href` http(s) reescritos a `/api/v1/marketing/c?t=...&u=...`, un pixel `/api/v1/marketing/o.gif?t=...` y un footer con `/api/v1/marketing/unsubscribe?token=...`. Las cards de productos apuntan a la tienda en https (`StoreLinks.CampaignStoreBaseAsync`); solo en desarrollo, con la plataforma en `localhost` o `*.localhost`, van en http.
6. La baja es un GET que muestra una página de confirmación y un POST que agrega la supresión (motivo `unsubscribe`, con la campaña). Los transaccionales siguen llegando.
7. Atribución (detalle de la campaña): órdenes pagadas desde el envío que usaron el cupón de la campaña. Muestra ventas y, para las órdenes con costo snapshot, ganancia (total − envío − costo − comisión de MP).
8. `POST /{id}/test` manda una prueba con el prefijo `[PRUEBA]`, sin tracking.

Estados de la campaña: `draft`, `scheduled`, `sending`, `sent`, `cancelled`.

## Lo que aprendimos de la API real

- **Idempotency-Key**: se genera una por envío y se repite en todos los reintentos. Si el primer intento llegó y se perdió la respuesta, Resend no duplica el email. Ver [Send Email](https://resend.com/docs/api-reference/emails/send-email).
- **Solo se reintenta 429 y 5xx** (y errores de red). Un 4xx (from sin verificar, dominio inválido) es definitivo.
- **El display name no puede tener comillas dobles**: rompen el header From (RFC 5322). `BuildFrom` las saca.
- **Los tags vuelven en el webhook**, a veces como objeto y a veces como array según la versión del payload. `ExtractTenantTag` acepta las dos formas.
- **El webhook se firma con svix**: el secret viene como `whsec_<base64>` y el header puede traer varias firmas `v1,...` separadas por espacio (rotación). Alcanza con que una coincida. Ver [Webhooks](https://resend.com/docs/dashboard/webhooks/introduction).
- **`onboarding@resend.dev`** solo entrega a la dirección dueña de la cuenta de Resend: sirve para el primer smoke test, no para tiendas.

## Cómo probar

- **Local sin clave**: dejá `Email:ResendApiKey` vacío y mirá el log de la API (`[email:dev] → ...`). Alcanza para ver qué email se dispara y con qué asunto.
- **Preview**: en `/configuracion/emails-automaticos` el editor muestra la plantilla con el layout real (`POST /api/v1/email-templates/preview`). En `/marketing`, la campaña tiene preview y "Enviar prueba".
- **Envío real**: cargá una API key de prueba y `Email:From` de un dominio verificado, y mandá una campaña de prueba a tu casilla.
- **Webhook**: desde el panel de Resend podés reenviar un evento a tu endpoint (sale con un timestamp nuevo, así que pasa la ventana de 5 minutos). Sin `Email:WebhookSecret` el endpoint da 404 (es lo esperado).
- **Tests**: `backend/tests/UnitTests/Notifications/EmailSenderTests.cs` (reintentos, idempotencia, from, resultado del envío), `CampaignV2Tests.cs` (firma svix y ventana del timestamp, audiencias), `StoreLinksTests.cs` (https salvo localhost), `EmailCampaignTests.cs`, y en integración: `CampaignFlowTests.cs` (armar, enviar, abrir, clickear, darse de baja, rebotar, replay del webhook y un rechazo de Resend que cuenta como fallido), `ShopAuthEmailTemplateTests.cs` (plantillas de la cuenta), `AbandonedCartEmailTests.cs` (plantilla, apagada y supresión), `EmailTemplateTests.cs`, `FiscalWorkerTests.cs` (el email `factura` con el PDF, una sola vez) y los avisos de cancelación y reembolso en `ManualOrderTests.cs` y `MercadoPagoFlowTests.cs`. En integración Resend está simulado (`ApiFactory.AcceptAllEmails`; un test que quiera un rechazo pisa la ruta con `ExternalHttp.On` y la restaura).

## Pendiente

- Confirmar en el panel de Resend de producción que el webhook esté creado y que `EMAIL_WEBHOOK_SECRET` esté cargado en el `.env` del stack: sin eso, los rebotes no se suprimen.
- No hay alta manual de supresiones desde el panel (el motivo `manual` existe en la entidad pero nada lo usa).
