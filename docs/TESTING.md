# Tests y CI

Qué se prueba, con qué, cómo se corre y qué exige CI. La idea rectora: probar
contra la cosa real (Postgres de verdad, respuestas reales de la API, un
navegador donde hace falta) y tener un solo lugar para cada pieza compartida.

## El mapa

| Tipo | Qué cubre | Dónde | Cómo se corre | En CI |
| --- | --- | --- | --- | --- |
| Unitarios (backend) | Dominio, reglas, value objects, handlers; arquitectura (fronteras entre módulos, filtro de tienda en cada entidad) | `backend/tests/UnitTests` (`Architecture/` para lo segundo) | `dotnet test tests/UnitTests` desde `backend/` | Backend CI |
| Integración (backend) | Cada flujo por HTTP contra la API real y Postgres: checkout, pagos (MP, Payway, transferencia), envíos (Correo, Andreani, Zipnova), ARCA, Mercado Libre, campañas, finanzas, permisos, aislamiento entre tiendas | `backend/tests/IntegrationTests` | `dotnet test tests/IntegrationTests` | Backend CI |
| Contrato | Forma de lo que la API le devuelve a la tienda y a los listados | `StorefrontContractTests`, `ListContractTests` | (integración) | Backend CI |
| Smoke de la API | Todas las rutas GET (dueño, anónimo, con y sin tienda, con ids reales): ninguna da 5xx | `ApiSmokeTests` | (integración) | Backend CI |
| Performance | Ningún listado hace una consulta por fila; el catálogo público aguanta 20 pedidos concurrentes con p95 < 1 s | `PerformanceTests` | (integración) | Backend CI |
| Componentes (panel) | Todas las pantallas con datos reales y los flujos de cada una | `admin/src/__tests__` | `pnpm --filter ./admin exec vitest run` | Frontend CI, con piso de cobertura |
| Componentes (tienda) | Las páginas como las sirve Next (Server Components resueltos): checkout, cuenta, ficha, catálogo, editor en vivo | `storefront/src/__tests__` | `pnpm --filter ./storefront exec vitest run` | Frontend CI, con piso de cobertura |
| Exploratorios | En cada pantalla: aprieta cada botón, completa cada formulario y abre cada diálogo; nada puede romperse | `interactions.test.tsx` (panel y tienda) | (vitest) | Frontend CI |
| Accesibilidad (jsdom) | axe-core (WCAG 2.1 A/AA sin layout) en cada pantalla, cada página y cada diálogo que abre el explorador | `a11y.test.tsx` + `interactions.test.tsx` | (vitest) | Frontend CI |
| E2E | Camino que factura (tienda → producto → checkout → pedido por transferencia → pago registrado en el panel), 404 y buscador, filtros en el celular, tienda en construcción, token de vista previa, pantallas críticas del panel | `e2e/tests/*.spec.ts` | `pnpm test:e2e` | Workflow E2E |
| Smoke e2e | Un despliegue está vivo: API, tienda por host, catálogo, sitemap/robots, login | `e2e/tests/smoke.spec.ts` (`@smoke`) | `pnpm test:smoke` | (dentro del E2E) |
| Accesibilidad (navegador) | axe en Chromium, contraste de color incluido | `e2e/tests/accesibilidad.spec.ts` | (e2e) | (dentro del E2E) |
| Carga y protección | Usuarios virtuales recorriendo la tienda (p50/p95/p99); el rate limit corta el abuso con 429 | `scripts/load-test.mjs` | `pnpm test:load` / `pnpm test:load -- --mode protection` | No |

## Qué necesita cada suite

- **Unitarios y componentes**: nada.
- **Integración**: el Postgres de dev en `localhost:5432` (`docker compose -f
  infra/docker/docker-compose.dev.yml up -d postgres`). Usan su propia base,
  `tiendafy_itests`, que migran al arrancar; `TIENDAFY_TEST_DB` la cambia por
  otra cadena de conexión. Todo el HTTP saliente pasa por `FakeHttp`.
- **E2E, smoke y carga**: el stack levantado (`.\dev-up.ps1`). Contra dev, el
  smoke y la accesibilidad miran la tienda `canicari`; si no la tenés, usá
  `E2E_STORE=<subdominio>`. Otro stack: `E2E_API_URL`, `E2E_ADMIN_URL`,
  `E2E_STORE_DOMAIN` y `E2E_STORE`. Con `E2E_SEED=1`, `e2e/tests/seed.setup.ts`
  arma la tienda de la corrida desde una base vacía (así corre en CI). Ningún
  e2e toca una pasarela de pago: el camino crítico paga por transferencia.

En desarrollo el navegador, la tienda (SSR), el panel y el e2e llegan todos
desde 127.0.0.1, por eso `appsettings.Development.json` sube el techo global a
5000 pedidos/min. Con el de producción (300) una corrida del e2e lo agota.

## Verificar todo en local: `pnpm verify`

`scripts/verify.mjs` corre lo mismo que CI (menos el e2e) en fases, con el
paralelismo que aguanta la máquina, y deja un log por paso en `.verify/`:

1. Prettier, ESLint y tipos de todos los paquetes, en paralelo.
2. Las suites del panel y de la tienda: juntas si hay 8 GB libres o más (cada
   una con la mitad de los workers); si no, de a una.
3. Builds (`next build`, `vite build` y el backend en Release con
   `-warnaserror --no-incremental`), en paralelo si hay 7 GB libres o más.
4. Backend: `dotnet format --verify-no-changes` y unitarios juntos; después
   integración, sola (necesita el Postgres de dev).

| Opción | Qué hace |
| --- | --- |
| `--front` | Solo panel, tienda y paquetes compartidos |
| `--back` | Solo backend |
| `--coverage` | Los tests del front con cobertura, como CI |
| `--seq` | Todo de a uno (máquina cargada) |

Al final muestra una tabla con tiempos, la RAM libre mínima y la cola del log
de lo que falló.

Las suites del front nunca corren al lado de un build: miden tiempos
(`findBy`, debounces) y con la CPU compartida fallan sin que el código tenga
nada. Si una falla por timeout con la máquina ocupada, corréla sola antes
de investigar.

**Workers de vitest.** Los dos `vitest.config.ts` usan
`test-fixtures/workers.ts`: en local, el 30 % de los núcleos y no más de uno
cada 1,5 GB libres (mínimo 2); en CI, el default de vitest.
`VITEST_MAX_WORKERS` (un número o un porcentaje) o `--maxWorkers` lo pisan.
Cada worker carga el panel o la tienda enteros en jsdom: con el default
(núcleos menos uno) una máquina de 20 hilos se queda sin RAM.

## Cobertura

| Alcance | Piso | Dónde se exige |
| --- | --- | --- |
| Backend total (unit + integración, unidos por archivo y línea) | 93 % | `backend-ci.yml` → `python tools/coverage.py test-results --min 93` |
| Backend, dominio (`*.Core` + SharedKernel, solo unit) | 60 % | `backend-ci.yml` |
| Panel (`admin/src` + `shared/types` + `shared/ui`) | 92 % de líneas | `admin/vitest.config.ts` |
| Tienda (`storefront/src`) | 96 % de líneas | `storefront/vitest.config.ts` |

Los pisos son un *ratchet*: cuando la cobertura sube, se sube el piso; nunca se
baja. Para ver qué falta en el backend:

```bash
cd backend
dotnet test tests/UnitTests --collect:"XPlat Code Coverage" --results-directory ./coverage/unit
dotnet test tests/IntegrationTests --collect:"XPlat Code Coverage" --results-directory ./coverage/integration
python tools/coverage.py coverage --top 30            # por proyecto + los archivos con más líneas sin cubrir
python tools/coverage.py coverage --scope 'Payments'  # un alcance (regex sobre el proyecto)
```

En los frontends, `vitest run --coverage` deja `coverage/lcov-report/index.html`.

## Piezas compartidas

- **`test-fixtures/api.json`**: respuestas reales de la API sobre una tienda
  sembrada completa (`SeededStore`: catálogo, ventas, presupuestos, compras,
  campañas, chat, movimientos financieros), incluidas las del comprador
  logueado. Se regeneran con `pnpm fixtures:api` (corre `ApiFixturesExport`
  contra el Postgres de dev). No es determinista: si solo cambiaron unas
  rutas, regenerá aparte y copiá esas rutas, porque reescribir el archivo
  entero puede romper tests ajenos por el orden de los productos.
- **`test-fixtures/mock-api.ts`**: `fetch` simulado con esas respuestas (rutas
  normalizadas como el backend: GUID → `:id`). `api.on(método, ruta,
  respuesta, status)` pisa una ruta; `api.calls` registra método, ruta, body y
  headers de lo que viajó.
- **`test-fixtures/explore.ts`**: el explorador. Completa con valores
  plausibles por tipo de campo y avisa cada diálogo que abre.
- **`test-fixtures/a11y.ts`**: axe-core con las reglas que tienen sentido en
  jsdom, más el chequeo propio `label-sin-campo`. Una regla que no puede correr
  hace fallar el test.
- **`test-fixtures/dom-setup.ts`**: lo que jsdom no trae (`<dialog>` modal con
  Escape, observers, `elementFromPoint`, `Blob.text()`, rectángulos de
  `Range`).
- **Backend** (`backend/tests/IntegrationTests/Infrastructure/`): `ApiFactory`,
  `Merchant` (comercio con sesión y tienda), `Shopper` (comprador con su
  cookie), `SeededStore`, `FakeHttp` (todo HTTP saliente; lo no simulado
  responde 503), `Workers.RunOnceAsync<T>` (una pasada de un worker),
  `SqlCommands` (cuenta consultas de EF), `FakeArca` + `TestCa` +
  `merchant.ConfigureFiscalAsync()` y `merchant.ConnectMercadoPagoAsync(...)`.

## Convenciones

- **Nombres en castellano que digan el comportamiento**:
  `Los_listados_no_hacen_una_consulta_por_fila`, `'un 429 no cierra la sesión
  del comprador cacheado'`.
- **Se verifica lo que viaja a la API** (el body del POST), no solo lo que se
  ve: es lo que cobra, factura o despacha.
- **Buscar por rol y nombre accesible** (`getByRole('button', { name })`). Si
  un control no se encuentra así, tampoco lo encuentra un lector de pantalla:
  es un bug de la UI, no del test.
- **Nombres con paréntesis o puntos**: `rx(nombre)` de `admin/src/test/text.ts`.
- **Un bug encontrado = un test de regresión** que falla sin el arreglo.
- Antes de crear un archivo de test, buscá si ya hay uno del tema.

## CI (GitHub Actions)

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `backend-ci.yml` | Push a `main` y PR que tocan `backend/` | Build Release con `-warnaserror`, `dotnet format --verify-no-changes`, unitarios e integración (Postgres 18 como servicio), pisos de cobertura |
| `frontend-ci.yml` | Push a `main` y PR que tocan frontends, `shared/`, `e2e/`, `test-fixtures/` o la config de pnpm/Node | `pnpm format:check`, `pnpm -r run type-check`, ESLint de panel y tienda, builds de producción, vitest con cobertura |
| `e2e.yml` | Push a `main` y PR que tocan backend o frontends | API en Development + builds de producción de tienda y panel sobre una base vacía (`E2E_SEED=1`, tienda `e2etienda`), Playwright |
| `codeql.yml` | Push a `main`, PR a `main` y los lunes | CodeQL JS/TS y C#. El SARIF se evalúa en el workflow (`upload: never`): un hallazgo `error` rompe el build, un `warning` se anota |
| `gitleaks.yml` | Push a `main` y PR | Secretos en todo el historial |
| `docker-release.yml` | Push a `main` y tags `v*` | Imágenes de API, tienda y panel a GHCR (tag `sha-XXXXXXX`, `GIT_SHA` adentro); deploy a staging si existe la variable `STAGING_DOMAIN` y a producción con aprobación si existe `PLATFORM_DOMAIN` |

CodeQL y gitleaks se saltean en los PR de Dependabot (token de solo lectura) y
corren igual al mergear. Dependabot (`.github/dependabot.yml`) agrupa semanal
con 2 días de espera, para no proponer versiones que pnpm todavía rechaza por
recientes; los majors del stack de Vite/Vitest, TypeScript, ESLint,
`@types/node` y `react-router-dom` se hacen a mano.

## Números de referencia (carga)

Medido en dev (Windows + Docker) contra una tienda con 1.032 productos, 20
usuarios virtuales, 30 s: 631 pedidos/s, p95 88 ms, 0 errores; lo más pesado
es la búsqueda del catálogo (~100 ms de p95 por las facetas). En modo
protección (`--cap` = el cupo global: 5000/min en dev, 300 en producción), de
5.100 pedidos seguidos desde una IP se atienden 5.000 y el resto recibe 429
con `Retry-After`, sin 5xx.
