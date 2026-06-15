# Tiendafy - E-commerce Platform SaaS

Plataforma SaaS para merchants LATAM. Monolito modular .NET + Next.js + Vite.

## Stack Técnico

- **Backend**: C# / .NET 10 LTS, ASP.NET Core, EF Core, Hangfire
- **Storefront**: Next.js 14 (SSR + ISR), React 19, Tailwind
- **Admin**: React 19 + Vite, TypeScript, React Query
- **Database**: PostgreSQL 15+ con RLS, PgBouncer
- **Cache/Queues**: Redis, RabbitMQ
- **Infrastructure**: Docker, Terraform, CloudFlare for SaaS

## Quick Start - Local Development

### Setup automático (recomendado)

```powershell
# Windows
.\setup.ps1
```

```bash
# Linux / macOS / WSL
chmod +x setup.sh && ./setup.sh
```

El script verifica prerequisitos, levanta la infraestructura Docker, instala
dependencias del workspace, compila el backend y corre los tests. Flags:
`-SkipDocker` / `--skip-docker`, `-SkipTests` / `--skip-tests`.

### Requisitos
- Docker + Docker Compose
- .NET 10 SDK
- Node.js 22+, pnpm (el script lo instala vía corepack si falta)

### Setup manual

```bash
# Infraestructura (Postgres, PgBouncer, Redis, RabbitMQ, MinIO)
docker compose -f infra/docker/docker-compose.dev.yml up -d --wait

# Workspace frontend
pnpm install

# Backend
dotnet build backend/backend.slnx
dotnet test backend/backend.slnx

# API (puerto 5080 — el 5000 lo ocupa Docker Desktop en Windows):
dotnet run --project backend/src/Api        # → http://localhost:5080

# Cuando estén scaffoldeados (ver IMPLEMENTATION_CHECKLIST.md):
# dotnet run --project backend/src/Worker   → http://localhost:5081
# cd storefront && pnpm dev                 → http://localhost:3000
# cd admin && pnpm dev                      → http://localhost:3001
```

**URLs**:
- API: http://localhost:5080 — `/health`, `/api/v1/tenants`
- Storefront: http://localhost:3000 (pendiente de scaffold; tiendas en `*.localhost:3000`)
- Admin: http://localhost:3001 (pendiente de scaffold)
- Postgres: localhost:5432 (user: tiendafy, pass: tiendafy) | PgBouncer: localhost:6432
- Redis: localhost:6379
- RabbitMQ UI: http://localhost:15672 (guest/guest)
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

### Primeros Pasos

1. **Crear un tenant** (vía API):
```bash
curl -X POST http://localhost:5000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name": "Mi Tienda", "domain": "mitshop"}'
```

2. **Acceder al storefront**:
```
http://mitshop.localhost:3000
```

3. **Acceder al admin** (requiere login):
```
http://localhost:3001
```

## Estructura del Proyecto

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para:
- Topología completa de carpetas
- Conexiones entre módulos
- Flujos de datos
- Patrones arquitectónicos

## Documentación

- [ADRs](./docs/adr) - Decisiones arquitectónicas
- [Database](./docs/database) - Schema, índices, multi-tenancy
- [API](./docs/api) - OpenAPI spec, webhooks, rate limiting
- [Deployment](./docs/deployment) - Envs, CI/CD, monitoring
- [Guides](./docs/guides) - Cómo agregar features, debugging

## Desarrollo

### Agregar un Feature

Ver [docs/guides/adding-a-feature.md](./docs/guides/adding-a-feature.md)

En resumen:
1. Identificar módulo afectado
2. Crear command/query en `Features/YourFeature/`
3. Implementar handler
4. Exponer endpoint en host (Api/Worker)
5. Tests
6. Actualizar OpenAPI spec

### Agregar un Módulo

Ver [docs/guides/adding-a-module.md](./docs/guides/adding-a-module.md)

Módulos nuevos usan estructura modular:
- `{Module}.Contracts/` - Interfaces públicas, eventos, DTOs
- `{Module}.Core/` - Dominio + features
- `{Module}.Infrastructure/` - Persistencia, integraciones

### Tests

```bash
cd backend

# Unit tests
dotnet test tests/Unit

# Integration tests (requiere DB local)
dotnet test tests/Integration

# Architecture tests
dotnet test tests/Architecture
```

### Migraciones

```bash
cd backend

# Crear migración
dotnet ef migrations add MigrationName --project src/Api

# Aplicar
dotnet ef database update --project src/Api

# Revertir última
dotnet ef database update -1 --project src/Api
```

Ver [docs/database/migrations.md](./docs/database/migrations.md) para expand/contract pattern.

## Deployment

### Staging
```bash
git push origin main
# GitHub Actions despliega automáticamente a staging
# Admin: https://admin-staging.platform.com
# Storefront: https://staging.platform.com
```

### Producción
```bash
# Crear release
git tag v1.2.3
git push origin v1.2.3

# O hacer merge a release branch
git checkout release
git merge main
git push origin release
# GitHub Actions despliega a prod con approvals manuales
```

Ver [docs/deployment/ci-cd.md](./docs/deployment/ci-cd.md)

## Monitoreo

Acceder a dashboards en:
- **Grafana**: http://grafana.internal:3000
- **Sentry**: https://sentry.io
- **RabbitMQ**: http://localhost:15672

Ver [docs/deployment/monitoring.md](./docs/deployment/monitoring.md)

## Troubleshooting

### Postgres connection refused
```bash
docker ps | grep postgres
docker logs <container_id>
```

### RabbitMQ queue backed up
```bash
# Ver management UI
http://localhost:15672/
# Purge queue si es necesario
```

### Migraciones fallaron
```bash
# Ver historial
psql -h localhost -U tiendafy -d tiendafy \
  -c "SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId DESC LIMIT 5;"

# Revertir a estado anterior
dotnet ef database update <previous_migration> --project src/Api
```

## Contributing

1. Crear rama desde `main`
2. Commits pequeños, descriptivos
3. Abrir PR contra `main`
4. Code review + CI verde
5. Merge y auto-deploy a staging

## Licencia

[Tu licencia aquí]

## Contacto

- Slack: #development
- Email: dev@tiendafy.com
