# Mercado Pago — integración (Tiendafy)

Modelo: **OAuth marketplace**. Tiendafy es UNA app registrada en Mercado Pago; cada
merchant conecta su cuenta con un botón ("Conectá tu cuenta"). Guardamos su
`access_token` + `refresh_token` **cifrados** (ASP.NET Data Protection) por tenant
y cobramos en su nombre. Comisión de plataforma (`marketplace_fee`) configurable,
default 0%.

## Estado

- ✅ Fase 1A — Conexión OAuth (connect / callback / disconnect / preferencias).
- ✅ Fase 1B — **Checkout Pro end-to-end**:
  - Módulo `Orders` (Order desde CheckoutSession, estados PendingPayment→Paid/Failed/…).
  - `POST /api/v1/checkout/{id}/pay` → crea Order + preference MP → devuelve `init_point`.
  - Webhook `POST /api/v1/payments/webhooks/mercadopago` (firma HMAC, dedup idempotente, worker async).
  - Storefront: carrito → email → "Pagar con Mercado Pago" → redirect; páginas `/checkout/success|failure|pending`.
  - Admin: **Ventas** (`/ventas`) con lista + detalle.
- ⏳ Fase 2 — Checkout API/Bricks on-site.
- ⏳ Extras — refunds, chargebacks, emails.

## Config (NO commitear secretos)

Sección `MercadoPago` en `appsettings.json` (placeholders). Valores reales por
**user-secrets**:

```bash
cd backend/src/Api
dotnet user-secrets init
dotnet user-secrets set "MercadoPago:ClientId"     "<APP_ID de tu app MP>"
dotnet user-secrets set "MercadoPago:ClientSecret" "<CLIENT_SECRET>"
dotnet user-secrets set "MercadoPago:WebhookSecret" "<webhook secret de la app>"
# RedirectUri y PublicApiBaseUrl los auto-inyecta dev-up.ps1 -Tunnel (ver abajo).
```

Variables que el script puede setear solo (override de appsettings, separador `__`):
`MercadoPago__RedirectUri`, `MercadoPago__PublicApiBaseUrl`.

## Probar local end-to-end

1. **Test users** (dashboard MP o MCP `create_test_user`, `site_id=MLA`): 1 vendedor + 1 comprador.
2. **App MP**: logueado como el test user vendedor → creá una app → copiá `ClientId`/`ClientSecret`/`WebhookSecret` a user-secrets.
3. **cloudflared**: descargá `cloudflared-windows-amd64.exe`, renombralo a `cloudflared.exe` y ponelo en la raíz del repo.
4. **Levantar con túnel**:
   ```powershell
   .\dev-up.ps1 -Tunnel
   ```
   El script arranca el túnel, imprime `https://xxxx.trycloudflare.com` y auto-inyecta esa URL como
   `RedirectUri` (callback OAuth) y `PublicApiBaseUrl` (notification_url de webhooks) de la API.
5. **Registrar el Redirect URI** en tu app de MercadoPago: `https://xxxx.trycloudflare.com/api/v1/payments/mercadopago/callback`
   (la URL del quick tunnel cambia en cada corrida; actualizala en MP).
6. **Conectar**: admin → Configuración → Medios de pago → "Conectá tu cuenta" (logueate con el test user vendedor).
7. **Comprar**: en el storefront agregá un producto → carrito → email → "Pagar con Mercado Pago".
8. **Tarjeta de prueba** (forzar estado por nombre del titular): `APRO` aprueba, `OTHE` rechaza, `CONT` pendiente.
9. El **webhook** concilia la orden solo → la ves en admin → **Ventas** como "Pagada".

## Reglas no-negociables (SDK MP)

- Checkout Pro usa SOLO `/v1/checkout/preferences`; redirigir a `init_point` (nunca `sandbox_init_point`).
- `auto_return`/`back_urls` exigen HTTPS y mismo origen (en dev http el auto_return falla silencioso; el webhook igual concilia).
- Webhooks: validar firma HMAC-SHA256, responder 200 antes de procesar, dedup idempotente.
- Nunca confiar en query params del redirect: reconciliar server-side con `GET /v1/payments/{id}`.
- `access_token` del seller vence ~6 meses: se refresca solo con `refresh_token`.

## Notas / pendientes conocidos

- El **descuento de cupón** del carrito todavía NO viaja al monto cobrado (el Order toma el snapshot del CheckoutSession sin cupón). Pendiente para cuando el cupón se modele en el checkout server-side.
- Sin `WebhookSecret` configurado, el receiver rechaza los webhooks (firma inválida) → la orden queda "Pendiente". Es esperado: configurá el secret.

## Producción

- Persistir el keyring de Data Protection (DB/Redis/KeyVault).
- Credenciales reales de la app MP (no test users) + dominio público estable (no quick tunnel).
- `AuthBaseUrl`/`ApiBaseUrl` por país si no es Argentina.
