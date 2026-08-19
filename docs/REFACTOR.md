# Refactor integral — DRY / KISS / YAGNI / Clean Code / Clean Architecture

Siete pasadas (agosto 2026) sobre todo el monorepo, con una regla fija: **cero cambios
de comportamiento** (salvo fixes autorizados o bugs reales encontrados por la revisión).
Cada pasada cerró con backend build + tests verdes, tsc/eslint/vitest en admin y
storefront, `next build` de producción y verificación de que EF no genera migraciones
nuevas.

## Pasada 1 — dedupes de base

Commits: `eab1ad1`, `80f09ef`, `0c346da` (+ `5505be7` fix, `977fcc2`/`1563e44` tests).

**Backend (DRY):**

- `SharedKernel/Common/Text.Clip` — truncado con trim/null que carriers y
  notificaciones reimplementaban.
- `SharedKernel/Common/JsonRead` — lectura tolerante de JSON de APIs externas
  (`GetString`/`GetInt32`/`GetDate`/`GetLongFlexible`), antes copiada en Meli,
  MiCorreo y Zipnova.
- `ExternalApiException` + `ExternalErrorBody` — parseo de cuerpos de error de
  APIs externas, antes por carrier.
- `InboxEntry` + `InboxDrain` — base del patrón inbox de webhooks (Meli/MP).
- `JobQueue<TJob>` — cola en memoria de imports, duplicada entre productos e
  imágenes.
- `StoreUrls` — construcción de URL pública de tienda; el esquema (http/https)
  quedó como parámetro porque campañas y carritos abandonados difieren a
  propósito.
- `PackageLimits`, `SoapFault`, `AdvisoryLock`, `MoneyFormat`,
  `NotificationCosts`, `ImportMedia`, `MagicBytes`, `SvgSanitizer`.

**Frontend (DRY):**

- `@tiendafy/ui`: `Spinner`, `EmptyList`, `PageHeader`.
- admin: `lib/orderStatus`, `lib/shipping`, `Products/types`, `PlainDialog`,
  `ShipmentBits`.
- storefront: `lib/api-client`, `lib/storage`, `lib/coupons`, `lib/contact`
  (fetch/localStorage/validación fuera de los componentes),
  `StorefrontPageShell`, `CheckoutResultPage(kind)` (éxito/error de checkout
  eran gemelos).

**Fix real encontrado en el camino** (`5505be7`): cache cross-tenant en páginas
legales e institucionales — una tienda podía servir el texto legal de otra.

**Buenas prácticas:** coverage ratchet en CI (admin lines≥19, storefront
lines≥20 sobre `lib/**`) — el código nuevo en lib exige tests.

## Pasada 2 — capas y arranque

Commits: `346ed02`, `b82a628`.

- `SharedKernel.Persistence/ModuleDb` — `AddModuleDbContext`,
  `DesignTimeOptions`, `MoneyConverter`/`NullableMoneyConverter`: las **16**
  DesignTimeFactory y los 16 `AddDbContext` delegan en una sola definición.
  Verificado: `dotnet ef migrations has-pending-model-changes` no genera nada.
- `ApiJson.Web` — singleton de `JsonSerializerOptions(Web)`. El drift
  escritor/lector ya había causado un bug real (cantidades de ML en 0). Hoy hay
  exactamente un `JsonSerializerDefaults.Web` en todo backend/src.
- `OAuth2` (SharedKernel) — authorization URL + grants + POST de token que Meli
  y MercadoPago tenían línea por línea; el parseo y las excepciones siguen por
  cliente.
- `TimestampedId` — formato del state OAuth copiado entre Payments y la API.
  Purposes de DataProtection intactos (cambiarlos invalida secretos cifrados).
- admin: `CarrierCard` + `useCarrierConfig` (Correo/Zipnova compartían
  esqueleto de configuración), `TemplateGrid`, `Helper`, `ConnectionBits`,
  tabla de rutas `MAIN_ROUTES`/`SETTINGS_ROUTES` en App.tsx.
- storefront: `CmsBody`, `MarqueeTrack`, `catalog-client`.

## Pasada 3 — splits estructurales e infraestructura

Commit: `3130cbc`.

- **Program.cs: 347 → 82 líneas.** Registro por área en `Api/Startup`
  (`ServiceRegistration`: 17 módulos, integraciones y workers en el MISMO
  orden; `PipelineExtensions`: pipeline HTTP). Clean Architecture: el
  composition root quedó legible y cada área registra lo suyo.
- Splits puro-mover backend: `OrderComprobantePresenter`,
  `ProductImportEndpointHelpers`, `ResendWebhook`, `PublicPage`,
  `FiscalFormat.Dec`, `Text.Cap` (3 copias con 3 nombres distintos).
- appsettings: las claves que el código leía sin definición quedaron declaradas
  con sus defaults exactos; `appsettings.Development.json` dejó de duplicar
  `Logging`.
- admin: `theme-editor-panels` (1588 líneas) → 8 archivos por panel + barrel;
  `helpContent` (1733) → 8 `help-content-*.ts` por categoría con `satisfies`
  (la exhaustividad de `HelpLinkId` se conserva en compile-time) +
  `HELP_CATEGORIES` canónicas; `ExportImport` (726) → página + 3 tabs;
  `Orders` → `orders-fiscal`/`orders-refund`; `Tabs`/`StatCard` a
  `@tiendafy/ui`; `arr<T>()` reemplaza un cast defensivo copiado 8 veces.
- storefront: `sections.tsx` → `section-types` + `section-primitives` +
  `HomeSections` (sin ciclos de módulos); `StorefrontView` → `StoreHeader` +
  `StoreFooter`.

## Pasada 4 — fixes de UX autorizados + QC del propio refactor

Commit: `4e971f8`.

**Fixes autorizados (únicos cambios de comportamiento):**

- Orders/orders-fiscal: los 5 `catch` que mostraban el error crudo de red
  ("Failed to fetch") al merchant pasan a `errMsg(e, fallback)` en castellano.
- La fecha inline de Orders delega en `formatDateTime` de `@tiendafy/types`.

**Micro-dedupes:**

- storefront `lib/cache` (`REVALIDATE`) — los 8 `revalidate: 30/60` sueltos
  pasan a constantes con nombre por tipo de contenido.
- storefront `store/styles` — inputs y botón primario de formularios copiados
  en 7 componentes (15 usos).
- admin `lib/styles` (`SETTINGS_CARD`/`TABLE_CARD`) — card copiada en 11
  páginas (18 usos).

**QC de agente sobre los 8 commits del refactor** (verificó miembro por miembro
los ~53 archivos nuevos):

- 24 imports muertos que dejaron los splits en storefront — borrados.
- 9 usings muertos que dejaron las extracciones backend — borrados.
- Import duplicado de lucide-react fusionado; comentario stale de `features.ts`
  corregido.
- Rename de seguridad: `money` de ML → `moneyMajor` (ML manda pesos enteros,
  `formatMoney` divide por 100; mismo nombre y unidades opuestas en la misma
  carpeta era una trampa).
- `export-import-shared.ts` → `import-templates.ts` (ExportTab nunca lo
  importó; el nombre mentía).
- Causa raíz corregida: el eslint del storefront no tenía
  `@typescript-eslint/no-unused-vars` (el admin sí) — agregada en warn.
- `pnpm-lock` regenerado tras el specifier de tailwind ^4 del design-system.
- Confirmado por el QC: `ApiJson.Web` es único en el backend y la trampa de
  unidades de ML nunca se cruzó en ningún call site.

## Pasada 5 — tests, docs y dead code pre-existente

Ángulos que las cuatro pasadas anteriores no habían tocado, verificados por
3 agentes de análisis (backend con el compilador — IDE0005/0051/0052 elevados a
warning en un build descartable —, frontend con conteo de referencias repo-wide,
docs contra el filesystem y el código real).

**Backend:**

- **49 usings muertos pre-existentes** borrados (verificados por compilador,
  no por grep): 33 residuos de la migración a `ModuleDb`
  (`Microsoft.EntityFrameworkCore` quedó importado en los 16 `*Module.cs` y
  16 `DesignTimeFactory.cs` que ya no lo usan), 11 en `Api/`, 3 en tests y
  los 3 pre-existentes que el QC de la 4ª pasada había listado.
- Dead code: `RequireTenantOwner` (AuthExtensions) sin ningún caller desde que
  RBAC reemplazó el chequeo binario de owner — borrado.
- TODO stale en ProductEndpoints que pedía "proteger con permisos" dos líneas
  después de la línea que ya los aplica — borrado.
- Tests (DRY): `TenantId.New()` copiado en 10 suites → `TestData.Tenant`;
  wrapper trivial `Ars()` repetido en 4 suites → `using static TestData`.

**Frontend:**

- 28 símbolos exportados sin ningún importador pasan a privados de su archivo;
  el barrel de `@tiendafy/types` pierde 10 nombres sin consumidor y el de
  `@tiendafy/ui` pierde `Pagination` (componente entero sin uso — borrado;
  admin y storefront tienen sus propios paginadores, distintos a propósito).
- `LogoMark` copiado byte a byte en 3 archivos del admin → componente único.
- 5 formateos de fecha reimplementados inline con las mismas opciones →
  `formatDate`/`formatDateTime` de `@tiendafy/types` (output idéntico).
- Panel "Vista previa" de email (19 líneas JSX idénticas en CampaignModal y
  AutoEmails) → `EmailPreviewPanel` con caption por prop.
- `authPost` unifica login/register/forgot del storefront (mismo POST +
  manejo de error); wrapper label+descripción idéntico de Checkbox/Radio →
  `LabeledControl` interno de `@tiendafy/ui`.
- Constantes existentes aplicadas donde quedaban literales: `INPUT_LIGHT_11`
  (CheckoutClient), `SETTINGS_CARD` (charts, MiscPages), `API_URL` exportada
  de lib/api (Captcha re-derivaba env var + fallback).
- 3 devDependencies del admin sin ninguna referencia (eslint-plugin-react,
  @typescript-eslint/eslint-plugin, @typescript-eslint/parser — el config usa
  el metapaquete `typescript-eslint`).

**Docs (verdad restaurada tras mover miles de líneas):**

- Redis/RabbitMQ eliminados de README/DEPLOY/ARQUITECTURA-VISUAL/compose
  (el compose de dev ya no los levanta).
- 16 → **17 módulos** en README/START_HERE (faltaba MercadoLibre en la lista);
  diagrama de arquitectura suma Support, MercadoLibre y los workers de
  campañas/Meli; Next.js 15 → 16; 305 → 370+ tests; 26 → 29 manuales;
  8 → 10 plantillas de email.
- Rutas reales corregidas en CONFIGURACION (callback OAuth de MP sin `oauth/`,
  webhook `/payments/webhooks/mercadopago`, `PLATFORM_BASE_DOMAIN` en vez de
  una env inexistente) y aclarado qué claves mapea de verdad el compose de
  prod.
- usuarios-de-prueba: la sesión de comprador es cookie HttpOnly por tenant
  (no Bearer + localStorage, que era el diseño viejo); payments/support-chat
  citan `RequirePermission` (no `RequireTenantMembership`); rbac-propuesta
  retitula sus secciones como registro histórico.
- `docs/guides/adding-a-feature.md` y `adding-a-module.md` **borrados**:
  describían un stack que nunca se construyó así (MediatR, FluentValidation,
  NUnit+Moq, RabbitMQ, RLS) y enlazaban docs inexistentes — activamente
  dañinos para un dev nuevo.

## Pasada 6 — infra, CI, e2e y pendientes de riesgo bajo

El único territorio no revisado en 5 pasadas: workflows de CI, e2e, compose,
scripts de setup y tooling raíz.

- **Bug real reparado**: `admin-pantallas.spec.ts` usaba `ADMIN` sin importarlo
  desde que el dedupe de la pasada 3 movió las consts a `_helpers.ts` — los 5
  tests de ese describe tiraban `ReferenceError` en runtime. Causa raíz: e2e no
  tenía type-check (sin tsconfig, `pnpm -r type-check` lo salteaba en silencio).
  Fix + causa raíz: import reparado, `e2e/tsconfig.json` nuevo y script
  `type-check` — ahora el CI lo compila como al resto.
- CI: `permissions: contents: read` explícito en backend-ci y frontend-ci
  (least privilege; los otros workflows ya lo declaraban); los paths de
  frontend-ci ahora incluyen `e2e/**`, `package.json` raíz y los archivos de
  Prettier — cambios ahí no disparaban el CI que los valida.
- Pendientes de riesgo bajo de pasadas anteriores, cerrados: hook
  `useVariantStock` (query de stock idéntica en Productos e Inventario),
  `pollWhileRunning` (refetchInterval copiado en las 2 tabs de importación),
  alias de campo `Json` de MeliClient inlineado a `ApiJson.Web`.
- Exactitud menor: `edge.conf` anotado como sample no montado y su upstream
  corregido a `:5080`; `.dockerignore` raíz anotado como fallback (los
  `Dockerfile.dockerignore` por app lo reemplazan); referencia muerta a
  `IMPLEMENTATION_CHECKLIST.md` en setup.ps1/sh → `START_HERE.md`; carpeta
  personal fuera del repo quitada de `tiendafy.code-workspace`; comentario
  stale de `tokens.css` ("el admin usa los defaults" — los overridea todos).
- **Reportado, sin tocar (decisiones)**: PgBouncer en dev compose sin ningún
  consumidor (el ADR 0003 lo reserva para RLS futuro); Postgres 15 en dev vs
  16 en prod/CI; las imágenes de GHCR no hornean los DSN de Sentry que el
  compose de prod sí pasa; claves de prod aún sin mapear (`PublicApiBaseUrl`,
  `Email:WebhookSecret`, `MercadoPago:PublicApiBaseUrl`/`WebhookSecret`);
  `actions: read` posiblemente sobrante en codeql.yml (no verificable hasta
  recuperar acceso a Actions).
  *Post-pasada: PgBouncer removido, Postgres dev 15→16, claves de prod
  mapeadas (commit `a75077d`) y los DSN de Sentry horneados en docker-release
  vía secrets del repo — todo cerrado.*

## Pasada 7 — sweep del código nuevo post-refactor (rentabilidad, compras, WMS, Meta Ads, social)

Commits: `3cb819f` (+ `833b71c` fix CA1826 previo, cierre de deuda en el commit
siguiente). Alcance: SOLO lo agregado después de la pasada 6 — el resto del repo
ya estaba seco. Dos revisores independientes (backend y admin) con verificación
de callers antes de cada hallazgo.

- **Bugs reales encontrados y reparados**:
  - `OAuth2.BuildAuthorizationUrl` hardcodeaba `/authorization` (path de ML):
    las URLs de autorización de Meta Ads, Facebook/Instagram y X nacían 404.
    El helper ahora recibe la URL completa; solo `MeliClient` agrega su path.
  - `useVariantStock` cacheaba por *cantidad* de variantes: dos búsquedas con
    el mismo total compartían caché y la columna de stock quedaba en blanco.
  - `fetchAllProducts` sin `.catch` en los selectores de catálogo (composer
    social y modales de ML): un fetch fallido dejaba spinner infinito.
  - `/redes` trataba "cargando" como "vacío"; callback OAuth de Meta Ads sin
    `try/catch` (500 crudo al browser); `Social:AdminReturnUrl` en 5173 (el
    admin corre en 3001).
- **DRY**: `MetaGraphTokens` (canje Graph duplicado), `ISocialConnector` con
  PKCE (X ya no es caso especial), `VariantPicker` + `variantLabel`/
  `matchesProduct` (typeahead copiado 3× entre Compras y Kits), `usePagedList`
  + `useDebouncedValue` (filtro/paginado copiado entre Costos e Inventario),
  `MeliSyncService.ParseSnapshot` (deserialización del cache ML en 3 sitios),
  `MutatePostAsync`, `IDataProtector.TryUnprotect`, mapas de estado unificados
  (`PO_STATUS`/`POST_STATUS`/`CONNECTOR_META`), form de Compras tipado.
- **Deuda técnica cerrada** (commit siguiente): `AdjustAvailableAsync` atómico
  en Inventory (delta con `GREATEST(0, …)` en un solo UPDATE — reemplaza el
  read-modify-write de recepción de OC / venta ML / kits que podía pisar
  reservas del checkout; con test de integración contra Postgres real),
  endpoint bulk `GET /products/costs?ids=` (la página de Costos pasó de
  20 GETs a 1), y DSN de Sentry en docker-release (gated por secrets).
- **NO aplicado a propósito**: base común de los 3 token services (lo
  compartido ya está extraído en `OAuthStateProtector`/`OAuth2`; tocar los
  purposes de DataProtection es máximo riesgo por ~8 líneas).

## Pasada 8 — barrido completo del repo (backend + admin + storefront + infra)

Tres barridos paralelos (backend, admin, storefront/shared/infra) sobre el repo
entero. Lo aplicado, agrupado por lo que arregla:

- **Bugs encontrados por el barrido** (el refactor los destapó; se arreglaron):
  - Nota de crédito de Mercado Libre: se emitía siempre y se marcaba el flag
    aunque la venta no estuviera cancelada; la factura manual se emitía con el
    id de ML en vez del id de la orden local.
  - Rentabilidad del canal ML: la resolución ítem→variante estaba copiada 3
    veces y la copia de rentabilidad no tenía el fallback a nivel ítem, así que
    el margen de ML salía inflado. Ahora hay un `MeliLinkResolver` único.
  - `POST /orders/manual` con `ReturnUrl` inválido reservaba stock y recién
    después fallaba: media hora de reservas colgadas por cada intento.
  - Pago on-site con tarjeta nunca encolaba la factura automática: era la copia
    incompleta de los side-effects del pago (ver abajo).
  - Config de Mercado Libre: cualquier error de red dejaba la pantalla en
    blanco y sin mensaje. Ahora muestra el error con botón de reintentar.
  - Ventas de ML: el botón "Facturar" se decidía comparando la ETIQUETA visible
    ("Pagada") en vez del estado; renombrar el texto lo apagaba en silencio.
- **Once inputs con clases muertas**: `className="h-8 w-24"` sobre `<Input>` no
  hacía nada — `cn` concatena sin resolver conflictos de Tailwind y `.h-10` /
  `.w-full` de la base ganan por orden en el CSS. Se agregó la prop `compact`
  al Input compartido (el alto es del control, no de una clase suelta) y el
  ancho pasó a un div que lo envuelve, que es la convención del repo.
- **DRY**: `PaidOrderSideEffects` (los efectos de "orden pagada" estaban en 3
  copias divergidas — on-site, webhook y venta manual — y ahora corren paso a
  paso en best-effort: antes una excepción en el medio se llevaba puesto el
  resto y no volvían, porque el reintento del webhook ya no da "recién
  pagada"), `PriceRounding` (modos de redondeo + su validación, antes
  duplicados entre endpoint y handler, ahora con tests de cada borde),
  `fieldChrome` (foco/disabled/error de Input, Select y Textarea),
  `catalog-map` (tipos y mappers puros del catálogo, importables desde el
  cliente), `replaceAt`, tipos del catálogo en Costos.
- **Clean architecture**: `ManualOrderService` — el endpoint de venta manual
  tenía 158 líneas de reglas de negocio y un `IServiceProvider` para pedir
  servicios a mano; ahora el endpoint traduce HTTP y el servicio tiene sus
  dependencias explícitas (y, de paso, libera las reservas si la orden no se
  puede crear). `PostCard` y `PerNetworkOverrides` salieron de adentro de sus
  pantallas de redes.
- **Dead code**: modelo de tema muerto en `shared/types/tenancy.ts` (con los
  MISMOS nombres que el vivo de `theme.ts` y otra forma — un import por
  autocompletado compilaba y fallaba en runtime), prop `name` fantasma en
  Radio, props `enabled`/`className` que nadie pasaba, `open &&` redundante.
- **Infra/CI**: ancla YAML para la imagen de Postgres en docker-compose de prod
  (postgres y pg-backup no pueden volver a quedar en versiones distintas),
  `AI_MODEL` configurable, sitemap del storefront usando el guardrail de
  tenant, y el CI de frontend ahora corre los builds de producción de admin y
  storefront antes de los tests (el build de prod es lo único que detecta
  errores que el dev server perdona).

## Pasada 9 — clones medidos, no intuidos

Barrido con un detector de bloques repetidos (ventanas de 7 líneas
normalizadas) sobre backend, admin, storefront y shared: 36 grupos de código
duplicado, de los que se atacaron los que tenían riesgo real de divergir.

- **Bug destapado**: una venta de Mercado Libre **cancelada nunca devolvía el
  stock** que había descontado. Mismo patrón que el de kits: la ida existía y
  la vuelta no. `MoveStockAsync` ahora hace los dos sentidos con la misma
  resolución de vínculo, con flag `StockReverted` para que no se aplique dos
  veces (migración `AddMeliOrderStockReverted`). Solo se revierte en
  `cancelled`: un `refunded` es una devolución posterior al envío y esa
  decisión es de una persona, igual que en la tienda propia.
- **Fuga menor cerrada**: el worker de importación de imágenes devolvía
  `ex.Message` crudo a la pantalla del usuario (el de productos ya usaba un
  mensaje genérico). Los dos comparten ahora `ImportQueueWorker<TJob>`, que
  centraliza el consumo de la cola, el marcado de fallo y la limpieza.
- **DRY**: `FONT_FAMILY_CSS` en `@tiendafy/types` (el mapa de familias estaba
  copiado entre el panel y la tienda: agregar una fuente y olvidar una copia
  dejaba al comerciante eligiendo una tipografía que su tienda no aplicaba),
  `VariantCostDto` en ProductEndpoints, `RemovableThumb`/`AddImagesTile` entre
  alta y edición de producto, `UploadDropzone` entre los uploaders de imagen y
  video del editor, y `TEXTAREA_LIGHT`/`BTN_SUBMIT_PUBLIC` entre los dos
  formularios públicos de la tienda.
- **Higiene verificada**: cero TODO/FIXME, cero `console.log`, un solo `any`
  (la API de BarcodeDetector, que no está en los tipos del navegador).
- **NO aplicado a propósito**: envolver el preámbulo de los 7 endpoints de
  Mercado Libre (`ResolveConnectionAsync` + `NotConnected`) en un helper con
  lambdas — lo compartido ya está extraído y el wrapper agrega indirección por
  3 líneas; y los 3 endpoints de reservas de Inventory sin consumidor, que son
  la API pública del módulo (mismo criterio que los tipos exportados).

## Recortado a propósito (KISS: riesgo > beneficio) — no reabrir sin motivo

- Unificar modales de envío Correo/Zipnova y `RepeatableList` del theme-editor:
  serían mini-DSLs más difíciles de leer que la duplicación.
- `SendAsync` genérico de MercadoPago: aplasta los templates de log
  estructurado.
- `CtaEmail`: los 4 HTML de emails difieren de verdad.
- `ByTenantAsync` genérico: acopla dominios por ahorrar 1 línea.
- Hooks `useStoreResource`/`useBodyScrollLock`: cambian deps de efectos —
  riesgo de comportamiento.
- Fusionar `ExternalErrorBody` con `JsonRead`: solapan 2 líneas y operan sobre
  tipos distintos.
- `StoreUrls` vs `siteBase()` del storefront: procesos distintos (registro del
  tenant vs header Host), no son duplicados.
- Barrel `theme-editor-panels`: aisla el layout de archivos de los paneles.
- 6 tipos exportados sin importador externo: API pública de sus módulos.

## Decisión pendiente (cambia comportamiento — requiere autorización)

- `PublicApiBaseUrl` se lee en la **raíz** de la config pero solo existe
  `MercadoPago:PublicApiBaseUrl` → los links de tracking y de baja de campañas
  caen a `localhost:5080` en prod. Opciones: declarar la clave raíz en la
  config de prod, o cambiar el código para leer la de MercadoPago.
