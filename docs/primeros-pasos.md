# Primeros pasos

Lo que necesitás el primer día para levantar Tiendafy, probarlo y saber dónde
tocar. El índice de toda la documentación está en [README.md](./README.md).

Tiendafy es la plataforma con la que una importadora opera varias tiendas
propias desde un panel. "Multi-tenant" acá quiere decir varias tiendas de la
misma empresa: cada fila lleva `tenant_id` y cada módulo filtra por tienda.

## 1. Requisitos

| Herramienta | Versión                         | Nota                                                                |
| ----------- | ------------------------------- | ------------------------------------------------------------------- |
| Docker      | Docker Desktop (Windows) o Engine | Postgres 18, MinIO y pgAdmin corren en contenedores               |
| .NET SDK    | 10                              | `setup.*` lo exige                                                  |
| Node        | 26 (`.node-version`)            | Desde Node 25 no hay corepack                                       |
| pnpm        | la de `packageManager` en `package.json` | `npm install -g pnpm`; al correr en el repo se pasa sola a esa versión |

## 2. Primera vez

```powershell
.\setup.ps1              # Windows. Opciones: -SkipDocker, -SkipTests
./setup.sh               # Linux/macOS/WSL. Opciones: --skip-docker, --skip-tests
```

Hace, en orden: chequea requisitos, levanta `infra/docker/docker-compose.dev.yml`
(Postgres, MinIO, pgAdmin), `pnpm install`, compila el backend y corre sus tests.

Los tests de integración del backend usan el Postgres de dev (base
`tiendafy_itests`, aparte de la de desarrollo): con `-SkipDocker` y sin
Postgres levantado, fallan.

> Si venís de antes del 15-oct-2026: el Postgres de dev pasó a la 18 con un
> volumen nuevo (`postgres18_data`) y arranca vacío. Para traer tus datos de la
> 16, seguí [despliegue.md → Cambiar de major de Postgres → Desarrollo](./despliegue.md#cambiar-de-major-de-postgres-16--18).

## 3. Día a día

```powershell
.\dev-up.ps1                     # infra + API (:5080) + panel (:5173) + tienda (:3000)
.\dev-up.ps1 -BackendOnly        # solo infra + API
.\dev-up.ps1 -StorefrontPort 3001  # si otra app ya usa el 3000
.\dev-up.ps1 -Tunnel             # túnel cloudflared para webhooks de Mercado Pago
.\dev-up.ps1 -Docker             # todo en contenedores (demo/smoke, sin hot-reload)
.\dev-down.ps1                   # apagar (-KeepInfra deja Docker; -Docker baja el modo contenedores)
```

`dev-up.ps1` espera a que `/health` dé 200 antes de lanzar los frontends, abre
cada uno en su ventana y al final lista las tiendas de la base con su URL. Los
logs de la API quedan en `backend/api-run.log` y `backend/api-err.log`.

Sin Windows, a mano (con la infra arriba):

```bash
cd backend/src/Api && dotnet run          # http://localhost:5080
cd storefront && pnpm dev                 # http://localhost:3000
cd admin && pnpm dev                      # http://localhost:5173
```

## 4. Entrar y tener datos

1. Panel en http://localhost:5173 con `admin@tiendafy.local` / `password123`.
   En Development la API siembra al arrancar una cuenta por rol y dos
   compradores por tienda: [usuarios-de-prueba.md](./usuarios-de-prueba.md).
2. Si no hay tiendas, creá una desde el menú de usuario → **Mis tiendas** (`/tenants`).
3. Para llenarla con datos de ejemplo: `POST /api/v1/dev/demo-seed` sobre la
   tienda activa, como dueño (`?reset=true` borra la demo anterior y la
   rehace). La ruta existe solo en Development.
4. La tienda se ve en `http://<subdominio>.localhost:3000`. `localhost:3000`
   pelado muestra la tienda de `PRIMARY_STORE_SUBDOMAIN` (ver
   [configuracion.md](./configuracion.md#3-variables-de-los-frontends)); sin
   esa variable, "tienda no encontrada".

## 5. Tests

```bash
pnpm verify              # todo lo de CI salvo el e2e, en fases que no ahogan la máquina
pnpm verify --front      # solo panel, tienda y paquetes compartidos
pnpm verify --back       # solo backend
pnpm test:e2e            # Playwright contra el stack levantado
```

Qué hay, cómo correr cada suite y qué exige CI: [tests.md](./tests.md).

## 6. Dónde vive cada cosa

```
backend/src/Api/            composición: endpoints (Endpoints/), arranque (Startup/), workers, orquestación entre módulos
backend/src/Modules/<M>/    un módulo por área, con su DbContext y su filtro de tienda
backend/src/SharedKernel*/  tipos comunes y helpers de persistencia (ModuleDb)
backend/tests/              UnitTests (incluye Architecture/) e IntegrationTests (API real + Postgres)
admin/src/                  panel; el centro de ayuda (/ayuda) sale de src/config/help-content-*.ts
storefront/src/             tienda; las secciones del inicio en components/store/sections/
shared/types/src/sections/  registro único de secciones del editor (ver su README.md)
test-fixtures/              respuestas reales de la API y helpers que comparten las suites del front
e2e/tests/                  specs de Playwright
infra/docker/               compose de dev, overlay full-docker y stack de producción
infra/edge/                 Caddy del borde (80/443) para todo el servidor
scripts/                    verify, fixtures de la API, prueba de carga
```

Los 21 módulos de `backend/src/Modules`: Analytics, Catalog, Checkout,
Content, Customers, Discounts, Finance, Fiscal, Identity, Inventory, Media,
MercadoLibre, Notifications, Orders, Payments, Purchasing, Reviews, Social,
Support, Tenancy y Themes. La mayoría es un solo proyecto `.Infrastructure`;
los que tienen dominio con reglas suman `.Core`, y los que les muestran tipos
a otros módulos, `.Contracts`. Un módulo solo puede referenciar el
`.Contracts` de otro (lo controla
`backend/tests/UnitTests/Architecture/ModuleBoundariesTests.cs`).

## 7. Convenciones

- Código, commits, UI y docs en castellano rioplatense. Commits con el formato
  del historial: `tipo(área): qué cambia` (`fix(pagos): …`, `docs(testing): …`).
- `pre-commit` (husky + lint-staged) formatea lo que commiteás: Prettier en
  TS/CSS/JSON/YAML y `dotnet format --include` en C#. No reemplaza a
  `pnpm verify`: CI corre `dotnet format` sobre toda la solución y compila con
  `-warnaserror`.
- Módulo nuevo: [guias/agregar-un-modulo.md](./guias/agregar-un-modulo.md).
  Permisos: [permisos.md](./permisos.md) (fuente de verdad:
  `backend/src/Modules/Identity/Identity.Infrastructure/Permissions.cs`).
  UI: [sistema-visual.md](./sistema-visual.md). Decisiones de arquitectura: [adr/](./adr/).
- Un bug arreglado lleva su test de regresión ([tests.md](./tests.md#convenciones)).

## 8. Problemas comunes

| Síntoma                                                     | Qué hacer                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| El 3000 lo usa otra app                                     | `.\dev-up.ps1 -StorefrontPort 3001`; el script actualiza `VITE_STOREFRONT_ORIGIN` en `admin/.env.local`        |
| `dotnet build` falla con MSB3027 (DLL bloqueada por `Api`)  | La API de `dev-up` sigue corriendo: `.\dev-down.ps1 -KeepInfra` y compilá de nuevo                            |
| "Ver mi tienda" o el editor apuntan a un puerto vacío       | Revisá `VITE_STOREFRONT_ORIGIN` en `admin/.env.local` (plantilla `http://{sub}.localhost:<puerto>`)           |
| Docker dice "Engine running" pero los puertos no responden | `dev-up.ps1` reinicia Docker Desktop solo una vez; si sigue, reinicialo a mano                               |
