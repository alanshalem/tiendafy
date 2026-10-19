---
name: mercadopago-webhooks
description: Webhooks de Mercado Pago (firma x-signature, inbox durable, reintentos, topics, resolver la tienda por user_id). Usala al tocar MercadoPagoWebhookValidator, PaymentWebhookEndpoints, PaymentWebhookWorker o SettlePaymentHandler.
---

# Mercado Pago: webhooks

Mercado Pago avisa con un `POST` a `notification_url` (o a la URL configurada
en "Tus integraciones"). El aviso solo trae el id: el estado se consulta.

En Tiendafy: `POST /api/v1/payments/webhooks/mercadopago` (público) valida la
firma, guarda `(type, data.id, user_id)` en `payment_webhook_events` y
contesta 200. El worker (`PaymentWebhookWorker`, cada 5 s) procesa los
`payment`: busca la tienda por `user_id`, consulta `GET /v1/payments/{id}` con
el token de la tienda y llama a `SettlePaymentHandler` (idempotente).

## Firma (`x-signature`)

```
x-signature: ts=1704908010,v1=618c8534…   (hex)
x-request-id: 7b5c8e02-…
URL: …/webhooks/mercadopago?data.id=123456789&type=payment
```

Manifest (template oficial, con el `;` final):

```
id:{data.id};request-id:{x-request-id};ts:{ts};
```

- `v1 = HMAC-SHA256(secret, manifest)` en hex; comparar en tiempo constante.
- La referencia hoy es el `WebhookSignatureValidator` de las SDK oficiales
  (Node, .NET, Java, Python, PHP, Ruby): la página de webhooks ya no muestra el
  template y remite a las SDK. Lo que hacen:
  - `data.id` **de la query**, tal como llega. Ya no se pasa a minúsculas: la
    SDK de Node lo hacía y lo sacó en jun-2026 ("MercadoPago signs the
    notification using the original casing"). Lo que digan guías viejas sobre
    minúsculas para ids alfanuméricos, no.
  - Si falta `data.id` o `x-request-id`, se saca ese tramo del manifest.
  - `ts` es en **segundos** (la SDK de Node lo corrigió en ago-2026). Ojo: el
    ejemplo de la guía de notificaciones de Checkout Pro muestra un `ts` de 13
    dígitos (milisegundos); el de la página de webhooks, de 10.
  - Las notificaciones de QR no vienen firmadas.
- El secreto es **de la aplicación** (uno solo para todas las tiendas
  conectadas), se ve en "Tus integraciones" → Webhooks y se rota con
  "Restablecer".
- Tiendafy (`MercadoPagoWebhookValidator`, sin la SDK) rechaza si `ts` difiere
  más de 5 minutos del reloj del servidor. Acepta `ts` en segundos y en
  milisegundos (desde 10^11 se lee en ms) y cualquier `ts` que no sean solo
  dígitos ASCII, o que no se pueda ubicar en el tiempo, es firma inválida
  (401), nunca un 500. Sin `MercadoPago:WebhookSecret`,
  **todo** webhook da 401. Toma `data.id` del body y usa la query como
  respaldo: para `payment` es el mismo valor; con Orders conviene la query.

## Entrega y reintentos

- Contestar **200 o 201 en menos de 22 s**. Si no, Mercado Pago reintenta cada
  15 minutos y, después del tercer intento, espacia los intentos. Un aviso ya
  contestado no se reenvía: por eso el inbox es durable y el procesamiento va
  aparte.
- Solo se guardan los avisos `type = payment`; los demás se contestan 200 y
  se descartan.
- Reintentos propios del worker: 30 s, 2, 10 y 45 min, 3, 6 y 12 h (8
  intentos) y después `dead`. El panel los ve en
  `GET /payments/mercadopago/webhooks/health` y los revive con
  `POST /payments/mercadopago/webhooks/{id}/retry`, acotado al `user_id` de la
  tienda.
- Dedup: una fila por pago (índice único `(type, data_id)`). Mercado Pago
  manda varios avisos del mismo pago cuando cambia de estado
  (`payment.created`, después `payment.updated` al aprobarse un `in_process`,
  al reembolsarse desde su panel, al entrar un contracargo). Ante la violación
  del índice, `PaymentWebhookEndpoints` vuelve a poner en cola la fila si ya
  estaba `done` o `dead`; si sigue `pending` no la toca (el worker todavía no
  consultó el pago). Hasta el 16-oct-2026 los avisos posteriores se
  descartaban. Queda una ventana chica: un aviso que llega mientras el worker
  está procesando la misma fila se pierde si el worker ya leyó el estado viejo.

## El inbox no tiene tienda

Los pagos se cobran con el token de cada tienda, así que el aviso dice de
quién es solo por el `user_id` (la cuenta de Mercado Pago de la tienda).
Una tienda solo puede ver o revivir eventos de su propio `user_id`.

## Qué hace Tiendafy con cada estado

| `status` | Efecto |
|---|---|
| `approved` | Pendiente → `Paid`, confirma reservas (sin reserva activa, descuenta directo; sin stock, queda "para revisar"), guarda la comisión. Si ya estaba pagada con ese pago y sin comisión, solo la guarda. Si `transaction_amount_refunded` creció, aplica la diferencia como reembolso |
| `rejected`, `cancelled` | Pendiente → `Failed`, libera reservas |
| `refunded` | → `Refunded` |
| `charged_back`, `in_mediation` | → `ChargedBack` |
| `pending`, `in_process` | Nada; espera el próximo aviso |

## Topics

`payment` (el que procesamos), `orders` (Orders API), `topic_merchant_order_wh`
(merchant orders), `topic_chargebacks_wh` (contracargos),
`topic_claims_integration_wh` (reclamos), `mp-connect` (una cuenta se vinculó
o desvinculó de la app), `stop_delivery_op_wh` (alertas de fraude) y los de
suscripciones. Detalle: `references/topics-payloads.md`.

El IPN viejo (`?topic=…&id=…`, sin firma) no se usa.

## Problemas típicos

| Síntoma | Causa |
|---|---|
| Todo da 401 | Falta `WebhookSecret`, es de otra app, o el reloj está corrido más de 5 min |
| Pago aprobado, orden pendiente | `PublicApiBaseUrl` vacía o no accesible desde internet |
| Eventos `dead` | `last_error` en `payment_webhook_events`; revivir desde el panel |
| Aviso de un `user_id` desconocido | Cuenta desconectada de la tienda o de otra app |

Docs: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks>,
validador oficial de referencia:
<https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts>
(en .NET, `MercadoPago.Webhook.WebhookSignatureValidator`, ver
<https://github.com/mercadopago/sdk-dotnet/blob/master/docs/webhooks.md>).
