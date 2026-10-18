# Topics y payloads de webhooks de Mercado Pago

Todos los avisos traen solo el id del recurso: se consulta con el token de la
cuenta dueña (en Tiendafy, la tienda que corresponde al `user_id`).

## `payment` (el que usa Tiendafy)

```json
{
  "id": 12345,
  "live_mode": true,
  "type": "payment",
  "date_created": "2026-10-16T10:00:00Z",
  "user_id": 123456789,
  "api_version": "v1",
  "action": "payment.created",
  "data": { "id": "987654321" }
}
```

`action`: `payment.created` o `payment.updated`. Consulta:
`GET /v1/payments/{data.id}`.

`status`: `pending`, `approved`, `authorized`, `in_process`, `in_mediation`,
`rejected`, `cancelled`, `refunded`, `charged_back`.

Campos que lee Tiendafy: `status`, `status_detail`, `external_reference`,
`transaction_amount`, `transaction_amount_refunded` y
`transaction_details.net_received_amount` (neto acreditado → comisión).

## `orders` (Orders API)

`action`: `order.processed`, `order.action_required`, `order.failed`,
`order.canceled`, `order.refunded`, `order.charged_back`… Consulta:
`GET /v1/orders/{data.id}`. El id es alfanumérico (`ORD…`): para la firma va
tal como llega en la query (las SDK oficiales dejaron de pasarlo a minúsculas
en jun-2026).

## `topic_merchant_order_wh`

Merchant orders (agrupan los pagos de una preference). Consulta:
`GET /merchant_orders/{id}`. Tiendafy no lo necesita: `external_reference`
del pago alcanza.

## `topic_chargebacks_wh`

Contracargos. Consulta: `GET /v1/chargebacks/{id}` (trae los pagos
involucrados y el plazo para presentar documentación). Hoy Tiendafy se entera
del contracargo por el `status` del pago (`charged_back`).

## `topic_claims_integration_wh`

Reclamos (mediaciones) del comprador. Se gestionan desde el panel de Mercado
Pago o la API de claims.

## `mp-connect`

Una cuenta autorizó o revocó la app (OAuth). Útil para marcar una tienda como
desconectada sin esperar a que falle un cobro.

## Suscripciones

`subscription_preapproval`, `subscription_authorized_payment`,
`subscription_preapproval_plan`. Tiendafy no vende suscripciones.

## Otros de la lista de "Tus integraciones"

`stop_delivery_op_wh` (alertas de fraude), `topic_card_id_wh` (Card Updater),
`wallet_connect`, `point_integration_wh` (Point). Tiendafy no los usa.
