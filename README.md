# Tiendafy

Plataforma SaaS de e-commerce multi-tenant para merchants de Argentina/LATAM
(estilo Tiendanube): cada comercio tiene su tienda online, checkout con
Mercado Pago, panel de administración y facturación electrónica ARCA.

## Stack

- **Backend**: .NET 10 — monolito modular (ASP.NET Core minimal APIs, EF Core, PostgreSQL)
- **Storefront**: Next.js 15 (SSR multi-tenant por subdominio/dominio propio), React 19, Tailwind
- **Admin**: React 19 + Vite (SPA), TypeScript, React Query
- **Infra dev**: Docker (Postgres, PgBouncer, Redis, RabbitMQ, MinIO)
- **Prod**: Docker Compose + Caddy (TLS automático) — ver [docs/DEPLOY.md](./docs/DEPLOY.md)

## Quick start (desarrollo)

```powershell
# Primera vez: verifica prerequisitos, levanta infra, instala deps, compila y testea.
.\setup.ps1          # Linux/macOS: ./setup.sh

# Día a día: levanta TODO (infra + API + storefront + admin) con hot-reload.
.\dev-up.ps1         # apagar: .\dev-down.ps1
# Full-docker (demo/smoke): .\dev-up.ps1 -Docker
```

Requisitos: Docker, .NET 10 SDK, Node 22+ (pnpm llega vía corepack).

**URLs locales**:

| Qué | URL |
|---|---|
| API | http://localhost:5080 (`/health`) |
| Admin (panel del merchant) | http://localhost:3001 |
| Storefront (tiendas) | http://`<subdominio>`.localhost:3000 |
| Postgres / PgBouncer | localhost:5432 / 6432 (tiendafy/tiendafy) |
| RabbitMQ UI / MinIO Console | localhost:15672 / localhost:9001 |

**Primeros pasos**: abrí el admin (http://localhost:3001), registrate, creá una
tienda y entrá a su storefront en `http://<subdominio>.localhost:3000`.
Usuarios de prueba: [docs/usuarios-de-prueba.md](./docs/usuarios-de-prueba.md).

## Comandos frecuentes

```bash
# Backend
dotnet build backend/backend.slnx
dotnet test  backend/backend.slnx

# Frontends
pnpm --filter ./admin dev          # o: type-check / build
pnpm --filter ./storefront dev

# Migraciones EF (ejemplo con el módulo Themes; cada módulo tiene su DbContext)
cd backend
dotnet ef migrations add MiCambio --project src/Modules/Themes/Themes.Infrastructure --startup-project src/Api --context ThemesDbContext
dotnet ef database update          --project src/Modules/Themes/Themes.Infrastructure --startup-project src/Api --context ThemesDbContext
```

## Documentación

- **API navegable** (con la API corriendo, solo en dev): [http://localhost:5080/scalar/v1](http://localhost:5080/scalar/v1) — UI Scalar con las 130+ rutas agrupadas por módulo. Spec cruda: `/openapi/v1.json`.
- [docs/ARQUITECTURA-VISUAL.md](./docs/ARQUITECTURA-VISUAL.md) — **diagramas Mermaid de TODO el sistema**: piezas, integraciones (Mercado Pago, Resend, WhatsApp, ARCA…) y el flujo de una venta
- [docs/START_HERE.md](./docs/START_HERE.md) — mapa de toda la documentación
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — arquitectura y topología
- [docs/CONNECTIONS.md](./docs/CONNECTIONS.md) — cómo se comunican las piezas
- [docs/DEPLOY.md](./docs/DEPLOY.md) — build de imágenes y producción
- [docs/adr/](./docs/adr) — decisiones arquitectónicas
- [docs/guides/](./docs/guides) — agregar un feature / un módulo

## Estructura

```
backend/     API .NET (src/Api) + módulos (src/Modules/{Tenancy,Catalog,Orders,Payments,Fiscal,...})
storefront/  Next.js multi-tenant (la tienda que ve el comprador)
admin/       SPA del panel del merchant
shared/      Paquetes pnpm compartidos (types, ui, design-system)
infra/       Docker compose (dev/app/prod), Caddy, nginx
docs/        Documentación
```
