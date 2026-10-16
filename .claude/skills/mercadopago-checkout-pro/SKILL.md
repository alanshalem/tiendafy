---
name: mercadopago-checkout-pro
description: Checkout Pro de Mercado Pago (POST /checkout/preferences, init_point, back_urls, marketplace_fee, vencer un link). Usala al tocar CreateCheckoutProPreferenceAsync, ExpirePreferenceAsync, /checkout/{id}/pay o los links de pago de ventas manuales.
---

# Mercado Pago: Checkout Pro

El backend crea una **preference** con el token de la tienda, la tienda
redirige al `init_point`, el comprador paga en Mercado Pago, vuelve por
`back_urls` y el resultado llega por webhook.

En Tiendafy: `MercadoPagoCheckoutClient.CreateCheckoutProPreferenceAsync`,
`POST /api/v1/checkout/{id}/pay` y el link de pago de `POST /orders/manual`.

## Crear la preference

```http
POST https://api.mercadopago.com/checkout/preferences
Authorization: Bearer {access_token de la tienda}
X-Idempotency-Key: {id de la orden}
Content-Type: application/json

{
  "items": [{ "title": "Remera", "quantity": 2, "unit_price": 15000.00, "currency_id": "ARS" }],
  "payer": { "email": "comprador@example.com" },
  "back_urls": {
    "success": "https://tienda.example.com/checkout/ok",
    "failure": "https://tienda.example.com/checkout/error",
    "pending": "https://tienda.example.com/checkout/pendiente"
  },
  "auto_return": "approved",
  "external_reference": "{id de la orden}",
  "notification_url": "https://api.example.com/api/v1/payments/webhooks/mercadopago",
  "marketplace_fee": 300.00,
  "statement_descriptor": "MITIENDA"
}
```

Respuesta: `id` y `init_point` (redirigir ahí). `sandbox_init_point` ya no se
usa: con usuarios de prueba también va `init_point`.

**La ruta es `/checkout/preferences`, sin `/v1`.** Lo mismo para actualizar:
`PUT /checkout/preferences/{id}`.

## Reglas duras

- El total sale del servidor (sesión de checkout, cupón recalculado), nunca del
  cliente. El envío viaja como un ítem más.
- **No hay descuento a nivel orden** en la preference: con cupón, Tiendafy
  colapsa los ítems en uno solo por el neto.
- `external_reference` = id de la orden; `X-Idempotency-Key` = id de la orden.
- `notification_url` solo si hay `PublicApiBaseUrl`; vacía = no hay webhooks y
  la orden queda pendiente aunque se pague.
- `marketplace_fee` (monto, no porcentaje) es la comisión de la plataforma
  **en la preference**; en `/v1/payments` el campo se llama `application_fee`.
- `statement_descriptor`: hasta 22 caracteres (Tiendafy lo corta).
- `auto_return` necesita `back_urls` en HTTPS: por http (desarrollo) el regreso
  automático falla en silencio y la orden se concilia igual por webhook.
- El `returnUrl` que manda el cliente se valida contra dominios propios
  (`SafeRedirect`).
- Nunca marcar pagada con los query params del regreso: esperar el webhook o
  consultar `GET /v1/payments/{id}`.

## Vencer un link (cancelar una venta pendiente)

Las preferences no se borran. Se vencen:

```http
PUT https://api.mercadopago.com/checkout/preferences/{id}
{ "expires": true, "expiration_date_to": "2026-10-16T12:00:00.000Z" }   // fecha ya pasada
```

Primero se vence el link, después se cancela la orden y se liberan reservas:
al revés, alguien podría pagar una orden cancelada.

## Estados que llegan después

`approved` (pagada), `pending` / `in_process` (efectivo, revisión: esperar),
`rejected`, `cancelled`, `refunded`, `charged_back`, `in_mediation`. Qué hace
Tiendafy con cada uno: `mercadopago-webhooks`.

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| Falla al crear la preference | Ruta con `/v1/checkout/preferences` | `/checkout/preferences` |
| No vuelve solo a la tienda | `back_urls` por http | HTTPS (túnel en local) |
| Pago aprobado y orden pendiente | Sin `notification_url` o API no accesible desde internet | `PublicApiBaseUrl` pública |
| `MercadoPago.NotConnected` | La tienda no completó el OAuth | Conectar en Configuración → Medios de pago |
| La comisión no aparece | `marketplace_fee` en 0 o mandada como `application_fee` | Campo correcto según la API |

Docs: <https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing>
y la referencia de preferences en <https://www.mercadopago.com.ar/developers/es/reference>.
