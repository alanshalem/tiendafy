# Deploy: staging y producción

Guía de variables de entorno e infraestructura. **En dev no necesitás nada de
esto** — todo cae a `localhost` por defecto.

## Dos ambientes en el servidor

| | Producción | Staging |
|---|---|---|
| Dominio | `tudominio.com` | `stg.tudominio.com` |
| Variables | `infra/docker/.env.prod` | `infra/docker/.env.staging` |
| Proyecto compose | `tiendafy-prod` | `tiendafy-staging` |
| Base de datos | propia, con backup diario | propia, descartable |
| Bucket de imágenes | `tiendafy-media` | `tiendafy-media-stg` |
| Mercado Pago | credenciales reales | credenciales de prueba |
| Emails | Resend | sin API key: se escriben en el log |
| Indexación | sí | `noindex` en todas las respuestas |

Los dos ambientes usan **el mismo** `docker-compose.stack.yml`. Que sea el
mismo archivo no es prolijidad: si staging se define aparte, se va pareciendo
cada vez menos a producción y deja de servir para probar.

El borde (Caddy, puertos 80/443) es **uno solo para todo el servidor**, en
`infra/edge/`: atiende a Tiendafy y a cualquier otro sistema de la máquina,
un archivo por sistema en `infra/edge/sites/`. Cada stack publica sus puertos
solo en `127.0.0.1` (`API_PORT`, `WEB_PORT`, `ADMIN_PORT` de su `.env`) y Caddy
los distingue por dominio. Para un servidor que ya tiene otros sistemas
andando, la guía paso a paso (con vuelta atrás) es
[PUBLICAR-EN-LA-VPS.md](./PUBLICAR-EN-LA-VPS.md).

```bash
# Una sola vez
cp infra/edge/.env.example           infra/edge/.env
cp infra/docker/.env.prod.example    infra/docker/.env.prod
cp infra/docker/.env.staging.example infra/docker/.env.staging   # si hay staging
chmod 600 infra/edge/.env infra/docker/.env.*                    # tienen secretos
docker compose -f infra/edge/docker-compose.yml up -d --build

# Cada deploy (lo hace GitHub Actions, o vos a mano)
./infra/deploy.sh staging sha-a1b2c3d
./infra/deploy.sh prod    sha-a1b2c3d   # el MISMO tag que probaste
```

### La misma imagen en los dos ambientes

Las imágenes **no tienen ambiente**: la config entra al arrancar el contenedor,
no al compilar. El admin escribe su `config.js` en el arranque
(`admin/docker-config.sh`) y el storefront inyecta la config en el HTML de cada
request (`storefront/src/lib/runtime.ts`, variables `PUBLIC_*` sin el prefijo
`NEXT_PUBLIC_`, que Next hornearía al compilar).

Por eso promover es volver a desplegar el mismo tag, no volver a construir: lo
que sale a producción son exactamente los bytes que se probaron en staging.

### Refrescar staging con datos de producción

```bash
./infra/refresh-staging.sh          # toma el último backup de prod
```

Restaura el backup en staging y le pasa `infra/sql/anonymize-staging.sql`, que
reemplaza los datos de contacto por direcciones `@example.invalid` y borra las
credenciales de cobro y facturación. Si algo queda sin anonimizar, el script
**no levanta staging**. Restaurar producción sin anonimizar es la forma más
común de mandarle un email a un cliente real desde un ambiente de prueba.

## Arquitectura

3 apps + infra:

- **backend** (`backend/src/Api`, .NET 10) → API HTTP. Detrás de un reverse
  proxy/ingress que termina TLS (el compose de prod la corre en `:5080`; `:8080` es el default del Dockerfile).
- **storefront** (Next.js) → tiendas de los merchants + landing de plataforma.
  Resuelve por host: `tudominio.com` = landing, `*.tudominio.com` = tienda.
- **admin** (Vite SPA estática) → panel del merchant.
- **infra**: PostgreSQL (+ backup diario) por ambiente y un Caddy compartido;
  imágenes en Cloudflare R2 (o cualquier S3-compatible).

## Variables de entorno

### Backend (`ASPNETCORE_ENVIRONMENT=Production`)
Se pueden pasar como env vars (doble guion bajo = anidado) o `appsettings.Production.json`.

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `ConnectionStrings__Default` | `Host=pg;Port=5432;Database=tiendafy;Username=...;Password=...` | **Requerido** |
| `Tenancy__PlatformBaseDomain` | `tudominio.com` | Sin esto resuelve mal los hosts |
| `Cors__AllowedOrigins__0` | `https://midominio-propio.com` | Extra (localhost y `*.PlatformBaseDomain` ya se permiten) |
| `DataProtection__KeyPath` | `/keys` | **Volumen persistente.** Sin esto, los tokens MP encriptados se pierden al reiniciar |
| `Media__Endpoint` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | **Requerido.** Storage S3-compatible (R2, S3, MinIO propio). La API no arranca en Producción si apunta a localhost |
| `Media__PublicBaseUrl` | `https://img.tudominio.com` | **Requerido.** Dominio desde el que el comprador descarga las imágenes |
| `Media__AccessKey` / `__SecretKey` | — | **Requerido.** Token con lectura/escritura sobre los dos buckets. `minioadmin` en Producción = no arranca |
| `Media__Region` | `auto` | R2 firma con `auto`. MinIO la ignora |
| `Media__BucketInPublicUrl` | `false` | `false` con dominio propio de R2 (objeto en la raíz); `true` en MinIO/S3 path-style (`{base}/{bucket}/{key}`) |
| `Media__EnsureBucketOnStartup` | `false` | R2 no soporta `PutBucketPolicy`: los buckets se crean a mano una vez |
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

### Imágenes de las tiendas (storage)

El backend habla S3 con cualquier proveedor compatible. **Cloudflare R2** es el
default recomendado: el egress es gratis y las imágenes de una tienda se leen
mil veces por cada vez que se suben, así que es el único costo que crecería con
las ventas. Además le saca disco y ancho de banda al VPS.

Alta, una sola vez:

1. Cloudflare → R2 → crear dos buckets: `tiendafy-media` y `tiendafy-private`.
2. Atar un dominio propio (ej. `img.tudominio.com`) **solo al de media**. Ese es
   el que hace público el bucket y el que le da CDN. El privado NO se expone:
   los adjuntos de chat se sirven con URLs firmadas de vida corta.
3. Crear un API token de R2 con permiso de lectura/escritura sobre esos dos
   buckets (no uses uno de cuenta entera).
4. Completar `MEDIA_*` en `.env.prod`.

Con MinIO propio en vez de R2: `Media__BucketInPublicUrl=true`,
`Media__EnsureBucketOnStartup=true` y **exponelo por un dominio público**
(ej. `media.tudominio.com` detrás de Caddy). No alcanza con `localhost:9000`:
en producción `next/image` bloquea los upstreams que resuelven a IP privada y
todas las fotos de la tienda quedan rotas.

Migrar de un proveedor a otro es copiar los objetos entre buckets: las URLs
guardadas en la base apuntan al dominio viejo, así que hay que mantenerlo vivo
o reescribirlas.

Correo Argentino no necesita env vars: las credenciales MiCorreo son **por
tienda** y viven cifradas en la DB (las carga el merchant desde el admin).

Integraciones opcionales de plataforma (vacío = apagado, el panel lo dice):
`Meli__*` (canal Mercado Libre), `MetaAds__*` (ROAS real) y `Social__Meta__*` /
`Social__X__*` (redes sociales; Telegram no necesita credenciales). El detalle
de cada una — qué conseguir y dónde — está en
[CONFIGURACION.md](./CONFIGURACION.md); el compose de prod ya mapea todas desde
`.env.prod`.

### Storefront (Next.js)
En el servidor, todo en runtime: `API_URL` (la API por la red interna),
`APP_ENV`, y las que viajan al navegador —
`PUBLIC_API_URL`, `PUBLIC_ADMIN_ORIGIN` (link al panel y validación del origin
del editor de temas), `PUBLIC_SENTRY_DSN`. `REVALIDATE_SECRET` (en `.env.prod`) lo
comparten la API y el storefront: con él, publicar un diseño o cambiar el
catálogo se ve en la tienda al toque; vacío, tarda 30 a 60 s.

Las `NEXT_PUBLIC_*` de `storefront/.env.example` siguen existiendo para
desarrollo: Next las hornea al compilar, así que en el servidor no se leen.

### Admin (Vite)
En el servidor: `APP_ENV`, `VITE_API_URL`, `VITE_STOREFRONT_ORIGIN`,
`VITE_SENTRY_DSN` — leídas **al arrancar el contenedor**, no horneadas. En
desarrollo salen de `admin/.env.local` como siempre.

## Reverse proxy / TLS

La API confía en `X-Forwarded-Proto`/`X-Forwarded-For` en prod (ForwardedHeaders)
y manda HSTS. El proxy (nginx / Caddy / ingress) termina TLS y redirige HTTP→HTTPS.
No hay redirect en la app (evita loops).

**Wildcard DNS + TLS**: `*.tudominio.com` y `*.stg.tudominio.com` apuntan al
servidor. Los certificados comodín salen por **DNS-01 con el plugin de
Cloudflare** (`infra/edge/Dockerfile`), con un token acotado a la zona: así una
tienda nueva funciona desde el primer visitante, sin emitir un certificado en el
momento — que además choca contra el límite semanal de Let's Encrypt cuando hay
varias tiendas.

Para **dominios propios de merchants** sigue el on-demand, validado contra
`/tenants/resolve` de la API de producción, y hay que agregarlos a
`Cors__AllowedOrigins`. Si tu DNS no está en Cloudflare, Caddy tiene plugins
para otros proveedores; el resto de la configuración no cambia.

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
- **Frontends**: se instala con npm el pnpm pinneado en el `packageManager`
  del package.json raíz (Node 25+ ya no trae corepack). Capa de deps con
  `pnpm fetch` (solo lockfile) + cache mount del store, e install `--frozen-lockfile --offline --filter ./app...` (el
  equivalente estricto de `npm ci`, filtrado al workspace que se buildea).
- **Storefront**: runtime = output **standalone** de Next (server.js +
  node_modules podados por file-tracing) — la imagen no lleva el repo.
- Las imágenes NO llevan URLs de ambiente: la config entra en runtime (ver
  "La misma imagen en los dos ambientes"). Los `--build-arg` de `NEXT_PUBLIC_*`
  y `VITE_*` quedan solo para builds sueltos de desarrollo.
- **pnpm**: los build scripts nativos aprobados están en `pnpm-workspace.yaml`
  (`allowBuilds`/`onlyBuiltDependencies`), si no `--frozen-lockfile` falla.
- Cada imagen tiene su **`Dockerfile.dockerignore`** (BuildKit): el contexto solo
  lleva lo que esa imagen necesita, y repite las exclusiones de secretos porque
  reemplaza al `.dockerignore` raíz.

### Qué corre en el servidor

```
edge               caddy (80/443, red del servidor)   ← el único que da la cara
├── tiendafy-prod      api 127.0.0.1:5080, storefront :3000, admin :8090 (+ postgres, pg-backup)
├── tiendafy-staging   lo mismo en :5081, :3002, :8091 (opcional)
└── otros sistemas     lo que escuche en 127.0.0.1 (ver infra/edge/sites/)
```

Caddy usa la red del propio servidor (no una de Docker) para ver la IP real
de cada visitante y llegar a todo lo que escucha en `127.0.0.1`, esté o no en
Docker. Los límites de memoria de cada `.env` evitan que staging deje sin RAM
a producción.

CI publica las imágenes en GHCR y dispara los deploys
(`.github/workflows/docker-release.yml`): staging automático en cada push a
`main` (solo si el repo tiene la variable `STAGING_DOMAIN`), producción **con
aprobación manual** (GitHub → Settings → Environments → production → Required
reviewers).

**Deploy a mano** (las migraciones son un paso explícito, NO corren al boot):

```bash
./infra/deploy.sh prod sha-a1b2c3d
curl -s https://api.TU_DOMINIO/version   # ¿corre el sha que esperabas?
```

**Volver atrás**: desplegar el tag anterior. Las imágenes viejas siguen en GHCR.

```bash
./infra/deploy.sh prod sha-EL_ANTERIOR
```

Ojo: eso vuelve el código, no la base. Una migración que borra datos no se
deshace con un rollback de imagen — para eso está el backup.

### Restaurar un backup (ensayado — no improvisar en la emergencia)

Los dumps diarios quedan en `infra/docker/backups/<ambiente>/` (formato custom de pg_dump,
retención 14 días). Restaurar:

```bash
# 1. Copiar el dump adentro del contenedor de postgres
docker cp infra/docker/backups/prod/tiendafy-YYYYMMDD-HHMM.dump tiendafy-prod-postgres-1:/tmp/r.dump
# 2. Crear una DB de verificación y restaurar ahí (NUNCA pisar tiendafy directo)
docker exec tiendafy-prod-postgres-1 createdb -U tiendafy tiendafy_restore
docker exec tiendafy-prod-postgres-1 pg_restore -U tiendafy -d tiendafy_restore /tmp/r.dump
# 3. Verificar (conteo de tablas y de tenants)
docker exec tiendafy-prod-postgres-1 psql -U tiendafy -d tiendafy_restore -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'; SELECT count(*) FROM tenants;"
# 4. Si está OK y hay que promoverla: renombrar DBs (con la API apagada)
```

Recordá: el volumen `dpkeys` (keyring de DataProtection) se backupea aparte —
sin él, los tokens MP y certificados ARCA cifrados son irrecuperables.

### Cambiar de major de Postgres (16 → 18)

Los datos de una major no arrancan con otra, así que no es un deploy más:
cuando el compose pide otra major que la que corre, `deploy.sh` se frena y
pide este paso. `infra/pg-upgrade.sh` lo hace en unos segundos de corte
(probado con una copia de la base de desarrollo: 108 tablas, 30 s):

```bash
cd /srv/tiendafy && git pull
./infra/pg-upgrade.sh prod          # ensayo, copia, cambio y control de filas
./infra/deploy.sh prod sha-XXXXXXX  # levanta la API y la tienda de nuevo
```

1. **Ensayo sin cortar nada**: copia la base en caliente y la restaura en un
   Postgres nuevo descartable. Si algo no entra (una fila huérfana hace fallar
   una clave foránea), termina ahí y todo sigue andando como estaba.
2. Frena la API, la tienda y el backup; cuenta las filas de cada tabla y hace
   el dump definitivo en `infra/docker/backups/pg-upgrade-<ambiente>-<fecha>/`.
3. Reemplaza el contenedor por el de la major nueva con un volumen **nuevo**
   (`pgdata<major>`). El viejo no se toca: es la vuelta atrás.
4. Restaura, recalcula estadísticas y compara los conteos de antes y después.
   Si no coinciden, se frena y explica cómo volver.

**Si el ensayo falla por filas huérfanas**, el error dice la clave foránea.
Para verlas todas (no borra nada):

```bash
docker exec -i tiendafy-prod-postgres-1 psql -U tiendafy -d tiendafy -tA <<'SQL'
SELECT format('SELECT %L, count(*) FROM %s c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I) HAVING count(*) > 0',
  con.conname, con.conrelid::regclass, a.attname, con.confrelid::regclass, af.attname, a.attname)
FROM pg_constraint con
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
JOIN pg_attribute af ON af.attrelid = con.confrelid AND af.attnum = con.confkey[1]
WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1
\gexec
SQL
```

En producción no debería haber ninguna: la única forma conocida de crearlas es
la purga de tiendas, que solo existe en desarrollo.

**Volver atrás** después del cambio: el script imprime los comandos (volver el
compose al commit anterior y levantar de nuevo; los datos viejos siguen en su
volumen). Cuando todo ande unos días, borrar el volumen viejo con el
`docker volume rm` que indica al final.

**Desarrollo**: mismo cambio en `docker-compose.dev.yml` (volumen
`postgres18_data`). La primera vez, copiar la base vieja a la nueva:

```bash
docker exec tiendafy-postgres pg_dump -U tiendafy -d tiendafy -Fc > dev.dump   # con la 16 todavía corriendo
docker compose -f infra/docker/docker-compose.dev.yml up -d --wait postgres     # recrea con la 18, base vacía
docker exec -i tiendafy-postgres pg_restore -U tiendafy -d tiendafy --exit-on-error < dev.dump
```

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
