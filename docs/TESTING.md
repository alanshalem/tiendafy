# Tests de Tiendafy

Qué se prueba, con qué, cómo se corre y qué cuenta como "verde". La idea
rectora: **probar con datos reales y contra la cosa real** (Postgres de verdad,
respuestas reales de la API, un navegador de verdad donde hace falta), y tener
un solo lugar para cada cosa compartida (fixtures, explorador, accesibilidad).

## El mapa

| Tipo | Qué cubre | Dónde | Cómo se corre | En CI |
|---|---|---|---|---|
| **Unitarios (backend)** | Dominio, reglas, value objects, handlers | `backend/tests/UnitTests` | `dotnet test tests/UnitTests` | ✅ + ratchet de dominio ≥ 60 % |
| **Integración / API** | Cada flujo de punta a punta por HTTP contra Postgres real: checkout, pagos (MP, Payway), envíos (Correo, Zipnova, Andreani), ARCA, Mercado Libre, campañas, finanzas, aislamiento multi-tenant | `backend/tests/IntegrationTests` | `dotnet test tests/IntegrationTests` | ✅ |
| **Contrato** | Forma de lo que la API le devuelve al storefront y a los listados | `StorefrontContractTests`, `ListContractTests` | (parte de integración) | ✅ |
| **Smoke de la API** | Todas las rutas GET (dueño, anónimo, con/sin tienda, con ids reales): ninguna da 5xx | `ApiSmokeTests` | (parte de integración) | ✅ |
| **Performance (en cada build)** | Ningún listado hace una consulta por fila (N+1); el catálogo público aguanta 20 pedidos concurrentes con p95 < 1 s | `PerformanceTests` | (parte de integración) | ✅ |
| **Componentes (admin)** | Las 49 pantallas renderizan con datos reales; flujos por pantalla (productos, ventas, compras, finanzas, ARCA, campañas…) | `admin/src/__tests__` | `pnpm --filter ./admin exec vitest run` | ✅ + piso de cobertura |
| **Componentes (tienda)** | Las 17 páginas como las sirve Next (Server Components resueltos); checkout, cuenta, ficha, catálogo, editor en vivo | `storefront/src/__tests__` | `pnpm --filter ./storefront exec vitest run` | ✅ + piso de cobertura |
| **Exploratorios ("monkey")** | Cada pantalla/página: aprieta cada botón, completa cada formulario con valores válidos, abre cada diálogo. Nada puede romperse | `interactions.test.tsx` (admin y tienda) | (parte de vitest) | ✅ |
| **Accesibilidad (jsdom)** | axe-core (WCAG 2.1 A/AA sin layout) en cada pantalla, cada página y **cada diálogo que abre el explorador** | `a11y.test.tsx` + `interactions.test.tsx` | (parte de vitest) | ✅ |
| **Regresión** | Cada bug que encontraron los tests tiene su test, que falla sin el arreglo | En el test de cada área (buscar "regresión") | (todo lo anterior) | ✅ |
| **E2E** | El camino que factura (tienda → producto → carrito → checkout), pantallas críticas del panel | `e2e/tests` | `pnpm test:e2e` con el stack levantado | — |
| **Smoke e2e** | Un despliegue está vivo: API, tienda por host, catálogo, sitemap/robots, login | `e2e/tests/smoke.spec.ts` (`@smoke`) | `pnpm test:smoke` | — |
| **Accesibilidad (navegador)** | axe en Chromium, con contraste de color | `e2e/tests/accesibilidad.spec.ts` | (parte del e2e) | — |
| **Carga y protección** | Usuarios virtuales recorriendo la tienda (p50/p95/p99); el rate limit corta el abuso con 429 | `scripts/load-test.mjs` | `pnpm test:load` / `pnpm test:load -- --mode protection` | — |

Los e2e, el smoke y la carga necesitan el stack levantado (`.\dev-up.ps1`):
no corren en CI.

## Cobertura

| Proyecto | Medido | Piso en CI |
|---|---|---|
| Backend (unit + integración, unidos por archivo y línea) | 92,5 % | 90 % (`tools/coverage.py --min 90`) |
| Backend, solo dominio (`*.Core` + SharedKernel, unit) | — | 60 % |
| Panel (`admin/src` + `@tiendafy/ui` + `@tiendafy/types`) | 71,7 % | 70 % |
| Tienda (`storefront/src`) | 97 % | 95 % |

Los pisos son un *ratchet*: cuando la cobertura sube, se sube el piso; nunca se
baja. Para ver qué falta en el backend:

```bash
cd backend
dotnet test tests/UnitTests --collect:"XPlat Code Coverage" --results-directory ./coverage/unit
dotnet test tests/IntegrationTests --collect:"XPlat Code Coverage" --results-directory ./coverage/integration
python tools/coverage.py coverage --top 30            # por proyecto + los archivos con más líneas sin cubrir
python tools/coverage.py coverage --scope 'Payments'  # un alcance
```

En los frontends, `vitest run --coverage` deja `coverage/lcov-report/index.html`.

## Las piezas compartidas

- **`test-fixtures/api.json`** — las respuestas **reales** de la API sobre la
  tienda sembrada (113 rutas, incluidas las del comprador logueado). Las genera
  el backend: `pnpm fixtures:api` (corre `ApiFixturesExport` contra Postgres).
  Si cambia la forma de una respuesta, se regeneran y los tests de los
  frontends lo notan. La tienda sembrada (`SeededStore`) está completa como
  la deja un comercio: catálogo con categoría, ficha técnica y fotos, ventas,
  presupuestos, compras, campañas, chat posventa, movimiento financiero.
- **`test-fixtures/mock-api.ts`** — `fetch` simulado que responde con esas
  fixtures (rutas normalizadas igual que el backend: GUID → `:id`, slug →
  `:slug`). `api.on(método, ruta, respuesta, status)` pisa una ruta para un
  caso; `api.calls` registra lo que viajó (método, ruta, body, headers).
- **`test-fixtures/explore.ts`** — el explorador ("monkey testing"): una
  fábrica que cada proyecto instancia con su Testing Library. Completa con
  valores plausibles por tipo de campo y avisa cada diálogo que abre.
- **`test-fixtures/a11y.ts`** — axe-core con las reglas que tienen sentido en
  jsdom. Una regla que no puede correr hace fallar el test (así fue como, un
  tiempo, los diálogos quedaban sin revisar).
- **`test-fixtures/dom-setup.ts`** — lo que jsdom no trae: `<dialog>`,
  observers, `elementFromPoint`, Escape que cierra diálogos.
- **Backend**: `Merchant` (un comercio con sesión y su tienda), `Shopper` (un
  comprador con su cookie), `SeededStore`, `FakeHttp` (todo HTTP saliente
  —Mercado Pago, ARCA, carriers, Resend, S3— pasa por acá; lo que no está
  simulado responde 503), `Workers.RunOnceAsync<T>` (una pasada de un worker),
  `SqlCommands` (cuenta las consultas de EF).

## Convenciones

- **Nombres en castellano que digan el comportamiento**, no la función:
  `Los_listados_no_hacen_una_consulta_por_fila`, `'un 429 no cierra la sesión
  del comprador cacheado'`.
- **Se verifica lo que viaja a la API** (el body del POST), no solo lo que se
  ve: es lo que cobra, factura o despacha.
- **Buscar por rol y nombre accesible** (`getByRole('button', { name })`). Si
  un control no se puede encontrar así, tampoco lo encuentra un lector de
  pantalla: es un bug, no un problema del test.
- **Nombres reales con paréntesis o puntos**: `rx(nombre)` (admin `src/test/text.ts`).
- **Un bug encontrado = un test de regresión** que falla sin el arreglo.

## Lo que encontraron los tests (y se arregló)

Funcionales y de seguridad: membresías de tienda con un rol inexistente,
`/shipping/methods` y `/checkout-settings` sin exigir tienda, certificado ARCA
activado sin habilitar la facturación, URLs firmadas de MinIO con el esquema
equivocado, la cotización de Andreani bloqueada para el comprador, el sitemap
que publicaba el catálogo de una tienda en construcción, y el panel/la tienda
que mostraban "sesión cerrada" ante un 429 o un corte de la API.

Accesibilidad: el carrito y el panel de filtros cerrados seguían alcanzables
con Tab; los menús "Más" y "Categorías" no abrían con un tap en tablets; los
menús ⋮ y varios botones de ícono, selects, switches y campos sin nombre
accesible; el `Modal` y los `Tabs` compartidos sin nombre/estado accesible.

## Pendientes conocidos

- **Contraste de color (WCAG AA, 4,5:1)**: lo mide el e2e en navegador y queda
  como `test.fixme`. En el panel fallan tokens de diseño (menú lateral 4,34:1 y
  2,42:1; azul `#007aff` con texto blanco 4,01:1); en la tienda, colores que
  elige cada comercio. Corregirlo cambia la identidad visual: es una decisión
  de diseño.
- **128 `<label>` del panel sin `htmlFor`**: los campos se encuentran por su
  placeholder (axe lo acepta), pero hacer clic en la etiqueta no enfoca el
  campo. `FormField` ya lo hace bien; migrar a `FormField` es lo recomendado.
- **Pool de conexiones en frío**: la primera ráfaga concurrente paga abrir las
  conexiones a Postgres (en Docker Desktop, ~380 ms cada una). Si en producción
  hay picos después de períodos ociosos, conviene `Minimum Pool Size` en la
  cadena de conexión.

## Números de referencia (carga, dev en Windows + Docker)

Contra una tienda con 1.032 productos, 20 usuarios virtuales, 30 s:
**631 pedidos/s, p95 88 ms, 0 errores** (la búsqueda del catálogo, ~100 ms de
p95 por las facetas, es lo más pesado). Con 400 pedidos seguidos desde una IP,
el límite global (300/min) corta el resto con 429 + `Retry-After`, sin 5xx.
