# Configuración: credenciales y variables de entorno

Qué hay que conseguir, cómo se llama cada variable y dónde va, en desarrollo y
en producción. Si algo pide una clave y no está acá, es un bug de esta página.

Dos niveles que no se mezclan:

- **Plataforma**: credenciales de la instalación (apps de Mercado Pago y Mercado
  Libre, Resend, storage…). Van en variables de entorno. Nunca se commitean.
- **Tienda**: credenciales de cada tienda (su cuenta de Mercado Pago, Payway,
  WhatsApp, certificado ARCA, carriers). No van en ningún entorno: se cargan
  desde el panel y la API las guarda cifradas con DataProtection.

## 1. Qué conseguir y dónde

| Servicio | Qué conseguir | Dónde | Nivel | ¿Hace falta? |
| --- | --- | --- | --- | --- |
| PostgreSQL | Una clave fuerte | vos | Plataforma | Sí |
| Storage (Cloudflare R2, S3 o MinIO) | Access key + secret + dominio público | R2: dos buckets (`tiendafy-media` con dominio propio, `tiendafy-private` sin) y un API token acotado a esos dos. En dev, el MinIO del compose | Plataforma | Sí |
| Mercado Pago | App marketplace: Client ID, Client Secret, Webhook Secret | [Panel de desarrolladores](https://www.mercadopago.com.ar/developers). Redirect: `https://api.TUDOMINIO/api/v1/payments/mercadopago/callback` | Plataforma | Para cobrar con MP |
| Resend | API key + dominio verificado (SPF/DKIM) | [resend.com](https://resend.com) | Plataforma | Sí en prod (sin key, los mails van al log) |
| Webhook de Resend | Signing secret (`whsec_…`) | Resend → Webhooks, eventos `email.bounced` y `email.complained` → `https://api.TUDOMINIO/api/v1/webhooks/resend` | Plataforma | Recomendado (suprime rebotes) |
| Cloudflare Turnstile | Site key + secret | [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile | Plataforma | Recomendado (captcha en login, registro, contacto, newsletter, reseñas y "avisame") |
| Google OAuth | Client ID + secret | [Google Cloud Console](https://console.cloud.google.com/apis/credentials), cliente web. Redirect: `https://api.TUDOMINIO/api/v1/shop/auth/google/callback` | Plataforma | Opcional (login de compradores) |
| Sentry | Un DSN por app (API, tienda, panel) | [sentry.io](https://sentry.io) | Plataforma | Opcional |
| Mercado Libre | App: Client ID + secret | [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar). Redirect: `https://api.TUDOMINIO/api/v1/meli/oauth/callback`; notificaciones (topic `orders_v2`): `https://api.TUDOMINIO/api/v1/webhooks/meli` | Plataforma | Para el canal ML |
| Meta Ads | App ID + secret (Marketing API, permiso `ads_read`) | [developers.facebook.com](https://developers.facebook.com). Redirect: `https://api.TUDOMINIO/api/v1/meta-ads/oauth/callback` | Plataforma | Opcional (gasto publicitario en Rentabilidad) |
| Redes: Meta | App ID + secret (puede ser la de Meta Ads) con `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` | developers.facebook.com. Redirect: `https://api.TUDOMINIO/api/v1/social/oauth/callback/meta` | Plataforma | Opcional |
| Redes: X | Client ID (+ secret si la app es confidencial), OAuth 2.0 con `tweet.read tweet.write users.read offline.access` | [developer.x.com](https://developer.x.com). Redirect: `https://api.TUDOMINIO/api/v1/social/oauth/callback/x` | Plataforma | Opcional |
| IA (Anthropic, OpenAI, Google, Groq) | API key de cada proveedor | La consola de cada uno ([integraciones/ia.md](./integraciones/ia.md#proveedores-y-claves)) | **Cada tienda** (Configuración → Inteligencia artificial) | Opcional. Sin clave cargada, la IA está apagada en esa tienda |
| Mercado Pago de la tienda | Nada: un click | Panel → Configuración → Medios de pago (OAuth) | Tienda | Por tienda |
| Payway | site_id + clave pública + clave privada (distintas en sandbox y producción) | Alta comercial con Payway. Se cargan en Configuración → Medios de pago → Payway | Tienda | Opcional |
| Mercado Libre de la tienda | Nada: un click | Configuración → Mercado Libre (OAuth) | Tienda | Opcional |
| WhatsApp Cloud API | Phone Number ID + token permanente + plantillas aprobadas | developers.facebook.com, producto WhatsApp; token de system user en Meta Business | Tienda | Opcional |
| Telegram | Bot token + canal | El comercio crea el bot con @BotFather, lo hace admin del canal y lo carga en Redes → Cuentas | Tienda | Opcional |
| ARCA | CUIT + certificado (el panel arma el CSR) + punto de venta | ARCA con clave fiscal; el asistente de Configuración → Facturación guía | Tienda | Para facturar |
| Correo Argentino (MiCorreo) | userToken + passwordToken (TEST y PROD separados) + customerId | Cuenta en [MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) y credenciales por su formulario de contacto | Tienda | Opcional |
| Andreani | Usuario y clave de la API, número de cliente, contratos (domicilio y/o sucursal), sucursal de origen | Alta comercial con Andreani | Tienda | Opcional |
| Zipnova | API token + secret + account ID | Panel de Zipnova → Configuración → Integraciones. Para probar, pedile a soporte el modo "testing": fuera de él, cada envío consume saldo real | Tienda | Opcional |

## 2. Variables de la API

La API lee `backend/src/Api/appsettings.json`, encima
`appsettings.Development.json` en desarrollo, y encima las variables de
entorno. Una clave `Seccion:Clave` se pasa como variable `Seccion__Clave`
(doble guion bajo; los arrays, `Seccion__Clave__0`).

**En desarrollo**, los defaults de `appsettings*.json` alcanzan para correr
todo. Para probar una integración, exportá la variable en la consola antes de
`.\dev-up.ps1` (la API hereda el entorno):

```powershell
$env:MercadoLibre__ClientId = '...'; $env:MercadoLibre__ClientSecret = '...'
.\dev-up.ps1
```

> `dotnet user-secrets` no funciona tal como está: `Api.csproj` no tiene
> `UserSecretsId`.

**En producción**, el servicio `api` de `infra/docker/docker-compose.stack.yml`
arma estas claves a partir del `.env.prod` (columna "En `.env.prod`").

### Base, red y arranque

| Clave | Para qué | Default / dev | En `.env.prod` |
| --- | --- | --- | --- |
| `ConnectionStrings:Default` | Postgres | `Host=127.0.0.1;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy` | Armada con `POSTGRES_PASSWORD` y `DB_MIN_POOL_SIZE` (default 5) |
| `Database:MigrateOnStartup` | Migrar al arrancar | `true` | Fija en `false`: `deploy.sh` corre `dotnet Api.dll migrate` antes del `up` |
| `Auth:RequireTwoFactorForAdmins` | Verificación en dos pasos obligatoria para quien es dueño o administrador de alguna tienda: sin ella no usa el panel (al entrar la configura). Ver `Api/Auth/TwoFactorRequirement` | `true` (dev: `false`, en `appsettings.Development.json`: el seed y el e2e entran con contraseña) | No se mapea (usa `true`) |
| `DataProtection:KeyPath` | Keyring que cifra todos los secretos de las tiendas | Vacío = `%LOCALAPPDATA%`. En Production es obligatoria (sin ella la API no arranca) | Fija en `/keys` (volumen `dpkeys`) |
| `Tenancy:PlatformBaseDomain` | Dominio base: las tiendas son `<sub>.<dominio>` | `localhost` | `STACK_DOMAIN` |
| `Cors:AllowedOrigins` | Orígenes extra (dominios propios de tiendas). Ya se aceptan el panel (`Admin:BaseUrl`), el dominio base y `<tienda>.<dominio>` (un nivel, sin los reservados de `Subdomain.cs` ni el host de `Media:PublicBaseUrl`); `localhost` y `*.localhost`, solo en Development. La sesión del panel solo vale desde el panel | `[]` | No se mapea (ver Pendientes) |
| `ForwardedHeaders:KnownNetworks` | CIDRs de los proxies en los que se confía para `X-Forwarded-For`; también marcan el tráfico interno del storefront, que no tiene techo global | `[]` | `TRUSTED_PROXY_CIDR_0..2` (default: los tres rangos privados) |
| `RateLimiting:GlobalPermitLimit` | Pedidos por minuto por IP | `300` (dev: `5000`, en `appsettings.Development.json`) | No se mapea (usa 300) |
| `RateLimiting:AuthPermitLimit` / `:PaymentsPermitLimit` | Intentos cada 5 min por IP y ruta: formularios públicos (login, registro, contacto, cupón, reseñas, "avisame"); pagos de la tienda | `10` / `15` | No se mapea |
| `RateLimiting:CheckoutContactPermitLimit` | Guardados del email del checkout (`POST /checkout/contact`) cada 5 min por IP | `30` (dev: `1000`) | No se mapea |
| `RateLimiting:CheckoutPermitLimit` | Armar (`POST /checkout`) y enviar (`/checkout/{id}/submit`) un checkout cada 10 min por IP y ruta (el id no cuenta: otra compra no da cupo nuevo). Holgado por el CGNAT de los celulares | `30` (dev: `1000`) | No se mapea |
| `RateLimiting:ShippingQuotePermitLimit` | Cotizaciones de envío (Correo, Zipnova, Andreani) cada 5 min por IP y carrier | `30` (dev: `1000`) | No se mapea |
| `RateLimiting:SearchPermitLimit` / `:TrackPermitLimit` | Por minuto por IP y ruta: búsqueda de la tienda (`products/search`, `products/suggest`, `search/log`) / beacon de visitas (`POST /track`). El storefront por la red interna no tiene cupo | `120` / `120` (dev: `5000`) | No se mapea |
| `RateLimiting:ShopSessionPermitLimit` / `:GoogleAuthPermitLimit` | Por IP y ruta: la sesión del comprador (`GET /shop/auth/me`) por minuto / "Entrar con Google" (`google/start` y `google/callback`) cada 5 min | `120` / `20` (dev: `5000` / `20`) | No se mapea |
| `RateLimiting:AccountMailsPerEmailPerHour` | Mails de la cuenta del comprador (activación, "ya tenés cuenta", cambio de contraseña, reenvío, confirmación del newsletter) por dirección y tienda, por hora. Pasado el tope el endpoint contesta igual y no manda nada. En memoria. El login del comprador, además, se bloquea 15 min por cuenta después de 10 contraseñas mal puestas (fijo, `ShopAuth.MaxFailedLogins`) | `3` | No se mapea |
| `Workers:Enabled` | Workers de polling (webhooks, campañas, etc.) | `true` | `WORKERS_ENABLED`: `true` en una sola instancia |
| `Sentry:Dsn` | Errores de la API | Vacío = apagado | `SENTRY_DSN_BACKEND` (y `Sentry:Environment` = `APP_ENV`) |

### Links públicos

| Clave | Para qué | Default / dev | En `.env.prod` |
| --- | --- | --- | --- |
| `PublicApiBaseUrl` | Base de los links de baja y de seguimiento de los emails | `http://localhost:5080` | `https://api.<STACK_DOMAIN>` |
| `Admin:BaseUrl` | Link al panel en el aviso de stock bajo y base de los links de los mails de la cuenta del panel (verificar el email, restablecer la contraseña, la bienvenida de alguien del equipo; nunca el `Origin` del pedido) | Vacío = el aviso de stock va sin link y los de la cuenta van a `https://admin.<dominio>` (en dev, `http://localhost:5173`) | `https://admin.${STACK_DOMAIN}` (lo arma el compose) |
| `Tenancy:PrimaryStoreSubdomain` | La tienda que atiende el dominio pelado, como `PRIMARY_STORE_SUBDOMAIN` de la tienda y el panel: sus links de cuenta van al dominio pelado y su comprador puede usar la sesión desde ahí (`Api/Shop/StoreOrigins`). Los links de la cuenta del comprador usan el dominio propio de la tienda, el pelado si es la principal, o `<tienda>.<dominio>` (en dev, con el puerto 3000) | Vacío (dev: también lee `PRIMARY_STORE_SUBDOMAIN`; sin ninguna, `localhost` vale para cualquier tienda solo en Development) | `PRIMARY_STORE_SUBDOMAIN` (lo arma el compose) |
| `Storefront:RevalidateUrl` / `:RevalidateSecret` | Aviso a la tienda para que un diseño publicado o un cambio de catálogo se vea al toque. Vacío = apagado: la tienda vence su caché sola en 30 a 60 s | Dev: `http://localhost:3000/internal/revalidate` / `dev-revalidate-secret` | URL fija `http://storefront:3000/internal/revalidate`; secreto `REVALIDATE_SECRET` (el mismo que usa la tienda) |

### Email y notificaciones

| Clave | Para qué | Default / dev | En `.env.prod` |
| --- | --- | --- | --- |
| `Email:ResendApiKey` | API key de Resend | Vacío = los mails se escriben en el log | `RESEND_API_KEY` |
| `Email:From` | Remitente (dominio verificado en Resend) | `Tiendafy <onboarding@resend.dev>` | `EMAIL_FROM` |
| `Email:WebhookSecret` | Firma (svix) del webhook de Resend | Vacío = el webhook responde 404 | `EMAIL_WEBHOOK_SECRET` |
| `Email:MaxRetries` | Reintentos de envío | `2` | No se mapea |
| `Notifications:EmailCostUsdPer1000` / `:WhatsAppCostUsdPerMessage` | Tarifas para el costo estimado del panel | `0.40` / `0.034` | No se mapea |
| `Captcha:Turnstile:SiteKey` / `:Secret` | Turnstile | Vacío = sin captcha (fuera de Development la API lo loguea como Critical al arrancar y `deploy.sh` avisa, sin frenar) | `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` |

### Medios de pago y canales

| Clave | Para qué | Default / dev | En `.env.prod` |
| --- | --- | --- | --- |
| `MercadoPago:ClientId` / `:ClientSecret` | App marketplace | Vacío | `MP_CLIENT_ID` / `MP_CLIENT_SECRET` |
| `MercadoPago:WebhookSecret` | Firma de los webhooks de pagos | Vacío | `MP_WEBHOOK_SECRET` |
| `MercadoPago:RedirectUri` | Callback del OAuth | Vacío. Con `dev-up.ps1 -Tunnel`, `<túnel>/api/v1/payments/mercadopago/callback` | `https://api.<STACK_DOMAIN>/api/v1/payments/mercadopago/callback` |
| `MercadoPago:PublicApiBaseUrl` | Base del `notification_url` de los pagos. Vacío = MP no avisa y la venta no se concilia sola | Vacío. Con `-Tunnel`, la URL del túnel | `https://api.<STACK_DOMAIN>` |
| `MercadoPago:AdminReturnUrl` | Adónde vuelve el navegador tras conectar | `http://localhost:5173/configuracion/medios-de-pago` | `https://admin.<STACK_DOMAIN>/configuracion/medios-de-pago` |
| `MercadoLibre:ClientId` / `:ClientSecret` | App de ML. Vacío = canal apagado | Vacío | `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` |
| `MercadoLibre:RedirectUri` / `:AdminReturnUrl` | OAuth y vuelta al panel | Vacío / `http://localhost:5173/configuracion/mercadolibre` | Derivadas de `STACK_DOMAIN` |
| `Authentication:Google:ClientId` / `:ClientSecret` | Login de compradores con Google. Vacío = botón oculto | Vacío | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `MetaAds:AppId` / `:AppSecret` | Meta Ads. Vacío = apagado | Vacío | `META_APP_ID` / `META_APP_SECRET` |
| `MetaAds:RedirectUri` / `:AdminReturnUrl` | OAuth y vuelta | Vacío / `http://localhost:5173/estadisticas/rentabilidad` | Derivadas de `STACK_DOMAIN` |
| `Social:Meta:AppId` / `:AppSecret` | Facebook e Instagram. Vacío = conector apagado | Vacío | `SOCIAL_META_APP_ID` / `SOCIAL_META_APP_SECRET` |
| `Social:X:ClientId` / `:ClientSecret` | X | Vacío | `SOCIAL_X_CLIENT_ID` / `SOCIAL_X_CLIENT_SECRET` |
| `Social:Meta:RedirectUri`, `Social:X:RedirectUri`, `Social:AdminReturnUrl` | OAuth y vuelta | Vacío / vacío / `http://localhost:5173/redes` | Derivadas de `STACK_DOMAIN` |
| `Ai:Disabled` | Palanca de emergencia: apaga la IA de todas las tiendas (hace falta reiniciar la API). Las claves son de cada tienda, no de plataforma | `false` | `AI_DISABLED` (el compose la pasa como `Ai__Disabled`) |
| `RateLimiting:AiPermitLimit` | Llamadas de IA por usuario y por ruta cada 5 minutos | `30` | Sin variable: default del código |
| `RateLimiting:AiJobsPermitLimit` | Trabajos masivos de IA por tienda por hora | `5` | Sin variable: default del código |
| `Fiscal:Endpoints:*` | URLs de WSAA, WSFEv1 y padrón (constancia de inscripción) de ARCA, en homologación y producción (cada tienda elige su ambiente) | Las oficiales, en el código | No hace falta tocarlas |

### Imágenes (storage S3)

| Clave | Para qué | Default / dev | En `.env.prod` |
| --- | --- | --- | --- |
| `Media:Endpoint` | API S3 | `http://localhost:9000` (MinIO) | `MEDIA_ENDPOINT` |
| `Media:PublicBaseUrl` | Base pública de las imágenes | `http://localhost:9000` | `MEDIA_PUBLIC_BASE_URL` |
| `Media:AccessKey` / `:SecretKey` | Credenciales | `minioadmin` / `minioadmin` | `MEDIA_ACCESS_KEY` / `MEDIA_SECRET_KEY` |
| `Media:Bucket` / `:PrivateBucket` | Bucket público y privado (adjuntos del chat, documentos) | `tiendafy-media` / `tiendafy-private` | `MEDIA_BUCKET` / `MEDIA_PRIVATE_BUCKET` |
| `Media:Region` | Región de firma (`auto` en R2) | Sin setear | `MEDIA_REGION` (default `auto`) |
| `Media:BucketInPublicUrl` | La URL pública incluye el bucket (MinIO, S3 path-style) | `true` | `MEDIA_BUCKET_IN_PUBLIC_URL` (default `false`, R2 con dominio propio) |
| `Media:EnsureBucketOnStartup` | Crear el bucket al arrancar | `true` | `MEDIA_ENSURE_BUCKET` (default `false`: R2 no soporta `PutBucketPolicy`, los buckets se crean a mano) |

En Production la API no arranca si `Media:Endpoint` o `Media:PublicBaseUrl`
apuntan a localhost o si las credenciales son `minioadmin`.

## 3. Variables de los frontends

**Tienda** (`storefront/.env.local` en dev, ver `storefront/.env.example`; en
prod, el entorno del contenedor). Las `PUBLIC_*` se leen al arrancar y se
inyectan en el HTML (`storefront/src/lib/runtime.ts`): la misma imagen sirve
para cualquier ambiente. Las `NEXT_PUBLIC_*` quedan como respaldo de
desarrollo porque Next las hornea al compilar.

| Variable | Para qué | Dev | Prod (`docker-compose.stack.yml`) |
| --- | --- | --- | --- |
| `API_URL` | API para el render del servidor | `http://localhost:5080` | `http://api:5080` (red interna) |
| `PUBLIC_API_URL` (o `NEXT_PUBLIC_API_URL`) | API para el navegador | `http://localhost:5080` | `https://api.<STACK_DOMAIN>` |
| `PUBLIC_ADMIN_ORIGIN` (o `NEXT_PUBLIC_ADMIN_ORIGIN`) | Link al panel y origen exacto que acepta la vista previa del editor | `http://localhost:5173` | `https://admin.<STACK_DOMAIN>` |
| `PUBLIC_SENTRY_DSN` (o `NEXT_PUBLIC_SENTRY_DSN`) | Errores de la tienda | Vacío | `SENTRY_DSN_STOREFRONT` |
| `APP_ENV` | Ambiente en Sentry | `NODE_ENV` | `APP_ENV` |
| `PLATFORM_BASE_DOMAIN` | Dominio base para resolver la tienda por host | `localhost` | `STACK_DOMAIN` |
| `PRIMARY_STORE_SUBDOMAIN` | Qué tienda atiende el dominio pelado | Sin setear = "tienda no encontrada" en `localhost:3000` (`.env.example` trae `puenteoriente`) | `PRIMARY_STORE_SUBDOMAIN` |
| `REVALIDATE_SECRET` | Secreto de `/internal/revalidate` (el mismo que `Storefront:RevalidateSecret` de la API) | Sin setear = `dev-revalidate-secret` | `REVALIDATE_SECRET`; vacío = ruta apagada |

**Panel** (`admin/.env.local` en dev, ver `admin/.env.example`; en prod, el
contenedor escribe `/config.js` al arrancar con `admin/docker-config.sh`, así
que no hace falta recompilar):

| Variable | Para qué | Dev | Prod (`docker-compose.stack.yml`) |
| --- | --- | --- | --- |
| `VITE_API_URL` | API | `http://localhost:5080` | `https://api.<STACK_DOMAIN>` |
| `VITE_STOREFRONT_ORIGIN` | Plantilla de la URL de cada tienda (`{sub}` = subdominio) | `http://{sub}.localhost:3000` (`dev-up.ps1` la ajusta si cambia el puerto) | `https://{sub}.<STACK_DOMAIN>` |
| `VITE_PRIMARY_STORE_SUBDOMAIN` | La tienda que vive en el dominio pelado | Vacío | `PRIMARY_STORE_SUBDOMAIN` |
| `VITE_SENTRY_DSN` | Errores del panel | Vacío | `SENTRY_DSN_ADMIN` |
| `VITE_BRAND_NAME` | Marca que muestra el panel | `Tiendafy` | `BRAND_NAME` (vacío = Tiendafy) |
| `APP_ENV` | Ambiente en Sentry (en el contenedor; en dev sale del modo de Vite) | `development` | `APP_ENV` |

## 4. Producción: los archivos `.env`

Tres plantillas; se copian sin el `.example`, se completan y nunca se commitean:

| Plantilla | Qué configura |
| --- | --- |
| `infra/edge/.env.example` → `infra/edge/.env` | El Caddy del borde, uno por servidor: `ACME_EMAIL`, `TIENDAFY_DOMAIN`, `CLOUDFLARE_API_TOKEN` (certificados comodín por DNS-01) |
| `infra/docker/.env.prod.example` → `.env.prod` | El stack de producción |
| `infra/docker/.env.staging.example` → `.env.staging` | El mismo stack con credenciales de prueba, otros puertos y sin backup |

Los dos stacks usan el mismo `infra/docker/docker-compose.stack.yml`. Además de
lo que figura en las tablas de arriba, el `.env` de cada stack define
`COMPOSE_PROJECT_NAME`, `APP_ENV`, `REGISTRY` y `TAG` (imágenes de GHCR; en prod
`deploy.sh` exige un tag concreto), los puertos `API_PORT`, `WEB_PORT` y
`ADMIN_PORT` (tienen que coincidir con `infra/edge/sites/tiendafy.caddy`), los
techos `*_MEM_LIMIT`, `BACKUP_REPLICAS` y la copia fuera del servidor
(`OFFSITE_*`, ver [despliegue.md](./despliegue.md#copia-fuera-del-servidor)).

> El volumen `dpkeys` guarda las claves con las que están cifrados todos los
> secretos de las tiendas (Mercado Pago, Payway, WhatsApp, carriers,
> certificados ARCA). Si se pierde, cada tienda tiene que reconectar todo. El
> backup diario (`pg-backup`) lo incluye.

Paso a paso para levantar el servidor: [publicar-en-la-vps.md](./publicar-en-la-vps.md).
Usuarios de desarrollo: [usuarios-de-prueba.md](./usuarios-de-prueba.md).

## Pendientes

- Pendiente: `Cors:AllowedOrigins` no se pasa en `docker-compose.stack.yml` (un
  valor vacío podría leerse como un origen permitido). Hace falta recién con el
  primer dominio propio de una tienda, y ese trabajo incluye servir la API
  desde el mismo dominio (ver [despliegue.md](./despliegue.md), Seguridad).
