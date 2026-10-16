---
name: mercadopago-refunds
description: Reembolsos totales y parciales de Mercado Pago (POST /v1/payments/{id}/refunds, clave de idempotencia por parcial) y contracargos. Usala al tocar OrderRefundService, RefundAsync o el estado ChargedBack.
---

# Mercado Pago: reembolsos y contracargos

En Tiendafy: `POST /api/v1/orders/{id}/refund` →
`backend/src/Api/Orders/OrderRefundService.cs` → `MercadoPagoCheckoutClient.RefundAsync`.
Auditoría en `payment_refunds`.

## API

```http
POST https://api.mercadopago.com/v1/payments/{payment_id}/refunds
Authorization: Bearer {access_token de la tienda}
X-Idempotency-Key: refund-{orderId:N}-{ya devuelto en centavos}-{este monto en centavos}

{}                       // total: devuelve todo lo que queda
{ "amount": 1500.50 }    // parcial
```

Respuesta: `id`, `payment_id`, `amount`, `status` (`approved`, `in_process`,
`rejected`, `cancelled`). `GET /v1/payments/{id}/refunds` lista los hechos.

Después del reembolso, el pago queda `approved` con
`transaction_amount_refunded` > 0 (parcial) o `refunded` (total).

## Reglas duras

- **La clave de idempotencia tiene que cambiar entre parciales.** Con una
  clave fija por pago, Mercado Pago deduplica el segundo parcial y no lo hace.
  La de Tiendafy es determinística: un doble click o un reintento con el mismo
  monto da la misma clave (no devuelve dos veces); un parcial nuevo da otra,
  porque lo ya devuelto cambió.
- El primer total va sin monto; con parciales previos, siempre con monto
  explícito.
- Lock por orden y validación contra `RemainingRefundable`; Mercado Pago
  primero, estado local después (con `xmin`: si otra instancia ya aplicó, 409).
- Solo pagos `approved` (o parcialmente devueltos). Plazo: hasta 180 días desde
  el pago.
- `PaymentId` que empieza con `manual-` (efectivo, transferencia, cuenta
  corriente): no se llama a Mercado Pago, solo se registra. Si el pago fue de
  Payway, va a Payway.
- Al completar el total corren los avisos y la nota de crédito automática
  (ARCA); el reingreso de stock es opcional.
- Reembolsos hechos desde el panel de Mercado Pago: `SettlePaymentHandler` los
  aplica si consulta el pago y ve `transaction_amount_refunded` mayor al
  registrado. Pero el aviso que los dispara es un `payment.updated` del mismo
  pago, y el inbox hoy lo descarta por duplicado (ver `mercadopago-webhooks`).
- En marketplace, Mercado Pago devuelve también la parte proporcional de la
  comisión de la plataforma (`marketplace_fee`/`application_fee`).

## Contracargos

El comprador desconoce el pago con su banco. El pago pasa a `charged_back`
(o `in_mediation` durante un reclamo) y Tiendafy marca la orden `ChargedBack`.
El detalle (pagos involucrados, plazo para presentar documentación) está en
`GET /v1/chargebacks/{id}` y llega por el topic `topic_chargebacks_wh`. La
defensa (factura, comprobante de entrega) se presenta desde el panel de
Mercado Pago antes del plazo.

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| El segundo parcial "no hizo nada" | Clave de idempotencia repetida | Clave que incluya lo ya devuelto |
| Error de monto | Supera lo que queda por devolver | Validar contra `transaction_amount_refunded` |
| Error de estado | El pago no está `approved` | No hay nada que devolver: cancelar |
| `in_process` | Medio lento | Esperar; se refleja en el pago |

Docs: <https://www.mercadopago.com.ar/developers/es/reference> (Reembolsos,
Contracargos).
