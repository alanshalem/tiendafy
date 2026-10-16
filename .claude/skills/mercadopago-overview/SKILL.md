---
name: mercadopago-overview
description: Mapa de Mercado Pago en Tiendafy (OAuth por tienda, Checkout Pro o Payment Brick, webhooks, reembolsos) y qué API usar. Usala antes de tocar Modules/Payments o el checkout, o para elegir qué skill mercadopago-* cargar.
---

# Mercado Pago: mapa general

Fuente de verdad del proyecto: `docs/integraciones/mercadopago.md` (archivos,
configuración, flujos, lo aprendido de la API real y cómo probar). Esta skill
resume la API y apunta a las de detalle.

## Cómo lo usa Tiendafy

- **Una app de plataforma con OAuth; cada tienda conecta su cuenta** y se
  cobra con el `access_token` de la tienda (modelo marketplace).
- Dos modos por tienda: **Checkout Pro** (`PRO`, redirect) y **checkout
  integrado** (`API`, Payment Brick + `POST /v1/payments`).
- Webhooks firmados → inbox durable (`payment_webhook_events`) → worker que
  consulta `GET /v1/payments/{id}` y aplica el resultado.
- Reembolsos totales y parciales con clave de idempotencia determinística.

## Qué skill cargar

| Necesidad | Skill |
|---|---|
| Conectar cuentas, tokens, comisión de la plataforma | `mercadopago-oauth-marketplace` |
| Preference, `init_point`, vencer un link de pago | `mercadopago-checkout-pro` |
| Cobro con token de tarjeta, 3DS, Payments vs Orders | `mercadopago-checkout-api` |
| Payment Brick y Status Screen en la tienda | `mercadopago-bricks` |
| Firma, inbox, topics | `mercadopago-webhooks` |
| Devoluciones y contracargos | `mercadopago-refunds` |
| Cuentas y tarjetas de prueba | `mercadopago-testing-sandbox` |

## Rutas de la API (base `https://api.mercadopago.com`)

| Qué | Ruta |
|---|---|
| Crear / actualizar preference (Checkout Pro) | `POST /checkout/preferences`, `PUT /checkout/preferences/{id}` (**sin** `/v1`) |
| Cobrar / consultar un pago | `POST /v1/payments`, `GET /v1/payments/{id}` |
| Reembolsar | `POST /v1/payments/{id}/refunds`, `GET /v1/payments/{id}/refunds` |
| Orders API (no la usamos) | `POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/refund` |
| Merchant order | `GET /merchant_orders/{id}` |
| Contracargo | `GET /v1/chargebacks/{id}` |
| Medios de pago | `GET /v1/payment_methods` |
| OAuth: canje y refresh | `POST /oauth/token` |
| OAuth: autorización (navegador) | `https://auth.mercadopago.com.ar/authorization` |

No inventes rutas por analogía (agregar `/v1` a todo): confirmá en la
referencia oficial. Una preference creada en `/v1/checkout/preferences` falla.

## Payments API u Orders API

Mercado Pago empuja las integraciones nuevas a **Orders API**, pero Payments
no está deprecada: "dejó de sumar funcionalidades" y mantiene arreglos. Para
Tiendafy, **Orders no tiene todavía un equivalente documentado de
`application_fee`** (la guía oficial de migración lo marca como bloqueante
para marketplace/split). Por eso el checkout integrado sigue en
`/v1/payments`. Checkout Pro no usa ninguna de las dos para crear el cobro: usa
preferences.

## Reglas duras

- Nunca confiar en el redirect ni en el body del webhook: el estado sale de
  `GET /v1/payments/{id}` con el token de la tienda.
- `X-Idempotency-Key` en todo POST que cobra o devuelve.
- `external_reference` = id de la orden (reconciliación).
- Tokens de las tiendas cifrados (purposes `Tiendafy.Payments.MercadoPagoTokens.v1`
  y `Tiendafy.Payments.MercadoPagoOAuthState.v1`: **no cambiarlos nunca**).
- Credenciales de prueba y de producción tienen el mismo prefijo `APP_USR-`: no
  se distinguen por el prefijo.
- Argentina: sitio `MLA`, moneda `ARS`. Montos en la API como decimales; en
  Tiendafy, `Money` en centavos y se convierte en el borde.

## Documentación oficial

- Checkout Pro: <https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing>
- Checkout API (Payments): <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/landing>
- Checkout API (Orders) y migración: <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-orders/resources/migrate-payments-to-orders>
- Bricks: <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/landing>
- Webhooks: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks>
- Referencia de la API: <https://www.mercadopago.com.ar/developers/es/reference>
- Plugin oficial para Claude Code (Apache-2.0, MCP `https://mcp.mercadopago.com/mcp`):
  <https://github.com/mercadopago/mercadopago-claude-marketplace>
