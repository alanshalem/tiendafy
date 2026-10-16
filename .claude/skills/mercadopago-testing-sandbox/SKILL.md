---
name: mercadopago-testing-sandbox
description: Probar Mercado Pago de punta a punta en Tiendafy (cuentas de prueba, app de prueba, túnel, tarjetas que fuerzan approved/rejected/pending). Usala antes de una prueba manual de pagos o al escribir tests contra la API falsa.
---

# Mercado Pago: pruebas

No hay un ambiente sandbox separado: se prueba en producción con **cuentas de
prueba** (vendedor y comprador) y sus credenciales, que también empiezan con
`APP_USR-` (el prefijo `TEST-` ya no se usa).

## Automático (sin Mercado Pago)

- `backend/tests/IntegrationTests/MercadoPagoFlowTests.cs` (API falsa).
- `UnitTests/Orders/SettlePaymentHandlerTests.cs`,
  `UnitTests/Payments/OAuthCallbackHandlerTests.cs`,
  `UnitTests/Api/OrderRefundLocksTests.cs`.

## A mano, de punta a punta

1. En "Tus integraciones" → **Cuentas de prueba**, creá un vendedor y un
   comprador del sitio `MLA` (Argentina).
2. Logueado como el vendedor de prueba, creá la app (modelo marketplace /
   OAuth) y cargá `MercadoPago:ClientId`, `ClientSecret` y `WebhookSecret` en
   user-secrets de `backend/src/Api`.
3. `cloudflared.exe` en la raíz del repo y `.\dev-up.ps1 -Tunnel`: inyecta
   `PublicApiBaseUrl` y `RedirectUri` con la URL del túnel.
4. Registrá en la app el Redirect URI que imprime el script y la URL del
   webhook (`…/api/v1/payments/webhooks/mercadopago`, evento Pagos). La URL del
   túnel rápido cambia en cada corrida.
5. Panel → Configuración → Medios de pago → conectá la cuenta del vendedor de
   prueba y elegí el modo.
6. Comprá en la tienda logueado (o con el email) del comprador de prueba.
7. Reembolsá desde Ventas y mirá `GET /orders/{id}/refunds`.
8. Probá también cerrar el navegador antes de volver a la tienda: la orden
   tiene que pagarse igual por webhook.

## Tarjetas de prueba (Argentina)

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Mastercard crédito | 5031 7557 3453 0604 | 123 | 11/30 |
| Visa crédito | 4509 9535 6623 3704 | 123 | 11/30 |
| American Express | 3711 803032 57522 | 1234 | 11/30 |
| Mastercard débito | 5287 3383 1025 3304 | 123 | 11/30 |
| Visa débito | 4002 7686 9439 5619 | 123 | 11/30 |

El resultado lo decide el **nombre del titular** (documento DNI 12345678):

| Titular | Resultado |
|---|---|
| `APRO` | Aprobado |
| `OTHE` | Rechazado por error general |
| `CONT` | Pendiente |
| `CALL` | Rechazado, llamar para autorizar |
| `FUND` | Rechazado por monto insuficiente |
| `SECU` | Rechazado por código de seguridad |
| `EXPI` | Rechazado por vencimiento |
| `FORM` | Rechazado por error en el formulario |

Los números cambian de vez en cuando: si una no anda, mirá la tabla vigente en
<https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>.

## Reglas duras

- Nunca tarjetas reales con credenciales de prueba, ni tarjetas de prueba con
  credenciales reales.
- Comprador y vendedor de prueba tienen que ser del mismo sitio (`MLA`).
- No se puede pagar con la misma cuenta que vende.
- Los secretos van por user-secrets o `.env.prod` (en el servidor), nunca al
  repo.
- Se puede simular un aviso desde "Tus integraciones" → Webhooks → Simular;
  para que la firma valide, el secreto tiene que ser el de esa app.

## Problemas típicos

| Síntoma | Causa |
|---|---|
| "No podés pagarte a vos mismo" | Comprador = vendedor |
| La tarjeta de prueba se rechaza siempre | Titular distinto de `APRO`, o cuenta de otro país |
| Webhook 401 | El secreto no es el de la app de prueba |
| No vuelve solo a la tienda | `back_urls` por http: usar el túnel |
