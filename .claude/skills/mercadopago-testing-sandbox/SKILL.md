---
name: mercadopago-testing-sandbox
description: Probar Mercado Pago de punta a punta en Tiendafy (cuentas de prueba, app de prueba, túnel, tarjetas que fuerzan approved/rejected/pending y el desafío 3DS). Usala antes de una prueba manual de pagos o al escribir tests contra la API falsa.
---

# Mercado Pago: pruebas

No hay un host sandbox aparte: se usa la misma API con **credenciales de
prueba** (las de la app de prueba o las de un vendedor de prueba). Esas
credenciales también empiezan con `APP_USR-`, igual que las de producción: no
se distinguen por el prefijo.

## Automático (sin Mercado Pago)

- `backend/tests/IntegrationTests/MercadoPagoFlowTests.cs` (API falsa,
  incluido el pago con desafío del banco).
- `UnitTests/Orders/SettlePaymentHandlerTests.cs`,
  `UnitTests/Payments/OAuthCallbackHandlerTests.cs`,
  `UnitTests/Payments/MercadoPagoCardPaymentTests.cs` (body con 3DS y
  `three_ds_info`), `UnitTests/Api/OrderRefundLocksTests.cs`.
- Tienda: `storefront/src/__tests__/checkout.test.tsx`,
  `card-challenge.test.tsx` y `csp.test.ts`.

## Cuentas de prueba (lo que dice la guía)

- Tipos: **vendedor**, **comprador** e **integrador** (este último, para
  integraciones marketplace). Comprador y vendedor del mismo país (`MLA`); el
  país no se cambia después.
- Al crear la app se crea sola una cuenta de vendedor de prueba; sus
  credenciales son las "credenciales de prueba" de la app.
- Hasta 15 a la vez y no se pueden borrar.
- **"Las integraciones con Checkout Bricks no soportan cuentas de prueba"**:
  en modo `API` (Brick) se prueba con credenciales de prueba y tarjetas de
  prueba; si el comprador de prueba falla, comprá con un email cualquiera.

## A mano, de punta a punta

1. Creá la app de prueba (marketplace / OAuth) y los usuarios de prueba que
   falten.
2. Exportá `ClientId`, `ClientSecret` y `WebhookSecret` como variables de
   entorno en la consola (`$env:MercadoPago__ClientId = '...'`, etc.) antes de
   `.\dev-up.ps1`. `dotnet user-secrets` **no** sirve: `Api.csproj` no tiene
   `UserSecretsId`.
3. `cloudflared.exe` en la raíz del repo y `.\dev-up.ps1 -Tunnel`: inyecta
   `PublicApiBaseUrl` y `RedirectUri` con la URL del túnel.
4. Registrá en la app el Redirect URI que imprime el script y la URL del
   webhook (`…/api/v1/payments/webhooks/mercadopago`, evento Pagos). La URL del
   túnel rápido cambia en cada corrida.
5. Panel → Configuración → Medios de pago → conectá la cuenta del vendedor de
   prueba y elegí el modo.
6. Comprá en la tienda (en modo `PRO`, logueado como el comprador de prueba).
7. Reembolsá desde Ventas (total y parcial) y mirá `GET /orders/{id}/refunds`.
8. Cerrá el navegador antes de volver a la tienda: la orden tiene que pagarse
   igual por webhook.

## Tarjetas de prueba

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Mastercard crédito | 5031 7557 3453 0604 | 123 | 11/30 |
| Visa crédito | 4509 9535 6623 3704 | 123 | 11/30 |
| American Express | 3711 803032 57522 | 1234 | 11/30 |
| Mastercard débito | 5287 3383 1025 3304 | 123 | 11/30 |
| Visa débito | 4002 7686 9439 5619 | 123 | 11/30 |

El resultado lo decide el **nombre del titular** (con `APRO` y `OTHE`, DNI
12345678):

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

Hay más códigos (`CARD`, `INST`, `DUPL`, `LOCK`, `CTNA`, `ATTE`, `BLAC`,
`UNSU`, `TEST`) en la tabla oficial.

**Desafío 3DS** (modo `API`, solo con credenciales de prueba; en producción no
anda): Mastercard `5483 9281 6457 4623` lo supera, `5361 9568 0611 7557` no lo
autoriza (CVV 123, vence 11/30).

Los números cambian de vez en cuando: si una no anda, mirá la tabla vigente en
<https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>.

## Reglas duras

- Nunca tarjetas reales con credenciales de prueba, ni tarjetas de prueba con
  credenciales reales.
- No se puede pagar con la misma cuenta que vende.
- Los secretos van por variables de entorno en local o `.env.prod` en el
  servidor, nunca al repo.
- Se puede simular un aviso desde "Tus integraciones" → Webhooks → Simular;
  para que la firma valide, el secreto tiene que ser el de esa app.

## Problemas típicos

| Síntoma | Causa |
|---|---|
| "No podés pagarte a vos mismo" | Comprador = vendedor |
| La tarjeta de prueba se rechaza siempre | Titular distinto de `APRO`, o cuenta de otro país |
| El Brick falla con el comprador de prueba | Bricks no soporta cuentas de prueba: usar otro email |
| Webhook 401 | El secreto no es el de la app de prueba |
| No vuelve solo a la tienda | `back_urls` por http: usar el túnel |

Docs: cuentas de prueba
<https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/accounts>,
3DS <https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/how-tos/integrate-3ds>.
