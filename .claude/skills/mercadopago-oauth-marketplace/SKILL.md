---
name: mercadopago-oauth-marketplace
description: OAuth de Mercado Pago para conectar la cuenta de cada tienda a la app de la plataforma (authorize, /oauth/token, refresh, state cifrado) y comisión marketplace_fee/application_fee. Usala al tocar MercadoPagoOAuthClient, OAuthCallbackHandler o MercadoPagoConnection.
---

# Mercado Pago: OAuth y modelo marketplace

Tiendafy es **una app de Mercado Pago** (la de la plataforma). Cada tienda
autoriza esa app con su cuenta y la plataforma cobra **en nombre de la
tienda** con el `access_token` que recibe. Los pagos se acreditan en la cuenta
de la tienda; la comisión opcional de la plataforma va aparte.

En Tiendafy: `MercadoPagoOAuthClient.cs`, `Payments.Core/Features/Connect/OAuthCallbackHandler.cs`,
`MercadoPagoConnection` (tabla `mp_connections`, una por tienda) y el panel
`admin/src/pages/Settings/MercadoPagoConnect.tsx`.

## Flujo

1. `POST /api/v1/payments/mercadopago/connect` arma la URL:
   ```
   https://auth.mercadopago.com.ar/authorization
     ?client_id={APP_ID}&response_type=code&platform_id=mp
     &state={state cifrado}&redirect_uri={RedirectUri}
   ```
   El `state` lleva tienda + hora, cifrado (purpose
   `Tiendafy.Payments.MercadoPagoOAuthState.v1`), y vale 15 minutos.
2. Mercado Pago vuelve a `GET /api/v1/payments/mercadopago/callback?code=…&state=…`
   **sin header de tienda**: la tienda sale del `state`, nunca de la request.
3. Canje:
   ```http
   POST https://api.mercadopago.com/oauth/token
   Content-Type: application/x-www-form-urlencoded

   client_id=…&client_secret=…&grant_type=authorization_code&code=…&redirect_uri=…
   ```
   Respuesta: `access_token`, `refresh_token`, `user_id`, `public_key`,
   `expires_in` (15552000 s = 180 días), `scope`.
4. Se cifran los tokens (purpose `Tiendafy.Payments.MercadoPagoTokens.v1`) y
   se crea o actualiza la conexión. El navegador vuelve a `AdminReturnUrl`
   con `?mp=connected` o `?mp=error`.
5. Refresh: antes de cada uso, si el token vence en menos de 7 días,
   `grant_type=refresh_token&refresh_token=…`. Se guarda el `refresh_token`
   nuevo si viene. Si el refresh falla, se loguea y se sigue con el actual.

## Reglas duras

- `redirect_uri` tiene que coincidir **exacto** con el registrado en la app
  (en local, la URL del túnel de `dev-up.ps1 -Tunnel`, que cambia en cada
  corrida).
- `user_id` de la conexión = el `user_id` que llega en los webhooks: es la
  única forma de saber de qué tienda es un aviso.
- `public_key` de la conexión es la que usa el Brick de esa tienda; una
  conexión sin `public_key` (vieja) hay que reconectarla.
- Nunca mezclar el token de la plataforma con el de la tienda: el pago se
  acredita a quien es dueño del token.
- El comprador ve el `statement_descriptor` de la tienda (configurable, hasta
  22 caracteres).

## Comisión de la plataforma

Por tienda, `marketplaceFeePercent` (0 a 100, default 0) en
`PUT /api/v1/payments/mercadopago/preferences`. Se manda como **monto**:

| Dónde | Campo |
|---|---|
| Preference (Checkout Pro) | `marketplace_fee` |
| `/v1/payments` (Brick) | `application_fee` |
| `/v1/orders` | Sin equivalente documentado (por eso no migramos) |

Hoy plataforma y tiendas son la misma empresa, así que la comisión suele
quedar en 0; el modelo marketplace se usa por el OAuth (cada tienda cobra en
su cuenta).

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| `redirect_uri` inválido | No coincide con el de la app | Registrar la URL exacta |
| El callback dice "state inválido o vencido" | Pasaron más de 15 min, o cambió el keyring | Reconectar |
| `MercadoPago.NotConnected` | La tienda nunca conectó o desconectó | Conectar |
| Refresh falla siempre | La tienda revocó la app | Reconectar (el aviso `mp-connect` lo anticipa) |

Docs: <https://www.mercadopago.com.ar/developers/es/docs/security/oauth/introduction>
