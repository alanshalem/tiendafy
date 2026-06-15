# Mercado Pago — integración (Tiendafy)

Modelo: **OAuth marketplace**. Tiendafy es UNA app registrada en Mercado Pago; cada
merchant conecta su cuenta con un botón ("Conectá tu cuenta"). Guardamos su
`access_token` + `refresh_token` **cifrados** (ASP.NET Data Protection) por tenant
y cobramos en su nombre. Comisión de plataforma (`marketplace_fee`) configurable,
default 0%.

## Estado

- ✅ Fase 1A — Conexión OAuth (connect / callback / disconnect / preferencias). Módulo `Payments`.
- ⏳ Fase 1B — Orders + creación de preference (Checkout Pro) + webhook + storefront redirect.
- ⏳ Fase 2 — Checkout API / Bricks on-site.

## Config (NO commitear secretos)

Sección `MercadoPago` en `appsettings.json` (placeholders) — los valores reales van por
**user-secrets** o variables de entorno:

```bash
cd backend/src/Api
dotnet user-secrets init
dotnet user-secrets set "MercadoPago:ClientId"     "<APP_ID de tu app MP>"
dotnet user-secrets set "MercadoPago:ClientSecret" "<CLIENT_SECRET>"
dotnet user-secrets set "MercadoPago:RedirectUri"  "https://<tu-tunel>/api/v1/payments/mercadopago/callback"
dotnet user-secrets set "MercadoPago:WebhookSecret" "<webhook secret de la app>"
```

`AdminReturnUrl` (default `http://localhost:3001/configuracion/medios-de-pago`) es a
dónde vuelve el navegador del merchant tras autorizar.

## Probar local sin romper

No hay sandbox aparte: se prueba con **cuentas de prueba** (producción con flag test).

1. **Test users**: creá 1 vendedor + 1 comprador (dashboard MP o MCP `create_test_user`, `site_id=MLA`).
2. **App MP**: logueado como el test user vendedor, creá una app y copiá `ClientId`/`ClientSecret`.
3. **Túnel** (el callback OAuth y los webhooks necesitan HTTPS público):
   ```bash
   cloudflared tunnel --url http://localhost:5080
   ```
   Registrá la URL del túnel como `Redirect URI` en la app MP y ponela en `MercadoPago:RedirectUri`.
4. **Conectar**: en el admin → Configuración → Medios de pago → "Conectá tu cuenta".
5. **Tarjetas de prueba** (forzar estado por nombre del titular): `APRO` aprueba, `OTHE`
   rechaza, `CONT` queda pendiente. Números por país en la doc de MP.

## Reglas no-negociables (del SDK MP)

- Checkout Pro usa SOLO `/v1/checkout/preferences`; redirigir a `init_point` (nunca `sandbox_init_point`, deprecado).
- `auto_return: approved` y `back_urls` exigen HTTPS y mismo origen.
- Webhooks: validar firma HMAC-SHA256 (`x-signature`/`x-request-id`), responder 200 antes de procesar, dedup idempotente.
- Nunca confiar en los query params del redirect: reconciliar server-side con `GET /v1/payments/{id}`.
- El `access_token` del seller vence a los ~6 meses: renovar con `refresh_token`.

## Producción

- Persistir el keyring de Data Protection (DB/Redis/KeyVault) — si no, los tokens cifrados
  se vuelven ilegibles al rotar el host.
- Credenciales reales de la app MP (no test users).
- `AuthBaseUrl`/`ApiBaseUrl` por país si no es Argentina.
