# Deploy a producción

Guía de variables de entorno e infraestructura. **En dev no necesitás nada de
esto** — todo cae a `localhost` por defecto. Esto es solo para producción.

## Arquitectura

3 apps + infra:

- **backend** (`backend/src/Api`, .NET 10) → API HTTP. Detrás de un reverse
  proxy/ingress que termina TLS (el compose de prod la corre en `:5080`; `:8080` es el default del Dockerfile).
- **storefront** (Next.js) → tiendas de los merchants + landing de plataforma.
  Resuelve por host: `tudominio.com` = landing, `*.tudominio.com` = tienda.
- **admin** (Vite SPA estática) → panel del merchant.
- **infra**: PostgreSQL (+ backup diario) y Caddy; media en S3/MinIO externo.

## Variables de entorno

### Backend (`ASPNETCORE_ENVIRONMENT=Production`)
Se pueden pasar como env vars (doble guion bajo = anidado) o `appsettings.Production.json`.

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `ConnectionStrings__Default` | `Host=pg;Port=5432;Database=tiendafy;Username=...;Password=...` | **Requerido** |
| `Tenancy__PlatformBaseDomain` | `tudominio.com` | Sin esto resuelve mal los hosts |
| `Cors__AllowedOrigins__0` | `https://midominio-propio.com` | Extra (localhost y `*.PlatformBaseDomain` ya se permiten) |
| `DataProtection__KeyPath` | `/keys` | **Volumen persistente.** Sin esto, los tokens MP encriptados se pierden al reiniciar |
| `MercadoPago__ClientId` / `__ClientSecret` | — | App de MercadoPago (marketplace) |
| `MercadoPago__RedirectUri` | `https://api.tudominio.com/api/v1/payments/mercadopago/callback` | Debe coincidir con la app MP |
| `MercadoPago__WebhookSecret` | — | Para validar la firma del webhook |
| `MercadoPago__PublicApiBaseUrl` | `https://api.tudominio.com` | URL pública para webhooks |
| `MercadoPago__AdminReturnUrl` | `https://admin.tudominio.com/configuracion/medios-de-pago` | Vuelta tras OAuth |
| `Email__ResendApiKey` | `re_...` | Sin esto, los emails solo se loguean (reset de contraseña, verificación, pedidos) |
| `Database__MigrateOnStartup` | `false` | Multi-instancia: desactivá las migraciones en boot y corrélas como paso de deploy |
| `Sentry__Dsn` | `https://…@…ingest.sentry.io/…` | Error-tracking backend. Vacío = Sentry desactivado |
| `Email__From` | `Tienda <hola@tudominio.com>` | Remitente verificado en Resend |
| `Authentication__Google__ClientId` / `__ClientSecret` | — | Opcional (login Google del comprador) |
| `Captcha__Turnstile__SiteKey` / `__Secret` | — | Opcional. Cloudflare Turnstile anti-bots en contacto y login/signup. Vacío = sin captcha |
| `Notifications__EmailCostUsdPer1000` | `0.40` | Opcional. Tarifa de referencia del panel "Uso del mes" (emails) |
| `Notifications__WhatsAppCostUsdPerMessage` | `0.034` | Opcional. Ídem para WhatsApp |

Correo Argentino no necesita env vars: las credenciales MiCorreo son **por
tienda** y viven cifradas en la DB (las carga el merchant desde el admin).

Integraciones opcionales de plataforma (vacío = apagado, el panel lo dice):
`Meli__*` (canal Mercado Libre), `MetaAds__*` (ROAS real) y `Social__Meta__*` /
`Social__X__*` (redes sociales; Telegram no necesita credenciales). El detalle
de cada una — qué conseguir y dónde — está en
[CONFIGURACION.md](./CONFIGURACION.md); el compose de prod ya mapea todas desde
`.env.prod`.

### Storefront (Next.js)
Ver `storefront/.env.example`. Claves: `API_URL`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_ADMIN_ORIGIN` (**requerida en prod** —
valida el origin del postMessage del editor de temas), `PLATFORM_BASE_DOMAIN`.

### Admin (Vite)
Ver `admin/.env.example`. Clave: `VITE_API_URL` (se hornea en el build estático).

## Reverse proxy / TLS

La API confía en `X-Forwarded-Proto`/`X-Forwarded-For` en prod (ForwardedHeaders)
y manda HSTS. El proxy (nginx / Caddy / ingress) termina TLS y redirige HTTP→HTTPS.
No hay redirect en la app (evita loops).

**Wildcard DNS + TLS**: apuntá `*.tudominio.com` al storefront y conseguí un
cert wildcard (o usá Caddy/cert-manager para emitir on-demand). Para **dominios
propios de merchants**, el proxy debe resolver SSL por dominio (Caddy on-demand TLS
o cert-manager) y agregarlos a `Cors__AllowedOrigins`.

## Build (Docker)

Cada app tiene su `Dockerfile`. Los frontends usan el workspace pnpm (necesitan
`shared/`), por eso el contexto de build es la **raíz del repo**:

```bash
docker build -f backend/Dockerfile      -t tiendafy-api .
docker build -f storefront/Dockerfile   -t tiendafy-store .
docker build -f admin/Dockerfile        -t tiendafy-admin .
```

Notas de build (ya resueltas en los Dockerfiles):
- **API**: user no-root `app` de las imágenes .NET 8+ (`USER $APP_UID`); cache
  mount de NuGet (cambiar código no re-descarga paquetes); `libfontconfig1` +
  fuentes en el runtime para los PDFs de facturas (QuestPDF/Skia).
- **Frontends**: corepack usa el pnpm pinneado en el `packageManager` del
  package.json raíz. Capa de deps con `pnpm fetch` (solo lockfile) + cache mount
  del store, e install `--frozen-lockfile --offline --filter ./app...` (el
  equivalente estricto de `npm ci`, filtrado al workspace que se buildea).
- **Storefront**: runtime = output **standalone** de Next (server.js +
  node_modules podados por file-tracing) — la imagen no lleva el repo.
- Los `NEXT_PUBLIC_*` / `VITE_*` se hornean en build-time → `--build-arg`.
- **pnpm**: los build scripts nativos aprobados están en `pnpm-workspace.yaml`
  (`allowBuilds`/`onlyBuiltDependencies`), si no `--frozen-lockfile` falla.
- Cada imagen tiene su **`Dockerfile.dockerignore`** (BuildKit): el contexto solo
  lleva lo que esa imagen necesita, y repite las exclusiones de secretos porque
  reemplaza al `.dockerignore` raíz.

### Producción (single-host)

```bash
cp infra/docker/.env.prod.example infra/docker/.env.prod   # completar
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --build
```

Caddy termina TLS (plataforma + subdominios + dominios propios con on-demand
TLS validado contra `/tenants/resolve`), `pg-backup` hace `pg_dump` diario, y el
volumen `dpkeys` guarda el keyring de DataProtection (backupearlo junto a la DB).
CI publica las imágenes en GHCR (`.github/workflows/docker-release.yml`).

**Deploy de una versión nueva** (las migraciones son un paso explícito, NO
corren al boot en prod — evita carreras entre réplicas):

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod pull
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod run --rm api dotnet Api.dll migrate
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d
curl -s https://api.TU_DOMINIO/version   # ¿corre el sha que esperabas?
```

### Restaurar un backup (ensayado — no improvisar en la emergencia)

Los dumps diarios quedan en `infra/docker/backups/` (formato custom de pg_dump,
retención 14 días). Restaurar:

```bash
# 1. Copiar el dump adentro del contenedor de postgres
docker cp infra/docker/backups/tiendafy-YYYYMMDD-HHMM.dump tiendafy-prod-postgres-1:/tmp/r.dump
# 2. Crear una DB de verificación y restaurar ahí (NUNCA pisar tiendafy directo)
docker exec tiendafy-prod-postgres-1 createdb -U tiendafy tiendafy_restore
docker exec tiendafy-prod-postgres-1 pg_restore -U tiendafy -d tiendafy_restore /tmp/r.dump
# 3. Verificar (conteo de tablas y de tenants)
docker exec tiendafy-prod-postgres-1 psql -U tiendafy -d tiendafy_restore -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'; SELECT count(*) FROM tenants;"
# 4. Si está OK y hay que promoverla: renombrar DBs (con la API apagada)
```

Recordá: el volumen `dpkeys` (keyring de DataProtection) se backupea aparte —
sin él, los tokens MP y certificados ARCA cifrados son irrecuperables.

### Correr TODO el sistema en contenedores (local)

Overlay que suma las 3 apps a la infra, sin duplicarla:

```bash
docker compose -f infra/docker/docker-compose.dev.yml \
               -f infra/docker/docker-compose.app.yml up -d --build
```

o, en Windows, un solo comando:  `./dev-up.ps1 -Docker`  (y `./dev-down.ps1 -Docker`).

La API (`ASPNETCORE_ENVIRONMENT=Development`) migra sola al arrancar y apunta a
`postgres`/`minio` por nombre de servicio; el storefront hace SSR contra `api:8080`
y el browser pega a `localhost:5080`. Para el día a día de desarrollo conviene el
modo **nativo** (`./dev-up.ps1`, con hot-reload); el full-docker es para demo/smoke.

## Seguridad (hecho vs. proxy vs. roadmap)

**Ya en la app:**
- **Aislamiento multi-tenant**: toda escritura admin y **toda lectura privada**
  (orders, customers, stats, coupons, inventory, email-templates, pages, MP
  connection, export/import) exige sesión + membresía del tenant. Las lecturas
  públicas del storefront (products, pages publicadas, theme, orders/{id}) quedan
  abiertas a propósito. La sesión del comprador queda atada a su tienda (no se
  reusa el bearer cambiando `X-Tenant-Id`).
- **Rate limiting** (`AddRateLimiter`): global 300/min por IP + estricto 10/5min por
  IP y endpoint en login/registro (admin y shop), contacto y validación de cupón.
  ⚠️ El límite es **por instancia**. Con varias réplicas, poné el throttling también
  en el proxy (nginx `limit_req` / Cloudflare) o un store distribuido.
- **SSRF**: la importación de imágenes por URL solo busca hosts públicos (bloquea
  loopback, rangos privados y `169.254.169.254`).
- **OAuth Google**: se verifica firma + `aud` + `exp` del `id_token`; el redirect
  post-login solo apunta a destinos propios (anti open-redirect/robo de token).
- **Uploads**: validación por *magic bytes* además del content-type.
- **Sesión admin**: cookie `HttpOnly` + `SameSite=Lax` + `Secure` (forzado en prod).
- **Sesión comprador**: cookie `HttpOnly` por-tenant (`shop_{tenantId}`), `SameSite=Lax`,
  `Secure` en https. **Ya no usa `localStorage`** ni viaja el token por la URL del
  OAuth. El front pega con `credentials: 'include'`.
- **CSS del tema**: `customCss` se sanea al guardar (quita `<`, `@import`,
  `expression()`, `javascript:`…) para que no rompa el `<style>` e inyecte HTML/JS.
- **CSRF**: las escrituras con cookie exigen el header custom `X-Tenant-Id` (no
  enviable por un form cross-site sin preflight CORS, que no permitimos) **y** la
  cookie es `SameSite=Lax` → doble defensa. No usamos tokens CSRF dedicados.

**Debe poner el proxy / hosting:**
- Headers de seguridad para el **admin** (Vite estático). Ya hay un
  `admin/public/_headers` (Netlify/Cloudflare Pages) y un `<meta>` CSP en `index.html`.
  Para **nginx**, agregá en el `server` del admin:
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  ```
  El **storefront** (Next) ya emite CSP/nosniff/referrer vía `next.config.ts` (sin
  `X-Frame-Options` porque el editor lo previsualiza en iframe).
- HTTPS obligatorio (redirect HTTP→HTTPS) y puertos de DB cerrados a internet (VPC).
- **Rotación de secretos**: DataProtection **ya rota** sus llaves solo (cada 90 días,
  conserva las viejas para descifrar) si `DataProtection__KeyPath` es persistente.
  Tokens MP: re-OAuth del merchant. DB/Resend/Turnstile: rotá vía secrets manager
  (AWS Secrets Manager / Vault) y redeploy.

**Decisiones / roadmap pendientes:**
- **MFA/2FA** para admins (TOTP/WebAuthn) — feature de producto.
- **CORS multi-tenant**: el API refleja `*.PlatformBaseDomain` con credenciales
  porque el storefront vive en subdominios. Es seguro mientras **nosotros** sirvamos
  el storefront ahí (el merchant no inyecta JS propio; su `customCss` es solo CSS
  saneado). Aislamiento total = servir las tiendas en un **dominio registrable
  aparte** del admin/API (decisión de infra, modelo `myshopify.com`).
- **PII en reposo** (teléfono/dirección): cifrado a nivel columna (DataProtection).
- **Bucket de media** es público de solo-lectura (ok para fotos de productos). Si se
  suben **documentos privados**, pasar a *signed URLs* y bucket privado.
