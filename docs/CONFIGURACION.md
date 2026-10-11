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
| **IA (Claude)** | API key | [console.anthropic.com](https://console.anthropic.com) → API Keys | Plataforma | Opcional (sugerencias: respuestas ML, posts, descripciones) |
| **Cloudflare R2** (o S3/MinIO) | Access key + Secret key + dominio propio | R2: panel → R2 → dos buckets + dominio propio en el de media + API token acotado a esos buckets. En dev, el MinIO del compose | Plataforma | Sí (imágenes/videos) |
| **Mercado Libre** | App: Client ID + Client Secret | [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar) → crear aplicación. Redirect URI: `https://api.TUDOMINIO/api/v1/meli/oauth/callback`; notificaciones (topic `orders_v2`): `https://api.TUDOMINIO/api/v1/webhooks/meli` | Plataforma | Opcional (canal ML) |
| **Mercado Pago del merchant** | — (un click) | El merchant conecta su cuenta desde Configuración → Medios de pago (OAuth) | Tienda | Por tienda |
| **Payway (ex Decidir)** | site_id + public key + private key (sandbox y producción son distintos) | Alta comercial con Payway → te dan las credenciales por ambiente. El comercio las carga en Configuración → Medios de pago → Payway | Tienda | Opcional (tarjeta sin salir del checkout) |
| **Mercado Libre del merchant** | — (un click) | El merchant conecta su cuenta de vendedor desde Configuración → Mercado Libre (OAuth) | Tienda | Opcional |
| **WhatsApp Cloud API** | Phone Number ID + access token permanente + plantillas aprobadas | [developers.facebook.com](https://developers.facebook.com) → app con producto WhatsApp; token de system user en Meta Business | Tienda | Opcional |
| **ARCA (facturación)** | CUIT + certificado digital (vía CSR) + punto de venta | ARCA con clave fiscal: Administración de Certificados Digitales + Puntos de venta (Web Services) — el wizard del admin te guía | Tienda | Para facturar |
| **Correo Argentino (MiCorreo)** | userToken + passwordToken (TEST y PROD separados) + customerId | Cuenta en [MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) + credenciales por su formulario de contacto | Tienda | Opcional |
| **Zipnova** | API Token + API Secret + account ID | Panel Zipnova → Configuración → Integraciones → Gestionar credenciales. Para probar: registrarse y pedir a soporte que habilite la modalidad "testing" en la cuenta (se desactiva al operar en serio). ⚠️ Fuera de testing, crear envíos consume saldo real | Tienda | Opcional |
| **Andreani** | Usuario + contraseña de la API + número de cliente + contratos (domicilio y/o sucursal) + sucursal de origen | Alta comercial con Andreani → te habilitan el acceso a la API y te dan los contratos. El comercio los carga en Configuración → Medios de envío → Andreani | Tienda | Opcional |

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
| `MercadoLibre:AdminReturnUrl` | A dónde vuelve el navegador tras autorizar | `http://localhost:5173/configuracion/mercadolibre` | `https://admin.TUDOMINIO/configuracion/mercadolibre` |
| `Email:ResendApiKey` | API key de Resend | vacío = modo dev (loguea, no envía) | `.env.prod` |
| `Email:From` | Remitente | `Tiendafy <onboarding@resend.dev>` | `Tiendafy <no-responder@TUDOMINIO>` (dominio verificado) |
| `Email:WebhookSecret` | Firma svix del webhook de Resend | vacío = endpoint apagado | `.env.prod` |
| `Captcha:Turnstile:SiteKey` / `:Secret` | Turnstile | vacío = captcha apagado | `.env.prod` |
| `Authentication:Google:ClientId` / `:ClientSecret` | Login Google de compradores | opcional | opcional |
| `Sentry:Dsn` | Errores del backend | vacío = apagado | `.env.prod` |
| `Media:Endpoint` / `Media:AccessKey` / `Media:SecretKey` / `Media:PublicBaseUrl` | R2/S3/MinIO | defaults del compose de dev | `.env.prod` (la API no arranca en Producción con los de dev) |
| `Media:Region` | Región de firma (`auto` en R2) | vacío | `auto` |
| `Media:BucketInPublicUrl` | La URL pública lleva el bucket | `true` | `false` con dominio propio de R2 |
| `Media:EnsureBucketOnStartup` | Crear bucket al arrancar | `true` | `false` en R2 (no soporta `PutBucketPolicy`; los buckets se crean a mano) |
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
| `NEXT_PUBLIC_ADMIN_ORIGIN` | `http://localhost:5173` | **REQUERIDA**: `https://admin.TUDOMINIO` (link al panel + seguridad del editor de temas) |
| `PLATFORM_BASE_DOMAIN` (server-side) | `localhost` | `TUDOMINIO` |
| `NEXT_PUBLIC_SENTRY_DSN` | vacío | DSN del storefront |

**Admin** (`admin/.env.local` en dev; build arg en prod):

| Variable | Dev | Prod |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5080` | `https://api.TUDOMINIO` |
| `VITE_SENTRY_DSN` | vacío | DSN del admin |

## 4. Producción: `.env.prod`

Hay **tres** plantillas en `infra/docker/`, una por pieza (copiarlas sin el `.example` y completarlas; nunca commitearlas):

- **`.env.edge.example`** → el Caddy compartido: `PLATFORM_DOMAIN`, `STAGING_DOMAIN`, `ACME_EMAIL`, `CLOUDFLARE_API_TOKEN` (certificados comodín por DNS-01).
- **`.env.prod.example`** → el stack de producción.
- **`.env.staging.example`** → el mismo stack, con credenciales de prueba y sin backup.

Los dos stacks usan el MISMO `docker-compose.stack.yml`: lo único distinto es el archivo de variables. Claves de cada stack: `COMPOSE_PROJECT_NAME`, `APP_ENV`, `STACK_DOMAIN`, `POSTGRES_PASSWORD`, `REGISTRY`/`TAG` (imágenes GHCR), `EMAIL_FROM`, `RESEND_API_KEY`, `MP_*`, `MEDIA_*` (storage), `SENTRY_DSN_*`, `BRAND_NAME` (la marca del panel; vacío = Tiendafy), `WORKERS_ENABLED` y los techos de memoria `*_MEM_LIMIT`. El resto (Mercado Libre, Captcha, Google, CORS) va como variables de entorno manuales del servicio `api`.

> **Crítico**: el volumen `dpkeys` (DataProtection) guarda las claves con las que están cifrados TODOS los secretos por-tienda (tokens de MP, credenciales de Payway, WhatsApp, MiCorreo, Zipnova, Andreani, certificados ARCA). Si se pierde, cada tienda tiene que reconectar todo. Está incluido en el backup diario del compose — verificar que siga así.

## 5. Checklist de lanzamiento (orden sugerido)

1. VPS + DNS: `TUDOMINIO`, `*.TUDOMINIO`, `api.`, `admin.` → Caddy hace el TLS solo (on-demand para dominios propios de tiendas).
2. `.env.edge` + `.env.prod` + `.env.staging` completos → `docker compose -f infra/docker/docker-compose.edge.yml --env-file infra/docker/.env.edge up -d` y después `./infra/deploy.sh staging` / `./infra/deploy.sh prod`.
3. Migrar: `docker compose … run --rm api dotnet Api.dll migrate`.
4. Resend: dominio verificado + `EMAIL_FROM` + webhook de bounces (§1).
5. Mercado Pago: app en modo productivo, redirect URI real, webhook de pagos apuntando a `https://api.TUDOMINIO/api/v1/payments/webhooks/mercadopago`.
6. Turnstile con el dominio real.
7. Sentry DSNs.
8. Probar compra punta a punta con una tienda de prueba (tarjetas de test de MP).
9. Backups: verificar que el sidecar de Postgres escriba y que `dpkeys` esté en el respaldo.
10. Cada tienda conecta lo suyo desde el admin: MP (un click), Payway, WhatsApp, ARCA, MiCorreo, Zipnova, Andreani.

## 6. Credenciales de desarrollo (solo local)

- Admin del panel: `admin@tiendafy.local` / `password123`
- Compradores de prueba: `ana@test.com` / `password123`
- Levantar todo: `./dev-up.ps1` (Postgres+MinIO en Docker, API, ambos fronts)
