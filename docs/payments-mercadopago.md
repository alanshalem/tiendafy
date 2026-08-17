# Mercado Pago — integración (Tiendafy)

Modelo: **OAuth marketplace**. Tiendafy es UNA app registrada en Mercado Pago; cada
merchant conecta su cuenta con un botón ("Conectá tu cuenta"). Guardamos su
`access_token` + `refresh_token` **cifrados** (ASP.NET Data Protection) por tenant
y cobramos en su nombre. Comisión de plataforma (`marketplace_fee`) configurable,
default 0%.

## Estado

- ✅ Fase 1A — Conexión OAuth (connect / callback / disconnect / preferencias).
- ✅ Fase 1B — **Checkout Pro end-to-end** (preference → redirect → webhook → orden Pagada).
- ✅ Fase 2 — **Checkout API/Bricks on-site**: Payment Brick en el storefront,
  `POST /checkout/{id}/pay-onsite`, settle inmediato + webhook como backup.
- ✅ Modo de cobro **elegible por tienda** desde el admin (PRO/API, comparativa visual).
- ✅ **Refunds totales y parciales** con auditoría, historial y sync desde MP.
- ✅ Emails (compra, envío, reembolso total), chargebacks (estado `ChargedBack`).

## Arquitectura

```
storefront CheckoutClient ─┬─ PRO: POST /checkout/{id}/pay        → redirect init_point
                           └─ API: Payment Brick (tokeniza en el navegador)
                                   POST /checkout/{id}/pay-onsite → settle inmediato

admin MercadoPagoConnect ── OAuth + modo de cobro + statement descriptor
admin Ventas ────────────── refund total/parcial + historial (GET /orders/{id}/refunds)

API Modules/Payments
  MercadoPagoOAuthClient      OAuth connect/refresh (token vence ~6 meses)
  MercadoPagoCheckoutClient   preferences, card payments, refunds (con monto)
  MercadoPagoWebhookValidator HMAC x-signature + anti-replay 5 min
  PaymentWebhookEvent         inbox durable → PaymentWebhookWorker (polling 5s, 6 reintentos)
  PaymentRefund               auditoría de reembolsos (payment_refunds)

API Modules/Orders
  Order                       PendingPayment→Paid→Fulfilled / Failed / Refunded /
                              PartiallyRefunded / ChargedBack + RefundedAmount
  SettlePaymentHandler        aplica resultado idempotente + sync refunds parciales
```

Claves de diseño:

- **El monto SIEMPRE sale del servidor**: la Order se construye desde la
  `CheckoutSession` (stock ya reservado) y el cupón se recalcula server-side.
- `Order.Id` = `external_reference` en MP (reconciliación).
- Modo API: la tarjeta se tokeniza **en el navegador** con la `publicKey` del
  seller — el PAN jamás toca nuestra API (PCI queda en MP). `binary_mode=false`
  permite challenge 3DS.

## Reembolsos

`POST /api/v1/orders/{id}/refund` (admin, `RequirePermission(Permission.OrdersRefund)`):

```json
{ "amount": 1500.50, "reason": "producto dañado" }   // parcial
{ "amount": null }                                    // total (lo que quede)
```

- Validación server-side: orden `Paid|Fulfilled|PartiallyRefunded`, monto > 0 y
  ≤ `RemainingRefundable`.
- **Auditoría** en `payment_refunds`: quién (email admin), cuándo, monto, motivo,
  id del refund en MP. Historial: `GET /api/v1/orders/{id}/refunds`.
- **Idempotencia**: la `X-Idempotency-Key` hacia MP es el id del registro de
  auditoría — única por intento (retry de red no duplica; dos parciales sí son dos).
- Parcial → `PartiallyRefunded` (acumula `RefundedAmount`); al completar el total
  → `Refunded` + email "cancelacion-compra".
- Concurrencia: lock por orden (`SemaphoreSlim`).
- Refunds hechos en el **dashboard de MP** se sincronizan por webhook: el worker
  compara `transaction_amount_refunded` contra lo local y aplica la diferencia.

## Seguridad (checklist)

- [x] Firma HMAC-SHA256 en todos los webhooks (canonical `id:{data.id};request-id:{x-request-id};ts:{ts};`), 401 si inválida; anti-replay 5 min; comparación en tiempo constante.
- [x] Monto server-side; cupones recalculados; nunca del cliente.
- [x] `X-Idempotency-Key` en pagos (orderId) y refunds (auditId por intento).
- [x] Tokens OAuth cifrados en reposo; nunca logueados.
- [x] Tarjeta tokenizada en el navegador (Brick); el PAN no pasa por la API.
- [x] `refund` y `fulfill` exigen auth + membership del tenant.
- [x] Rate limiting: policy `payments` (15 req/5 min por IP+ruta) en `pay` y
      `pay-onsite` contra card-testing; techo global 300/min.

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
6. **Conectar**: admin → Configuración → Medios de pago → "Conectá tu cuenta" (test user vendedor).
7. **Elegir modo**: en la misma pantalla, Checkout Pro o Checkout integrado (aplica al instante).
8. **Comprar**: storefront → producto → carrito → checkout. Con modo API el
   formulario de tarjeta aparece embebido; con PRO redirige a MP.
9. **Tarjeta de prueba** (estado por nombre del titular): `APRO` aprueba, `OTHE` rechaza, `CONT` pendiente.
10. **Reembolsar**: admin → Ventas → expandir la orden → Reembolsar (total o
    parcial con monto y motivo). El historial queda en el mismo modal.

## Reglas no-negociables (SDK MP)

- Checkout Pro usa SOLO `/v1/checkout/preferences`; redirigir a `init_point` (nunca `sandbox_init_point`).
- `auto_return`/`back_urls` exigen HTTPS y mismo origen (en dev http el auto_return falla silencioso; el webhook igual concilia).
- Webhooks: validar firma HMAC-SHA256, responder 200 antes de procesar, dedup idempotente.
- Nunca confiar en query params del redirect: reconciliar server-side con `GET /v1/payments/{id}`.
- `access_token` del seller vence ~6 meses: se refresca solo con `refresh_token`.
- Refunds: hasta 180 días del pago; la idempotency key debe variar entre parciales.

## Troubleshooting

| Síntoma | Causa probable |
|---|---|
| Webhook responde 401 | `WebhookSecret` ausente/incorrecto, o reloj desfasado > 5 min |
| Pago aprobado pero orden Pendiente | `PublicApiBaseUrl` no accesible desde MP (falta túnel en dev) |
| `MercadoPago.NotConnected` | El tenant no completó OAuth o desconectó la cuenta |
| Refund falla en MP | Pago no aprobado, ya reembolsado por completo, o > 180 días |
| Brick no carga en storefront | Modo API sin `publicKey` (reconectar OAuth) |
| Eventos `dead` en inbox | Ver `last_error` en `payment_webhook_events` (6 reintentos máx.) |
| 429 en checkout | Rate limit `payments` (15/5min por IP+ruta) — esperar la ventana |

## Producción

- Persistir el keyring de Data Protection (DB/Redis/KeyVault).
- Credenciales reales de la app MP (no test users) + dominio público estable (no quick tunnel).
- `AuthBaseUrl`/`ApiBaseUrl` por país si no es Argentina.
