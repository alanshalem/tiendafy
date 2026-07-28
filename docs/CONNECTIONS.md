# Tiendafy - Mapa de Conexiones

Topología de cómo se comunican los componentes del sistema.

## Visión de Arriba (High Level)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSERS / CLIENTES                          │
│  (Shoppers)                          (Merchants)                      │
└────────────┬──────────────────────────────────┬──────────────────────┘
             │                                  │
      (HTTPS)│                            (HTTPS)│
             │                                  │
    ┌────────▼──────────┐          ┌────────────▼──────────────┐
    │   Storefront      │          │   Admin Dashboard        │
    │  (Next.js SSR)    │          │  (React + Vite SPA)      │
    │  3 domains:       │          │  admin.platform.com      │
    │  *.platform.com   │          │                          │
    └────────┬──────────┘          └────────────┬──────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │ (HTTP REST API)
                    ┌───────▼────────────┐
                    │  API Host (.NET)   │
                    │  Port 5000         │
                    │  /api/v1/*         │
                    └───────┬────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐         ┌───▼─────┐        ┌───▼────┐
    │   DB   │         │  Redis  │        │RabbitMQ│
    │Postgres│         │ Cache   │        │Messages│
    │ 5432   │         │ 6379    │        │ 5672   │
    └────────┘         └─────────┘        └────┬───┘
                                               │
                                        ┌──────▼───────┐
                                        │ Worker Host  │
                                        │ Port 5001    │
                                        │ Background   │
                                        │ Jobs         │
                                        └──────────────┘
```

## Detalle: API ↔ Base de Datos

```
Api Request (Middleware)
    ↓
TenancyMiddleware
├─ Resuelve tenant por Host header
├─ context.Items["TenantId"] = resolved_tenant_id
└─ Continúa
    ↓
Handler/Endpoint
├─ Inyecta DbContext
├─ Abre transacción
├─ SET LOCAL app.tenant_id = <tenantId>
└─ Ejecuta query
    ↓
PostgreSQL (Motor)
├─ RLS policy filtra rows: WHERE tenant_id = CURRENT_SETTING('app.tenant_id')
├─ Devuelve rows filtradas
└─ Transacción se completa
    ↓
EF Core Global Filter (segunda línea)
└─ HasQueryFilter(x => x.TenantId == _tenantContext.TenantId)
    ↓
Response
```

## Detalle: Messaging (Outbox → RabbitMQ → Worker)

```
Handler crea aggregate
    ↓
aggregate.RaiseDomainEvent(new OrderCreatedEvent(...))
    ↓
SaveChangesAsync() en DbContext
├─ Interceptor: RelationalEventStore
│  ├─ Extrae domain events del aggregate
│  ├─ Inserta en table: OutboxEvent (id, event_json, created_at, published = false)
│  └─ Commit atómico con aggregate change
    ↓
Worker Service (polling loop)
├─ SELECT * FROM OutboxEvent WHERE published = false ORDER BY created_at
├─ Para cada evento:
│  ├─ Publica a RabbitMQ (exchange: tiendafy.events)
│  ├─ UPDATE OutboxEvent SET published = true
│  └─ Si RabbitMQ falla: retry exponencial
    ↓
RabbitMQ Router
├─ Exchange: tiendafy.events (topic)
├─ Routing key: orders.created
├─ Queues: 
│  ├─ webhooks.queue (Webhooks consumer)
│  ├─ analytics.queue (Analytics consumer)
│  └─ notifications.queue (Email consumer)
    ↓
Worker Consumers
├─ Webhooks consumer dispara HTTP a merchant webhooks
├─ Analytics consumer registra en warehouse
└─ Notifications consumer envía email de confirmación
```

## Detalle: Checkout → Pagos → Almacén

```
Storefront: Shopper da click en "Pagar"
    ↓
POST /api/v1/checkout/payment-intent
    ↓
CheckoutHandler
├─ CarritoValidator (items, stock, precios)
│  └─ Inyecta ICatalogService (Catalog.Contracts)
│      └─ Llama a Catalog.GetProductsAsync()
├─ InventoryService.ReserveStockAsync() (optimistic lock)
│  ├─ UPDATE inventory SET available = available - @qty WHERE variant_id = @id AND available >= @qty
│  ├─ Si afecta 0 filas → StockUnavailableException
│  └─ Crea Reservation con TTL 30min (en Redis)
├─ PaymentGatewayAdapter.InitiatePaymentAsync()
│  ├─ Llama a MercadoPago API
│  └─ Devuelve preference_id + init_point URL
└─ Devuelve al cliente URL de MP
    ↓
Storefront redirige shopper a MP (checkout/cart → MP website)
    ↓
Shopper completa pago en MP
    ↓
MP redirige a Storefront (confirmation page con status)
    ↓
Storefront: WebhookListener en background verifica status con MP
    ↓
MP: Envía webhook al backend
    POST /api/v1/webhooks/payments/mercado-pago
    │ signature en header (HMAC)
    ↓
PaymentWebhookHandler (Inbox pattern)
├─ Valida HMAC
├─ INSERT INTO Inbox (event_id, payload, processed = false) — deduplicación
├─ SELECT from Inbox WHERE event_id = <new> AND NOT processed
├─ Payment aggregate transiciona: PENDING → APPROVED
├─ Domain event: PaymentApprovedEvent emitido
├─ RaiseDomainEvent → Outbox → RabbitMQ
└─ Worker consume PaymentApprovedEvent
    ↓
Worker: OrderHandler
├─ Order aggregate transiciona: PENDING → CONFIRMED
├─ Inventory: ConfirmReservationAsync() (mueve de reserved a sold)
├─ Domain event: OrderConfirmedEvent emitido
└─ Notificaciones consume: envía email al cliente + merchant
```

## Detalle: Storefront ↔ Datos de Tema

```
Browser: GET *.platform.com
    ↓
Next.js Middleware (app/api/middleware.ts)
├─ Extrae tenant por Host header
├─ Resuelve tenant_id desde Redis (cache)
└─ Agrega a request headers: X-Tenant-Id
    ↓
getStaticProps() o getServerSideProps()
├─ Llama a Backend API: GET /api/v1/tenants/<id>/theme
│  └─ Devuelve tema: { sections: [...], tokens: {...} }
├─ Llama a Backend API: GET /api/v1/tenants/<id>/products?limit=20
│  └─ Devuelve catálogo: [{ id, name, price, image, variants: [...] }]
└─ Pasa props a component
    ↓
React: Renderiza dinamicamente secciones
├─ HeroSection: <HeroSection config={theme.sections[0]} />
├─ ProductGrid: <ProductGrid products={products} />
└─ (design tokens via CSS custom properties)
    ↓
ISR Revalidation:
├─ Home: revalidate = 3600 (1h)
├─ Product detail: revalidate = 60 (1min) + on-demand via revalidateTag()
└─ Admin: PATCH /theme → POST /api/v1/admin/revalidate-storefront
   └─ Storefront consume revalidation event y recompila ISR
```

## Detalle: Admin ↔ Backend

```
Browser: GET admin.platform.com
    ↓
Vite Dev Server (localhost:3001) / Nginx en prod
    ↓
index.html → main.tsx (entry point)
    ↓
React Router
├─ <ProtectedRoute> check
├─ useAuth() hook: verifica sesión + token
└─ Devuelve Dashboard
    ↓
Dashboard Component
├─ useApi() hook: GET /api/v1/admin/dashboard/metrics
├─ React Query: @tanstack/react-query
│  ├─ Caching local
│  ├─ Polling cada 30s
│  └─ Optimistic updates para mutations
└─ Renderiza charts + stats
    ↓
Merchant hace click: "Crear producto"
    ↓
ProductForm (component)
├─ Validación local: React Hook Form + Zod
├─ POST /api/v1/admin/products { name, price, variants, ... }
├─ Backend CreateProductCommand handler
├─ Product aggregate creado + ProductCreatedEvent
├─ Response: { id, name, created_at }
└─ Optimistic update local + React Query invalidate cache
    ↓
useApi() refetch automático
└─ Dashboard muestra producto nuevo
```

## Detalle: Admin ↔ Editor de Temas

```
Merchant: "Editar tema"
    ↓
GET /api/v1/admin/themes/<id>
├─ Devuelve tema: { sections: [{ type: 'hero', settings: {...} }], tokens: {...} }
└─ Admin renderiza Theme Editor (Drag & Drop builder)
    ↓
Admin arrastra una sección Hero al canvas
    ↓
ThemeBuilder: actualiza state local
├─ Reorder sections array
└─ Preview en tiempo real
    ↓
Admin hace click "Publicar tema"
    ↓
PATCH /api/v1/admin/themes/<id> { sections: [...], tokens: {...} }
    ↓
Backend:
├─ UpdateThemeCommand
├─ Theme aggregate: transiciona a PUBLISHED
├─ ThemePublishedEvent emitido → Outbox
└─ Worker consume: invalida caches de storefront
    ↓
Storefront (ISR):
├─ Recibe webhook de invalidación
├─ Revalida /  (home)
├─ CDN purga cache de Cloudflare
└─ Next request a / devuelve tema nuevo
```

## Detalle: Sincronización de Componentes

```
shared/ui/Button.tsx
├─ Usado por: Storefront + Admin
├─ Props: size, variant, disabled, loading
├─ Tailwind classes: mismo tw.config.ts
└─ Monorepo: ambos consumen desde ../../shared/ui

shared/types/api.ts
├─ Type definitions compiladas desde OpenAPI
├─ Usado por: Storefront + Admin
├─ Script en CI: compile OpenAPI → types.ts
└─ Auto-sync: evita desync de tipos

shared/styles/tailwind.config.ts
├─ Design tokens centralizados
├─ CSS variables: --color-primary, --spacing-4, etc.
└─ Ambas apps consumen el mismo config
```

## Detalle: CI/CD Pipeline

```
Developer: git push origin feature-branch
    ↓
GitHub: Crea PR (pull request)
    ↓
CI/CD Workflows (.github/workflows/)
├─ backend-ci.yml
│  ├─ dotnet build
│  ├─ dotnet test (unit + integration)
│  ├─ Architecture tests (dependency rules)
│  ├─ Docker build + push
│  └─ Migrations validate (dry-run)
├─ storefront-ci.yml
│  ├─ npm ci && npm run build
│  ├─ npm test
│  ├─ npm run lint
│  ├─ Lighthouse audit
│  └─ Docker build + push
└─ admin-ci.yml
   ├─ npm ci && npm run build
   ├─ npm test
   ├─ npm run lint
   └─ Docker build + push
    ↓
Todos pasan:
├─ Status check ✓
├─ PR aprobado
└─ Merge a main
    ↓
Merge trigger: deploy-staging.yml
├─ Pull imágenes de container registry
├─ Deploy a staging: Cloud Run / Fargate
├─ Health checks
└─ Smoke tests
    ↓
Staging OK: Ready para producción
    ↓
Manual trigger: deploy-prod.yml
├─ Requiere approval en Slack/GitHub
├─ Canary deploy: 10% tráfico
├─ Monitor SLOs por 5min
├─ Si OK: 50% → 100%
└─ Si error: rollback automático
```

## Observabilidad: Trace End-to-End

```
Browser: fetch POST /api/v1/checkout/payment-intent
    ↓
Storefront inserta header: traceparent: 00-<trace_id>-<span_id>-01
    ↓
API: OpenTelemetry intercepta
├─ Extrae trace_id
├─ Abre span: "POST /api/v1/checkout/payment-intent"
├─ Agrega atributos: tenant_id, user_id, method, path
└─ Propaga trace_id a databases + RabbitMQ
    ↓
CheckoutHandler
├─ Span: "ReserveStock"
├─ Span: "InitiatePayment" (con llamada a MP API)
└─ Domain events → Outbox
    ↓
Worker
├─ Consume OutboxEvent (hereda trace_id)
├─ Span: "PublishToRabbitMQ"
└─ Propaga a consumers
    ↓
Grafana Tempo
├─ Recibe traces de API, Worker, Notifications
├─ Correlaciona todo por trace_id
├─ User puede ver flujo completo: POST → DB → RabbitMQ → Email
└─ Latency: 850ms (API 120ms + DB 30ms + MP API 450ms + RabbitMQ 250ms)
    ↓
Error: NotificationService timeout
├─ Trace muestra: Notifications.SendEmailAsync() tardó 12s
├─ Alert dispara: "Email service slow"
└─ Sentry captura exception
```

## Mapa de Puertos

| Servicio | Puerto | Host | Público |
|----------|--------|------|---------|
| Storefront | 3000 | localhost | Sí |
| Admin | 3001 | localhost | Sí |
| API | 5000 | localhost | Sí |
| Worker | 5001 | localhost | No |
| PostgreSQL | 5432 | localhost | No (dev only) |
| PgBouncer | 6432 | localhost | No |
| Redis | 6379 | localhost | No |
| RabbitMQ API | 5672 | localhost | No |
| RabbitMQ UI | 15672 | localhost | No |
| Grafana | 3000 | localhost | No (en prod) |

## Reglas de Comunicación

1. **Storefront → Backend**: REST API + OAuth (short JWT)
2. **Admin → Backend**: REST API + Session (httpOnly cookie)
3. **Backend → Database**: EF Core + RLS + transacciones
4. **Backend → Cache**: StackExchange.Redis (cache + reservas)
5. **Backend → Queue**: RabbitMQ (publisher)
6. **Worker ← Queue**: RabbitMQ (consumer)
7. **Backend ↔ External**: Timeout 5s, retry exponencial, circuit breaker
8. **Cruzar módulos**: Solo vía Contracts (interfaces públicas)
9. **Eventos**: Sempre vía Outbox pattern (no direct RabbitMQ en handler)
