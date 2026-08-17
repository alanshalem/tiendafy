# Refactor integral — DRY / KISS / YAGNI / Clean Code / Clean Architecture

Cinco pasadas (agosto 2026) sobre todo el monorepo, con una regla fija: **cero cambios
de comportamiento** (salvo dos fixes de UX autorizados explícitamente). Cada pasada
cerró con backend build + tests verdes, tsc/eslint/vitest en admin y storefront,
`next build` de producción y verificación de que EF no genera migraciones nuevas.

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
