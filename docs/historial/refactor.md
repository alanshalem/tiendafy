# Refactor integral — DRY / KISS / YAGNI / Clean Code / Clean Architecture

> **Estado al 18-oct-2026.** Registro histórico: describe cada pasada como era
> al cerrarla (las cifras de módulos, tests y archivos son de ese momento; hoy
> el backend tiene 21 módulos). Lo que sigue vigente como regla:
>
> - Lo que orquesta varios módulos vive en `Api/`; lo que habla con UN sistema
>   externo vive en el `.Infrastructure` de su módulo (en octubre se mudaron
>   los carriers a Checkout y el cliente de Mercado Libre a su módulo).
> - Dos tests de arquitectura sostienen lo que antes sostenía la costumbre:
>   `ModuleBoundariesTests` (un módulo solo ve el `.Contracts` de otro, ninguno
>   conoce a la Api) y `TenantQueryFilterTests` (toda entidad con `TenantId`
>   tiene filtro, o una excepción escrita con su motivo).
> - La lista "Recortado a propósito" del final sigue valiendo.
> - La "Decisión pendiente" de `PublicApiBaseUrl` está cerrada: el compose de
>   producción declara la clave raíz y `StoreLinks.ApiBase` es el único que la lee.
>
> Las pasadas 1 a 9 son de agosto de 2026 (15 al 19); de la 10 a la 12, de
> octubre. Cosas que una pasada vieja nombra y hoy ya no existen o cambiaron:
> `StatCard` de `@tiendafy/ui` (pasada 3) y los endpoints de reservas de
> Inventory (pasada 9) se borraron en la 12; `infra/nginx/edge.conf` (pasada 6)
> también, lo reemplazó `infra/edge` con Caddy; y el panel volvió al puerto
> 5173, así que los `AdminReturnUrl` apuntan ahí (la pasada 7 los había movido
> a 3001).

Pasadas sobre todo el monorepo con una regla fija: **cero cambios
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
- `docs/guides/adding-a-feature.md` y `adding-a-module.md` **borrados** (la guía de hoy, `guias/agregar-un-modulo.md`, se escribió después):
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
  `IMPLEMENTATION_CHECKLIST.md` en setup.ps1/sh → `START_HERE.md` (hoy `primeros-pasos.md`); carpeta
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

## Pasada 10 — fronteras de módulos y lo que sostenía la costumbre (11-oct)

Commits del 11 de octubre, entre `10d79a12` y `72125d80`. El mismo día se
escribió la tanda grande de tests (integración, pantallas del panel, e2e con
axe), y varias cosas de acá salieron de lo que esos tests destaparon.

- **Fronteras revisadas por máquina** (`7bf999bd`): `ModuleBoundariesTests` y
  `TenantQueryFilterTests`. El de filtros encontró ocho entidades con
  `TenantId` y sin `HasQueryFilter` (entre ellas las configs y envíos de
  Correo Argentino, Zipnova y Andreani, que guardan credenciales); las
  consultas ya filtraban a mano, así que fue defensa en profundidad sin cambio
  de comportamiento.
- **Cada adaptador a su módulo**: los clientes de MiCorreo, Zipnova y Andreani
  pasan de `Api/Shipping` a `Checkout.Infrastructure/Carriers` (`d7fc2bd5`); el
  cliente de Mercado Libre, a `MercadoLibre.Infrastructure` (`72125d80`); los
  puertos de redes (`ISocialChannel`, `ISocialConnector`) a `Social.Contracts`
  (`fac6cc56`). Para mudarlos, `ExternalApiException`, `LogValue` y las
  opciones JSON pasaron a SharedKernel (una sola instancia de `JsonDefaults.Web`).
  Se quedan en la Api a propósito los tokens firmados que viajan al navegador
  y la orquestación (`MeliSyncService`, workers).
- **Una sola mecánica**: `SignedToken<T>` para los tokens firmados (cotización
  de envío, baja y tracking de campañas), con tests que leen tokens emitidos
  por el código viejo (`72c2ffe5`); `Paging` para el offset/limit de los nueve
  listados (`10d79a12`); el permiso de cada endpoint declarado en la ruta y no
  en la primera línea del handler (`93d7bd14`).
- **Código muerto con herramientas** (`313f6c13`): analizadores IDE0005/0051/
  0052/0060 en el backend y `tsc --noUnusedLocals --noUnusedParameters` en los
  dos frontends; cero símbolos sin uso. `ProductEndpoints` (1087 líneas) y
  `Compras.tsx` (1538) partidos sin tocar rutas ni componentes (`7252c029`).
- **Bugs que destaparon los tests del día**: la factura automática nunca se
  encolaba (`e396572b`); todo miembro invitado quedaba como dueño (`73551f35`);
  un webhook de Mercado Pago que fallaba seis veces en 30 s se perdía (ahora
  reintenta con escala hasta ~1 día y el campo hace de lease, `eca218aa`); un
  CUIL salía como Factura A (`91797f6f`); errores del cliente respondían 500
  (`f8d99ce5`); el checkout nunca ofrecía Andreani (`3ffcd170`).

## Pasada 11 — auditoría del 15-oct

Commits `0ffa12e3..f1326481`. Revisión por áreas después de salir a producción.

- **Hora y números argentinos en un solo lugar** (`0ffa12e3`):
  `ArgentinaTime` reemplaza el "-3 h" escrito a mano en 14 lugares y
  `ArgentineNumbers` el `{x:N0}` sin cultura, que en el contenedor (cultura
  invariante) daba "1,500". Con eso: las series de Estadísticas cuentan días de
  Argentina (una venta de las 22 h ya no cae en el día siguiente), el pulso en
  vivo muestra la hora local y los mails ponen punto de miles.
- **Ventas**: reembolso y cancelación salen del endpoint a `OrderRefundService`
  (el candado por venta pasa a 128 semáforos fijos en vez de un diccionario
  que crecía para siempre); `CheckoutOrderFactory` deja de ser un estático de
  la capa HTTP; `RunIfJustPaidAsync` junta los efectos de "recién pagada" de
  tarjeta y Payway. Un reembolso siempre avisa: con la plantilla de la tienda
  si está prendida, si no con el aviso genérico.
- **Notificaciones**: `StoreLinks` junta los links de tienda
  (`Tenancy:PlatformBaseDomain` se leía a mano en 12 lugares con dos defaults
  distintos).
- **Mercado Libre**: una sola definición de "venta cobrada"
  (`MeliOrder.EarningStatuses`: la rentabilidad y la reposición no contaban
  las devoluciones parciales) y publicar con el recargo del canal, igual que la
  sincronización (solo si la sincronización de precios está prendida).
- **Tienda**: el checkout partido en archivos (`lib/checkout-totals`, resumen,
  envío, pasos), un solo pedido de cotización para el checkout y la ficha, las
  redirecciones por la API interna en vez de salir a internet, los pedidos del
  servidor que no dependen entre sí en paralelo, y el origin del panel leído en
  cada uso (la misma carrera que ya se había arreglado para la URL de la API).
- **Panel**: las claves de React Query de cada tienda llevan la tienda (cambiar
  de tienda mostraba datos de la anterior) y las compartidas salen de
  `lib/queryKeys.ts`; un solo `useCategories`.
- **Operación** (`64733783`, `f1326481`): el backup diario copia también el
  keyring de DataProtection; `backup-offsite` (apagado hasta configurarlo)
  sube los backups cifrados con rclone crypt; `infra/check-backup.sh` restaura
  el último dump en una base aparte; `deploy.sh` copia la base antes de migrar,
  exige tag en producción e imprime cómo volver atrás; `pg-upgrade.sh` y
  `deploy.sh` andan como usuario `deploy`.

## Pasada 12 — lo que nadie usaba (16-oct)

Commits `1eb590ff..2f3dea28`, más `b72d3b20` y `0cfe3ad1`. Cada borrado se
verificó buscando referencias en todo el repo (también por reflexión y DI);
lo que solo usaba un test se reescribió para ir por la puerta que usa el
sistema.

- **Endpoints sin consumidor**: `POST /inventory/reservations` (y confirmar y
  liberar: el checkout, la venta manual y la transferencia reservan por
  `IInventoryService`, dentro del proceso), `GET /newsletter/count`,
  `GET /shop/favorites` (la tienda lee con `POST /shop/favorites/merge`) y
  `POST /fiscal/health` (lo cubre el diagnóstico, `POST /fiscal/test-connection`).
- **Backend**: las excepciones de SharedKernel que nadie tiraba,
  `RequireTenantMembership` (todo pasó a `RequirePermission`), métodos de
  `IMembershipService` e `IInventoryService` sin llamadas, usings marcados por
  IDE0005 y la dependencia de logging de `Fiscal.Core`.
- **Front**: `StatCard` de `@tiendafy/ui` (el panel usa `KpiCard`), lo que
  `@tiendafy/types` exportaba sin importador, re-exports "para quien los
  importaba de acá", nombres duplicados (`useIsNarrow` = `useIsMobile`), el
  `_headers` de Netlify que el nginx del panel no lee, y scripts y
  dependencias que no corría nadie.
- **Infra**: `infra/nginx/edge.conf`, el ejemplo de proxy de borde que ningún
  compose montaba.
- **Criterio que quedó**: un `export` significa "esto lo usa otro archivo". Los
  tipos del esquema del tema y `RICH_NODES`/`RICH_MARKS` siguen exportados sin
  importador porque son la API del paquete.

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

*Cerrada: el compose de producción declara `PublicApiBaseUrl` en la raíz
(`https://api.<dominio>`) y desde el 15-oct la lee un solo lugar,
`StoreLinks.ApiBase`. Queda como registro.*

- `PublicApiBaseUrl` se lee en la **raíz** de la config pero solo existe
  `MercadoPago:PublicApiBaseUrl` → los links de tracking y de baja de campañas
  caen a `localhost:5080` en prod. Opciones: declarar la clave raíz en la
  config de prod, o cambiar el código para leer la de MercadoPago.
