# WhatsApp (Cloud API de Meta)

Avisos automáticos por WhatsApp con la [Cloud API oficial de Meta](https://developers.facebook.com/docs/whatsapp/cloud-api). Es opcional y **por tienda**: cada merchant conecta su propio número de WhatsApp Business y sus plantillas aprobadas; la plataforma no tiene credenciales de WhatsApp.

No confundir con el botón flotante y los links `wa.me` de la tienda (`storefront/src/components/store/WhatsAppFab.tsx`, `StoreWhatsApp.tsx`): esos solo abren un chat con el número de la tienda y no usan ninguna API.

## Qué hace en Tiendafy

- Manda mensajes de **plantilla** (las únicas que Meta deja mandar fuera de la ventana de 24 horas) en eventos de la venta: pago acreditado (con el texto de "pago" o el de "compra recibida"), despacho, listo para retirar, reembolso total y carrito abandonado.
- Cada tipo de mensaje arranca **apagado**: no sale nada hasta que el merchant lo prende y carga el nombre de su plantilla aprobada en Meta.
- Es best-effort: un error de WhatsApp nunca rompe el pago, el despacho ni el email, que sale igual.
- Las ventas manuales (mostrador) no mandan WhatsApp al quedar pagadas: el comprador está enfrente (`PaidOrderSideEffects.RunAsync(whatsApp: false)`).
- Cuenta cada envío que Meta aceptó (`NotificationEvent`) para el panel de costos. Meta cobra el mensaje entregado; uno que rechaza (plantilla no aprobada, token vencido) no se cobra y no se cuenta. Sin webhook de estados, "aceptado" es lo más cerca de "entregado" que se puede contar.

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Cliente de la Graph API + normalización de teléfonos AR + cifrado del token | `backend/src/Api/Notifications/WhatsAppSender.cs` (`WhatsAppSender`, `WhatsAppTokenProtector`) |
| Decide si mandar y con qué parámetros | `backend/src/Api/Notifications/WhatsAppNotifier.cs` |
| Entidades y catálogo de mensajes | `backend/src/Modules/Notifications/Notifications.Infrastructure/WhatsApp.cs` (`WhatsAppConnection`, `WhatsAppTemplate`, `WhatsAppTemplateCatalog`) |
| Endpoints del admin | `backend/src/Api/Endpoints/WhatsAppEndpoints.cs` |
| Disparadores | `Api/Orders/PaidOrderSideEffects.cs`, `Api/Orders/OrderFulfillment.cs`, `Api/Orders/RefundedOrderSideEffects.cs`, `Api/Notifications/AbandonedCartWorker.cs` |
| Admin | `admin/src/pages/Settings/WhatsAppAuto.tsx` (`/configuracion/whatsapp-automatico`) |

Endpoints (todos bajo `/api/v1/whatsapp`, permiso `notifications.config`):

- `GET/PUT/DELETE /connection`: Phone Number ID, access token y número visible. El token se guarda cifrado con DataProtection (purpose `tiendafy.whatsapp.tokens`; no se cambia, o hay que reconectar todas las tiendas).
- `POST /test`: manda la plantilla `hello_world` (en `en_US`), que Meta trae pre-aprobada en toda cuenta nueva. Valida las credenciales de punta a punta.
- `GET /templates` y `PUT /templates/{type}`: catálogo más overrides del tenant (prendido, nombre de la plantilla en Meta, idioma; default `es_AR`).

## Configuración

Nada a nivel plataforma salvo la tarifa del panel de costos:

| Clave | Para qué | Default |
|---|---|---|
| `Notifications:WhatsAppCostUsdPerMessage` | Costo estimado por mensaje en el panel | 0.034 |

Lo que carga cada tienda (ver [configuracion.md](../configuracion.md)):

1. Una app en [developers.facebook.com](https://developers.facebook.com) con el producto WhatsApp.
2. El **Phone Number ID** del número (no es el teléfono, es un ID de la Cloud API).
3. Un **access token permanente** de un system user de Meta Business (el temporal de la consola vence en 24 horas).
4. Las plantillas creadas y aprobadas en el WhatsApp Manager. El panel sugiere nombre, variables y texto de ejemplo de cada una.

## Flujos

Catálogo (`WhatsAppTemplateCatalog`): variables en orden, como `{{1}}`, `{{2}}`, ... de la plantilla en Meta. "nombre" es el primer nombre del comprador (sin nombre, lo que va antes de la `@` de su email) y "orden" es el número de pedido de la tienda (`Order.Label`).

| Tipo | Nombre sugerido en Meta | Variables | Se dispara en |
|---|---|---|---|
| `confirmacion-pago` | `confirmacion_pago` | nombre, orden, total | Orden pagada (`PaidOrderSideEffects`, una vez por venta: solo el settle que la deja pagada corre los efectos) |
| `confirmacion-compra` | `confirmacion_compra` | nombre, orden, total | Orden pagada, en el mismo momento que `confirmacion-pago` (son dos textos para elegir; con las dos prendidas salen dos mensajes) |
| `confirmacion-envio` | `pedido_en_camino` | nombre, orden, seguimiento ("a coordinar" si no hay) | Despacho |
| `lista-para-retirar` | `listo_para_retirar` | nombre, orden | Pedido de retiro listo |
| `cancelacion-compra` | `pedido_reembolsado` | nombre, orden, total | Reembolso total. No en la cancelación de una venta sin cobrar ni en un reembolso parcial: el texto sugerido dice que se devolvió la plata (esos dos avisan solo por email) |
| `carritos-abandonados` | `carrito_abandonado` | nombre, tienda | `AbandonedCartWorker`, solo si el checkout llegó a cargar teléfono y hay consentimiento (ver abajo) |

`WhatsAppNotifier` para cada evento:

1. Normaliza el teléfono del comprador a E.164 argentino sin `+` (`NormalizeArPhone`: agrega el `549`, saca el `0` y el `15`). Si no es usable, no manda.
2. Busca la conexión de la tienda y el override de ese tipo. Sin conexión, sin override, apagado o sin nombre de plantilla: no manda.
3. Llama `POST https://graph.facebook.com/{versión}/{phoneNumberId}/messages` con `type: template` y los parámetros del body. La versión es `MetaGraph.Version` (`backend/src/Api/MetaAds/MetaGraph.cs`, hoy `v26.0`), la misma de redes y Meta Ads.
4. Reintenta dos veces (1 s y 3 s) ante 429, 5xx o error de red. Un 4xx es definitivo.

Los logs enmascaran el teléfono del comprador (`LogValue.MaskPhone`: `***6789`), también dentro del cuerpo de error de Meta.

## Lo que aprendimos de la API real

Revisado contra la documentación de Meta el 18-oct-2026: el envío (`POST /{phone-number-id}/messages` con `messaging_product: whatsapp`, `type: template`, `template.name`, `template.language.code` y un componente `body` con parámetros `type: text` en el orden de la plantilla) coincide con `WhatsAppSender`.

- **Fuera de la ventana de atención al cliente (24 horas) solo se pueden mandar plantillas aprobadas**. Por eso el contenido vive en Meta y Tiendafy solo guarda el nombre. Ver [Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) (la página vieja de `business-management-api/message-templates` ahora solo dice que se mudó).
- **En modo de prueba** la app solo entrega a números registrados como testers: el `POST /test` lo avisa en el mensaje de error.
- **Carrito abandonado es marketing para Meta**: tiene otra tarifa y Meta exige que la persona haya aceptado recibir mensajes del negocio ([política de WhatsApp Business](https://whatsappbusiness.com/policy/)). Sale solo con consentimiento: el comprador tildó, junto al teléfono, "Quiero que {tienda} me avise por WhatsApp si dejo la compra sin terminar" (`CheckoutSession.AcceptsWhatsApp`, viene sin tildar) y su email no está en la lista de supresión de la tienda (`email_suppressions`: se dio de baja, rebotó o marcó spam). La casilla aparece solo si la tienda tiene esta plantilla prendida (`whatsAppReminders` en `GET /checkout-settings`): no se pide permiso para algo que nunca va a llegar. Meta pide que el texto diga quién escribe y por qué canal. Antes salía a cualquiera que hubiera dejado teléfono para el envío. Si algún día hay campañas por WhatsApp, ese permiso no alcanza: hace falta uno propio, guardado por cliente con fecha y texto aceptado, y una forma de darse de baja por WhatsApp.
- **Los celulares argentinos llevan `549`** en la Cloud API; con `54` solo, el mensaje no llega a celulares.

## Cómo probar

- Conectá una cuenta de prueba de Meta, cargá tu número como tester y usá "Enviar prueba" en `/configuracion/whatsapp-automatico` (manda `hello_world`).
- Prendé `confirmacion-pago` con una plantilla aprobada y marcá como pagada una orden con tu teléfono.
- Tests: `backend/tests/UnitTests/Notifications/WhatsAppPhoneTests.cs` (normalización de teléfonos), `backend/tests/IntegrationTests/WhatsAppAndAdsFlowTests.cs` (conectar, probar y avisos de venta contra la Graph API simulada; el uso del mes cuenta solo lo aceptado), `MercadoPagoFlowTests.cs` (la confirmación de compra sale una vez, aunque después llegue el aviso de Mercado Pago del mismo pago) y `AbandonedCartEmailTests.cs` (el de carrito abandonado sale solo con la casilla tildada).

## Pendiente

- Probarlo de punta a punta con un número de WhatsApp Business y plantillas aprobadas reales (los tests corren contra una Graph API simulada).
- La versión de la Graph API (`MetaGraph.Version`, hoy `v26.0`) hay que subirla antes de que Meta la apague (unos dos años; v20.0, la que había acá, murió el 24-sep-2026 y con ella los avisos; al 18-oct-2026 v26.0 no tiene fecha de baja). Revisala contra el [changelog](https://developers.facebook.com/docs/graph-api/changelog/versions).
- No hay webhook de estados (entregado, leído, fallido) ni mensajes entrantes: solo se sabe si Meta aceptó el envío.
