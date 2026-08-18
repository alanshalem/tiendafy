# Configuración completa — credenciales, API keys y variables

Todo lo que hay que **conseguir** y **configurar** para levantar Tiendafy, en dev y en producción. Una sola página: si algo pide una clave y no está acá, es un bug de esta doc.

Hay dos niveles, no mezclarlos:

- **Nivel PLATAFORMA** — credenciales de Tiendafy como producto. Van en variables de entorno / user-secrets / `.env.prod`. **Jamás se commitean.**
- **Nivel TIENDA** — credenciales de cada merchant (su Mercado Pago, su WhatsApp, su certificado ARCA…). **No van en ningún env**: se cargan desde el panel admin y se guardan cifradas (DataProtection) en la base.

---

## 1. Resumen: qué conseguir y dónde

| Servicio | Qué conseguir | Dónde se consigue | Nivel | ¿Obligatorio? |
|---|---|---|---|---|
| **PostgreSQL** | Password fuerte | vos | Plataforma | Sí |
| **Mercado Pago** | App marketplace: Client ID + Client Secret + Webhook Secret | [Panel de desarrolladores MP](https://www.mercadopago.com.ar/developers) → crear aplicación (modelo marketplace, OAuth) | Plataforma | Sí (cobros) |
| **Resend** | API key + dominio verificado | [resend.com](https://resend.com) → API Keys; Domains → verificar tu dominio (SPF/DKIM) | Plataforma | Sí en prod (emails) |
| **Resend webhook** | Signing secret (`whsec_…`) | Panel Resend → Webhooks → eventos `email.bounced` + `email.complained` → `https://api.TUDOMINIO/api/v1/webhooks/resend` | Plataforma | Recomendado (supresión de rebotes) |
| **Cloudflare Turnstile** | Site key + Secret key | [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile | Plataforma | Recomendado (anti-bots en formularios públicos) |
| **Google OAuth** | Client ID + Client Secret | [console.cloud.google.com](https://console.cloud.google.com) → Credentials → OAuth client (web); redirect: `https://api.TUDOMINIO/api/v1/shop/auth/google/callback` | Plataforma | Opcional (login de compradores con Google) |
| **Sentry** | 3 DSNs (backend, storefront, admin) | [sentry.io](https://sentry.io) → un proyecto por app | Plataforma | Opcional (errores en prod) |
| **Meta Ads** | App ID + App Secret | [developers.facebook.com](https://developers.facebook.com) → crear app con Marketing API (permiso `ads_read`); redirect: `https://api.TUDOMINIO/api/v1/meta-ads/oauth/callback` | Plataforma | Opcional (ROAS real en Rentabilidad) |
| **Redes sociales — Meta** | App ID + App Secret (puede ser la misma app de Meta Ads) | [developers.facebook.com](https://developers.facebook.com) → app con permisos `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`; redirect: `https://api.TUDOMINIO/api/v1/social/oauth/callback/meta` | Plataforma | Opcional (posts en Facebook/Instagram) |
| **Redes sociales — X** | Client ID (+ Client Secret si la app es confidencial) | [developer.x.com](https://developer.x.com) → app OAuth 2.0 con scopes `tweet.read tweet.write users.read offline.access`; redirect: `https://api.TUDOMINIO/api/v1/social/oauth/callback/x` | Plataforma | Opcional (posts en X) |
| **Telegram del merchant** | Bot token + canal | El merchant crea un bot con @BotFather, lo hace admin de su canal y lo carga en Redes sociales → Cuentas | Tienda | Opcional |
| **MinIO / S3** | Access key + Secret key | tu propio MinIO (el compose de dev lo incluye; en prod es un servicio externo) o un S3 compatible | Plataforma | Sí (imágenes/videos) |
| **Mercado Libre** | App: Client ID + Client Secret | [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar) → crear aplicación. Redirect URI: `https://api.TUDOMINIO/api/v1/meli/oauth/callback`; notificaciones (topic `orders_v2`): `https://api.TUDOMINIO/api/v1/webhooks/meli` | Plataforma | Opcional (canal ML) |
| **Mercado Pago del merchant** | — (un click) | El merchant conecta su cuenta desde Configuración → Medios de pago (OAuth) | Tienda | Por tienda |
| **Mercado Libre del merchant** | — (un click) | El merchant conecta su cuenta de vendedor desde Configuración → Mercado Libre (OAuth) | Tienda | Opcional |
| **WhatsApp Cloud API** | Phone Number ID + access token permanente + plantillas aprobadas | [developers.facebook.com](https://developers.facebook.com) → app con producto WhatsApp; token de system user en Meta Business | Tienda | Opcional |
| **ARCA (facturación)** | CUIT + certificado digital (vía CSR) + punto de venta | ARCA con clave fiscal: Administración de Certificados Digitales + Puntos de venta (Web Services) — el wizard del admin te guía | Tienda | Para facturar |
| **Correo Argentino (MiCorreo)** | userToken + passwordToken (TEST y PROD separados) + customerId | Cuenta en [MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) + credenciales por su formulario de contacto | Tienda | Opcional |
| **Zipnova** | API Token + API Secret + account ID | Panel Zipnova → Configuración → Integraciones → Gestionar credenciales. Para probar: registrarse y pedir a soporte que habilite la modalidad "testing" en la cuenta (se desactiva al operar en serio). ⚠️ Fuera de testing, crear envíos consume saldo real | Tienda | Opcional |

---

## 2. Nivel plataforma — variables del backend (API)

En **dev**: `dotnet user-secrets` (proyecto `backend/src/Api`) o `appsettings.Development.json` para lo no-secreto.
En **prod**: `.env.prod` (ver §4) — el compose las mapea a estas claves.

| Clave .NET | Qué es | Dev | Prod |
|---|---|---|---|
| `ConnectionStrings:Default` | Postgres | la levanta el compose de dev | armada por el compose con `POSTGRES_PASSWORD` |
| `MercadoPago:ClientId` / `MercadoPago:ClientSecret` | App marketplace de MP | user-secrets | `.env.prod` |
| `MercadoPago:RedirectUri` | Callback OAuth público | URL del túnel (cloudflared/ngrok) | `https://api.TUDOMINIO/api/v1/payments/mercadopago/callback` |
| `MercadoPago:WebhookSecret` | Firma de webhooks de pagos | user-secrets | `.env.prod` |
| `MercadoLibre:ClientId` / `MercadoLibre:ClientSecret` | App de plataforma en ML (canal Mercado Libre) | user-secrets (vacío = integración apagada) | `.env.prod` |
| `MercadoLibre:RedirectUri` | Callback OAuth registrado en la app de ML | URL del túnel + `/api/v1/meli/oauth/callback` | `https://api.TUDOMINIO/api/v1/meli/oauth/callback` |
| `MercadoLibre:AdminReturnUrl` | A dónde vuelve el navegador tras autorizar | `http://localhost:3001/configuracion/mercadolibre` | `https://admin.TUDOMINIO/configuracion/mercadolibre` |
| `Email:ResendApiKey` | API key de Resend | vacío = modo dev (loguea, no envía) | `.env.prod` |
| `Email:From` | Remitente | `Tiendafy <onboarding@resend.dev>` | `Tiendafy <no-responder@TUDOMINIO>` (dominio verificado) |
| `Email:WebhookSecret` | Firma svix del webhook de Resend | vacío = endpoint apagado | `.env.prod` |
| `Captcha:Turnstile:SiteKey` / `:Secret` | Turnstile | vacío = captcha apagado | `.env.prod` |
| `Authentication:Google:ClientId` / `:ClientSecret` | Login Google de compradores | opcional | opcional |
| `Sentry:Dsn` | Errores del backend | vacío = apagado | `.env.prod` |
| `Media:Endpoint` / `Media:AccessKey` / `Media:SecretKey` / `Media:PublicBaseUrl` | MinIO/S3 | defaults del compose de dev | `.env.prod` |
| `Media:EnsureBucketOnStartup` | Crear bucket al arrancar | `true` | `true` (primera vez) |
| `PublicApiBaseUrl` | URL pública de la API — **la usan los links de baja y tracking de los emails** | `http://localhost:5080` | `https://api.TUDOMINIO` |
| `Tenancy:PlatformBaseDomain` | Dominio base (subdominios de tiendas) | `localhost` | `TUDOMINIO` |
| `Cors:AllowedOrigins` | Orígenes permitidos | localhost | tus dominios de admin/storefront |
| `DataProtection:KeyPath` | Claves de cifrado (¡todos los secretos de tiendas dependen de esto!) | default local | volumen `dpkeys` del compose — **backupear siempre** |
| `Database:MigrateOnStartup` | Migrar al arrancar | `true` | `false` (se migra con `dotnet Api.dll migrate`) |
| `Workers:Enabled` | Workers de fondo (carritos, campañas) | `true` | `true` solo en la instancia principal |
| `Notifications:EmailCostUsdPer1000` / `:WhatsAppCostUsdPerMessage` | Tarifas del panel de costos | defaults 0.40 / 0.034 | ajustar a tu plan real |
| `Fiscal:Endpoints:*` | URLs de WSAA/WSFE de ARCA | defaults de homologación | defaults de producción (built-in) |

## 3. Nivel plataforma — variables de los frontends

**Storefront** (`storefront/.env.local` en dev; env del contenedor en prod):

| Variable | Dev | Prod |
|---|---|---|
| `API_URL` (SSR) | `http://localhost:5080` | `https://api.TUDOMINIO` |
| `NEXT_PUBLIC_API_URL` (browser) | `http://localhost:5080` | `https://api.TUDOMINIO` |
| `NEXT_PUBLIC_ADMIN_URL` | `http://localhost:3001` | `https://admin.TUDOMINIO` |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | `http://localhost:3001` | **REQUERIDA**: `https://admin.TUDOMINIO` (seguridad del editor de temas) |
| `PLATFORM_BASE_DOMAIN` (server-side) | `localhost` | `TUDOMINIO` |
| `NEXT_PUBLIC_SENTRY_DSN` | vacío | DSN del storefront |

**Admin** (`admin/.env.local` en dev; build arg en prod):

| Variable | Dev | Prod |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5080` | `https://api.TUDOMINIO` |
| `VITE_SENTRY_DSN` | vacío | DSN del admin |

## 4. Producción: `.env.prod`

La plantilla completa vive en **`infra/docker/.env.prod.example`** — copiarla a `.env.prod` (nunca commitearlo) y completarla. El `docker-compose.prod.yml` mapea el subconjunto que está en `.env.prod.example`; el resto de las claves (Mercado Libre, `Email:WebhookSecret`, `PublicApiBaseUrl`, Captcha, Google, `Media:*`, CORS) va como variables de entorno manuales del servicio `api`. Claves del archivo: `PLATFORM_DOMAIN`, `ACME_EMAIL` (TLS de Caddy), `POSTGRES_PASSWORD`, `REGISTRY`/`TAG` (imágenes GHCR), `EMAIL_FROM`, `RESEND_API_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `SENTRY_DSN_*`, `WORKERS_ENABLED`.

> **Crítico**: el volumen `dpkeys` (DataProtection) guarda las claves con las que están cifrados TODOS los secretos por-tienda (tokens de MP, WhatsApp, MiCorreo, Zipnova, certificados ARCA). Si se pierde, cada tienda tiene que reconectar todo. Está incluido en el backup diario del compose — verificar que siga así.

## 5. Checklist de lanzamiento (orden sugerido)

1. VPS + DNS: `TUDOMINIO`, `*.TUDOMINIO`, `api.`, `admin.` → Caddy hace el TLS solo (on-demand para dominios propios de tiendas).
2. `.env.prod` completo → `docker compose -f infra/docker/docker-compose.prod.yml up -d`.
3. Migrar: `docker compose … run --rm api dotnet Api.dll migrate`.
4. Resend: dominio verificado + `EMAIL_FROM` + webhook de bounces (§1).
5. Mercado Pago: app en modo productivo, redirect URI real, webhook de pagos apuntando a `https://api.TUDOMINIO/api/v1/payments/webhooks/mercadopago`.
6. Turnstile con el dominio real.
7. Sentry DSNs.
8. Probar compra punta a punta con una tienda de prueba (tarjetas de test de MP).
9. Backups: verificar que el sidecar de Postgres escriba y que `dpkeys` esté en el respaldo.
10. Cada tienda conecta lo suyo desde el admin: MP (un click), WhatsApp, ARCA, MiCorreo, Zipnova.

## 6. Credenciales de desarrollo (solo local)

- Admin del panel: `admin@tiendafy.local` / `password123`
- Compradores de prueba: `ana@test.com` / `password123`
- Levantar todo: `./dev-up.ps1` (Postgres+MinIO en Docker, API, ambos fronts)
