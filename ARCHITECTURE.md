# Tiendafy Architecture

## Topología

```
tiendafy/                              # Monorepo raíz
├── backend/                           # Backend modular (.NET 10)
│   ├── src/
│   │   ├── Api/                       # Host HTTP (puerto 5000)
│   │   │   ├── Program.cs             # Composition root
│   │   │   ├── appsettings.json
│   │   │   ├── Extensions/            # DI, middleware setup
│   │   │   ├── Middleware/            # Tenancy resolver, exception handler
│   │   │   └── Api.csproj
│   │   │
│   │   ├── Worker/                    # Host background jobs + consumers (puerto 5001)
│   │   │   ├── Program.cs
│   │   │   ├── BackgroundServices/    # Workers que ejecutan en loop
│   │   │   └── Worker.csproj
│   │   │
│   │   ├── SharedKernel/              # Tipos base compartidos
│   │   │   ├── Domain/
│   │   │   │   ├── DomainEvent.cs
│   │   │   │   ├── ValueObject.cs
│   │   │   │   ├── Entity.cs
│   │   │   │   └── AggregateRoot.cs
│   │   │   ├── Common/
│   │   │   │   ├── Money.cs           # Dinero = int (centavos) + currency code
│   │   │   │   ├── TenantId.cs
│   │   │   │   ├── Result<T>.cs       # Railway-oriented programming
│   │   │   │   └── Ulid.cs            # IDs distribuidos
│   │   │   ├── Exceptions/
│   │   │   ├── Constants.cs
│   │   │   └── SharedKernel.csproj
│   │   │
│   │   └── Modules/                   # Módulos de dominio
│   │       ├── Tenancy/
│   │       │   ├── Tenancy.Contracts/
│   │       │   │   ├── TenantCreatedEvent.cs
│   │       │   │   ├── ITenancyService.cs (interface para usarla desde otros módulos)
│   │       │   │   └── Tenancy.Contracts.csproj
│   │       │   ├── Tenancy.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Tenant.cs (aggregate root)
│   │       │   │   │   ├── Plan.cs (value object)
│   │       │   │   │   └── TenantStatus.cs
│   │       │   │   ├── Features/
│   │       │   │   │   ├── CreateTenant/
│   │       │   │   │   │   ├── CreateTenantCommand.cs
│   │       │   │   │   │   ├── CreateTenantHandler.cs
│   │       │   │   │   │   ├── CreateTenantValidator.cs
│   │       │   │   │   │   └── CreateTenantEndpoint.cs
│   │       │   │   │   ├── GetTenant/
│   │       │   │   │   └── UpdateTenantPlan/
│   │       │   │   ├── Application/
│   │       │   │   │   ├── TenancyService.cs (implementa contracts)
│   │       │   │   │   └── Events/ (handlers de dominio)
│   │       │   │   └── Tenancy.Core.csproj
│   │       │   └── Tenancy.Infrastructure/
│   │       │       ├── Persistence/
│   │       │       │   ├── TenantRepository.cs
│   │       │       │   └── Queries/ (read models si hay)
│   │       │       ├── Integrations/
│   │       │       └── Tenancy.Infrastructure.csproj
│   │       │
│   │       ├── Identity/
│   │       │   ├── Identity.Contracts/
│   │       │   ├── Identity.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── User.cs
│   │       │   │   │   ├── Role.cs
│   │       │   │   │   └── Permission.cs
│   │       │   │   └── Features/
│   │       │   │       ├── RegisterUser/
│   │       │   │       ├── Login/
│   │       │   │       ├── IssueToken/
│   │       │   │       └── CreateApiKey/
│   │       │   └── Identity.Infrastructure/
│   │       │
│   │       ├── Catalog/
│   │       │   ├── Catalog.Contracts/
│   │       │   │   ├── ProductCreatedEvent.cs
│   │       │   │   └── CatalogQueries.cs
│   │       │   ├── Catalog.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Product.cs
│   │       │   │   │   ├── Variant.cs
│   │       │   │   │   ├── Option.cs
│   │       │   │   │   └── Category.cs
│   │       │   │   └── Features/
│   │       │   │       ├── CreateProduct/
│   │       │   │       ├── UpdateProduct/
│   │       │   │       ├── ListProducts/
│   │       │   │       └── GetProductBySlug/
│   │       │   └── Catalog.Infrastructure/
│   │       │       ├── Persistence/
│   │       │       └── ReadModels/
│   │       │           └── ProductSearchModel.cs (desnormalizado para el storefront)
│   │       │
│   │       ├── Inventory/
│   │       │   ├── Inventory.Contracts/
│   │       │   ├── Inventory.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Stock.cs
│   │       │   │   │   ├── StockMovement.cs
│   │       │   │   │   ├── Reservation.cs
│   │       │   │   │   └── ReservationPolicy.cs
│   │       │   │   └── Features/
│   │       │   │       ├── ReserveStock/
│   │       │   │       ├── ConfirmReservation/
│   │       │   │       ├── ReleaseReservation/
│   │       │   │       └── GetAvailableStock/
│   │       │   └── Inventory.Infrastructure/
│   │       │       └── Jobs/
│   │       │           └── ReleaseExpiredReservationsJob.cs
│   │       │
│   │       ├── Orders/
│   │       │   ├── Orders.Contracts/
│   │       │   ├── Orders.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Order.cs (aggregate root complejo con máquina de estados)
│   │       │   │   │   ├── OrderItem.cs
│   │       │   │   │   ├── OrderStatus.cs
│   │       │   │   │   ├── Shipping.cs
│   │       │   │   │   └── ShippingProvider.cs
│   │       │   │   └── Features/
│   │       │   │       ├── CreateOrder/
│   │       │   │       ├── UpdateOrderStatus/
│   │       │   │       ├── GetOrder/
│   │       │   │       └── ListOrders/
│   │       │   └── Orders.Infrastructure/
│   │       │       ├── Persistence/
│   │       │       └── Saga/
│   │       │           └── CheckoutSaga.cs
│   │       │
│   │       ├── Checkout/
│   │       │   ├── Checkout.Contracts/
│   │       │   │   ├── CheckoutSessionStartedEvent.cs
│   │       │   │   └── CheckoutCommands.cs
│   │       │   ├── Checkout.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── CheckoutSession.cs
│   │       │   │   │   ├── CartItem.cs
│   │       │   │   │   └── CheckoutStatus.cs
│   │       │   │   └── Features/
│   │       │   │       ├── StartCheckout/
│   │       │   │       ├── AddItemToCart/
│   │       │   │       ├── CalculateShipping/
│   │       │   │       ├── CalculateTax/
│   │       │   │       └── SubmitCheckout/
│   │       │   └── Checkout.Infrastructure/
│   │       │       └── Integrations/
│   │       │           └── TaxProvider.cs
│   │       │
│   │       ├── Payments/
│   │       │   ├── Payments.Contracts/
│   │       │   │   ├── PaymentInitiatedEvent.cs
│   │       │   │   └── PaymentStateMachine.cs
│   │       │   ├── Payments.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Payment.cs
│   │       │   │   │   ├── PaymentStatus.cs
│   │       │   │   │   └── PaymentMethod.cs
│   │       │   │   └── Features/
│   │       │   │       ├── InitiatePayment/
│   │       │   │       ├── HandlePaymentWebhook/
│   │       │   │       ├── RefundPayment/
│   │       │   │       └── GetPaymentStatus/
│   │       │   └── Payments.Infrastructure/
│   │       │       ├── Gateways/
│   │       │       │   ├── IPaymentGateway.cs (interface)
│   │       │       │   └── MercadoPagoGateway.cs
│   │       │       └── Inbox/
│   │       │           └── PaymentWebhookHandler.cs (patrón Inbox para deduplicación)
│   │       │
│   │       ├── Billing/
│   │       │   ├── Billing.Contracts/
│   │       │   ├── Billing.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Subscription.cs
│   │       │   │   │   ├── SubscriptionStatus.cs
│   │       │   │   │   ├── Invoice.cs
│   │       │   │   │   └── BillingPlan.cs
│   │       │   │   └── Features/
│   │       │   │       ├── CreateSubscription/
│   │       │   │       ├── ChargeSubscription/
│   │       │   │       └── HandleSubscriptionWebhook/
│   │       │   └── Billing.Infrastructure/
│   │       │       └── Jobs/
│   │       │           └── MonthlyBillingJob.cs
│   │       │
│   │       ├── Themes/
│   │       │   ├── Themes.Contracts/
│   │       │   ├── Themes.Core/
│   │       │   │   ├── Domain/
│   │       │   │   │   ├── Theme.cs
│   │       │   │   │   ├── Section.cs
│   │       │   │   │   ├── DesignToken.cs
│   │       │   │   │   └── ThemeAsset.cs
│   │       │   │   └── Features/
│   │       │   │       ├── CreateTheme/
│   │       │   │       ├── UpdateThemeSettings/
│   │       │   │       ├── PublishTheme/
│   │       │   │       └── GetThemePreview/
│   │       │   └── Themes.Infrastructure/
│   │       │       └── Storage/
│   │       │           └── S3ThemeAssetStorage.cs
│   │       │
│   │       └── Notifications/
│   │           ├── Notifications.Contracts/
│   │           ├── Notifications.Core/
│   │           │   ├── Domain/
│   │           │   │   ├── EmailTemplate.cs
│   │           │   │   └── NotificationPreference.cs
│   │           │   └── Features/
│   │           │       ├── SendOrderConfirmation/
│   │           │       ├── SendShippingUpdate/
│   │           │       └── SendMarketingEmail/
│   │           └── Notifications.Infrastructure/
│   │               └── Handlers/
│   │                   └── DomainEventToEmailHandler.cs
│   │
│   ├── tests/
│   │   ├── Unit/
│   │   │   ├── Modules/
│   │   │   │   ├── Catalog/
│   │   │   │   ├── Orders/
│   │   │   │   └── ...
│   │   │   └── SharedKernel/
│   │   ├── Integration/
│   │   │   ├── Modules/
│   │   │   ├── Persistence/
│   │   │   └── Messaging/
│   │   ├── Architecture/
│   │   │   ├── DependencyRulesTests.cs (valida que solo se cumpla Contracts)
│   │   │   └── ModuleStructureTests.cs
│   │   └── tests.csproj
│   │
│   ├── migrations/
│   │   ├── 001_InitialSchema.sql
│   │   ├── 002_Tenancy.sql
│   │   ├── 003_Identity.sql
│   │   ├── 004_Catalog.sql
│   │   ├── 005_Inventory.sql
│   │   ├── 006_Orders.sql
│   │   ├── 007_Payments.sql
│   │   ├── 008_Billing.sql
│   │   ├── 009_Themes.sql
│   │   ├── 010_Inbox_Outbox.sql
│   │   └── README.md (expand/contract pattern)
│   │
│   ├── backend.sln
│   └── README.md
│
├── storefront/                        # Next.js 14 (SSR + ISR, por tenant)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # Root layout, tenancy resolver
│   │   │   ├── page.tsx               # Home (ISR)
│   │   │   ├── products/
│   │   │   │   ├── [slug]/
│   │   │   │   │   ├── page.tsx       # Product detail (SSG con ISR)
│   │   │   │   │   └── layout.tsx
│   │   │   │   └── page.tsx           # Product listing (ISR)
│   │   │   ├── cart/
│   │   │   │   ├── page.tsx           # Cart (dynamic)
│   │   │   │   └── layout.tsx
│   │   │   ├── checkout/
│   │   │   │   ├── page.tsx           # Checkout form (dynamic)
│   │   │   │   ├── layout.tsx
│   │   │   │   └── confirmation/
│   │   │   │       └── page.tsx
│   │   │   ├── account/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── orders/
│   │   │   │       └── page.tsx
│   │   │   └── api/
│   │   │       ├── middleware.ts      # Tenancy resolver (Host header)
│   │   │       ├── cart/route.ts
│   │   │       └── webhooks/
│   │   │           └── payment/route.ts
│   │   ├── components/
│   │   │   ├── ui/                    # Design system primitives
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx         # Logo, nav, cart icon (theme-aware)
│   │   │   │   ├── Footer.tsx
│   │   │   │   ├── Navigation.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   ├── storefront/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   ├── CartSummary.tsx
│   │   │   │   ├── CheckoutForm.tsx
│   │   │   │   └── PaymentWidget.tsx  # Integración con MercadoPago
│   │   │   └── sections/              # Secciones componibles del tema
│   │   │       ├── HeroSection.tsx
│   │   │       ├── FeaturedProducts.tsx
│   │   │       ├── CollectionGrid.tsx
│   │   │       └── Newsletter.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                 # HTTP client para backend
│   │   │   ├── auth.ts                # JWT + refresh token
│   │   │   ├── cart.ts                # Lógica de carrito (localStorage + API)
│   │   │   ├── tenancy.ts             # Resolver tenant por Host
│   │   │   ├── theme.ts               # Cargar tema y design tokens
│   │   │   ├── hooks.ts               # useCart, useTenant, useAuth, useSomething
│   │   │   └── constants.ts
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   ├── variables.css          # Design tokens como CSS vars
│   │   │   └── components.css
│   │   ├── types/
│   │   │   ├── api.ts                 # Types de respuestas del backend
│   │   │   ├── domain.ts              # Product, Order, etc
│   │   │   └── theme.ts
│   │   ├── config/
│   │   │   ├── api.ts
│   │   │   └── constants.ts
│   │   ├── .env.local (en .gitignore)
│   │   └── public/
│   │       ├── favicon.ico
│   │       └── og-image.jpg
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts              # Design tokens centralizados
│   ├── tsconfig.json
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── README.md
│
├── admin/                             # React 19 + Vite + TypeScript (SPA)
│   ├── src/
│   │   ├── main.tsx                   # Entry point
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Products/
│   │   │   │   ├── index.tsx          # Listing con búsqueda + filters
│   │   │   │   ├── Create.tsx
│   │   │   │   ├── Edit.tsx
│   │   │   │   └── Detail.tsx
│   │   │   ├── Orders/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── Detail.tsx
│   │   │   │   └── Fulfill.tsx
│   │   │   ├── Inventory/
│   │   │   │   ├── index.tsx
│   │   │   │   └── Adjustments.tsx
│   │   │   ├── Settings/
│   │   │   │   ├── Store.tsx
│   │   │   │   ├── Billing.tsx
│   │   │   │   ├── Domains.tsx
│   │   │   │   ├── Team.tsx
│   │   │   │   └── Integrations.tsx
│   │   │   ├── Themes/
│   │   │   │   ├── index.tsx          # Tema actual + editor de secciones
│   │   │   │   ├── Editor.tsx         # Drag & drop builder
│   │   │   │   └── Preview.tsx
│   │   │   ├── Analytics/
│   │   │   │   ├── Sales.tsx
│   │   │   │   ├── Traffic.tsx
│   │   │   │   └── Customers.tsx
│   │   │   ├── Auth/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Logout.tsx
│   │   │   │   └── Profile.tsx
│   │   │   └── NotFound.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # Design system (mismo que storefront)
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   ├── Pagination.tsx
│   │   │   │   ├── Form/
│   │   │   │   │   ├── FormField.tsx
│   │   │   │   │   ├── FormError.tsx
│   │   │   │   │   └── MultiSelect.tsx
│   │   │   │   └── ...
│   │   │   ├── admin/
│   │   │   │   ├── ProtectedRoute.tsx
│   │   │   │   ├── AdminLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   ├── Breadcrumbs.tsx
│   │   │   │   └── StoreSelector.tsx  # Para admins multitienda
│   │   │   └── forms/
│   │   │       ├── ProductForm.tsx
│   │   │       ├── OrderForm.tsx
│   │   │       └── ThemeBuilder.tsx   # Drag & drop section builder
│   │   ├── lib/
│   │   │   ├── api.ts                 # HTTP client con auto-retry
│   │   │   ├── auth.ts                # Manejo de sesiones y tokens
│   │   │   ├── hooks.ts               # useAuth, useTenant, useApi
│   │   │   ├── query-client.ts        # React Query setup
│   │   │   └── constants.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useApi.ts              # Wrapper sobre React Query
│   │   │   ├── useTenant.ts
│   │   │   └── ...
│   │   ├── types/
│   │   │   ├── api.ts                 # Tipos de API
│   │   │   └── domain.ts
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   └── variables.css          # Mismo design system que storefront
│   │   ├── .env.local (en .gitignore)
│   │   └── public/
│   │       └── logo.svg
│   ├── .env.example
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── README.md
│
├── infra/                             # Terraform + Docker
│   ├── terraform/
│   │   ├── environments/
│   │   │   ├── dev.tfvars
│   │   │   ├── staging.tfvars
│   │   │   └── prod.tfvars
│   │   ├── modules/
│   │   │   ├── network/
│   │   │   │   ├── main.tf
│   │   │   │   ├── variables.tf
│   │   │   │   └── outputs.tf
│   │   │   ├── database/
│   │   │   │   ├── main.tf            # Cloud SQL o RDS Postgres
│   │   │   │   ├── variables.tf
│   │   │   │   └── outputs.tf
│   │   │   ├── storage/
│   │   │   │   ├── main.tf            # S3 / GCS para temas e imágenes
│   │   │   │   └── variables.tf
│   │   │   ├── cache/
│   │   │   │   ├── main.tf            # Redis
│   │   │   │   └── variables.tf
│   │   │   ├── container-registry/
│   │   │   │   └── main.tf
│   │   │   ├── compute/
│   │   │   │   ├── main.tf            # Cloud Run / Fargate
│   │   │   │   └── variables.tf
│   │   │   ├── cdn/
│   │   │   │   ├── main.tf            # Cloudflare
│   │   │   │   └── variables.tf
│   │   │   └── monitoring/
│   │   │       ├── main.tf            # Grafana / Datadog
│   │   │       └── variables.tf
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfstate (en .gitignore)
│   ├── docker/
│   │   ├── Dockerfile.api             # Multi-stage para Api
│   │   ├── Dockerfile.worker          # Multi-stage para Worker
│   │   ├── Dockerfile.storefront      # Multi-stage para Next.js
│   │   ├── Dockerfile.admin           # Multi-stage para Vite + Node
│   │   ├── docker-compose.dev.yml     # Local development stack
│   │   └── .dockerignore
│   └── README.md (instrucciones de deploy)
│
├── docs/
│   ├── adr/                           # Architecture Decision Records
│   │   ├── 0001-dotnet-monolith.md    # Por qué .NET y monolito
│   │   ├── 0002-next-vs-vite.md       # Por qué Next + Vite
│   │   ├── 0003-postgres-rls.md       # Por qué RLS para multi-tenancy
│   │   ├── 0004-cqrs-pattern.md
│   │   ├── 0005-outbox-inbox.md
│   │   ├── 0006-mercado-pago.md
│   │   ├── 0007-saga-checkout.md
│   │   └── README.md (template para nuevos ADRs)
│   ├── api/
│   │   ├── openapi.yaml               # OpenAPI spec (compilado desde código)
│   │   ├── endpoints.md
│   │   └── webhooks.md
│   ├── database/
│   │   ├── schema.md
│   │   ├── indexes.md
│   │   ├── multi-tenancy.md
│   │   └── migrations.md
│   ├── deployment/
│   │   ├── local-setup.md
│   │   ├── environments.md
│   │   ├── ci-cd.md
│   │   └── monitoring.md
│   ├── guides/
│   │   ├── adding-a-module.md
│   │   ├── adding-a-feature.md
│   │   ├── debugging.md
│   │   └── performance.md
│   └── onboarding.md
│
├── .github/
│   └── workflows/
│       ├── backend-ci.yml             # .NET build, test, lint, scan
│       ├── storefront-ci.yml          # Next.js build, test, lint, audit
│       ├── admin-ci.yml               # Vite build, test, lint, audit
│       ├── migrations-validate.yml    # Test migrations on staging db
│       ├── deploy-staging.yml         # Auto-deploy to staging
│       └── deploy-prod.yml            # Manual approval, deploy to prod
│
├── .gitignore
├── .editorconfig
├── ARCHITECTURE.md                    # Este archivo
├── README.md                          # Setup rápido del proyecto
└── LICENSE
```

## Conexiones Inter-Módulos

### Backend → Storefront

- Storefront llama a `/api/v1` del backend
- Endpoints públicos: `GET /api/v1/tenants/{id}/products`, `GET /api/v1/tenants/{id}/products/{slug}`, `POST /api/v1/tenants/{id}/checkout`
- Autenticación: JWT en Authorization header
- Rate limiting: por IP (Cloudflare) + por user_id (Redis)

### Backend → Admin

- Admin llama a `/api/v1` del backend (igual API, autenticación diferente: sesión + CSRF)
- Endpoints privados: `POST /api/v1/admin/products`, `GET /api/v1/admin/orders`, `PATCH /api/v1/admin/settings`
- Autenticación: sesión HTTP-only cookie + CSRF token en form
- Permisos: granulares por usuario (productos:leer, órdenes:reembolsar, etc)

### Backend → Base de Datos

- Todas las escritas con `SET LOCAL app.tenant_id` dentro de transacción
- RLS policies filtran automáticamente por tenant
- EF Core global query filters como segunda línea de defensa

### Backend → Message Queue (RabbitMQ)

- Outbox pattern: después de cada escritura, tabla `OutboxEvent` guarda evento + timestamp
- Worker Host consume Outbox cada N segundos, publica a RabbitMQ, marca como published
- Si RabbitMQ falla, reintentos exponenciales hasta que se cumpla delivery

### Backend → Redis

- Cache: productos catalogados (TTL 1h), sesiones de checkout (TTL 30m), rate limits
- Reservas de stock: SETEX con TTL (checkout expira, reserva se suelta)
- Sessions: almacenar datos de sesión de usuario si lo necesitamos

### Storefront → Redis (vía backend)

- Cart: vive en localStorage del navegador + API del backend que lo persiste en Redis por user_id
- Checkout session: guarda en Redis con idempotency key

### Admin → Storefront

- No hay comunicación directa
- Admin cambia temas/secciones → almacena en DB → Storefront relée via ISR/revalidation
- Admin edita productos → webhook al storefront para revalidar caches

### Integración Externa: Mercado Pago

- Backend inicia pago → llama a MP API → devuelve URL de MPago
- Storefront redirige comprador a MP
- MP redirige de vuelta a storefront con status
- MP envía webhook al backend `/api/v1/webhooks/payments` (Inbox pattern para deduplicación)
- Backend actualiza estado de pago en DB y publica evento
- Worker consume evento → envía confirmación al comprador vía email

## Despliegue

### Local (docker-compose.dev.yml)

```
docker-compose -f infra/docker/docker-compose.dev.yml up
- PostgreSQL en 5432
- Redis en 6379
- RabbitMQ en 5672 + 15672 (management)
- API en 5000
- Worker en 5001
- Storefront en 3000
- Admin en 3001
```

### Staging

- Terraform provisiona infraestructura en Cloud Run / ECS Fargate
- CI/CD pushea imagen a container registry
- Deployment automático desde main
- Storefront en `https://staging.platform.com`
- Admin en `https://admin-staging.platform.com`

### Producción

- Mismo flujo, con approvals manuales
- Canary deployment: 10% tráfico → 50% → 100%
- Feature flags para cambios arriesgados
- Multi-región ready (replica pasiva en otra región)

## Observabilidad

Todos los hosts (Api, Worker, Storefront, Admin) emiten:

- Traces: OpenTelemetry → Grafana Tempo
- Métricas: Prometheus → Grafana
- Logs: Structurados (Serilog) → Grafana Loki, correlacionados por trace_id

Dashboards:

- API latency + throughput + error rates
- Checkout funnel (% por etapa)
- Worker queue depth + job duration
- DB connection pool saturation
- Cache hit rates
- Webhook delivery success rate
