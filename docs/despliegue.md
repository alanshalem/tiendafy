# Despliegue y operación

Cómo se despliega, se vuelve atrás, se respalda y se restaura Tiendafy, y qué
seguridad pone la app y qué el servidor. **En dev no necesitás nada de
esto**: todo cae a `localhost` por defecto. Qué es cada variable:
[configuracion.md](./configuracion.md); el dibujo del servidor:
[arquitectura.md](./arquitectura.md#1-el-servidor-de-producción).

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

Hoy la VPS corre **solo producción** (`puenteoriente.com.ar`): staging quedó
pospuesto por RAM. El compose y los scripts ya lo soportan; prenderlo es
completar `.env.staging` y sumar su sitio en Caddy.

Los dos ambientes usan **el mismo** `docker-compose.stack.yml`. Que sea el
mismo archivo no es prolijidad: si staging se define aparte, se va pareciendo
cada vez menos a producción y deja de servir para probar.

El borde (Caddy, puertos 80/443) es **uno solo para todo el servidor**, en
`infra/edge/`: atiende a Tiendafy y a cualquier otro sistema de la máquina,
un archivo por sistema en `infra/edge/sites/`. Cada stack publica sus puertos
solo en `127.0.0.1` (`API_PORT`, `WEB_PORT`, `ADMIN_PORT` de su `.env`) y Caddy
los distingue por dominio. Para un servidor que ya tiene otros sistemas
andando, la guía paso a paso (con vuelta atrás) es
[publicar-en-la-vps.md](./publicar-en-la-vps.md).

```bash
# Una sola vez, en /srv/tiendafy
cp infra/edge/.env.example           infra/edge/.env
cp infra/docker/.env.prod.example    infra/docker/.env.prod
cp infra/docker/.env.staging.example infra/docker/.env.staging   # si hay staging
chmod 600 infra/edge/.env infra/docker/.env.*                    # tienen secretos
docker compose -f infra/edge/docker-compose.yml up -d --build

# Cada deploy (hoy a mano; GitHub Actions cuando tenga las variables, ver abajo)
git pull                                # deploy.sh usa el compose y los scripts del repo
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
reemplaza los datos de contacto por direcciones `@example.invalid` (y borra el
teléfono, el DNI/CUIT y la dirección de ventas y checkouts), borra las
credenciales de cobro y facturación y deja a los usuarios del panel **sin
contraseña** y sin sesiones (`password_hash` en NULL, `security_stamp` nuevo). Si algo queda sin anonimizar, el script
**no levanta staging**. Restaurar producción sin anonimizar es la forma más
común de mandarle un email a un cliente real desde un ambiente de prueba.

**Cómo se entra a staging después.** Los usuarios del panel conservan su email y
sus tiendas, pero ninguna contraseña de producción sirve ahí. Entrá con el
flujo de recuperación: en el login del panel de staging, *Olvidé mi contraseña*
con tu email (o `POST /api/v1/auth/forgot` con `{ "email": "…" }`). Staging no
tiene API key de Resend, así que el mail no sale: el link con el token queda en
el log de la API (`docker compose … logs api | grep -i reset`). Abrí ese link y
elegí una contraseña nueva. Para un usuario nuevo, `/auth/register` solo
funciona si el registro está abierto (`GET /api/v1/auth/registration-open`).

**Buckets.** `deploy.sh staging` se niega a seguir si `MEDIA_BUCKET` o
`MEDIA_PRIVATE_BUCKET` faltan en `.env.staging` o valen lo mismo que en
producción (los valores por defecto del compose son los de producción): sin
esto, un borrado de prueba en staging se llevaría una foto de producción.

## Dónde está cada cosa en el servidor

Se entra con `ssh cking` (el alias de tu PC; IP `31.97.166.27`) y se entra
como el usuario **`deploy`**, no root: todo lo de Tiendafy se hace con él (está
en el grupo `docker`). Root (`su -`) hace falta solo para nginx, certbot y los
repos de cking y ckinsight.

| Qué | Dónde |
|---|---|
| El repo | **`/srv/tiendafy`**, de `deploy`. Es una ruta absoluta, en la raíz del disco: `cd /srv/tiendafy`, no `~/srv` (el home de `deploy` es `/home/deploy` y ahí no hay nada de Tiendafy) |
| Variables de producción | `/srv/tiendafy/infra/docker/.env.prod` (`chmod 600`; git lo ignora, así que no aparece en `git status`) |
| El borde (Caddy) | `/srv/tiendafy/infra/edge/`: `docker-compose.yml`, su `.env`, el `Caddyfile` y un archivo por sistema en `sites/`. Proyecto compose `edge`, contenedor `edge-caddy-1` |
| Backups | `/srv/tiendafy/infra/docker/backups/prod/`: los diarios (`tiendafy-*.dump` y `dpkeys-*.tgz`), las copias previas a cada deploy (`tiendafy-predeploy-*.dump`) y las de un cambio de major (`pg-upgrade-<fecha>/`). Es de `deploy` con permisos 0700 y los archivos 0600 (`pg-backup` se los devuelve y `deploy.sh` lo vuelve a asegurar). **Equivale a todos los secretos de las tiendas**: ver *Backups* |
| Control semanal de backups | `/srv/tiendafy/infra/docker/backups/check.log`, si está el cron de `deploy` (`crontab -l`) |
| La base y el keyring | Volúmenes de Docker `tiendafy-prod_pgdata18` y `tiendafy-prod_dpkeys` (`docker volume ls`). El de la 16 (`tiendafy-prod_pgdata`), si existe, es la vuelta atrás del cambio de major |
| Certificados | Volumen `edge_caddydata` |
| Logs | No hay archivos de log propios: cada contenedor loguea a Docker (3 archivos de 10 MB, rotan solos). Se leen con `docker compose … logs` (ver [Parte 7 de la guía de la VPS](./publicar-en-la-vps.md#parte-7--el-día-a-día)). Los de cking y ckinsight, en `/var/log/nginx/` |
| Contenedores | `tiendafy-prod-api-1`, `-storefront-1`, `-admin-1`, `-postgres-1`, `-pg-backup-1` (`docker ps`) |
| nginx (cking, ckinsight) | `/etc/nginx`, escuchando en `127.0.0.1:8081` detrás de Caddy. Respaldo de antes de Caddy: `/root/nginx-antes-de-caddy` |

Los comandos de `docker compose` del stack se corren desde
`/srv/tiendafy/infra/docker` con
`-f docker-compose.stack.yml --env-file .env.prod`; los scripts
(`./infra/deploy.sh`, `./infra/check-backup.sh`…), desde `/srv/tiendafy`.

Si el último deploy lo hizo GitHub Actions, el repo queda en el commit exacto
que desplegó, sin rama: antes de un `git pull` a mano, `git checkout main`.

## Variables de entorno

En el servidor todo sale de **`infra/docker/.env.prod`** (o `.env.staging`):
`docker-compose.stack.yml` lo lee y arma con eso la config de la API, la tienda
y el panel. Lo que no está en el `.env` lo arma el compose solo, a partir de
`STACK_DOMAIN` (direcciones públicas y callbacks de OAuth) o con un valor fijo.
Qué clave de la aplicación sale de cada variable, con sus defaults de
desarrollo y qué conseguir dónde: [configuracion.md](./configuracion.md).

Un cambio en el `.env` se aplica volviendo a correr
`./infra/deploy.sh prod <el tag que corre>` (o `docker compose … up -d`, que
recrea los contenedores cuya config cambió).

### Lo que completa el operador en `.env.prod`

**Base del stack**

| Variable | Ejemplo / default | Notas |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `tiendafy-prod` | Prefijo de contenedores y volúmenes (`tiendafy-prod-api-1`, `tiendafy-prod_dpkeys`) |
| `APP_ENV` | `prod` | Carpeta de backups (`backups/prod`) y nombre del ambiente en Sentry, la tienda y el panel. **Requerida** |
| `STACK_DOMAIN` | `puenteoriente.com.ar` | **Requerida.** De acá salen `api.`, `admin.`, las tiendas (`<sub>.dominio`) y todas las URLs de callback |
| `PRIMARY_STORE_SUBDOMAIN` | `puenteoriente` | Qué tienda atiende el dominio pelado (lo usan la tienda y el panel). Vacío = "tienda no encontrada" |
| `BRAND_NAME` | `Puente Oriente` | Marca que ve el equipo en el panel. Vacío = Tiendafy. No cambia lo que ve el comprador |
| `REGISTRY` / `TAG` | `ghcr.io/alanshalem/tiendafy` / vacío | Imágenes de GHCR. En producción el tag lo pasa `deploy.sh` y no puede ser `latest` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` | **Requerida** |
| `DB_MIN_POOL_SIZE` | `5` | Conexiones abiertas aunque no haya tráfico. No viene en el ejemplo: vale el default |
| `API_PORT` / `WEB_PORT` / `ADMIN_PORT` | `5080` / `3000` / `8090` | Publicados solo en `127.0.0.1`; tienen que coincidir con `infra/edge/sites/tiendafy.caddy` |
| `PG_MEM_LIMIT` / `API_MEM_LIMIT` / `WEB_MEM_LIMIT` / `ADMIN_MEM_LIMIT` | `1g` / `1g` / `768m` / `128m` | Techos de memoria de cada contenedor |
| `BACKUP_REPLICAS` | `1` | `0` apaga el backup diario (staging) |
| `WORKERS_ENABLED` | `true` | `false` en réplicas extra de la API, para no duplicar los workers |
| `TRUSTED_PROXY_CIDR_0` … `_2` | `172.16.0.0/12`, `192.168.0.0/16`, `10.0.0.0/8` | Redes de las que la API acepta `X-Forwarded-For` (lo que entra por el puerto publicado viene de la red de Docker). Sin esto, los límites por IP se comparten entre todos los visitantes. No vienen en el ejemplo: valen los defaults |

**Imágenes (storage S3)** — alta en [Imágenes de las tiendas](#imágenes-de-las-tiendas-storage)

| Variable | Ejemplo / default | Notas |
|---|---|---|
| `MEDIA_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | **Requerida.** En producción la API no arranca si apunta a localhost |
| `MEDIA_PUBLIC_BASE_URL` | `https://img.puenteoriente.com.ar` | **Requerida.** Dominio desde el que el comprador baja las fotos |
| `MEDIA_ACCESS_KEY` / `MEDIA_SECRET_KEY` | — | **Requeridas.** Token con lectura y escritura sobre los dos buckets. `minioadmin` en producción = no arranca |
| `MEDIA_BUCKET` / `MEDIA_PRIVATE_BUCKET` | `tiendafy-media` / `tiendafy-private` | Staging usa los suyos (`-stg`). En el ejemplo de prod no vienen: valen los defaults |
| `MEDIA_REGION` | `auto` | R2 firma con `auto`; MinIO la ignora |
| `MEDIA_BUCKET_IN_PUBLIC_URL` | `false` | `false` con dominio propio de R2 (objeto en la raíz); `true` en MinIO o S3 path-style (`{base}/{bucket}/{key}`) |
| `MEDIA_ENSURE_BUCKET` | `false` | R2 no soporta `PutBucketPolicy`: los buckets se crean a mano una vez |

**Email, cobros y servicios** (vacío = apagado, y el panel lo dice)

| Variable | Notas |
|---|---|
| `EMAIL_FROM` | Remitente con dominio verificado en Resend (`Puente Oriente <no-responder@…>`) |
| `RESEND_API_KEY` | Sin esto los mails solo se escriben en el log (es el default de staging, a propósito) |
| `EMAIL_WEBHOOK_SECRET` | Signing secret del webhook de rebotes y quejas de Resend. Vacío = el webhook responde 404 |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `MP_WEBHOOK_SECRET` | App de Mercado Pago de la plataforma ([integraciones/mercadopago.md](./integraciones/mercadopago.md)) |
| `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` | Canal Mercado Libre ([integraciones/mercadolibre.md](./integraciones/mercadolibre.md)) |
| `META_APP_ID` / `META_APP_SECRET` | Meta Ads (ROAS real) |
| `SOCIAL_META_APP_ID` / `SOCIAL_META_APP_SECRET`, `SOCIAL_X_CLIENT_ID` / `SOCIAL_X_CLIENT_SECRET` | Redes sociales; Telegram no necesita credenciales ([integraciones/redes-sociales.md](./integraciones/redes-sociales.md)) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Cloudflare Turnstile en login, registro, contacto, newsletter, reseñas y "avisame". Vacío = sin captcha (`deploy.sh` avisa) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Entrar con Google" de los compradores. Vacío = botón oculto |
| `AI_DISABLED` | `true` apaga la IA de **todas** las tiendas (palanca de emergencia, vacío = prendida). Las claves de IA no van acá: las carga cada tienda ([integraciones/ia.md](./integraciones/ia.md)) |
| `REVALIDATE_SECRET` | Lo comparten la API y la tienda: con él, publicar un diseño o cambiar el catálogo se ve al toque; vacío, tarda 30 a 60 s. `openssl rand -hex 32` |
| `SENTRY_DSN_BACKEND` / `SENTRY_DSN_STOREFRONT` / `SENTRY_DSN_ADMIN` | Errores de cada app. Vacío = Sentry apagado. Los secretos de las URLs (token del bot de Telegram, `access_token`, `?t=` de los links firmados, headers de autorización) se tapan antes de mandar nada: `backend/src/Api/Startup/SentryScrubber.cs` y, en el panel y la tienda, `shared/types/src/sentry-scrub.ts`. Un parámetro secreto nuevo se suma en los dos |

**Copia fuera del servidor** (`OFFSITE_REPLICAS`, `OFFSITE_PROVIDER`,
`OFFSITE_ENDPOINT`, `OFFSITE_BUCKET`, `OFFSITE_ACCESS_KEY`,
`OFFSITE_SECRET_KEY`, `OFFSITE_CRYPT_PASSWORD`): ver
[Copia fuera del servidor](#copia-fuera-del-servidor). `OFFSITE_PROVIDER` no
viene en el ejemplo: vale `Cloudflare` (para Backblaze B2, `Other`).

Correo Argentino, Andreani, Zipnova, Payway, WhatsApp y ARCA no llevan
variables: las credenciales son **por tienda**, las carga el comercio desde el
panel y quedan cifradas en la base.

### Lo que arma el compose solo

Lo demás no se completa: `docker-compose.stack.yml` lo deriva de
`STACK_DOMAIN` (direcciones públicas, callbacks de OAuth, `API_URL` y
`Storefront__RevalidateUrl` por la red interna) o lo fija
(`ASPNETCORE_ENVIRONMENT=Production` también en staging,
`DataProtection__KeyPath=/keys`, `Database__MigrateOnStartup=false`). Qué
clave sale de dónde está en la columna "En `.env.prod`" de
[configuracion.md](./configuracion.md).

Las claves que el compose no pasa quedan en su default en producción:
`Cors__AllowedOrigins` (hace falta recién con el primer dominio propio de una
tienda, ver Seguridad), los cupos de `RateLimiting__*`, `Email__MaxRetries` y
las tarifas de `Notifications__*`. Se suman como variable en el compose si
alguna vez hay que cambiarlas.

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

Con MinIO propio en vez de R2: `MEDIA_BUCKET_IN_PUBLIC_URL=true`,
`MEDIA_ENSURE_BUCKET=true` y **exponelo por un dominio público**
(ej. `media.tudominio.com` detrás de Caddy). No alcanza con `localhost:9000`:
en producción `next/image` bloquea los upstreams que resuelven a IP privada y
todas las fotos de la tienda quedan rotas.

Migrar de un proveedor a otro es copiar los objetos entre buckets: las URLs
guardadas en la base apuntan al dominio viejo, así que hay que mantenerlo vivo
o reescribirlas.

### Después de desplegar la IA

La IA dejó de usar una clave de la plataforma (`AI_API_KEY` y `AI_MODEL` ya no
existen). Después del primer deploy con este cambio queda **apagada en todas
las tiendas** hasta que su dueño la configure, y antes andaba con la clave de
plataforma, así que conviene avisarles. Para cada tienda:

1. El dueño entra a Configuración → Inteligencia artificial y carga la clave de
   al menos un proveedor ([cómo sacarla](./integraciones/ia.md#proveedores-y-claves)).
2. En esa consola del proveedor pone un **límite de gasto mensual**. El tope de
   Tiendafy es una estimación; este límite es el que de verdad corta el gasto.
3. Elige el modelo de cada tarea ("Usar recomendados" completa todo), carga un
   tope mensual y prende el interruptor (sin tope no deja).
4. Toca "Probar conexión" en cada proveedor.

Si algo sale mal con un proveedor o con el gasto, `AI_DISABLED=true` en
`.env.prod` y `./infra/deploy.sh prod <el tag que corre>` apaga la IA de todas
las tiendas sin tocar su configuración; al volverla a vacío vuelve todo como
estaba.

## Reverse proxy / TLS

La API confía en `X-Forwarded-Proto`/`X-Forwarded-For` de las redes de
`TRUSTED_PROXY_CIDR_*` y manda HSTS. Caddy termina TLS y redirige
HTTP→HTTPS; la app no redirige (evita loops).

**Wildcard DNS + TLS**: `*.tudominio.com` y `*.stg.tudominio.com` apuntan al
servidor. Los certificados comodín salen por **DNS-01 con el plugin de
Cloudflare** (`infra/edge/Dockerfile`), con un token acotado a la zona: así una
tienda nueva funciona desde el primer visitante, sin emitir un certificado en el
momento — que además choca contra el límite semanal de Let's Encrypt cuando hay
varias tiendas.

Para **dominios propios de merchants** sigue el on-demand, validado contra
`/api/v1/tenants/resolve` de la API de producción (el `ask` de `on_demand_tls` en `infra/edge/Caddyfile`), y hay que agregarlos a
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
- **Frontends**: Node de la misma major que `.node-version`; se instala con npm
  el pnpm fijado en el `packageManager` del package.json raíz (Node 25+ ya no
  trae corepack). Capa de deps con `pnpm fetch` (solo lockfile) + cache mount
  del store, e install `--frozen-lockfile --offline` del workspace completo (un
  install filtrado deja a tsc sin los tipos compartidos).
- **Contenedores endurecidos** (`docker-compose.stack.yml`): `api`,
  `storefront` y `admin` corren con `no-new-privileges` y `cap_drop: ALL`.
  Solo el panel (y los de backup) tienen además el sistema de archivos de solo
  lectura; lo que escriben va a un tmpfs: `/tmp`, y en el panel `config.js` y
  su CSP de runtime (`docker-config.sh` los escribe en `/tmp/tiendafy`). Si
  agregás algo que escribe a disco en uno de esos, declaralo ahí: con el
  sistema de solo lectura falla con `EROFS`.
  - La **API** no es de solo lectura y su `/tmp` es el disco del contenedor:
    la importación de fotos extrae ahí el ZIP (hasta 2 GB descomprimidos),
    Kestrel guarda los archivos grandes de un multipart (hasta 1 GB) y
    QuestPDF/Skia escriben su caché de fuentes. En un tmpfs eso sería memoria
    del contenedor y una subida grande la mataría por OOM. `/keys` es un
    volumen.
  - La **tienda** tampoco: Next escribe su caché (`.next/cache`) en runtime y
    crece con el catálogo.
- **Storefront**: runtime = output **standalone** de Next (server.js +
  node_modules podados por file-tracing) — la imagen no lleva el repo.
- Las imágenes NO llevan URLs de ambiente: la config entra en runtime (ver
  "La misma imagen en los dos ambientes"). Los Dockerfiles ni siquiera aceptan
  `NEXT_PUBLIC_*` ni `VITE_*` como build-args: también el modo todo-en-Docker
  de desarrollo (`docker-compose.app.yml`) les pasa la config por `environment`.
- **pnpm**: los build scripts nativos aprobados están en `pnpm-workspace.yaml`
  (`allowBuilds`); si no, `--frozen-lockfile` falla. pnpm 12 corta con cualquier
  clave que no reconozca en ese archivo.
- Cada imagen tiene su **`Dockerfile.dockerignore`** (BuildKit): el contexto solo
  lleva lo que esa imagen necesita, y repite las exclusiones de secretos porque
  reemplaza al `.dockerignore` raíz.

### Qué corre en el servidor

```
edge               caddy (80/443, red del servidor)   ← el único que da la cara
├── tiendafy-prod      api 127.0.0.1:5080, storefront :3000, admin :8090 (+ postgres, pg-backup, backup-offsite)
├── tiendafy-staging   lo mismo en :5081, :3002, :8091 (opcional)
└── otros sistemas     lo que escuche en 127.0.0.1 (ver infra/edge/sites/)
```

Caddy usa la red del propio servidor (no una de Docker) para ver la IP real
de cada visitante y llegar a todo lo que escucha en `127.0.0.1`, esté o no en
Docker. Los límites de memoria de cada `.env` evitan que staging deje sin RAM
a producción.

CI publica las imágenes en GHCR en cada push a `main`
(`.github/workflows/docker-release.yml`). Los deploys automáticos están
apagados mientras el repo no tenga las variables `STAGING_DOMAIN` /
`PLATFORM_DOMAIN` (hoy no las tiene: producción se despliega a mano). Con
ellas: staging automático y producción **con aprobación manual** (GitHub →
Settings → Environments → production → Required reviewers).

**Deploy a mano** (las migraciones son un paso explícito, NO corren al boot):

```bash
cd /srv/tiendafy && git pull            # el compose y los scripts del commit nuevo
./infra/deploy.sh prod sha-a1b2c3d
curl -s https://api.TU_DOMINIO/version   # ¿corre el sha que esperabas?
```

En producción el tag es obligatorio y no puede ser `latest`. El script trae
solo las imágenes de la app, copia la base (`backups/prod/tiendafy-predeploy-*.dump`)
justo antes de migrar, espera a que la API, la tienda y el panel respondan, e
imprime el comando para volver a lo que corría antes.

**Volver atrás**: desplegar el tag anterior (el script lo imprime al terminar
y si algo falla). Las imágenes viejas siguen en GHCR.

```bash
./infra/deploy.sh prod sha-EL_ANTERIOR
```

Ojo: eso vuelve el código, no la base. Una migración que borra datos no se
deshace con un rollback de imagen: para eso está la copia `tiendafy-predeploy-*`
de ese deploy (restaurarla como se explica abajo).

Lo mismo con una migración que la versión anterior no conoce y que cambia
columnas que esa versión usa. Volver a un tag anterior a las migraciones de
oct-2026 que cifran el teléfono, el DNI y la dirección del comprador
(`EncryptBuyerPii`, en ventas y checkouts) y que guardan hasheados los tokens de
sus sesiones (`HashShopperTokens`) **exige restaurar el `PREDEPLOY_DUMP`** de
ese deploy: la versión vieja no encuentra la columna `token` y leería cifrado
lo que muestra, factura y manda por mail. Se pierde lo que se guardó desde el
deploy. `deploy.sh` imprime los comandos con la ruta del dump; desde
`infra/docker`:

```bash
docker compose -f docker-compose.stack.yml --env-file .env.prod stop api storefront admin
docker compose -f docker-compose.stack.yml --env-file .env.prod exec -T postgres \
  pg_restore -U tiendafy -d tiendafy --clean --if-exists --single-transaction --exit-on-error \
  < backups/prod/tiendafy-predeploy-AAAAMMDD-HHMM-sha-NUEVO.dump
cd ../.. && ./infra/deploy.sh prod sha-EL_ANTERIOR
```

Con `--single-transaction` y `--exit-on-error`, si algo falla la base queda
como estaba.

**Paso único después del deploy de oct-2026 (sanitizador de SVG):** el
sanitizador nuevo y el `Content-Disposition: attachment` solo se aplican a lo
que se sube de ahí en adelante; los `.svg` que ya estaban en el bucket público
pasaron por el sanitizador viejo (con bypass conocidos) y se sirven en línea.
Una vez, con la versión nueva ya arriba, desde `infra/docker`:

```bash
docker compose -f docker-compose.stack.yml --env-file .env.prod run --rm api dotnet Api.dll resanitize-svg
```

Recorre los `.svg` del bucket de media, los re-sanea y los vuelve a subir en la
misma clave (las URLs no cambian) con `attachment`. Es idempotente: lo que ya
está bien no se toca, así que se puede volver a correr. Lo que el sanitizador
rechaza no se borra (es el logo de alguien): queda con `attachment` y sale en el
log como `SVG <clave>: el sanitizador lo rechaza`, para revisarlo a mano. En
staging, lo mismo con `.env.staging`.

El cifrado de los datos del comprador que estaban en claro no corre en
`migrate` sino al arrancar la versión nueva (`BuyerPiiBackfillService`, con
`Workers:Enabled`): mientras corre `migrate` sigue atendiendo la versión vieja,
que no sabe descifrar.

**Actualizar Postgres dentro de la misma major** (18.6 → 18.7, parches de
seguridad): el deploy no lo hace solo, a propósito, porque reinicia la base.
En un horario tranquilo:

```bash
cd /srv/tiendafy/infra/docker
docker compose -f docker-compose.stack.yml --env-file .env.prod pull postgres pg-backup
docker compose -f docker-compose.stack.yml --env-file .env.prod up -d postgres pg-backup
```

### Backups

Todos los días, `pg-backup` (ver `infra/docker/backup.sh`) deja en
`infra/docker/backups/<ambiente>/`, con 14 días de retención:

- `tiendafy-AAAAMMDD-HHMM.dump`: la base (formato custom de pg_dump). Se escribe
  a un temporal y solo toma ese nombre si se puede leer entero.
- `dpkeys-AAAAMMDD-HHMM.tgz`: el keyring de DataProtection. Sin él, los
  secretos que la base guarda cifrados (tokens de MP, certificados de ARCA)
  no se pueden leer: **un dump sin su keyring restaura una base a medias**.

> **Esa carpeta equivale a todos los secretos de las tiendas.** Quien se lleve un
> dump y el `dpkeys` de la misma fecha puede descifrar los tokens de Mercado
> Pago y Mercado Libre, los certificados de ARCA, las claves de IA y los datos
> personales de los clientes. Por eso la carpeta es 0700 y los archivos 0600, del
> usuario `deploy`: no la abras a otros usuarios, no la copies sin cifrar a
> ningún lado (la copia fuera del servidor ya sale cifrada con rclone crypt) y
> tratá cualquier copia como si fuera la base de producción. Los contenedores
> de backup corren con `BACKUP_UID`/`BACKUP_GID` (los de `deploy`, que
> `deploy.sh` exporta). `pg-backup` es el único que sigue como root, con
> `DAC_OVERRIDE` y `CHOWN` y nada más, porque las claves de `/keys` son
> 0600 del usuario de la API.

**Control semanal** de que el último backup se puede restaurar (en una base
aparte, sin tocar la real) y de que el keyring se abre. Una vez, en el crontab
del usuario `deploy` (`crontab -e`):

```
0 7 * * 1  /srv/tiendafy/infra/check-backup.sh prod >> /srv/tiendafy/infra/docker/backups/check.log 2>&1
```

A mano: `./infra/check-backup.sh prod` (termina en `OK` o en `FALLA: …`).

#### Copia fuera del servidor

Los backups de al lado de la base se pierden con el disco. El servicio
`backup-offsite` sube cada 6 h lo nuevo a un bucket S3 (R2), cifrado antes de
salir con rclone crypt, y poda lo de más de 60 días. Viene apagado. Para
prenderlo, una vez:

1. Cloudflare → R2 → crear el bucket `tiendafy-backups` (privado, sin dominio).
2. R2 → Manage API tokens → token con **Object Read & Write solo sobre ese
   bucket**. Anotar Access Key ID y Secret.
3. Inventar una frase larga y guardarla en el gestor de contraseñas: **sin
   ella la copia no se puede abrir**. En el servidor:
   `docker run --rm rclone/rclone:1.75 obscure 'la frase'` → copiar la salida.
4. En `.env.prod`: `OFFSITE_REPLICAS=1`, `OFFSITE_ENDPOINT` (el mismo de
   `MEDIA_ENDPOINT`), `OFFSITE_ACCESS_KEY`, `OFFSITE_SECRET_KEY` y
   `OFFSITE_CRYPT_PASSWORD` (la salida del paso 3).
5. `./infra/deploy.sh prod sha-…` (o `docker compose … up -d backup-offsite`) y
   a las horas, `docker compose … logs backup-offsite` no muestra errores.

Para traer la copia de vuelta (servidor nuevo), con las mismas variables:

```bash
docker run --rm -v "$PWD/restaurado:/out" \
  -e RCLONE_CONFIG_DESTINO_TYPE=s3 -e RCLONE_CONFIG_DESTINO_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_DESTINO_ENDPOINT=… -e RCLONE_CONFIG_DESTINO_ACCESS_KEY_ID=… \
  -e RCLONE_CONFIG_DESTINO_SECRET_ACCESS_KEY=… \
  -e RCLONE_CONFIG_CIFRADO_TYPE=crypt -e RCLONE_CONFIG_CIFRADO_REMOTE=destino:tiendafy-backups/prod \
  -e RCLONE_CONFIG_CIFRADO_PASSWORD=… \
  rclone/rclone:1.75 copy cifrado: /out
```

### Restaurar un backup (ensayado — no improvisar en la emergencia)

Restaurar la base:

```bash
cd /srv/tiendafy
# 1. Copiar el dump adentro del contenedor de postgres
docker cp infra/docker/backups/prod/tiendafy-YYYYMMDD-HHMM.dump tiendafy-prod-postgres-1:/tmp/r.dump
# 2. Crear una DB de verificación y restaurar ahí (NUNCA pisar tiendafy directo)
docker exec tiendafy-prod-postgres-1 createdb -U tiendafy tiendafy_restore
docker exec tiendafy-prod-postgres-1 pg_restore -U tiendafy -d tiendafy_restore /tmp/r.dump
# 3. Verificar (conteo de tablas y de tenants)
docker exec tiendafy-prod-postgres-1 psql -U tiendafy -d tiendafy_restore -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'; SELECT count(*) FROM tenants;"
# 4. Si está OK y hay que promoverla: renombrar DBs (con la API apagada)
```

Si además se perdió el volumen `dpkeys` (servidor nuevo), restaurar el keyring
del MISMO día que el dump, con la API frenada:

```bash
cd /srv/tiendafy/infra/docker
docker compose -f docker-compose.stack.yml --env-file .env.prod stop api
docker run --rm -v tiendafy-prod_dpkeys:/keys -v "$PWD/backups/prod:/b:ro" alpine \
  sh -c 'tar xzf /b/dpkeys-AAAAMMDD-HHMM.tgz -C /keys && chown -R 1654:1654 /keys'
docker compose -f docker-compose.stack.yml --env-file .env.prod start api
```

### Rotar las claves de DataProtection (si se comprometieron)

Caso: alguien se llevó el volumen `dpkeys`, un `dpkeys-*.tgz` o la carpeta de
backups. Con las claves **y** un dump puede descifrar todo lo que la base guarda
cifrado. Cambiar la clave no protege lo que ya se copió; lo que protege es que
los secretos de adentro **dejen de valer**. El orden:

1. **Contener.** Cortá el acceso por donde salió (credenciales del servidor,
   bucket de la copia fuera del servidor, usuario `deploy`) y rotá las de
   infraestructura que estén en `.env.prod`: contraseña de Postgres, R2/MinIO,
   Resend, Turnstile, `REVALIDATE_SECRET`, la frase de `rclone crypt`.
2. **Generar claves nuevas sin perder las viejas.** DataProtection guarda un
   `key-<id>.xml` por clave en `/keys` y firma/cifra con la más nueva; las
   demás solo sirven para descifrar. **No borres ni reemplaces el volumen**: la
   base quedaría ilegible. Con la API apagada, en cada `key-*.xml` poné el
   `expirationDate` en el momento actual (y `activationDate` igual o anterior)
   y levantala: al no haber clave vigente crea una nueva y la usa desde el
   primer arranque. La vieja queda en el keyring, solo para descifrar. Ensayalo
   primero en staging y verificá en `/keys` que apareció un `key-*.xml` nuevo.
   Hacé un backup del volumen antes (a un lugar cifrado).
3. **Re-cifrar lo que se pueda.** Se vuelve a cifrar solo lo que la aplicación
   vuelve a guardar; no hay un comando que recorra la base:
   - Se reconecta o se vuelve a cargar a mano en cada tienda (la clave nueva
     cifra lo nuevo): **Mercado Pago** y **Mercado Libre** (reconectar la
     cuenta), **Meta Ads**, **redes sociales** (Meta, X, Telegram),
     **WhatsApp**, **Payway**, **Correo Argentino**, **Andreani**, **Zipnova**,
     **claves de IA** (cargar la clave de nuevo) y el **certificado de ARCA**
     (subir el certificado y la clave privada de nuevo, o generar otro; si la
     privada se filtró, revocá el certificado en ARCA y sacá uno nuevo).
   - Pedíle a cada comercio que **rote la credencial en el proveedor**
     (revocar el token de MP/ML, regenerar la clave de IA, etc.): el valor
     viejo es el que el atacante pudo leer, así que volver a cifrarlo no
     alcanza.
   - Lo que **no** se re-cifra solo: los datos personales de los clientes
     (`Customers.PII.v1`: teléfono, dirección). Siguen cifrados con la clave
     vieja y, si esa clave se filtró, son legibles para quien tenga el dump.
     Re-cifrarlos exige un script que los lea y los guarde de nuevo, que hoy no
     existe: se escribe con el equipo, no se improvisa en la emergencia.
   - Lo efímero se corta solo, sin hacer nada: sesiones del panel y de la
     tienda, links firmados (cotizaciones de envío, recuperar contraseña,
     estado de OAuth, vista previa del editor). Quedan inválidos y es lo
     esperado.
4. **Sacar la clave vieja** recién cuando todo lo cifrado con ella se haya
   vuelto a guardar (y lo de los clientes, resuelto): se la revoca (se saca su
   archivo del volumen **después** de confirmar con un backup que se puede
   volver atrás). Mientras quede alguna fila cifrada con ella, borrarla deja
   ese dato ilegible para siempre.
5. Backups: los `dpkeys-*.tgz` y dumps anteriores a la rotación siguen
   abriendo lo viejo; borralos (también la copia fuera del servidor) cuando ya
   no hagan falta.

**NUNCA cambies un *purpose*** (el string de cada `CreateProtector(...)` o
`Purpose = ...`: `Tiendafy.Fiscal.Secrets.v1`, `Customers.PII.v1`,
`Tiendafy.Ai.Keys.v1`, `tiendafy.correo.tokens`…) ni el nombre de aplicación
(`SetApplicationName("tiendafy")`) para "rotar": todo lo cifrado con el viejo
deja de poder leerse, y es la forma más rápida de perder los secretos de todas
las tiendas. La rotación se hace con claves nuevas dentro del mismo purpose.

### Alguien del panel perdió el teléfono de la verificación en dos pasos

Para dueños y administradores la verificación en dos pasos es obligatoria
(`Auth:RequireTwoFactorForAdmins`, prendida por defecto). Quien perdió el
teléfono entra con uno de sus códigos de recuperación y, ya adentro, la pasa a
la app nueva desde Mi cuenta. Si tampoco tiene los códigos, no hay forma de
entrar desde el panel: la borra quien opera la plataforma.

1. **Confirmá por otro medio que el pedido es de esa persona** (un llamado, el
   dueño de la tienda en persona). Este comando es la única forma de entrar a
   una cuenta sin el segundo paso: alguien que se haga pasar por ella se queda
   con la cuenta.
2. Desde `infra/docker`:

   ```bash
   docker compose -f docker-compose.stack.yml --env-file .env.prod run --rm api dotnet Api.dll reset-2fa persona@empresa.com
   ```

   Desactiva la verificación, borra la clave de la app y los códigos de
   recuperación, desbloquea la cuenta (por si se bloqueó probando códigos) y
   cierra sus sesiones abiertas. Sale con código 1 si no hay una cuenta con ese
   email. El log no repite el email.
3. La persona entra con su contraseña y, si es dueña o administradora, el panel
   le pide configurar la verificación de nuevo antes de dejarla pasar.

En staging, lo mismo con `.env.staging`.

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
   el dump definitivo en `infra/docker/backups/<ambiente>/pg-upgrade-<fecha>/`.
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

En desarrollo sí hay filas huérfanas: la purga de tiendas de prueba
(`DELETE /tenants/{id}/purge`, solo en Development) desactiva las claves
foráneas y deja hijas sin padre (imágenes, variantes, ítems de pedidos), y el
restore falla al recrear esas claves. Antes del dump, o se borran (son basura:
nadie las puede ver) o se arranca la base de cero con los datos de demo
(`POST /dev/demo-seed`).

### Correr TODO el sistema en contenedores (local)

Overlay que suma las 3 apps a la infra, sin duplicarla:

```bash
docker compose -f infra/docker/docker-compose.dev.yml \
               -f infra/docker/docker-compose.app.yml up -d --build
```

o, en Windows, un solo comando:  `./dev-up.ps1 -Docker`  (y `./dev-down.ps1 -Docker`).

La API (`ASPNETCORE_ENVIRONMENT=Development`) migra sola al arrancar y apunta a
`postgres`/`minio` por nombre de servicio; el storefront hace SSR contra `api:8080`
y el browser pega a `localhost:5080`. Las URLs del navegador entran al arrancar,
igual que en producción (`PUBLIC_*` en la tienda, `VITE_*` que el panel vuelca
en `config.js`): cambiarlas en el compose pide `up -d`, no `--build`. Para el día a día de desarrollo conviene el
modo **nativo** (`./dev-up.ps1`, con hot-reload); el full-docker es para demo/smoke.

## Seguridad (hecho vs. proxy vs. roadmap)

**Ya en la app:**
- **Aislamiento multi-tenant**: toda escritura admin y **toda lectura privada**
  (orders, customers, stats, coupons, inventory, email-templates, pages, MP
  connection, export/import) exige sesión + membresía del tenant. Las lecturas
  públicas del storefront (products, pages publicadas, theme, orders/{id}) quedan
  abiertas a propósito. La sesión del comprador queda atada a su tienda (no se
  reusa el bearer cambiando `X-Tenant-Id`).
- **Rate limiting** (`AddRateLimiter`): global 300/min por IP (sin techo para el
  storefront que pide desde la red interna) + estricto 10/5min por IP y endpoint
  en los formularios públicos (login y registro del panel y de la tienda,
  contacto, cupón, reseñas, "avisame cuando ingrese", "Seguí tu pedido"), y
  15/5min en los endpoints de pago (contra el card-testing). Además, por IP y
  ruta: armar y enviar un checkout 10/10min (reservan stock), cotizar envío
  30/5min por carrier, y búsqueda y beacon de visitas 120/min.
  ⚠️ El límite es **por instancia**. Con varias réplicas, poné el throttling también
  en el proxy (nginx `limit_req` / Cloudflare) o un store distribuido.
- **SSRF**: la importación de imágenes por URL solo busca hosts públicos (bloquea
  loopback, rangos privados y `169.254.169.254`).
- **OAuth Google**: se verifica firma + `aud` + `exp` del `id_token`; el redirect
  post-login solo apunta a destinos propios (anti open-redirect/robo de token).
  La cuenta se busca primero por la cuenta de Google (`sub`) y después por
  email; una cuenta ya vinculada a otra cuenta de Google no se pisa (409). El
  arranque y la vuelta exigen una tienda que exista y esté abierta.
- **Uploads**: validación por *magic bytes* además del content-type.
- **Sesión admin**: cookie `HttpOnly` + `SameSite=Lax` + `Secure` (forzado en prod).
- **Segundo factor del panel**: TOTP con códigos de recuperación. Obligatorio
  para dueños y administradores (`Auth:RequireTwoFactorForAdmins`, prendido por
  defecto; apagado en Development) y opcional para el resto. El paso intermedio
  es otra cookie (`tiendafy.2fa`, `Secure` en prod): 5 min para el código, 15 min
  para configurarla al entrar (ese estado solo habilita configurarla). Las
  sesiones abiertas de quien la tiene que configurar reciben 403
  `Auth.TwoFactorSetupRequired` (`TwoFactorSetupMiddleware`). La clave de la app
  va cifrada con DataProtection (purpose `Tiendafy.Identity.AuthenticatorKey.v1`,
  no cambiarlo nunca): perder `dpkeys` deja a esas personas entrando solo con sus
  códigos de recuperación. Pasarla a otra app usa un ticket de 15 min (purpose
  `Tiendafy.Identity.AuthenticatorRelink.v1`). Sin teléfono ni códigos:
  `dotnet Api.dll reset-2fa <email>` (ver *Alguien del panel perdió el teléfono*).
- **Sesión comprador**: cookie `HttpOnly` por tienda (`shop_{tenantId}`), `SameSite=Lax`,
  `Secure` en https; nunca `localStorage` ni el token en la URL del OAuth. El
  front pega con `credentials: 'include'`.
- **PII en reposo**: teléfono y dirección de los clientes van cifrados por
  columna (DataProtection, purpose `Customers.PII.v1`). En ventas y checkouts,
  el teléfono, el documento y la dirección del comprador también (purposes
  `Orders.PII.v1` y `Checkout.PII.v1`); el email y el nombre quedan en claro
  porque se buscan y vinculan. Las filas de antes del cifrado se leen igual y
  las cifra el paso `migrate` (y una pasada al arrancar la API), por lotes.
- **Archivos privados** (adjuntos del chat de soporte): bucket aparte, nunca
  público, servido con URLs firmadas de vida corta.
- **CSS del tema**: `customCss` se sanea al guardar (quita `<`, `@import`,
  `expression()`, `javascript:`…) para que no rompa el `<style>` e inyecte HTML/JS.
- **CSRF**: las escrituras con cookie exigen el header custom `X-Tenant-Id` (no
  enviable por un form cross-site sin preflight CORS, que no permitimos) **y** la
  cookie es `SameSite=Lax` → doble defensa. No usamos tokens CSRF dedicados.
- **Sesión del panel solo desde el panel** (`Api/Auth/OriginRules.cs`): la cookie
  `tiendafy.session` es `Lax` y viaja en todo pedido del mismo sitio, y las tiendas
  viven en subdominios con GTM, Pixel y Clarity de cada comercio. Si el pedido trae
  `Origin` y no es el del panel (`Admin:BaseUrl`) ni el de la API, la sesión del
  panel se ignora (anónimo, 401) sin borrar la cookie. Sin `Origin` (navegación,
  descargas) vale. Y toda escritura de `/auth` (entrar, salir, el segundo paso y
  configurarlo, la contraseña) responde 403 `Auth.ForeignOrigin` con un `Origin`
  que no sea el del panel: son pedidos anónimos y, sin eso, un script en una
  tienda podía cerrarle la sesión al admin o loguearlo con otra cuenta.
- **Sesión del comprador solo desde su tienda** (`Api/Shop/StoreOrigins.cs`): la
  cookie `shop_<tienda>` es del host de la API y viaja desde cualquier tienda.
  Con `Origin`, vale solo si es un host de ESA tienda (su subdominio, su dominio
  propio con o sin www, el dominio pelado si es la principal de
  `Tenancy__PrimaryStoreSubdomain`); si no, el pedido es anónimo y el logout no
  cierra nada. Sin `Origin` (la tienda armando la página en el servidor) vale.
- **Links de los mails de cuenta**: verificar, restablecer, activar, la
  bienvenida de alguien del equipo y la confirmación del newsletter apuntan a
  `Admin__BaseUrl` o a la URL canónica de la tienda, nunca al `Origin` del pedido.

**Headers de seguridad:** el panel los manda desde el nginx de su imagen
(`admin/nginx-security-headers.conf`: HSTS, nosniff, `X-Frame-Options: DENY`,
referrer, permissions policy y el CSP con `frame-ancestors 'none'`; al arrancar,
`docker-config.sh` suma un segundo CSP que acota `connect-src` a la API, a
Sentry del ambiente y a Turnstile, y el navegador aplica los dos; el CSP y el
meta de `index.html` permiten el script y el iframe de
`https://challenges.cloudflare.com`, o con el captcha configurado nadie entra
al panel). La API manda nosniff,
`X-Frame-Options: DENY`, `frame-ancestors 'none'` y `Referrer-Policy:
no-referrer` (`SecurityHeadersMiddleware`; en Development `/scalar` queda sin
CSP). La tienda desde `storefront/next.config.ts`
(nosniff, referrer; sin `X-Frame-Options` porque el editor la previsualiza en
un iframe) más el CSP, que se enmarca solo desde ella misma y desde
`PUBLIC_ADMIN_ORIGIN` (`frame-ancestors`), sin `'unsafe-eval'` en producción
(`'unsafe-inline'` se queda: los nonces obligarían a renderizar todas las
páginas en forma dinámica y la tienda vive de la caché). Lo pone `storefront/src/proxy.ts` en cada respuesta
porque depende de la API del ambiente (`storefront/src/lib/csp.ts`). Caddy suma
HSTS, nosniff y referrer en los sitios que no los ponen (`security_headers` del
`infra/edge/Caddyfile`).

**Lo pone el borde / el servidor:** HTTPS con redirect desde HTTP (Caddy) y
ningún puerto de la base ni de las apps abierto a internet (todo escucha en
`127.0.0.1`).

**Rotación de secretos:** DataProtection rota sus llaves solo (cada 90 días,
conserva las viejas para descifrar) mientras el volumen `dpkeys` persista.
Tokens de MP: el comercio vuelve a conectar su cuenta. Base, Resend, R2,
Turnstile: cambiar el valor en `.env.prod` y redesplegar. Si se comprometen
las claves de DataProtection, ver *Rotar las claves de DataProtection*.

**Decisiones / roadmap pendientes:**
- **WebAuthn / llaves de seguridad** para el panel (hoy el segundo factor es
  TOTP) — feature de producto.
- **CORS multi-tenant**: el API acepta con credenciales el panel, el dominio de la
  plataforma y `<tienda>.PlatformBaseDomain` (un solo nivel, que no sea un
  subdominio reservado de `Subdomain.cs`: admin, api, img, media, stg…) y los de
  `Cors__AllowedOrigins`; nunca el host de las fotos (`Media:PublicBaseUrl`) ni
  lo de staging cuando cuelga de producción (`x.stg.<dominio>`). Las tiendas
  cargan scripts de terceros que configura cada comercio (GTM, Pixel, Clarity):
  por eso la sesión del panel no vale desde ellas (ver *CSRF* arriba). Aislamiento
  total = servir las tiendas en un **dominio registrable aparte** del admin/API
  (decisión de infra, modelo `myshopify.com`).
- **Dominios propios de tiendas**: hoy hay que sumar cada uno a
  `Cors__AllowedOrigins`, y la sesión del comprador vive en `api.` (desde otro
  dominio es una cookie de terceros). Se resuelve sirviendo la API desde el
  mismo dominio de cada tienda, antes de conectar el primero.
