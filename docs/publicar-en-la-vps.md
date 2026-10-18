# Publicar Tiendafy en la VPS (puenteoriente.com.ar)

Guía paso a paso para poner Tiendafy en producción en la VPS de Hostinger donde
ya corren **cking** y **ckinsight**, con **Caddy delante de todo**.

> **Estado al 15-oct-2026.** Partes 1 a 3 hechas: Tiendafy es público desde el
> 13-oct, con Caddy en 80/443 y nginx detrás (respaldo en
> `/root/nginx-antes-de-caddy`). Falta: la app de Mercado Pago (1.7), apagar
> `certbot.timer` (3.6), la Parte 4 (cuenta y tiendas reales) y, cuando
> quieras, la 5 (deploy automático). El día a día del deploy está en
> [despliegue.md](./despliegue.md), y dónde quedó cada cosa en el servidor
> (repo, `.env.prod`, backups, logs, Caddy), en
> [Dónde está cada cosa en el servidor](./despliegue.md#dónde-está-cada-cosa-en-el-servidor).

## Cómo queda

```
                    internet (80 / 443)
                            │
                ┌───────────┴───────────┐
                │  Caddy (infra/edge)   │  certificados de TODO el servidor,
                │  un archivo por       │  automáticos (también los dominios
                │  sistema en sites/    │  propios de las tiendas)
                └───────────┬───────────┘
          ┌─────────────────┼──────────────────────────┐
          │                 │                          │
 nginx 127.0.0.1:8081   Tiendafy (Docker)          (lo que venga:
 ├─ cking.com.ar        ├─ API     127.0.0.1:5080   un archivo nuevo
 │   (fotos de disco,   ├─ tiendas 127.0.0.1:3000   en sites/)
 │   límites, rutas)    └─ panel   127.0.0.1:8090
 └─ ckinsight.cking.com.ar
```

**¿Por qué un solo Caddy y no uno por sistema?** El 443 de una IP lo puede
escuchar un único programa. Con un Caddy por sistema, dos de ellos tendrían que
ir en otros puertos *detrás* del primero, así que igual habría una sola
puerta, más dos saltos y dos programas más para mantener. La separación ya
está donde importa: cada sistema tiene su archivo en `sites/`, su propio
backend y sus propios certificados. Un `caddy reload` con un archivo roto se
rechaza y queda andando la configuración anterior. Y los dominios propios de
las tiendas (el bloque `https://` que atiende cualquier dominio) solo los
puede atender el que tiene el 443.

| Dirección | Qué es |
|---|---|
| `puenteoriente.com.ar` | La tienda **Puente Oriente** (`PRIMARY_STORE_SUBDOMAIN=puenteoriente`) |
| `www.puenteoriente.com.ar` | Redirige al dominio pelado |
| `admin.puenteoriente.com.ar` | El panel |
| `api.puenteoriente.com.ar` | La API (también la usan Mercado Pago y Resend para avisar) |
| `img.puenteoriente.com.ar` | Las fotos (Cloudflare R2, no pasa por el servidor) |
| `<tienda>.puenteoriente.com.ar` | Cada una de las otras tiendas |

**Lo único con corte** es la Parte 3 (el cambio de puerta): cking y ckinsight
quedan sin HTTPS unos 30–60 segundos, mientras Caddy saca sus certificados.
Todo lo demás se hace con los sitios andando. La vuelta atrás está en la
Parte 6 y lleva dos minutos.

Staging queda para más adelante. Con 7,8 GB de RAM y cking al lado, arrancamos
solo con producción.

> **Las claves no van por chat ni por email.** Cada clave que saques en la
> Parte 1 se pega directo en un archivo del servidor (Parte 2). Mientras tanto,
> guardalas en tu gestor de contraseñas.

---

## Parte 1 — Cuentas y DNS (desde tu PC, el servidor no se toca)

Hay un huevo y la gallina: para tener mails `@puenteoriente.com.ar` el dominio
primero tiene que estar en Cloudflare. Por eso el orden importa.

### 1.1 Cloudflare: la cuenta y el dominio

1. Entrá a <https://dash.cloudflare.com/sign-up> y creá la cuenta con tu Gmail
   (después, en *My Profile*, le cambiás el email a `admin@puenteoriente.com.ar`).
2. **Add a domain** → `puenteoriente.com.ar` → plan **Free**.
3. Cloudflare busca los registros que el dominio ya tiene y los importa. **Revisá
   la lista**: si hoy el dominio tiene una web o un correo funcionando, tienen
   que estar ahí antes de seguir (si falta alguno, agregalo a mano).
4. Al final te muestra **dos nameservers** (algo como `xxx.ns.cloudflare.com`).
   Anotalos.

### 1.2 NIC.ar: pasarle el dominio a Cloudflare

1. Entrá a <https://nic.ar> con tu clave fiscal → *Mis dominios* →
   `puenteoriente.com.ar` → **Delegar** (o *Modificar delegaciones*).
2. Borrá los servidores de DNS que tenga y poné los dos de Cloudflare.
3. Confirmá. Tarda de minutos a unas horas: cuando esté listo, Cloudflare te
   manda un mail y el dominio aparece como **Active** en el panel.

Seguí con lo demás cuando diga **Active**.

### 1.3 Los registros DNS

En Cloudflare → `puenteoriente.com.ar` → **DNS → Records** → *Add record*:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| `A` | `@` | `31.97.166.27` | **DNS only** (nube gris) |
| `A` | `*` | `31.97.166.27` | **DNS only** (nube gris) |

El `*` cubre `admin.`, `api.`, `www.` y cada tienda: no hace falta cargarlos
uno por uno. **La nube tiene que quedar gris**: así los certificados los saca
Caddy y a las aplicaciones les llega la IP real de cada visitante (los límites
de intentos de login dependen de eso).

`cking.com.ar` **no se toca**: su DNS sigue donde está.

### 1.4 Los mails @puenteoriente.com.ar (gratis)

Cloudflare → `puenteoriente.com.ar` → **Email → Email Routing** → *Get started*:

1. *Destination addresses* → agregá tu Gmail y confirmalo desde el mail que te llega.
2. *Routing rules* → *Create address* → `admin` → que mande a tu Gmail.
3. Cloudflare agrega solo los registros MX que hacen falta.

Desde ahora, lo que llegue a `admin@puenteoriente.com.ar` aparece en tu Gmail.
Es para recibir (darte de alta en servicios, avisos); los mails a tus clientes
los manda Resend (1.6).

> Desde acá, **todas las cuentas se crean con `admin@puenteoriente.com.ar`**.

### 1.5 Cloudflare R2: las fotos de las tiendas

1. Cloudflare → **R2 Object Storage** → activarlo. Pide una tarjeta aunque el
   uso entre en el plan gratis (10 GB y salida de datos sin costo).
2. **Create bucket** → `tiendafy-media` (ubicación: Automatic).
3. **Create bucket** → `tiendafy-private`.
4. Entrá a `tiendafy-media` → **Settings → Custom Domains → Connect Domain** →
   `img.puenteoriente.com.ar`. Esto hace pública la carpeta de fotos y le pone
   la CDN de Cloudflare. **Solo a este bucket**: el privado (adjuntos del chat)
   no se expone nunca.
5. Volvé a R2 → **Manage R2 API Tokens → Create API token**:
   - Permisos: **Object Read & Write**.
   - *Specify bucket(s)*: `tiendafy-media` y `tiendafy-private`.
   - Crealo y anotá: **Access Key ID**, **Secret Access Key** y el endpoint
     **S3** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`). La clave secreta
     se muestra una sola vez.

### 1.6 Resend: los mails que manda la plataforma

Recuperar contraseñas, sumar gente al equipo, avisos de pedidos.

1. <https://resend.com/signup> con `admin@puenteoriente.com.ar`.
2. **Domains → Add Domain** → `puenteoriente.com.ar`.
3. Resend ofrece **cargar los registros en Cloudflare solo** (botón de
   Cloudflare). Si no, copialos a mano en Cloudflare → DNS (son TXT y MX en el
   subdominio `send.` y un TXT de DKIM). **No chocan** con los MX del 1.4.
4. **Verify**. Cuando el dominio diga *Verified*:
5. **API Keys → Create API Key** → permiso *Sending access*, dominio
   `puenteoriente.com.ar`. Anotala (`RESEND_API_KEY`).
6. **Webhooks → Add Endpoint**:
   - URL: `https://api.puenteoriente.com.ar/api/v1/webhooks/resend`
   - Eventos: `email.bounced` y `email.complained`.
   - Anotá el **Signing Secret** (`EMAIL_WEBHOOK_SECRET`).

   El webhook se puede crear ya: Resend empieza a usarlo cuando la API exista.

### 1.7 Mercado Pago: la app de la plataforma

Tiendafy es **una** app de Mercado Pago; cada tienda conecta su propia cuenta
desde el panel y cobra en su nombre.

1. <https://www.mercadopago.com.ar/developers/panel/app> (con la cuenta de MP de
   la empresa) → **Crear aplicación** → pagos online, Checkout Pro.
2. En la app, la **URL de redireccionamiento** (OAuth):
   `https://api.puenteoriente.com.ar/api/v1/payments/mercadopago/callback`
3. **Webhooks → Configurar notificaciones** (modo productivo):
   - URL: `https://api.puenteoriente.com.ar/api/v1/payments/webhooks/mercadopago`
   - Evento: **Pagos**.
   - Anotá la **clave secreta** que muestra (`MP_WEBHOOK_SECRET`).
4. **Credenciales de producción**: anotá **Client ID** y **Client Secret**.

Más detalle: [integraciones/mercadopago.md](./integraciones/mercadopago.md).

### 1.8 Token de Cloudflare para Caddy

Es para el certificado comodín (`*.puenteoriente.com.ar`): con él, cada tienda
nueva tiene HTTPS desde el primer visitante.

Cloudflare → arriba a la derecha → **My Profile → API Tokens → Create Token** →
plantilla **Edit zone DNS** → *Zone Resources*: `Include` → `Specific zone` →
`puenteoriente.com.ar` → crear. Anotalo (`CLOUDFLARE_API_TOKEN`): se muestra
una sola vez.

### 1.9 Token de GitHub para bajar las imágenes

Las imágenes de Docker de Tiendafy las arma GitHub y quedan en tu cuenta
(privadas, aunque el código sea público). El servidor necesita permiso de lectura:

GitHub → **Settings → Developer settings → Personal access tokens → Tokens
(classic) → Generate new token (classic)** → nombre `vps-ghcr`, scope **solo
`read:packages`**, vencimiento a tu gusto → anotalo.

### Checklist de la Parte 1

- [ ] Dominio **Active** en Cloudflare, con los registros `@` y `*` en nube gris
- [ ] `admin@puenteoriente.com.ar` llega a tu Gmail
- [ ] R2: los dos buckets, `img.puenteoriente.com.ar` conectado, Access Key, Secret y endpoint
- [ ] Resend: dominio *Verified*, API key, signing secret del webhook
- [ ] Mercado Pago: Client ID, Client Secret, clave del webhook
- [ ] Token de Cloudflare (DNS) y token de GitHub (`read:packages`)

---

## Parte 2 — Preparar el servidor (cking y ckinsight siguen andando)

No depende de NIC.ar: se puede hacer con el dominio todavía *Pending* en
Cloudflare. Para levantar Tiendafy alcanza con R2 (1.5); Resend y Mercado Pago
se completan después en `.env.prod` y se aplican volviendo a correr
`./infra/deploy.sh prod <tag>`.

Todo se hace con el usuario `deploy` (con `ssh cking` ya entrás como él), salvo
los pasos marcados con `su -`. El repo va en **`/srv/tiendafy`**, una ruta
absoluta en la raíz del disco, no adentro del home de `deploy`.

### 2.1 Entrar y darle Docker al usuario `deploy`

```bash
ssh cking
su -                                   # pasa a root
usermod -aG docker deploy              # deploy puede usar Docker
mkdir -p /srv/tiendafy && chown deploy:deploy /srv/tiendafy
exit                                   # vuelve a deploy
exit                                   # cierra la sesión (el grupo nuevo vale al reentrar)
ssh cking
docker ps                              # ahora tiene que andar sin "permission denied"
```

> Estar en el grupo `docker` equivale en la práctica a ser root. Es lo normal
> en un servidor de un solo dueño, y es lo que permite que GitHub despliegue
> solo (Parte 5) sin usar la cuenta de root.

### 2.2 Bajar el código

El repo es público, así que no hace falta ninguna llave:

```bash
git clone https://github.com/alanshalem/tiendafy.git /srv/tiendafy
```

### 2.3 Que Docker pueda bajar las imágenes

```bash
docker login ghcr.io -u alanshalem       # pide la contraseña: pegá el token de GitHub (1.9)
```

### 2.4 Las variables de producción

```bash
cd /srv/tiendafy/infra/docker
cp .env.prod.example .env.prod
chmod 600 .env.prod
openssl rand -base64 32                  # la contraseña de la base: copiala
nano .env.prod
```

Completá así (lo que no figura acá, dejalo como viene):

| Variable | Valor |
|---|---|
| `STACK_DOMAIN` | `puenteoriente.com.ar` |
| `PRIMARY_STORE_SUBDOMAIN` | `puenteoriente` |
| `POSTGRES_PASSWORD` | la que generó `openssl` |
| `BRAND_NAME` | `Puente Oriente` (lo que ve tu equipo en el panel; vacío = Tiendafy) |
| `REGISTRY` | `ghcr.io/alanshalem/tiendafy` (ya viene) |
| `MEDIA_ENDPOINT` | el endpoint S3 de R2 (1.5) |
| `MEDIA_PUBLIC_BASE_URL` | `https://img.puenteoriente.com.ar` |
| `MEDIA_ACCESS_KEY` / `MEDIA_SECRET_KEY` | las de R2 (1.5) |
| `EMAIL_FROM` | `Puente Oriente <no-responder@puenteoriente.com.ar>` |
| `RESEND_API_KEY` / `EMAIL_WEBHOOK_SECRET` | las de Resend (1.6) |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `MP_WEBHOOK_SECRET` | las de Mercado Pago (1.7) |
| `REVALIDATE_SECRET` | otro generado con `openssl rand -hex 32` (lo publicado se ve en la tienda al toque) |

Los puertos (`API_PORT=5080`, `WEB_PORT=3000`, `ADMIN_PORT=8090`) ya vienen y
**no chocan** con cking (3001, 5100) ni con ckinsight (8082, 8083).

Lo opcional (Sentry, Meta, X, IA) se puede completar después: vacío = apagado.

### 2.5 Las variables del borde (Caddy)

```bash
cd /srv/tiendafy/infra/edge
cp .env.example .env
chmod 600 .env
nano .env
```

| Variable | Valor |
|---|---|
| `ACME_EMAIL` | `admin@puenteoriente.com.ar` |
| `TIENDAFY_DOMAIN` | `puenteoriente.com.ar` |
| `CLOUDFLARE_API_TOKEN` | el de 1.8 |

### 2.6 Levantar Tiendafy (todavía no es público)

Buscá el tag de la última versión: en GitHub → **Actions → docker-release** →
la última corrida verde de `main` → el commit (7 caracteres). O en el servidor:

```bash
cd /srv/tiendafy
git rev-parse --short=7 HEAD            # ej. e3a4c1a  → el tag es sha-e3a4c1a
./infra/deploy.sh prod sha-e3a4c1a
```

`deploy.sh` baja las imágenes, crea la base, corre las migraciones y levanta
todo escuchando **solo adentro** del servidor. Tiene que mostrar
`==> esperando la API ... OK` y después `storefront OK` y `admin OK`. Comprobá:

```bash
curl -s http://127.0.0.1:5080/health                          # Healthy
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/  # 200
docker stats --no-stream                                      # cuánta RAM usa cada cosa
```

### 2.7 Preparar Caddy (todavía apagado)

```bash
cd /srv/tiendafy/infra/edge
docker compose build                    # Caddy con el plugin de Cloudflare (tarda unos minutos)
docker compose run --rm caddy caddy validate --config /etc/caddy/Caddyfile
```

Tiene que terminar en **`Valid configuration`**.

### 2.8 Traer las configuraciones nuevas de nginx

Los archivos nuevos (`cking.detras-de-caddy.conf` y
`ckinsight.detras-de-caddy.nginx.conf`) tienen que estar commiteados y pusheados
en los repos de cking y ckinsight. En el servidor:

```bash
su -
cd /root/cking && git pull
cd /root/ckinsight && git pull
ls /root/cking/deploy/nginx/cking.detras-de-caddy.conf /root/ckinsight/deploy/ckinsight.detras-de-caddy.nginx.conf
```

---

## Parte 3 — El cambio de puerta (el único momento con corte)

Hacelo en un horario tranquilo, y **con el dominio ya *Active* en Cloudflare**
(1.2): sin eso Caddy no puede sacar los certificados de `puenteoriente.com.ar`.
A cking y ckinsight no los afectaría, pero no tiene sentido cambiar la puerta
dos veces. Todo como **root** (`su -`).

### 3.1 Respaldo de nginx

```bash
cp -a /etc/nginx /root/nginx-antes-de-caddy
```

### 3.2 Poner las configuraciones nuevas (nginx todavía no las usa)

```bash
# Qué archivo usa cada sitio (los enlaces de sites-enabled):
CKING=$(readlink -f /etc/nginx/sites-enabled/cking)
CKINSIGHT=$(readlink -f /etc/nginx/sites-enabled/ckinsight)
echo "$CKING"; echo "$CKINSIGHT"

cp /srv/tiendafy/infra/edge/nginx/detras-de-caddy.conf /etc/nginx/conf.d/
cp /root/cking/deploy/nginx/cking.detras-de-caddy.conf "$CKING"
cp /root/ckinsight/deploy/ckinsight.detras-de-caddy.nginx.conf "$CKINSIGHT"

nginx -t
```

`nginx -t` tiene que decir **`syntax is ok`** y **`test is successful`**. Si
no, **pará acá**: restaurá con la Parte 6 (todavía no se cortó nada).

### 3.3 El cambio (una sola línea, para que el corte dure lo menos posible)

```bash
systemctl reload nginx && cd /srv/tiendafy/infra/edge && docker compose up -d
```

nginx suelta el 80 y el 443 y pasa a escuchar en `127.0.0.1:8081`; Caddy los
toma en el mismo instante.

### 3.4 Mirar cómo saca los certificados

```bash
docker compose logs -f caddy            # Ctrl+C para salir
```

Esperá a ver **`certificate obtained successfully`** para `cking.com.ar`,
`www.cking.com.ar`, `ckinsight.cking.com.ar`, `puenteoriente.com.ar`,
`*.puenteoriente.com.ar`, `api.`, `admin.` y `www.`. Suele tardar menos de un
minuto. El comodín puede tardar un poco más (espera a que se publique un
registro en Cloudflare).

### 3.5 Comprobar

```bash
for u in https://cking.com.ar https://www.cking.com.ar https://ckinsight.cking.com.ar \
         https://puenteoriente.com.ar https://admin.puenteoriente.com.ar https://api.puenteoriente.com.ar/health; do
  printf '%-45s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "$u")"
done
```

Esperado:

- **200** en todo.
- **301** en `www.cking.com.ar`.
- `puenteoriente.com.ar` puede dar 404 hasta que crees la tienda (Parte 4).

Además:

- Corré el chequeo de cking: `/root/cking/deploy/verificar-sitio.sh`.
- Entrá a cking y a ckinsight desde el navegador, y logueate en los dos.
- **IP real**: `tail -5 /var/log/nginx/access.log` tiene que mostrar IPs de
  visitantes, **no** `127.0.0.1`. Si muestra `127.0.0.1`, falta
  `/etc/nginx/conf.d/detras-de-caddy.conf` y los límites por IP de cking se
  compartirían entre todos: volvé atrás (Parte 6) y revisá el paso 3.2.

Si algo de cking o ckinsight no anda: **Parte 6**, y después lo miramos tranquilos.

### 3.6 Apagar certbot (unos días después, cuando todo esté probado)

Caddy saca y renueva todos los certificados; certbot ya no tiene nada que hacer.

```bash
systemctl disable --now certbot.timer
```

No borres `/etc/letsencrypt`: es lo que usa la vuelta atrás.

---

## Parte 4 — Arrancar la tienda

1. Entrá a **https://admin.puenteoriente.com.ar** → **Crear cuenta**. Solo la
   primera cuenta de una instalación vacía se puede registrar sola; las demás
   las sumás vos desde el panel. Confirmá el email (llega por Resend).
2. **Crear tienda** → nombre `Puente Oriente`, subdominio **`puenteoriente`**
   (tiene que coincidir con `PRIMARY_STORE_SUBDOMAIN`). Desde ese momento,
   **https://puenteoriente.com.ar** muestra esa tienda.
3. Creá las demás tiendas: cada una queda en `<subdominio>.puenteoriente.com.ar`.
4. En cada tienda: **Configuración → Medios de pago → Conectar Mercado Pago**
   (con la cuenta de MP que cobra en esa tienda).
5. **Configuración → Usuarios**: sumá a tu equipo con su rol. A cada uno le
   llega un mail para poner su contraseña.
6. Hacé una compra de prueba de punta a punta.

---

## Parte 5 — Deploy automático (cuando quieras)

Hasta acá, cada versión nueva se despliega a mano con
`./infra/deploy.sh prod sha-XXXXXXX`. Para que GitHub lo haga solo, **con tu
aprobación** en cada salida a producción:

1. **Primero la aprobación**: GitHub → repo **tiendafy → Settings →
   Environments → production → Required reviewers** → vos → *Save protection
   rules*. Va antes que todo lo demás: en cuanto exista la variable
   `PLATFORM_DOMAIN` (paso 3), cada push a `main` intenta desplegar, y sin
   este paso lo haría sin preguntarte.

2. Una llave para que GitHub entre como `deploy`. En **tu PC**:

   ```bash
   ssh-keygen -t ed25519 -C "github actions → vps" -f tiendafy-actions -N ""
   ```

   Agregá el contenido de `tiendafy-actions.pub` al final de
   `/home/deploy/.ssh/authorized_keys` en el servidor.

3. GitHub → repo **tiendafy → Settings → Secrets and variables → Actions**:
   - *Secrets*:
     - `DEPLOY_HOST` = `31.97.166.27`
     - `DEPLOY_USER` = `deploy`
     - `DEPLOY_SSH_KEY` = el contenido del archivo privado `tiendafy-actions`
   - *Variables*:
     - `PLATFORM_DOMAIN` = `puenteoriente.com.ar`
     - `DEPLOY_PATH` = `/srv/tiendafy`
4. Borrá el archivo privado `tiendafy-actions` de tu PC: ya está en GitHub.

Desde ahí, cada push a `main` arma las imágenes, espera tu aprobación y
despliega. Mientras no exista la variable `STAGING_DOMAIN`, staging se saltea
solo; y mientras no exista `PLATFORM_DOMAIN`, producción también (GitHub solo
arma las imágenes).

Dos cosas que el deploy automático no resuelve solo:

- **Un cambio de major de Postgres** frena el deploy (`deploy.sh` lo detecta).
  Se corre a mano `./infra/pg-upgrade.sh prod` y se vuelve a aprobar.
- El workflow deja el servidor en el commit exacto que desplegó (`git checkout
  <sha>`, sin rama). Para volver a desplegar a mano con `git pull`, primero
  `git checkout main`.

---

## Parte 6 — Vuelta atrás (dos minutos)

Deja cking y ckinsight **exactamente como estaban** (con sus certificados de
certbot):

```bash
su -
cd /srv/tiendafy/infra/edge && docker compose down           # Caddy suelta 80/443
rm -rf /etc/nginx && cp -a /root/nginx-antes-de-caddy /etc/nginx
nginx -t && systemctl reload nginx                           # nginx vuelve al 80/443
```

Tiendafy sigue corriendo adentro, sin ser público, hasta que lo intentemos de
nuevo.

---

## Parte 7 — El día a día

**Sumar otro sistema al servidor**: que escuche en `127.0.0.1:<puerto>` y crear
`/srv/tiendafy/infra/edge/sites/<sistema>.caddy` (commitealo en el repo):

```
nuevo.dominio.com {
	reverse_proxy 127.0.0.1:<puerto>
}
```

```bash
cd /srv/tiendafy/infra/edge && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

El certificado sale solo. El DNS de ese dominio tiene que apuntar a `31.97.166.27`.

**Cambié algo de `infra/edge`** (llegó con un deploy): Caddy no se reinicia
solo con los deploys de Tiendafy, a propósito. Recargalo con el `caddy reload`
de arriba.

**Ver qué pasa**: `docker compose -f /srv/tiendafy/infra/edge/docker-compose.yml logs -f caddy`
y, para Tiendafy, `cd /srv/tiendafy/infra/docker && docker compose -f
docker-compose.stack.yml --env-file .env.prod logs -f api`.

---

## Pendiente (no frena la salida)

- **Dominios propios de las tiendas** (`volxen.com.ar` en vez de
  `volxen.puenteoriente.com.ar`): Caddy ya saca el certificado solo (lo valida
  contra la API). **Falta del lado de la aplicación**:
  - la API todavía exige agregar cada dominio propio a mano a CORS;
  - la sesión del comprador vive en `api.puenteoriente.com.ar`, que desde otro
    dominio es "de terceros" y el navegador no la manda.

  Se resuelve sirviendo la API desde el mismo dominio de cada tienda. Hay que
  hacerlo **antes de conectar el primer dominio propio**.
- **Copia fuera del servidor**: los backups diarios (la base **y** el keyring
  `dpkeys`, sin el cual los tokens de Mercado Pago y los certificados de ARCA no
  se pueden descifrar) quedan en `/srv/tiendafy/infra/docker/backups/prod`. El
  servicio `backup-offsite` los sube cifrados a un bucket S3: un bucket nuevo de
  R2, o el mismo Backblaze B2 que usa cking por su API S3
  (`OFFSITE_PROVIDER=Other`, `OFFSITE_ENDPOINT=https://s3.<región>.backblazeb2.com`).
  Pasos en [despliegue.md → Copia fuera del servidor](./despliegue.md#copia-fuera-del-servidor). Y el control semanal
  de que se pueden restaurar: `infra/check-backup.sh` en el cron.
- **Postgres 18**: producción salió el 13-oct con Postgres 16 y el compose
  pide la 18 desde el 15-oct. Si todavía no se migró, el próximo
  `./infra/deploy.sh prod …` se frena y pide correr antes
  `./infra/pg-upgrade.sh prod` (ver [despliegue.md](./despliegue.md#cambiar-de-major-de-postgres-16--18)).
- **Staging** (`stg.puenteoriente.com.ar`): cuando haga falta. Los puertos ya
  están separados en `.env.staging.example`.
- **Sentry**, apps de **Meta / X / Mercado Libre**, clave de **IA**: se
  completan en `.env.prod` cuando los tengas, y `./infra/deploy.sh prod <tag>`
  los toma.
- Certificado de **ARCA** (facturación), Payway, WhatsApp y los carriers: no
  van en `.env.prod`; cada tienda los carga desde su panel (Configuración) y
  quedan cifrados en la base ([configuracion.md](./configuracion.md)).
