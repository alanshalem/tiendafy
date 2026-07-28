# Implementation Checklist - Tiendafy

Estructura arquitectónica definida. Checklist de qué falta construir, en orden de prioridad.

## Fase 0: Fundación Compartida (1-2 semanas)

Backend, storefront y admin comparten tipos, UI components y configuración.

- [x] **Backend SharedKernel** ✅ 2026-06-11
  - [x] `Result<T>` type (Railway-oriented programming) — `Common/Result.cs` (+ `Error` record con códigos estables)
  - [x] `Money` value object (long minor units + currency code) — `Common/Money.cs` (operadores con checked overflow, cross-currency lanza)
  - [x] `TenantId` strongly-typed ID — `Common/TenantId.cs` (readonly record struct)
  - [x] `DomainEvent`, `Entity`, `AggregateRoot` base classes — `Domain/` (AggregateRoot lleva TenantId + acumula events para Outbox)
  - [x] Common exceptions (`NotFoundException`, `UnauthorizedException`, etc) — `Exceptions/DomainException.cs`
  - [x] `UnitOfWork` interface — `Abstractions/IUnitOfWork.cs` (+ bonus `ITenantContext`)
  - Nota: `backend.sln` viejo reemplazado por `backend.slnx` (formato .NET 10; el .sln manual tenía GUIDs inválidos)

- [x] **Frontend Design System** ✅ 2026-06-11 (Storybook omitido — opcional, agregar si el equipo crece)
  - [x] Tailwind config (shared between storefront + admin) — `shared/design-system/tailwind.preset.cjs`, consumido vía `presets:` en `storefront/tailwind.config.ts` + `admin/tailwind.config.ts`. Workspace pnpm creado (`pnpm-workspace.yaml`, dep `workspace:*` en ambas apps)
  - [x] CSS custom properties (design tokens) — `shared/design-system/styles/tokens.css` (RGB crudo para alpha de Tailwind; theming por tenant = override de vars en :root sin recompilar)
  - [ ] UI components library — paquete `shared/ui` (`@tiendafy/ui`), TS source directo, dep workspace en ambas apps. `pnpm install` + type-check verdes
    - [x] Button, Input, Select, Textarea, Checkbox, Radio — accesibles (aria-invalid, useId labels, fieldset RadioGroup), estilados con tokens
    - [x] Card, Modal, Dropdown, Toast, Badge — Modal sobre `<dialog>` nativo (focus trap/Escape/top-layer gratis), Dropdown composable (Trigger/Menu/Item), Toast con provider + `useToast()` hook
    - [x] Table, Pagination, Breadcrumbs — Table genérica tipada (columns + rowKey + onRowClick + emptyState), Pagination por cursor (hasNext/hasPrev, alineada con API pública), Breadcrumbs router-agnostic (prop `linkComponent` para next/link o react-router)
    - [x] Form: FormField, FormError, MultiSelect — FormField cablea label/id/error/aria-describedby por cloneElement; MultiSelect controlado con checkboxes en popover (listbox accesible)
  - Fix de paso: deps inexistentes removidas (`@opentelemetry/sdk-web` no existe en npm; `react-query` v3 duplicaba `@tanstack/react-query` v5). OTel frontend se agrega en fase observabilidad con paquetes correctos
  - Fix de paso 2: Next 14→15 (14 no soporta React 19), @testing-library/react 14→16 + @testing-library/dom 10 en ambas apps. Workspace instala sin peer warnings
  - Fix de paso 3 (2026-06-12): `content` de Tailwind en ambas apps no incluía `../shared/ui/src` → las clases usadas solo por componentes de la librería no se generaban (modal/tabla/botones sin estilo en admin). Agregado el path en ambos tailwind.config.ts
  - [ ] Storybook setup (optional but recommended)

- [x] **Shared Types** ✅ 2026-06-11 — paquete `shared/types` (`@tiendafy/types`), workspace dep en ambas apps
  - [x] API types generator from backend OpenAPI spec — `pnpm generate` (openapi-typescript → `src/generated/api-schema.ts`); corre cuando Api exponga swagger. Hasta entonces, tipos manuales son el contrato
  - [x] Domain models (Product, Order, Payment, etc) — catalog/orders/checkout/tenancy; enums espejan máquinas de estado del backend; `Money` = centavos + ISO 4217; snapshots inmutables en OrderItem
  - [x] API request/response DTOs — `ApiError` (código estable), `CursorPage<T>` (sin offset), `IsoDateTime` UTC; `ThemeTokens` matchea formato RGB crudo de tokens.css

- [ ] **Infrastructure Setup** (en progreso 2026-06-11)
  - [x] Docker Compose (dev environment) — `infra/docker/docker-compose.dev.yml` (Postgres+RLS, Redis, RabbitMQ, PgBouncer, MinIO, dnsmasq)
  - [x] GitHub Actions workflows (CI/CD) — `backend-ci.yml` (dotnet build -warnaserror + test, path-filtered) + `frontend-ci.yml` (pnpm type-check shared; builds de apps comentados hasta scaffold). Ambos comandos verificados localmente. Nota: repo aún sin `git init` — workflows inertes hasta primer push
  - [ ] Terraform modules (staging/prod infrastructure) — bloqueado: falta elegir cloud provider (Cloud Run vs Fargate vs otro). Decisión de negocio, no se especula
  - [x] Setup scripts ✅ 2026-06-11 — `setup.ps1` (auto-arranca Docker Desktop si está apagado) + `setup.sh`. Verifican prereqs, levantan infra, instalan workspace, compilan y testean. Verificado end-to-end en Windows. Compose reescrito: imagen pgbouncer inexistente → `edoburu/pgbouncer`, dnsmasq eliminado (`*.localhost` resuelve nativo), mounts a archivos inexistentes eliminados

## Fase 1: MVP - Tenancy + Catalog + Checkout (4-6 semanas)

Un merchant puede crear tienda, listar productos, vender.

### Backend - Tenancy Module
- [x] Tenant aggregate + Tenancy service ✅ 2026-06-11 — `Tenancy.Contracts` (TenantDto, ITenancyService, TenantCreatedEvent) + `Tenancy.Core` (Tenant aggregate con máquina de estados, value object Subdomain con RFC 1035 + reservados, CreateTenantHandler, TenancyService con resolución por host: subdominio/custom domain/puerto/case/anidados/cancelados). 38 unit tests verdes. Sin MediatR: handlers planos en DI (CQRS como organización, no framework)
- [x] Migración EF `InitialTenancy` ✅ 2026-06-11 — tabla `tenants` (snake_case via EFCore.NamingConventions), índices únicos en `subdomain` y `custom_domain` (filtrado NOT NULL). Sin RLS: tabla global de plataforma, ES el directorio de tenants (RLS aplica a tablas tenant-scoped). Aplicada a Postgres local
- [x] CreateTenant endpoint ✅ — `POST /api/v1/tenants`, 201/400/409 (RFC 7807 problem+json). TODO: proteger con auth cuando Identity exista
- [x] GetTenant endpoint ✅ — `GET /api/v1/tenants/{id}` + `GET /api/v1/tenants/resolve?host=` (para middleware de storefront/admin)
- [x] ListTenants endpoint (paginated) ✅ 2026-06-11 — `GET /api/v1/tenants?limit=&after=` cursor-based (limit+1 para hasMore). CORS habilitado para :3000/:3001 en dev
- [x] Tests (unit) ✅ — 38 verdes. Integración con Testcontainers: pendiente
- [x] **Api host** ✅ 2026-06-11 — `src/Api` en puerto **5080** (5000 ocupado por Docker Desktop en Windows), `/health` con DbContext check, módulo registrado vía `AddTenancyModule()`. Smoke test E2E verificado: health Healthy → POST crea → fila real en Postgres → resolve por host con puerto → duplicado 409

### Backend - Identity Module
- [x] User aggregate + ASP.NET Identity integration ✅ 2026-06-11 — `Identity.Infrastructure`: `AppUser` (usuario global de staff; shoppers son población separada futura), `AppIdentityDbContext` (tablas renombradas: users/roles/user_roles/...), migración `InitialIdentity` aplicada. Sesión server-side cookie httpOnly `tiendafy.session` (revocable — per ADR sección 9), SameSite=Lax (localhost:3001→:5080 es same-site, puerto no cuenta), 401/403 sin redirects. Password: min 10 chars sin reglas teatrales. Endpoints `POST /auth/register|login|logout` + `GET /auth/me` (protegido). Smoke E2E verde: register→me→logout→401, login→me, password mala→401, lockout habilitado. Pendiente módulo: memberships por tienda, permisos granulares, CSRF tokens, MFA — Identity fase 2. Nota estructura: solo Infrastructure por ahora; Contracts/Core llegan con memberships (dominio real)
- [ ] Migrate: 002_Identity.sql
  - [ ] AspNetUsers, AspNetRoles, AspNetUserRoles
  - [ ] ApiKeys table (hash stored, salt, scopes)
  - [ ] RLS policies
- [ ] RegisterUser endpoint
- [ ] Login endpoint (return JWT)
- [ ] RefreshToken endpoint
- [ ] CreateApiKey endpoint
- [ ] MFA setup (future: optional)
- [ ] Tests

### Backend - Catalog Module
- [x] Product aggregate ✅ 2026-06-11 — `Catalog.Core/Domain`: Product (Draft→Active→Archived, publish idempotente, requiere ≥1 variante), slug auto-generado con normalización de acentos/ñ y ESTABLE ante renombres (SEO), eventos ProductCreated/ProductPublished. 28 tests nuevos (66 total verdes)
- [x] Variant entity ✅ — SKU único case-insensitive por producto, combinación de opciones única, precio Money no-negativo, producto simple = variante con 0 valores. Stock NO vive acá (Inventory module)
- [x] Option entity ✅ — máx 3 opciones, valores dedupe case-insensitive, bloqueadas una vez que existen variantes (OptionsLocked)
- [x] Catalog.Infrastructure + endpoints ✅ 2026-06-12 — migración `InitialCatalog` aplicada (products + product_options owned + product_variants entidad propia con FK shadow; Money por ComplexProperty, CompareAtPrice serializado "monto|moneda" — nullable complex no banca nested access en EF10; índice único (tenant_id, slug)). `TenantContextMiddleware` (X-Tenant-Id, interim hasta memberships). Endpoints: POST/GET /products, by-slug (solo ACTIVE), list cursor + filtro status. CreateProductHandler con resolución de colisión de slug (sufijo -2..-10). Fix DI crítico: IUnitOfWork global colisionaba entre módulos → cada handler recibe SU DbContext por factory. Smoke E2E verde: 2 productos con opciones/variantes/compareAt en Postgres, list, by-slug
- [x] Category aggregate ✅ 2026-06-12 — árbol por parent_id + path materializado ("ceramica/bowls"), máx 3 niveles, rename mantiene path estable (URLs no se rompen), índice único (tenant_id, path). Migración `AddCategories` aplicada. Endpoints POST/GET /categories (lista ordenada por path = árbol con un ORDER BY). Página admin Categorías REAL (reemplaza stub): árbol indentado, modal crear con selector de padre (filtra niveles 1-2). 6 tests dominio (72 total verdes). Smoke E2E: árbol real en Postgres, duplicado → 409. Pendiente Catalog: vincular productos↔categorías, UpdateProduct endpoint, búsqueda FTS
- [ ] Migrate: 003_Catalog.sql
  - [ ] products, variants, options, categories tables
  - [ ] Indexes: (tenant_id, slug), (tenant_id, category_id), (sku)
  - [ ] JSONB column for metafields (future)
  - [ ] RLS policies
- [ ] CreateProduct endpoint
- [ ] UpdateProduct endpoint
- [ ] GetProduct endpoint (public, by slug)
- [ ] ListProducts endpoint (public, with filters)
- [ ] SearchProducts endpoint (FTS)
- [ ] GetVariant endpoint (price + availability)
- [ ] Tests

### Backend - Inventory Module
- [x] **Inventory completo v1** ✅ 2026-06-12 — `Inventory.Contracts` (IInventoryService para Checkout) + Core + Infrastructure. Dominio: `StockItem` (proyección, SIN mutación read-modify-write a propósito), `StockMovement` ledger append-only (Initial/Adjustment/Reserved/ReleaseExpired/Released/Sold), `Reservation` TTL 30min con máquina de estados (Confirm valida expiración, Release solo Active). **Anti-oversell atómico**: `ExecuteUpdateAsync` condicional `WHERE available >= qty` — 0 filas = sin stock, sin race; CHECK constraint `available >= 0 AND reserved >= 0` en el motor como última línea. `ExpiredReservationsJob` (BackgroundService 30s, lotes de 100 — vive en Api hasta que exista host Worker). Endpoints: GET stock por variantes, PUT ajuste manual, POST reservations + confirm/release, GET ledger. Migración `InitialInventory` aplicada. Admin Inventario REAL (chau stub): tabla por variante con reservado (badge) + disponible editable inline + Guardar por fila. 7 tests dominio (82 verdes). Smoke E2E verde: set 3 → reserva 2 → reserva 2 más = **409 anti-oversell** → reserva 1 → confirm (venta) + release → disponible 1/reservado 0 exactos → ledger completo. Pendiente: integration test de concurrencia real (Testcontainers + requests paralelos), descuento de stock al confirmar checkout (llega con módulo Checkout)
- [ ] Stock aggregate (variant, available, reserved, sold)
- [ ] StockMovement ledger (in, out, adjust, reserve, release)
- [ ] Reservation aggregate (variant, qty, ttl, created_at)
- [ ] Migrate: 004_Inventory.sql
  - [ ] stock table (variant_id, available, reserved, sold)
  - [ ] stock_movements table (append-only ledger)
  - [ ] reservations table (ttl-based)
  - [ ] Indexes: (tenant_id, variant_id), (created_at)
  - [ ] RLS policies
- [ ] GetAvailableStock query
- [ ] ReserveStock command (optimistic lock: UPDATE ... WHERE available >= qty)
- [ ] ConfirmReservation command
- [ ] ReleaseReservation command (TTL job)
- [ ] AdjustStock endpoint (admin)
- [ ] GetStockLedger endpoint (audit)
- [ ] BackgroundJob: ReleaseExpiredReservations (Hangfire)
- [ ] Tests (concurrency tests importante)

### Backend - Checkout Module
- [x] **Checkout backend v1 (saga simple)** ✅ 2026-06-12 — `Checkout.Core` referencia SOLO Contracts de Catalog+Inventory (regla de módulos intacta). Contratos ampliados: `IInventoryService` +Reserve/Confirm/Release, `ICatalogCheckoutQuery` (snapshot de variantes con precio del momento). Dominio: `CheckoutSession` (Open→Submitted→Completed/Expired, TTL 30min, snapshot inmutable de precios — si el merchant cambia el precio después, el comprador conserva el que vio; valida monedas mixtas, qty 1-99) + `CheckoutItem` con ReservationId. **Saga orquestada simple en `SubmitCheckoutHandler`**: reserva item por item, ante CUALQUIER fallo libera todas las previas (compensación best-effort; el job de expiración es la red si una liberación falla). Endpoints: POST /checkout (start), GET, POST /{id}/submit. Migración `InitialCheckout` (checkout_sessions + checkout_items owned, Money serializado). 11 tests nuevos incluyendo saga con fakes (compensación exacta verificada) — **93 verdes**. Smoke E2E: start 2 items subtotal correcto → submit reserva ambos (stock reservado verificado) → checkout imposible (qty 50) → 409 y stock intacto. Pendiente: expiración de sesiones job, página checkout en storefront, Payments (MP) para Completed
- [ ] CheckoutSession aggregate (cart, shipping, tax, total)
- [ ] CartItem value object (product, variant, qty, price snapshot)
- [ ] Migrate: 005_Checkout.sql
  - [ ] checkout_sessions table
  - [ ] checkout_items table (snapshot of product at checkout time)
  - [ ] Indexes: (tenant_id, created_at), (status)
  - [ ] RLS policies
- [ ] StartCheckout command
- [ ] AddItemToCart command
- [ ] RemoveItemFromCart command
- [ ] CalculateShipping query (mock, future: real providers)
- [ ] CalculateTax query (mock, future: TaxJar/Avalara)
- [ ] SubmitCheckout command (reserves stock, initiates payment)
- [ ] Tests

### Backend - Payments Module
- [ ] Payment aggregate (status, amount, currency, provider, reference_id)
- [ ] PaymentMethod enum (MERCADO_PAGO, CREDIT_CARD, etc)
- [ ] IPaymentGateway interface
- [ ] MercadoPagoGateway implementation
- [ ] Migrate: 006_Payments.sql
  - [ ] payments table
  - [ ] payment_methods table
  - [ ] Inbox table (for webhook deduplication)
  - [ ] Indexes: (tenant_id, reference_id), (status)
  - [ ] RLS policies
- [ ] InitiatePayment command
- [ ] GetPaymentStatus query
- [ ] HandlePaymentWebhook command (Inbox pattern)
  - [ ] HMAC validation
  - [ ] Deduplication by event_id
  - [ ] Payment state machine: PENDING → APPROVED/REJECTED
  - [ ] Emit PaymentApprovedEvent
- [ ] RefundPayment command
- [ ] Tests (mock MP API)

### Backend - Orders Module
- [ ] Order aggregate (complex state machine)
- [ ] OrderItem value object (product snapshot at purchase time)
- [ ] OrderStatus enum (PENDING, CONFIRMED, SHIPPED, DELIVERED, REFUNDED, CANCELED)
- [ ] Migrate: 007_Orders.sql
  - [ ] orders table (order_number sequential per tenant, total, status)
  - [ ] order_items table (immutable snapshots)
  - [ ] order_timeline table (audit: who changed what, when)
  - [ ] Indexes: (tenant_id, order_number), (tenant_id, created_at), (status)
  - [ ] RLS policies
- [ ] CreateOrder command (after payment confirmed)
- [ ] GetOrder endpoint
- [ ] ListOrders endpoint (admin + customer)
- [ ] UpdateOrderStatus command (ship, deliver, etc - admin only)
- [ ] RefundOrder command (triggers payment refund)
- [ ] Tests (state machine, edge cases)

### Backend - Outbox/Inbox Infrastructure
- [ ] Migrate: 008_Outbox_Inbox.sql
  - [ ] outbox_events table (event_type, aggregate_id, event_json, created_at, published)
  - [ ] inbox_events table (event_id, event_type, processed, processed_at)
  - [ ] Indexes: (published, created_at), (processed, created_at)
- [ ] OutboxEventInterceptor (SaveChangesAsync intercepts, publishes domain events to Outbox)
- [ ] OutboxPublisher service (polling job: read unpublished, send to RabbitMQ, mark published)
- [ ] Tests

### Backend - Catalog (continuación) + Themes
- [x] UpdateProduct + estados + precio ✅ 2026-06-12 — `PATCH /products/{id}` (nombre/desc, slug estable), `POST /{id}/publish|archive` (publicar un archivado = Restore+Publish, gap encontrado en smoke: el dominio exigía restore explícito y el endpoint devolvía 409), `PATCH /{id}/variants/{vid}/price` (con compareAt). `ChangeVariantPrice` en aggregate + 3 tests (75 verdes). Admin: menú ⋯ por fila (Editar/Publicar/Archivar) + modal edición (nombre, desc, precio primera variante). Smoke E2E verde incluyendo republish de archivado
- [x] **Themes v1 + Editor de diseño con preview** ✅ 2026-06-12 (adelantado del roadmap a pedido) — `Themes.Infrastructure`: documento por tenant (announcement + tokens jsonb + sections jsonb), migración `InitialThemes`, `GET/PUT /api/v1/theme` (lazy default, validación JSON). Storefront: announcement bar, override de CSS vars por tenant (tokens RGB crudo → style en `<main>`), secciones renderizadas por orden/visibilidad (hero, featured-products con título custom, info-bar, newsletter), revalidate 5s. Admin "Tienda online" REAL estilo Tiendanube: panel izquierdo (anuncio, 3 color pickers hex↔RGB, lista de secciones con ▲▼ reorder + ojo toggle), preview iframe en vivo con toggle Celulares (375px)/Computadoras, "Publicar cambios" recarga preview. Smoke E2E verde: publicar tema verde con orden invertido → storefront lo refleja (announcement/orden/color/newsletter). Pendiente Themes fase 2: dominio rico con schema por sección, preview instantáneo sin publicar (postMessage), carrusel/banners con imágenes (necesita módulo media/S3), tipografías
- [x] **Media module + imágenes de producto** ✅ 2026-06-12 — `Media.Infrastructure`: `IMediaStorage`/S3 (MinIO dev, mismo SDK para S3/R2 prod, ForcePathStyle), bucket auto-creado con policy pública de lectura al arrancar, validación tipo (JPEG/PNG/WebP/AVIF) + tamaño (5MB), claves `{tenantId}/{guid}.{ext}`. `POST /api/v1/media` multipart → URL pública. Catalog: `ProductImage` owned (máx 10, posiciones compactadas al borrar), migración `AddProductImages`, endpoints add/remove imagen. Admin: thumbnail en tabla + editor de imágenes en modal (upload con label-input file, eliminar on-hover, guardado instantáneo). Storefront: card usa imagen real con object-cover, fallback inicial. Smoke E2E verde: PNG → MinIO → servida 200 → attach → render. Nota: resize on-the-fly (imgproxy) = fase de optimización
- [x] **Galería de diseños (presets de tema)** ✅ 2026-06-12 — 12 diseños con identidad propia (Terracota, Tinta, Eléctrico, Vivero, Cafeto, Algodón, Océano, Joya, Galería, Lavanda, Ladrillo, Medianoche) en `admin/src/lib/themePresets.ts`: paleta completa + announcement + orden/visibilidad de secciones + variante de hero. Storefront: 3 variantes de hero (`centered`/`banner`/`minimal`); tokens derivados (surface/border/muted siguen al tema — fix: presets dark dejaban header blanco con texto claro ilegible). Página `/canales/tienda-online/disenios`: cards con mini-preview CSS pintado con los colores reales del preset (announcement+header+hero variant+grid), "Usar este diseño" → PUT /theme, link cruzado con el editor. Verificado E2E con click real: Eléctrico aplicado → storefront negro/lima con hero banner y "DROPS". Nota SWR: primer hit tras expirar revalidate sirve stale (semántica Next) — el preview del editor recarga, ok. Fase 2: más section types (carrusel de imágenes, banners de categorías, IG/video), tipografías por preset, preview hover en gallery
- [ ] Pendiente Catalog: productos↔categorías, búsqueda FTS

### Frontend - Admin: Estadísticas + Productos (estilo Tiendanube)
- [x] **Estadísticas (6 subpáginas)** ✅ 2026-06-12 — Estadísticas ahora colapsable en sidebar con Visión general / Productos / Ventas y clientes / Visitas / Tiempo real / Reporte de cupones. Kit de gráficos propio SVG sin librerías (`components/charts`): Sparkline, BarChart agrupado, HBarChart, DonutChart, AreaChart, Heatmap, Legend, ChartCard — todo por tokens (bermellón + tints). `StatsToolbar` (fecha + comparación + filtros), `KpiCard`. Mock data determinístico (`lib/statsMock.ts`, seed fija). Las 6 páginas replican el layout de Tiendanube (KPIs con sparkline, barras de comportamiento, embudo de checkout, donut de cuotas, heatmap de eventos, tabs tiempo real, tabla de cupones). Verificado con screenshots
- [x] **Productos lista estilo Tiendanube** ✅ 2026-06-12 — rebuild completo: header con Organizar/Exportar e importar/Agregar con IA/Agregar producto, búsqueda + Filtrar + orden, tabla agrupada por producto con filas de variante, **precio y promocional editables inline** (PATCH al blur), stock real, badge de estado, menú de acciones. Filtros en slide-over (`FilterPanel`): categoría + chips de stock/precio/visibilidad/envío, aplicación client-side
- [x] **Exportar/Importar productos** ✅ 2026-06-12 — tabs Exportar (CSV real estilo Tiendanube, cabecera de 22 columnas con `;`, opción incluir descripciones) / Importar (dropzone .csv con preview de filas, checkboxes modificar/actualizar stock). **Plantilla descargable vacía + con ejemplos** (a pedido): flujo en 2 pasos, "Plantilla vacía" para completar + "Plantilla con ejemplos" guía
- [x] **Nuevo producto (form completo)** ✅ 2026-06-12 — `/productos/nuevo`: secciones Nombre/descripción, Fotos (upload real a media), Precios, Tipo, Inventario, Códigos, Peso/dimensiones, Categorías, Tags/SEO, Destacar; footer sticky. Wired a API real (crea producto + sube imágenes + stock inicial)
- [x] **Categorías drag-and-drop** ✅ 2026-06-12 (a pedido) — rebuild estilo Tiendanube: filas con manija ⠿, chevron expandir/colapsar, íconos duplicar/menú, path. Reordenar arrastrando (HTML5 DnD, dentro del mismo nivel), barra de cambios sin guardar (Descartar/Guardar) + `beforeunload`, orden persistido en localStorage. Nota: backend no tiene columna `position` aún — orden por navegador hasta agregarla
- [x] **Fix Dropdown overflow** ✅ 2026-06-12 (a pedido) — `@tiendafy/ui` Dropdown ahora portalea el menú al `<body>` con posición fija desde el trigger; ningún `overflow:hidden` de tabla/card lo recorta. Cierra con scroll/Escape/click afuera. Beneficia a todos los dropdowns (acciones de producto, selector de tienda)

### Frontend - Admin: Configuración (14 páginas estilo Tiendanube)
- [x] **Sección Configuración completa** ✅ 2026-06-12 — `SettingsLayout` con sub-nav propio (fuera del AdminLayout, como Tiendanube) agrupado en Pagos y envíos / Comunicación / Checkout / Otros, ruta `/configuracion/*`. 14 páginas: Medios de pago (tabs + MP destacado/conectado + grilla de proveedores con switches y tablas de costos), Medios de envío (tabs Nacionales/Internacionales/Retiros + Envío Nube), Centros de distribución, Información de contacto (form + aviso legal), Botón de WhatsApp, E-mails automáticos (cards agrupadas con toggles), Opciones del checkout (diseño/info cliente/nota/seguimiento/restricciones/checkout acelerado), Mensaje para clientes, Usuarios y notificaciones (lee `/auth/me` real), Dominios (subdominio real del tenant + estado/SSL + cards), Códigos externos (head/body), Idiomas y monedas, Redireccionamientos 301, Campos personalizados. `Switch` agregado a `@tiendafy/ui`. Persistencia por tienda vía `useSettings` (localStorage) + `SaveBar` sticky. Verificado con screenshots. Nota: persistencia frontend hasta que existan los módulos backend (Settings/Shipping/Payments config)

### Editor de diseño completo (Tiendanube-style) — preview en vivo
- [x] **Theme draft/published + editor con preview en tiempo real** ✅ 2026-06-13 — **la pieza que pidió el usuario: ver cambios ANTES de publicar.**
  - Backend: `ThemeDocument` con `draft_config` + `published_config` (JSON rico: colores, fuentes, encabezado, barra de anuncio, secciones ordenadas con su contenido), migración `ThemeDraftPublished`. Endpoints `GET /theme` (publicado, storefront), `GET /theme/draft`, `PUT /theme/draft` (autosave), `POST /theme/publish` (draft→published). Backfill de docs viejos. CORS ampliado a `*.localhost` para el iframe del preview
  - Storefront: schema `ThemeConfig` + renderers de sección (`components/store/sections.tsx`: carrusel, productos destacados/nuevos/oferta, banners promo/categorías, mensaje institucional, imagen+texto, info-bar, newsletter, instagram/video). `StorefrontView` client unifica home/preview: header con nav real (Inicio/Productos/Contacto) + **carrito drawer** (localStorage, add/qty/remove/total). Página `/preview` que **escucha postMessage del editor y aplica el tema en vivo sin reload**. Páginas reales navegables: `/productos` (listing), `/productos/[slug]` (detalle con variantes + agregar al carrito), `/contacto` (form)
  - Admin: editor rebuild estilo Tiendanube — top bar (✕, ● Borrador, toggle Celulares/Computadoras con marco de teléfono, Ver tienda, Publicar cambios), nav de secciones (Colores, Tipo de letra, Encabezado+anuncio, Página de inicio con reorder+visibilidad, Listado/Detalle/Carrito/Contacto/Footer/CSS), editores de contenido por sección con **subida de imágenes real** (carrusel, banners, imagen+texto). **postMessage live** en cada cambio (instantáneo) + **autosave draft debounced** + publicar. Presets de color con un click
  - **Verificado E2E con screenshots**: aplicar preset "Bosque" → header del iframe se pone verde AL INSTANTE sin reload ni publicar; modo celular con marco; autosave del draft confirmado; storefront real navegable con carrito. El gallery de diseños migrado al nuevo flujo (presetToConfig → publish)
  - **Editor TERMINADO** ✅ 2026-06-13 (fase 2 completa): Logo de tienda (upload), Encabezado +menú-mobile, **paneles reales** de Listado de productos (columnas, precio, botón, tachado), Detalle (SKU, stock, galería thumbs/apiladas, relacionados), Carrito (texto botón, sugeridos, barra envío gratis + umbral), Contacto (form + dirección/tel/email/WhatsApp), Pie de página (texto, redes, logos de pago), CSS avanzado (textarea inyectada). **Descartar cambios** (revertir draft→published). **Drag-and-drop real** en reorder de secciones (+ ▲▼). **Preview navegable manteniendo el draft**: nav con `?preview=1`, todas las páginas (home/productos/detalle/contacto) renderizan draft+live al navegar dentro del iframe. Config extendida (logo, productList, productDetail, cart, contact, footer, customCss) con merge de defaults en storefront y editor (robusto ante drafts viejos). Verificado E2E con screenshots

### Light / Dark mode con switch animado
- [x] **Dark mode admin + landing** ✅ 2026-06-13 (a pedido) — tokens dark en `shared/design-system/tokens.css` (`[data-theme="dark"]` override de superficies/bordes/textos; primary bermellón + accent obsidiana se mantienen). Admin: `themeMode.ts` (init desde localStorage/system, sin flash) + `ThemeModeToggle` (sol/luna) montado en headers de AdminLayout y SettingsLayout; **transición con View Transitions API — reveal circular desde el click**, fallback CSS suave + `prefers-reduced-motion`. Landing (storefront): `LandingThemeToggle` client en el header, override `[data-ld-mode="dark"]` que invierte papel↔obsidiana (hero ya oscuro por diseño se mantiene), mismo reveal circular. Verificado E2E con screenshots: admin light/dark claros, landing dark full-obsidiana, toggles persisten

### Importación / exportación masiva de productos + imágenes
- [x] **Auto-migrate en startup** ✅ 2026-06-14 — `Api/Startup/DatabaseMigrator.cs` aplica migraciones pendientes de los 6 DbContexts al arrancar (idempotente, `GetPendingMigrations` + `MigrateAsync`), mismo patrón que `EnsureMediaBucketAsync`. Caveat prod multi-instancia anotado en el código
- [x] **Import masivo CSV (queued + progreso)** ✅ 2026-06-14 — `Api/Import/`: `ProductImportQueue` (Channel + dict en memoria), `ProductImportWorker` (BackgroundService, scope DI por producto), `ProductCsv` (parser RFC4180 `;`/`,` + agrupado por handle + opciones/variantes/imágenes). Endpoints `POST /products/import` (multipart→encola) y `GET /products/import/{jobId}` (progreso). Upsert: crea (handle=slug, publica, stock) o actualiza (detalles+precio+stock) según "Modificar existentes"; "Actualizar stock" → `IStockRepository.SetAvailableAsync`. **Imágenes re-hospedadas**: descarga cada URL → MinIO/S3 vía `MediaStorage`, fallback a URL original si falla. Verificado E2E: 2 creados, 3 imágenes a MinIO, stock 20/12, update path (updated=2), skip path (skipped=2)
- [x] **Export masivo CSV** ✅ 2026-06-14 — `GET /products/export` recorre TODOS los productos (paginado), CSV Tiendanube con columna `Imágenes` (URLs propias). Round-trip verificado (export se re-importa limpio)
- [x] **Frontend import/export real** ✅ 2026-06-14 — `ExportImport.tsx`: subida real + polling de progreso (barra + contadores + errores por fila), export por backend, columna `Imágenes` en plantillas. `api.ts`: `postForm` + `download`
- [x] **Link producto↔categoría** ✅ 2026-06-14 — `Product.CategoryIds` (uuid[] en products, migración `AddProductCategories` con default `'{}'`), `SetCategories`. Import: `CategoryResolver` parsea paths display ("A > B > C", varios por coma), resuelve o **crea la jerarquía** que falte. Export emite los paths reconstruidos subiendo por ParentId. DTO expone `categoryIds`; endpoint `PUT /products/{id}/categories`. Verificado E2E: jerarquía creada hasta depth 3, multi-categoría, round-trip export
- [x] **Catálogo storefront tipo marketplace** ✅ 2026-06-14 — bug: `catalog.ts` tenía `limit=24` y el listado no paginaba. Backend: `IProductRepository.SearchAsync` + `GET /products/search` (filtros q/categoría, orden newest/price_asc/price_desc/name vía min precio de variantes con subconsulta EF, paginado por página + total). Storefront: `CatalogBrowser` (client) con buscador, dropdown de orden, sidebar de categorías (jerarquía indentada) y paginado con ventana 1…N. Verificado: 649 resultados, 28 páginas, orden por precio, búsqueda
- [x] **Fix límites upload de imágenes** ✅ 2026-06-14 — subir 1935 archivos en un POST chocaba con `MaxRequestBodySize` (30MB) y `ValueCountLimit` (1024). El endpoint ahora sube ambos límites por request (feature + `FormFeature`). Verificado: 1935 archivos aceptados en 1s
- [x] **Gestión de tiendas (editar/archivar/eliminar)** ✅ 2026-06-14 — `Tenant.Rename` + `ChangeSubdomain`; repo `NameExistsAsync`/`SubdomainExistsAsync`/`CustomDomainExistsAsync` con exclusión de sí misma; `UpdateTenantHandler` (update con unicidad nombre+URL+dominio, archivar=Suspend, activar=Reactivate, eliminar=Cancel soft). Endpoints PATCH/archive/activate/DELETE + `GET /tenants/check` (disponibilidad en vivo). `ListAsync` filtra canceladas. Front `Tenants.tsx`: columna kebab (Editar/Archivar↔Activar/Eliminar), modal con validación en vivo. Verificado E2E (create/check/patch/conflict 409/archive/activate/delete)
- [x] **Selector de tienda en el editor de diseño** ✅ 2026-06-14 — `Dropdown` en la barra del editor (si hay >1 tienda) → `selectStore`, recarga el draft de la otra tienda. Arreglado el doble-dropdown (el Trigger ya trae borde+chevron)
- [x] **Identidad: logo + favicon + imagen al compartir** ✅ 2026-06-14 — `favicon`/`shareImage` en el theme (admin+storefront+backend default). Panel "Identidad de tu tienda" con los 3 uploaders + tamaños recomendados (575×230 / 130×130 / 600×600). Favicon se inyecta en la pestaña vía effect en `StorefrontView` (vivo en preview)
- [x] **Más fuentes** ✅ 2026-06-14 — 12 familias nuevas (Poppins, Montserrat, DM Sans, Manrope, Work Sans, Space Grotesk, Playfair, Lora, Cormorant, DM Serif, Bebas, Archivo Black) vía Google Fonts en el layout del storefront (solo descarga la familia activa). `FONT_FAMILIES` + `fontOptions` en sync admin/storefront
- [x] **Fix fotos de productos (import idempotente)** ✅ 2026-06-14 — bug: re-correr el import de imágenes acumulaba duplicados (sin dedup) + el matcher por strip-`-N`/SKU pescaba archivos ajenos. Fix: `AttachImagesAsync` ahora **reemplaza** la galería (sube primero, si hay OK limpia con `Product.ClearImages` y agrega) → re-importar es idempotente; matcher endurecido (exacto slug → strip-`-N` solo contra slugs → SKU exacto, sin el combo strip+SKU). Verificado: 2 corridas → 3 imágenes, no 6. (Nota: el desalineo nombre↔slug es del CSV scrapeado, no se arregla del lado nuestro)
- [x] **Botones Comprar / Compartir en detalle** ✅ 2026-06-14 — `ProductDetail`: "Comprar ahora" (CTA principal, arriba) + "Agregar al carrito" (outline) + "Compartir" (Web Share API / copia link con feedback)
- [x] **Clientes (CRM)** ✅ 2026-06-14 — módulo backend `Customers` (entidad Customer + CRUD `/customers` con búsqueda). Admin: página Clientes (lista/buscar/crear/editar/eliminar). Nav sin PRONTO. Verificado
- [x] **Acciones masivas + duplicar producto** ✅ 2026-06-14 — checkboxes funcionales (select-all por página), barra bulk (Publicar/Archivar/Eliminar seleccionados vía Promise.all). Backend `POST /products/{id}/duplicate` (clona variantes/imágenes/categorías/SEO en DRAFT); kebab "Duplicar" conectado. Verificado: duplicado crea "Copia de…" con 6 imágenes
- [x] **Variantes + reordenar imágenes** ✅ 2026-06-14 — NewProduct: builder de opciones (Talle/Color…, hasta 3) → genera variantes (precio/promo/SKU/stock por combinación, producto cartesiano). EditProduct: reordenar la galería con drag → `PUT /products/{id}/images/reorder` (dominio `ReorderImages`)
- [x] **SEO por producto + páginas institucionales** ✅ 2026-06-14 — `Product.SeoTitle/SeoDescription` (migración `AddProductSeo`), en PATCH + DTO + form EditProduct + import (columnas "Título/Descripción para SEO"). Módulo backend `Content` (entidad Page: title/slug/body/published) + CRUD `/pages` + público `/pages/by-slug`. Admin: página Páginas (CMS simple). Storefront: `/paginas/[slug]` con `generateMetadata`. Verificado: "Sobre Nosotros" renderiza en la tienda
- [x] **Estadísticas reales** ✅ 2026-06-14 — `GET /stats/overview` agrega catálogo/categorías/cupones/clientes/páginas (counts reales). Overview reemplaza los mocks por datos reales + panel honesto de ventas ("disponibles cuando actives Pedidos"). Verificado: 650 productos, 6 cats, 2/3 cupones, 1 cliente, 1 página
- [x] **Import imágenes por CSV de mapeo** ✅ 2026-06-14 — el import de imágenes acepta un `.csv` de mapeo (handle→"Archivos"); el worker asocia EXACTO por mapeo (sin adivinar por nombre). Tab Imágenes acepta `.csv` + explica
- [x] **Fix selector de tienda (race)** ✅ 2026-06-14 — `setActiveTenant` (header X-Tenant-Id) ahora se setea SÍNCRONO en `selectStore` y en el auto-select, antes de que las queries (key store.id) refetcheen → al cambiar de tienda los datos de la página cargan del tenant correcto (sin datos viejos/vacíos)
- [x] **Paginación en Productos e Inventario** ✅ 2026-06-14 — `lib/products.ts` (`fetchAllProducts` por cursor, `fetchStockChunked` en chunks de 60 para no pasar el largo de URL); componente `Pagination` (ventana 1…N). Productos: 20/página con filtros+orden client-side sobre el catálogo completo; Inventario: 20 productos/página. Verificado: gimify 645 productos → 33 páginas
- [x] **Eliminar todos los productos (con imágenes)** ✅ 2026-06-14 — `IMediaStorage.DeleteAsync` (borra el objeto de MinIO parseando la key de la URL, best-effort, ignora URLs externas); `DELETE /products` borra todos los del tenant + sus imágenes del storage. Admin: botón "Eliminar todos" con confirmación tipeada ("ELIMINAR"). Verificado: 3→deleted 3→0
- [x] **Cupones de descuento (módulo Discounts)** ✅ 2026-06-14 — **módulo backend nuevo** `Discounts.Infrastructure` (mirror de Themes): entidad `Coupon` (Percentage/FixedAmount/FreeShipping, value, compra mínima, vigencia desde/hasta, límite de usos), `DiscountsDbContext` + migración `InitialDiscounts` (auto-aplicada), wired en slnx/Api.csproj/Program/DatabaseMigrator. Endpoints `GET/POST/PUT/DELETE /coupons`, `POST /coupons/{id}/toggle` y **`POST /coupons/validate`** (público, evalúa código+subtotal → descuento o motivo). Admin: página **Descuentos** (lista + crear/editar/pausar/eliminar, nav ya no PRONTO). Storefront: input de cupón en el carrito → valida → aplica descuento/envío gratis y recalcula. Verificado E2E: %/fijo/envío gratis, mínimo, duplicado 409, aplicado en el carrito
- [x] **Semántica de precios Precio/Promocional** ✅ 2026-06-14 — "Precio" = lista (mayor, tachado), "Promocional" = oferta (menor, mostrada/cobrada), estilo Tiendanube. Helper `lib/price.ts` (`toFormPrice`/`toDomainPrice`, normaliza cobra-menor-tacha-mayor) usado en EditProduct, NewProduct y la lista inline. Import backend normaliza igual; export emite Precio=lista/Promocional=oferta. Verificado: edición muestra 777.777 / 290.250
- [x] **Más combinaciones de colores** ✅ 2026-06-14 — 12 presets nuevos en el editor (Arena, Lavanda, Menta, Coral, Esmeralda, Mostaza, Vino, Carbón, Marino, Grafito…), claros y oscuros
- [x] **Footer multi-contacto** ✅ 2026-06-14 — `footer` suma `whatsapps`/`addresses`/`phones`/`emails` (arrays, uno o varios). `StringList` repetible en el FooterPanel; el storefront los renderiza con iconos (wa.me / tel: / mailto:). Schema en admin+storefront+backend default
- [x] **Editar / eliminar productos** ✅ 2026-06-14 — `EditProduct.tsx` (ruta `/productos/:id/editar`): nombre, descripción, precios+promo+stock por variante, fotos (alta/baja inmediata), categorías (chips), publicar/archivar, eliminar. Lista: nombre clickeable → edición, kebab con Editar/Duplicar/Archivar/Eliminar. Backend `DELETE /products/{id}` (hard delete, cascada). Verificado: DELETE 204→404, edición carga datos
- [x] **Encabezado configurable** ✅ 2026-06-14 — `header`: `layout` (clásico/logo-centrado/menú-izq/menú-der), `textColor`, `transparentOnHome` (transparente sobre el hero, sólido al scroll), `showSearch` (buscador→/products/search), `showCart`+`cartStyle`, `showAccount`, `border`. Render reescrito en `StorefrontView.Header`; controles en la pestaña Encabezado. Verificado en vivo en el editor
- [x] **Emojis → iconos lucide-react** ✅ 2026-06-14 — toda la UI (admin + storefront) pasó de emojis/glyphs a `lucide-react` (~32 archivos). Iconos heredan `currentColor` (respetan bermellón + dark mode). Nav-arrays guardan el componente (`LucideIcon`). Iconos de marca (Instagram/Facebook, que lucide removió) → SVG propios en el footer. Decorativos (👋, 🎉) se dejaron. tsc verde en ambas apps
- [x] **Servicio de import masivo de imágenes** ✅ 2026-06-14 — `Api/Import/`: `ImageImportQueue` + `ProductImageImportWorker`. Endpoints `POST /products/images/import` (multipart: muchas imágenes **o un .zip**, guarda a temp, encola) + `GET /products/images/import/{jobId}`. **Match por nombre = slug del producto** (exacto primero, luego sin sufijo `-N` que ordena la galería), fallback a SKU; sube a MinIO. Tab "Imágenes" en `ExportImport.tsx` con dropzone + progreso + sin-match. Verificado E2E con data real deporar: 645 productos, 5 imágenes→2 productos, galería ordenada (pos 0/1/2)

### Backend - HTTP Hosts
- [ ] API Host (Api project)
  - [ ] TenancyMiddleware (resolve tenant by Host header)
  - [ ] AuthenticationMiddleware (JWT + ASP.NET Identity)
  - [ ] ExceptionHandlerMiddleware (global error handling)
  - [ ] CorrelationIdMiddleware (trace_id propagation)
  - [ ] RateLimitingMiddleware (in-memory, future: Redis)
  - [ ] Versioning (/api/v1/*, future: v2)
  - [ ] OpenAPI/Swagger endpoint
  - [ ] Health check endpoint (/health)
  - [ ] Module registration (DI for all modules)

- [ ] Worker Host (Worker project)
  - [ ] OutboxPublisher background service
  - [ ] RabbitMQ consumer registrations
  - [ ] Hangfire setup
  - [ ] Health check endpoint

### Frontend - Storefront (Next.js)
- [x] Rebrand v2 "obsidiana y papel" ✅ 2026-06-12 — benchmark contra Empretienda/Commerce/Jumpseller/Tiendanube. Hero oscuro producto-adelante (mock CSS del admin real en perspectiva + tarjetas de tienda flotantes + toasts de venta), collage masonry de 6 tiendas con identidad propia (arte CSS, sin stock), CTA final oscuro (bookend), glow bermellón radial en zonas dark. Tokens: primary indigo→bermellón, accent→obsidiana (rebrand sistémico de admin+ui). Admin: sidebar obsidiana + logo. Logo/favicon SVG: sello bermellón rotado con "t" itálica (`icon.svg` Next + `admin/public/favicon.svg`). Reveal ahora progressive-enhancement (visible sin JS; `armed` por JS antes de observar). DESIGN.md actualizado a v2. Verificado con screenshots: hero, admin, collage. Nota: capturas full-page muestran secciones reveal en blanco — artefacto de captureBeyondViewport (no dispara IO), UX real verificada OK
- [x] Landing comercial de plataforma ✅ 2026-06-11 — `localhost:3000` sin subdominio → landing "editorial de mercado": Fraunces + Archivo (next/font), papel/tinta/bermellón con grano SVG, botones tipo sello con sombra dura, mock de storefront con notificaciones de venta animadas en loop, ticker marquee de productos, 3 pasos con numerales editoriales, grid de features estilo periódico, sección oscura de stats, testimonios, pricing en ARS con sticker "El más elegido", FAQ con `<details>` nativo, CTA final. Scroll reveals vía IntersectionObserver (`Reveal.tsx`), `prefers-reduced-motion` respetado. CSS scoped `.ld-root` — no toca storefronts de tenants. Verificado con Playwright: landing en host raíz, tiendas en subdominios intactas. Pendiente menor: favicon (404 en consola)
- [x] Scaffold mínimo E2E ✅ 2026-06-11 — Next 15 App Router corriendo en :3000. `lib/tenancy.ts` resuelve tenant por Host header contra `GET /tenants/resolve` (revalidate 60s), `lib/api.ts` cliente server-side (API_URL no se expone al browser). Home dinámica: header+hero con datos reales del tenant, página "Tienda no encontrada" para hosts desconocidos, página de suspensión por status. tokens.css + Tailwind integrados (`transpilePackages` para paquetes workspace). Verificado: `mitienda.localhost:3000` renderiza tenant real de Postgres; host desconocido → not-found. Fix de contrato: `Tenant.createdAt` → `createdAtUtc` (matchea JSON real de la API)
- [ ] Directory structure (app/, components/, lib/, types/)
- [ ] Layout structure
  - [ ] RootLayout (client-side state provider setup)
  - [ ] StoreLayout (header, nav, footer - theme-aware)
- [ ] Pages
  - [ ] / (home, ISR)
  - [ ] /products (listing, SSG with ISR)
  - [ ] /products/[slug] (detail, SSG with ISR on-demand)
  - [ ] /cart (dynamic)
  - [ ] /checkout (dynamic, form validation)
  - [ ] /checkout/confirmation (POST redirect pattern)
  - [ ] /account/login (dynamic)
  - [ ] /account/orders (authenticated, dynamic)
- [ ] Components
  - [ ] ProductCard
  - [ ] ProductGrid
  - [ ] CartSummary
  - [ ] CheckoutForm (form with Mercado Pago widget)
  - [ ] PaymentWidget (MP integration)
  - [ ] Header (navigation, cart icon, theme-aware)
  - [ ] Footer (links, copyright)
- [ ] Lib
  - [ ] api.ts (HTTP client with JWT)
  - [ ] auth.ts (JWT + refresh token handling)
  - [ ] cart.ts (localStorage + API sync)
  - [ ] tenancy.ts (resolve tenant from Host)
  - [ ] theme.ts (fetch + cache theme)
- [ ] API routes
  - [ ] /api/cart (POST, GET, DELETE)
  - [ ] /api/webhooks/payment (POST, handle MP redirects)
  - [ ] /api/auth/refresh (POST)
- [ ] Styling
  - [ ] Tailwind setup
  - [ ] CSS custom properties for design tokens
  - [ ] Responsive mobile-first
- [ ] Tests (optional for MVP)

### Frontend - Admin (React + Vite)
- [x] Rediseño IA completa estilo Tiendanube ✅ 2026-06-12 — sidebar agrupado (Gestión/Canales de venta/Plataforma/Configuración) con subsecciones colapsables y badges "Pronto" para módulos del roadmap; selector de tienda en topbar (StoreContext + localStorage + header X-Tenant-Id automático en cliente HTTP) + link "Ver mi tienda"; página Inicio con stat cards y checklist de onboarding (estados done reales); página Productos REAL (lista desde API con rango de precios formateado Intl, badges de estado, modal crear producto simple publicado al toque, EmptyState con CTA); 14 páginas stub navegables con EmptyState brandeado (patrón Tiendanube: ilustración SVG + kicker + título + body) — cada una se reemplaza al aterrizar su módulo. Verificado con screenshots
- [x] Scaffold mínimo E2E ✅ 2026-06-11 — Vite + React Router + React Query en :3001. `AdminLayout` (sidebar + topbar con tokens), página Tiendas: tabla (componentes `@tiendafy/ui`: Table, Badge, Card) con link directo a cada storefront, modal Crear tienda (FormField + validación de error de API RFC 7807, toast de éxito, invalidación de cache). Verificado: 200 OK, lista desde API real, CORS preflight OK
- [ ] Directory structure (pages/, components/, lib/, hooks/, types/)
- [ ] Auth flow
  - [ ] LoginPage (form, credential validation)
  - [ ] ProtectedRoute (redirect if not authenticated)
  - [ ] useAuth hook (check session, refresh)
- [ ] Layout
  - [ ] AdminLayout (sidebar, topbar, breadcrumbs)
  - [ ] Sidebar (navigation menu, store selector)
  - [ ] TopBar (user menu, logout)
- [ ] Pages
  - [ ] Dashboard (metrics overview)
  - [ ] Products/
    - [ ] Index (table, search, filters, pagination)
    - [ ] Create (form)
    - [ ] Edit (form, prefilled)
    - [ ] Detail (read-only view)
  - [ ] Orders/
    - [ ] Index (table, filters)
    - [ ] Detail (order info, items, timeline)
  - [ ] Settings/ (store name, domain, plan info)
- [ ] Components
  - [ ] ProductForm (create/edit form, variant matrix)
  - [ ] OrderDetail (timeline, actions)
  - [ ] AdminDataTable (reusable table with sorting/filtering)
- [ ] Lib
  - [ ] api.ts (HTTP client with session cookie + CSRF)
  - [ ] auth.ts (session management)
  - [ ] query-client.ts (React Query setup)
  - [ ] hooks.ts (useAuth, useApi, useTenant)
- [ ] Styling
  - [ ] Tailwind + shared design system
- [ ] Tests (optional for MVP)

## Fase 2: Escala Temprana (3-4 semanas)

A partir de 10-20 merchants, optimizar observabilidad, backup, soporte.

- [ ] **Observabilidad**
  - [ ] OpenTelemetry (traces)
  - [ ] Serilog (structured logging)
  - [ ] Prometheus (metrics)
  - [ ] Grafana (dashboards)
  - [ ] Sentry (error tracking)

- [ ] **Database**
  - [ ] Read replicas (Postgres replication)
  - [ ] Backups automated (PITR tested)
  - [ ] Monitoring (connection pool, slow queries)

- [ ] **API Pública**
  - [ ] OAuth setup (authorization_code + client_credentials)
  - [ ] API keys (scoped, rate-limited)
  - [ ] Rate limiting (Redis token bucket)
  - [ ] Webhook setup (event types, retry logic)
  - [ ] Documentation (OpenAPI fully documented)

- [ ] **Admin Mejoras**
  - [ ] Analytics dashboard (sales, traffic, conversion)
  - [ ] Bulk operations (importar productos via CSV)
  - [ ] Theme editor (drag & drop builder)

## Fase 3: Estabilidad Operativa (2-3 semanas)

Runbooks, alerting, disaster recovery procedures.

- [ ] **Monitoring & Alerting**
  - [ ] SLOs defined (availability, latency, error rate)
  - [ ] Alerts configured (Slack notifications)
  - [ ] Runbooks for common incidents

- [ ] **Database**
  - [ ] Sharding strategy (by tenant_id + date)
  - [ ] Partitioning (orders table, historical cleanup)

- [ ] **Backup & Restore**
  - [ ] Automated backups (daily, tested monthly)
  - [ ] PITR tested (recover to point-in-time)
  - [ ] RTO/RPO documented

- [ ] **Documentation**
  - [ ] Deployment guide
  - [ ] Troubleshooting guide
  - [ ] Incident response playbooks

## Fase 4: Escalabilidad (4-6 semanas)

A partir de 100+ merchants.

- [ ] **Kubernetes Migration**
  - [ ] Helm charts
  - [ ] HPA (horizontal pod autoscaling)
  - [ ] PDB (pod disruption budgets)
  - [ ] Rolling updates

- [ ] **Caching & CDN**
  - [ ] Redis read models (product catalog)
  - [ ] Cloudflare zones (CDN, WAF)
  - [ ] Cache invalidation strategy

- [ ] **Databases**
  - [ ] Sharding implementation (Citus or app-level)
  - [ ] Multi-region replication (read-heavy regions)

- [ ] **Service Extraction** (if needed)
  - [ ] Webhooks dispatcher (asynchronous fan-out)
  - [ ] Search service (Meilisearch/Elasticsearch)
  - [ ] Media processor (image resizing, optimization)

## Done: Structure Only

De aquí en más es implementación línea por línea. No hay sorpresas arquitectónicas.

✅ Monorepo structure (backend modular, storefront, admin)
✅ Module boundaries (Contracts/Core/Infrastructure)
✅ Database schema skeleton (migrations folder structure)
✅ CI/CD skeleton (GitHub Actions workflows)
✅ Observability skeleton (OpenTelemetry places)
✅ ADRs documenting major decisions
✅ Guides for feature/module addition

**Next**: Pick a feature from Fase 1, start implementing.

Sugerencia: Empezar por Tenancy (cimiento), luego Catalog (validar UI), luego Checkout → Payments (validar flujo crítico).
