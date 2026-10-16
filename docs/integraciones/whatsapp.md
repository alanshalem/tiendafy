# WhatsApp (Cloud API de Meta)

Avisos automáticos por WhatsApp con la [Cloud API oficial de Meta](https://developers.facebook.com/docs/whatsapp/cloud-api). Es opcional y **por tienda**: cada merchant conecta su propio número de WhatsApp Business y sus plantillas aprobadas; la plataforma no tiene credenciales de WhatsApp.

No confundir con el botón flotante y los links `wa.me` de la tienda (`storefront/src/components/store/WhatsAppFab.tsx`, `StoreWhatsApp.tsx`): esos solo abren un chat con el número de la tienda y no usan ninguna API.

## Qué hace en Tiendafy

- Manda mensajes de **plantilla** (las únicas que Meta deja mandar fuera de la ventana de 24 horas) en eventos de la venta: pago acreditado, despacho, listo para retirar, reembolso y carrito abandonado.
- Cada tipo de mensaje arranca **apagado**: no sale nada hasta que el merchant lo prende y carga el nombre de su plantilla aprobada en Meta.
- Es best-effort: un error de WhatsApp nunca rompe el pago, el despacho ni el email, que sale igual.
- Cuenta cada envío (`NotificationEvent`) para el panel de costos.

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

Catálogo (`WhatsAppTemplateCatalog`): variables en orden, como `{{1}}`, `{{2}}`, ... de la plantilla en Meta.

| Tipo | Nombre sugerido en Meta | Variables | Se dispara en |
|---|---|---|---|
| `confirmacion-pago` | `confirmacion_pago` | nombre, orden, total | Orden pagada |
| `confirmacion-envio` | `pedido_en_camino` | nombre, orden, seguimiento ("a coordinar" si no hay) | Despacho |
| `lista-para-retirar` | `listo_para_retirar` | nombre, orden | Pedido de retiro listo |
| `cancelacion-compra` | `pedido_reembolsado` | nombre, orden, total | Reembolso total. No en la cancelación de una venta sin cobrar ni en un reembolso parcial: el texto sugerido dice que se devolvió la plata (esos dos avisan solo por email) |
| `carritos-abandonados` | `carrito_abandonado` | nombre, tienda | `AbandonedCartWorker`, solo si el checkout llegó a cargar teléfono |
| `confirmacion-compra` | `confirmacion_compra` | nombre, orden, total | Nunca (ver "Pendiente") |

`WhatsAppNotifier` para cada evento:

1. Normaliza el teléfono del comprador a E.164 argentino sin `+` (`NormalizeArPhone`: agrega el `549`, saca el `0` y el `15`). Si no es usable, no manda.
2. Busca la conexión de la tienda y el override de ese tipo. Sin conexión, sin override, apagado o sin nombre de plantilla: no manda.
3. Llama `POST https://graph.facebook.com/{versión}/{phoneNumberId}/messages` con `type: template` y los parámetros del body. La versión es `MetaGraph.Version` (`backend/src/Api/MetaAds/MetaGraph.cs`, hoy `v26.0`), la misma de redes y Meta Ads.
4. Reintenta dos veces (1 s y 3 s) ante 429, 5xx o error de red. Un 4xx es definitivo.

Los logs enmascaran el teléfono del comprador (`LogValue.MaskPhone`: `***6789`), también dentro del cuerpo de error de Meta.

## Lo que aprendimos de la API real

- **Fuera de la ventana de 24 horas solo se pueden mandar plantillas aprobadas**. Por eso el contenido vive en Meta y Tiendafy solo guarda el nombre. Ver [Templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates).
- **En modo de prueba** la app solo entrega a números registrados como testers: el `POST /test` lo avisa en el mensaje de error.
- **Carrito abandonado es marketing para Meta**: tiene otra tarifa y otras reglas de consentimiento. El panel lo advierte.
- **Los celulares argentinos llevan `549`** en la Cloud API; con `54` solo, el mensaje no llega a celulares.

## Cómo probar

- Conectá una cuenta de prueba de Meta, cargá tu número como tester y usá "Enviar prueba" en `/configuracion/whatsapp-automatico` (manda `hello_world`).
- Prendé `confirmacion-pago` con una plantilla aprobada y marcá como pagada una orden con tu teléfono.
- Tests: `backend/tests/UnitTests/Notifications/WhatsAppPhoneTests.cs` (normalización de teléfonos) y `backend/tests/IntegrationTests/WhatsAppAndAdsFlowTests.cs` (conectar, probar y avisos de venta contra la Graph API simulada).

## Pendiente

- Probarlo de punta a punta con un número de WhatsApp Business y plantillas aprobadas reales (los tests corren contra una Graph API simulada).
- `confirmacion-compra` está en el catálogo pero nada la dispara (el email equivalente se sacó del catálogo de emails en oct-2026, por lo mismo).
- La versión de la Graph API (`MetaGraph.Version`, hoy `v26.0`) hay que subirla antes de que Meta la apague (unos dos años; v20.0, la que había acá, murió el 24-sep-2026 y con ella los avisos). Revisala contra el [changelog](https://developers.facebook.com/docs/graph-api/changelog).
- No hay webhook de estados (entregado, leído, fallido) ni mensajes entrantes: solo se sabe si Meta aceptó el envío.
