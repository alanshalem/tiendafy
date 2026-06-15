# 🚀 Tiendafy - START HERE

Estructura arquitectónica de Tiendafy. Todo planeado, cero código. 

## En 2 Minutos

- **Qué es**: SaaS e-commerce para merchants LATAM
- **Stack**: .NET (backend) + Next.js (storefront) + React+Vite (admin)
- **Multi-tenant**: Shared DB + PostgreSQL RLS
- **State**: Estructura 100% definida, listo para codificar

## Archivos Clave

Lee en este orden:

### 1. **[README.md](./README.md)** — Intro + Quick Start
- Setup local con Docker Compose
- Primeros pasos para testar algo corriendo
- URLs de cada servicio

### 2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Plano Completo
- Topología de carpetas (backend modular, storefront, admin)
- Estructura de módulos (.Contracts / .Core / .Infrastructure)
- Database schema skeleton
- CI/CD, observabilidad, deployment

### 3. **[CONNECTIONS.md](./CONNECTIONS.md)** — Cómo Se Comunican
- Flujos de datos (browser → storefront → API → DB)
- Messaging pattern (Outbox → RabbitMQ → Worker)
- Ejemplo completo: checkout → pago → confirmación
- Trace de observabilidad end-to-end

### 4. **[docs/adr/](./docs/adr/)** — Por Qué Cada Decisión
- 0001: .NET monolito vs Node/microservicios
- 0002: Next.js (storefront) + Vite (admin) separados
- 0003: PostgreSQL RLS para multi-tenancy
- Template para futuros ADRs

### 5. **[docs/guides/](./docs/guides/)** — Cómo Construir
- [adding-a-feature.md](./docs/guides/adding-a-feature.md) — Paso a paso feature (command/query/handler/endpoint)
- [adding-a-module.md](./docs/guides/adding-a-module.md) — Paso a paso módulo (estructura completa)
- coming: debugging, performance, deployment

### 6. **[IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)** — Qué Falta Hacer
- Fase 1: MVP (tenancy + catalog + checkout)
- Fase 2-4: Escala, observabilidad, optimización
- Cada item es 1-3 días de trabajo

## Navegación por Rol

### Soy Desarrollador Backend 👨‍💻
1. [ARCHITECTURE.md](./ARCHITECTURE.md) → "Backend → src/Modules"
2. [docs/adr/0001-dotnet-monolith.md](./docs/adr/0001-dotnet-monolith.md) → "Por qué .NET"
3. [docs/guides/adding-a-feature.md](./docs/guides/adding-a-feature.md) → "Crear un feature"
4. [docs/guides/adding-a-module.md](./docs/guides/adding-a-module.md) → "Crear un módulo"
5. [docs/database/](./docs/database/) (próximamente)
6. [CONNECTIONS.md](./CONNECTIONS.md) → "Detalle: API ↔ Base de Datos"

### Soy Desarrollador Frontend 👩‍💼
1. [ARCHITECTURE.md](./ARCHITECTURE.md) → "Storefront / Admin"
2. [docs/adr/0002-next-and-vite.md](./docs/adr/0002-next-and-vite.md) → "Por qué dos apps"
3. Storefront: [CONNECTIONS.md](./CONNECTIONS.md) → "Detalle: Storefront ↔ Backend"
4. Admin: [CONNECTIONS.md](./CONNECTIONS.md) → "Detalle: Admin ↔ Backend"
5. [README.md](./README.md) → "Quick Start" → `pnpm dev` en ambos

### Soy Devops / SRE 🛠️
1. [infra/](./infra/) → Terraform + Docker
2. [ARCHITECTURE.md](./ARCHITECTURE.md) → "Deployment" section
3. [CONNECTIONS.md](./CONNECTIONS.md) → "CI/CD Pipeline"
4. [docs/deployment/](./docs/deployment/) (próximamente)
5. Monitoring: [CONNECTIONS.md](./CONNECTIONS.md) → "Observabilidad: Trace End-to-End"

### Soy Product Owner / Tech Lead 📊
1. [ARCHITECTURE.md](./ARCHITECTURE.md) → Visión de arriba
2. [CONNECTIONS.md](./CONNECTIONS.md) → "Visión de Arriba (High Level)"
3. [docs/adr/](./docs/adr/) → Entiende por qué cada decisión
4. [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) → Timeline de MVPs
5. [CONNECTIONS.md](./CONNECTIONS.md) → Casos de uso (checkout → pagos → pedidos)

## Decisiones Ya Tomadas

✅ **Backend**: .NET 10 LTS, monolito modular, ASP.NET Core
✅ **Database**: PostgreSQL + RLS + shared schema
✅ **Frontend**: Next.js (storefront, SSR) + React+Vite (admin, SPA)
✅ **Messaging**: RabbitMQ + Outbox pattern
✅ **Cache**: Redis
✅ **Payments**: Mercado Pago (marketplace model)
✅ **Deployment**: Docker + Terraform + GitHub Actions
✅ **Observabilidad**: OpenTelemetry + Grafana
✅ **Multi-tenancy**: Compartido schema con RLS (no DB-per-tenant, no schema-per-tenant)

Cada decisión tiene un ADR explicando alternativas + trade-offs.

## Preguntas Frecuentes

**P: ¿Por qué .NET en lugar de Node?**
A: [docs/adr/0001-dotnet-monolith.md](./docs/adr/0001-dotnet-monolith.md) — TL;DR: tipado fuerte, performance, LTS estable.

**P: ¿Por qué compartir schema de DB?**
A: [docs/adr/0003-postgres-rls.md](./docs/adr/0003-postgres-rls.md) — TL;DR: migraciones 100k veces vs 1, RLS protege a nivel motor.

**P: ¿Por qué Next.js + Vite, no un solo frontend?**
A: [docs/adr/0002-next-and-vite.md](./docs/adr/0002-next-and-vite.md) — TL;DR: perfiles distintos (SEO vs SPA), deployables independientes, seguridad.

**P: ¿Cuándo migro a microservicios?**
A: [docs/adr/0001-dotnet-monolith.md](./docs/adr/0001-dotnet-monolith.md#migration-path) — A 10k+ clientes, si el perfil de carga lo justifica.

**P: ¿Cuándo necesito Kubernetes?**
A: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md#fase-4-escalabilidad-4-6-semanas) — A 100+ tiendas en staging. En MVP, contenedores administrados bastan.

**P: ¿Cómo evito data leaks entre tenants?**
A: [docs/adr/0003-postgres-rls.md](./docs/adr/0003-postgres-rls.md#implementation) — RLS en motor + global query filters en código + tests de aislamiento.

**P: ¿Dónde empiezo a codificar?**
A: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) (Fase 0-1) → Pick Tenancy → [docs/guides/adding-a-module.md](./docs/guides/adding-a-module.md) → Code.

## Estructura de Carpetas (30-segundo summary)

```
tiendafy/
├── backend/                  ← .NET monolito modular
│   ├── src/
│   │   ├── Api/              ← HTTP host (port 5000)
│   │   ├── Worker/           ← Background jobs (port 5001)
│   │   ├── SharedKernel/     ← Tipos base compartidos
│   │   └── Modules/          ← Tenancy, Identity, Catalog, Inventory, Orders, Checkout, Payments, Billing, Themes, Notifications
│   │       ├── {Module}.Contracts/     ← Interfaz pública
│   │       ├── {Module}.Core/          ← Dominio + features
│   │       └── {Module}.Infrastructure/ ← Persistencia
│   └── tests/                ← Unit, integration, architecture
├── storefront/               ← Next.js (port 3000)
│   └── src/
│       ├── app/              ← Pages (SSR + ISR)
│       ├── components/       ← React components
│       ├── lib/              ← API client, auth, cart
│       ├── types/            ← TS types
│       └── styles/           ← Tailwind + CSS
├── admin/                    ← React + Vite (port 3001)
│   └── src/
│       ├── pages/            ← Routes
│       ├── components/       ← React components
│       ├── lib/              ← API client, React Query
│       ├── types/            ← TS types
│       └── styles/           ← Tailwind + CSS
├── infra/                    ← Infrastructure as Code
│   ├── docker/               ← Docker Compose, Dockerfiles
│   └── terraform/            ← Terraform modules (network, DB, compute, etc)
├── docs/
│   ├── adr/                  ← Architecture Decision Records
│   ├── guides/               ← How-tos (adding features, modules, debugging)
│   ├── database/             ← Schema, indexes, migrations (próx)
│   ├── api/                  ← OpenAPI spec, webhooks (próx)
│   └── deployment/           ← CI/CD, monitoring, SLOs (próx)
├── .github/workflows/        ← CI/CD pipelines
├── ARCHITECTURE.md           ← This is it (full blueprint)
├── CONNECTIONS.md            ← How data flows
├── IMPLEMENTATION_CHECKLIST.md ← What to build
├── README.md                 ← Quick start
└── START_HERE.md             ← You are here
```

## Próximos Pasos

### Hoy
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) (30 min)
2. Understand [CONNECTIONS.md](./CONNECTIONS.md) (20 min)
3. Skim relevant ADRs (15 min)

### Esta Semana
1. Setup Docker Compose: `docker-compose -f infra/docker/docker-compose.dev.yml up`
2. Create Tenancy module skeleton (backend)
3. Setup Storefront + Admin projects with Tailwind
4. First commit: Estructura sin código de negocio

### Próximas Semanas
1. Implement Tenancy module (persona de arquitectura)
2. Implement Catalog module (features de lectura)
3. Implement Checkout module (lógica transaccional)
4. Integrate Mercado Pago (pagos)
5. Storefront UI (SSR + ISR templates)
6. Admin dashboard (CRUD básico)

## Soporte

- **Questions on architecture?** → Check docs/adr/ o CONNECTIONS.md
- **How to add X?** → docs/guides/adding-a-{feature|module}.md
- **Database question?** → docs/database/ (próx)
- **Deployment question?** → docs/deployment/ (próx)

---

**Ready?** Start with [README.md](./README.md) para setup local.
