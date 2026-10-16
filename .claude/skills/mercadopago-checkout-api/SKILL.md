---
name: mercadopago-checkout-api
description: Cobro server-to-server con token de tarjeta en Mercado Pago (POST /v1/payments, 3DS, idempotencia, application_fee) y cuándo convendría Orders API. Usala al tocar CreateCardPaymentAsync o /checkout/{id}/pay-onsite.
---

# Mercado Pago: checkout integrado (Payments API)

La tarjeta se tokeniza en el navegador (Payment Brick, ver
`mercadopago-bricks`) con la `public_key` de la tienda; el backend cobra con
ese token y el `access_token` de la tienda. La tarjeta nunca pasa por nuestro
servidor.

En Tiendafy: `MercadoPagoCheckoutClient.CreateCardPaymentAsync` y
`POST /api/v1/checkout/{id}/pay-onsite`.

## Cobro

```http
POST https://api.mercadopago.com/v1/payments
Authorization: Bearer {access_token de la tienda}
X-Idempotency-Key: {id de la orden}

{
  "transaction_amount": 30000.00,
  "token": "{token del Brick}",
  "description": "Orden {id}",
  "installments": 3,
  "payment_method_id": "visa",
  "issuer_id": "310",
  "payer": { "email": "comprador@example.com",
             "identification": { "type": "DNI", "number": "12345678" } },
  "three_d_secure_mode": "optional",
  "capture": true,
  "binary_mode": false,
  "external_reference": "{id de la orden}",
  "notification_url": "https://api.example.com/api/v1/payments/webhooks/mercadopago",
  "application_fee": 600.00,
  "statement_descriptor": "MITIENDA"
}
```

Respuesta: `id`, `status`, `status_detail` (y `three_ds_info` si hay desafío,
ver abajo). Tiendafy aplica el resultado en el momento; el webhook queda de
respaldo y es el que trae la comisión (`transaction_details.net_received_amount`
no viene en la respuesta del cobro).

## Reglas duras

- El monto sale del servidor, no del Brick.
- `application_fee` es la comisión de la plataforma en `/v1/payments` (en la
  preference se llama `marketplace_fee`).
- El token de tarjeta es de **un solo uso** y vence rápido: ante un error, el
  Brick tiene que generar otro.
- `X-Idempotency-Key`: el mismo valor en un reintento no cobra dos veces.
  Tiendafy usa el id de la orden.
- `binary_mode: false` deja el pago en `pending`/`in_process` cuando hace
  falta (revisión, 3DS). Con `true` solo hay `approved` o `rejected`.

## 3DS

`binary_mode: false` **no alcanza** para pedir 3DS. Hay que mandar
`three_d_secure_mode` (la guía oficial documenta estos dos valores):

| Valor | Efecto |
|---|---|
| `not_supported` (default) | Sin 3DS |
| `optional` (recomendado, el que usa Tiendafy desde el 16-oct-2026) | Mercado Pago y el banco deciden por riesgo |

Con 3DS la guía pide además `capture: true` y `binary_mode: false` (el pago
queda `pending` mientras el comprador responde).

Si hay desafío: `status: pending`, `status_detail: pending_challenge` y
`three_ds_info { external_resource_url, creq }` (la URL es el ACS del banco,
p. ej. `https://acs-public.tp.mastercard.com/api/v1/browser_Challenges`).

- Tiendafy devuelve a la tienda `challenge { paymentId, externalResourceUrl,
  creq }` desde `/pay-onsite` (solo con URL https absoluta) y deja la orden
  pendiente. La tienda lo muestra con el Status Screen Brick
  (`mercadopago-bricks`).
- El desafío tiene que **empezar dentro de los 30 s** de creado el pago (si no,
  se rechaza); empezado, el comprador tiene unos 5 minutos.
- Al terminar, el iframe hace `postMessage({ status: 'COMPLETE' })`: solo dice
  que terminó, no cómo salió. El estado final se sabe por webhook o
  consultando el pago, y la actualización no es instantánea.
- Finales: `approved`/`accredited`; `rejected`/`cc_rejected_3ds_challenge`
  (desafío fallido); `pending`/`pending_challenge` (sin completar);
  `cancelled`/`expired` (24 h pendiente).
- Pruebas: solo en sandbox con credenciales de prueba (en producción no anda ni
  con usuarios de prueba). Mastercard `5483 9281 6457 4623` supera el desafío,
  `5361 9568 0611 7557` no lo autoriza; CVV 123, vence 11/30.

## Estados y `status_detail` frecuentes

| `status` | `status_detail` | Qué es |
|---|---|---|
| `approved` | `accredited` | Cobrado |
| `in_process` | `pending_contingency`, `pending_review_manual` | Esperar el webhook |
| `pending` | `pending_challenge`, `pending_waiting_payment` | 3DS o pago en efectivo |
| `rejected` | `cc_rejected_bad_filled_*`, `cc_rejected_insufficient_amount`, `cc_rejected_call_for_authorize`, `cc_rejected_high_risk`, `cc_rejected_other_reason` | Mostrar un mensaje según el detalle y dejar reintentar con otro medio |

## Orders API (no la usamos, todavía)

Mercado Pago recomienda `POST /v1/orders` para integraciones nuevas. Lo que
cambia si algún día se migra:

- `transactions.payments[]` con `amount` como **string**; `total_amount` =
  suma.
- `notification_url` sale del body: los avisos se configuran en "Tus
  integraciones", topic `orders` (correr `orders` y `payment` en paralelo
  durante la migración).
- 3DS: `config.online.transaction_security.validation` (`on_fraud_risk`,
  `always`, `never`).
- Estados: `processed`, `processing`, `action_required`, `failed`,
  `canceled` (**una L**; Payments dice `cancelled`), `refunded`,
  `charged_back`.
- Idempotencia obligatoria en todos los POST; la misma clave con otro body da
  409 `idempotency_key_already_used`.
- Reembolso: `POST /v1/orders/{id}/refund`.
- **Bloqueante para Tiendafy**: no hay equivalente documentado de
  `application_fee` (marketplace).

## Docs

- Payments: <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/overview>
- 3DS (Checkout API): <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/how-tos/integrate-3ds>
- 3DS (Checkout Bricks): <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/how-tos/integrate-3ds>
- Migrar a Orders: <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-orders/resources/migrate-payments-to-orders>
