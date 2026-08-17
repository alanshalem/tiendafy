# Tiendafy

Plataforma SaaS de e-commerce multi-tenant para merchants de Argentina/LATAM
(estilo Tiendanube): cada comercio tiene su tienda online con dominio propio,
checkout con Mercado Pago, panel de administración completo, facturación
electrónica ARCA y envíos cotizados en vivo con Correo Argentino.

## Qué hace

| Área | Qué incluye |
|---|---|
| **Tienda online** | Storefront SSR multi-tenant (subdominio o dominio propio), editor de diseño visual con preview en vivo (draft/publicado, undo/redo), 15+ tipos de sección, SEO completo (sitemap/robots por host, JSON-LD de producto, canonical) |
| **Ventas** | Checkout en pasos (entrega → pago), Mercado Pago Checkout Pro y Bricks (OAuth por merchant, la plata va a SU cuenta), cupones, carritos abandonados con recupero, reembolsos totales/parciales auditados |
| **Envíos** | Métodos manuales (domicilio/retiro) + **cotización en vivo con Correo Argentino** (API MiCorreo): el comprador pone su CP y ve tarifas reales a domicilio o sucursal; alta de envíos desde la venta |
| **Facturación** | Electrónica ARCA/AFIP: certificado por tienda (CSR desde el panel), CAE online vía WSAA+WSFEv1, PDF con QR, notas de crédito en reembolsos, homologación y producción |
| **Comunicación** | Emails transaccionales brandeados (Resend) + WhatsApp Cloud API por plantillas, ambos editables por tienda, con contadores de uso y costo estimado |
| **Operación** | Inventario con reservas anti-oversell, import/export CSV masivo (productos + imágenes), CRM de clientes, chat posventa con adjuntos privados, estadísticas |
| **Plataforma** | RBAC por tienda (6 roles, deny-by-default), aislamiento multi-tenant estricto, legal AR (Botón de Arrepentimiento Res. 424/2020, términos/privacidad con override CMS), centro de ayuda integrado con 29 manuales |

## Stack

- **Backend**: .NET 10 — monolito modular (ASP.NET Core minimal APIs, EF Core, PostgreSQL). 17 módulos, cada uno con su DbContext y filtro global de tenant.
- **Storefront**: Next.js 16 (SSR multi-tenant por Host), React 19, Tailwind
- **Admin**: React 19 + Vite (SPA), TypeScript, React Query
- **Infra dev**: Docker (Postgres, MinIO)
- **Prod**: Docker Compose + Caddy (TLS automático, on-demand para dominios propios) — ver [docs/DEPLOY.md](./docs/DEPLOY.md)

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
| API | http://localhost:5080 (`/health`, `/version`) |
| Admin (panel del merchant) | http://localhost:3001 |
| Storefront (tiendas) | http://`<subdominio>`.localhost:3000 |
| Postgres | localhost:5432 (tiendafy/tiendafy) |
| MinIO Console | localhost:9001 |

**Primeros pasos**: abrí el admin (http://localhost:3001), registrate, creá una
tienda y entrá a su storefront en `http://<subdominio>.localhost:3000`.
Usuarios de prueba: [docs/usuarios-de-prueba.md](./docs/usuarios-de-prueba.md).

## Comandos frecuentes

```bash
# Backend
dotnet build backend/backend.slnx
dotnet test  backend/backend.slnx
dotnet run --project backend/src/Api -- migrate    # aplica migraciones y sale

# Frontends
pnpm --filter ./admin dev          # o: type-check / build / test
pnpm --filter ./storefront dev

# E2E (contra el stack de dev levantado)
pnpm --filter ./e2e test

# Migraciones EF (ejemplo con el módulo Themes; cada módulo tiene su DbContext)
cd backend
dotnet ef migrations add MiCambio --project src/Modules/Themes/Themes.Infrastructure --startup-project src/Api --context ThemesDbContext
```

## Calidad y CI

Todo corre en GitHub Actions en cada push/PR:

- **Backend CI**: build con `-warnaserror` (analizadores .NET latest-recommended), `dotnet format --verify-no-changes`, 370+ tests unitarios + tests de integración de aislamiento multi-tenant contra Postgres real, y un **ratchet de cobertura de dominio ≥ 60%** (actual: ~71%, solo puede subir).
- **Frontend CI**: Prettier check, typecheck de todo el workspace, ESLint, vitest con thresholds de cobertura como ratchet.
- **CodeQL** (JS/TS + C#): sin GHAS (repo privado) el SARIF se evalúa en el propio workflow — hallazgos `error` rompen el build, `warning` se anotan.
- **gitleaks**: escaneo de secretos en cada push.
- **Dependabot**: agrupado semanal con cooldown de 2 días (compatible con el guard de supply-chain de pnpm, que rechaza paquetes publicados hace <24 h). Los majors sensibles se encaran a mano.
- **docker-release**: imágenes a GHCR con `GIT_SHA` (expuesto en `GET /version`).

Hooks locales (husky): Prettier + `dotnet format` sobre lo stageado en cada commit.

## Seguridad (decisiones no negociables)

- Credenciales de integraciones (tokens MP, certificado y clave ARCA, tokens WhatsApp y MiCorreo) **cifradas con ASP.NET DataProtection**; nunca se devuelven por API, nunca se loguean, nunca en disco plano. El keyring (`dpkeys`) es el volumen más crítico del deploy.
- Aislamiento multi-tenant: query filters globales de EF por módulo + middleware de membresía en toda escritura + tests de integración que lo verifican.
- Precios sensibles firmados server-side: el costo de envío cotizado viaja en un token firmado con TTL (el cliente no puede manipularlo), mismo patrón que el preview token del editor.
- Logs sanitizados: emails enmascarados (`j***@gmail.com`), valores de usuario sin caracteres de control (anti log-forging).
- Rate limiting particionado por IP, captcha Turnstile en formularios públicos, RBAC deny-by-default.

## Documentación

- **API navegable** (con la API corriendo, solo en dev): [http://localhost:5080/scalar/v1](http://localhost:5080/scalar/v1) — UI Scalar con las 130+ rutas agrupadas por módulo. Spec cruda: `/openapi/v1.json`.
- [docs/START_HERE.md](./docs/START_HERE.md) — **mapa de toda la documentación** (empezá acá)
- [docs/CONFIGURACION.md](./docs/CONFIGURACION.md) — **todas las API keys, secretos y variables** para dev y producción: qué conseguir, dónde se consigue y dónde va (MP, Resend, Turnstile, Google, Sentry, MinIO, y lo que cada tienda carga en el admin)
- [docs/ARQUITECTURA-VISUAL.md](./docs/ARQUITECTURA-VISUAL.md) — **diagramas Mermaid de TODO el sistema**: piezas, integraciones (Mercado Pago, Resend, WhatsApp, ARCA, Correo Argentino…) y el flujo de una venta
- [docs/DEPLOY.md](./docs/DEPLOY.md) — build de imágenes y producción
- [docs/payments-mercadopago.md](./docs/payments-mercadopago.md) — integración de pagos en detalle
- [docs/rbac-propuesta.md](./docs/rbac-propuesta.md) — matriz de roles y permisos
- [docs/adr/](./docs/adr) — decisiones arquitectónicas
- [docs/guides/](./docs/guides) — agregar un feature / un módulo

## Estructura

```
backend/     API .NET (src/Api) + 17 módulos (src/Modules/{Tenancy,Catalog,Orders,Payments,Fiscal,Checkout,...})
storefront/  Next.js multi-tenant (la tienda que ve el comprador)
admin/       SPA del panel del merchant (incluye el centro de ayuda en /ayuda)
shared/      Paquetes pnpm compartidos (types, ui, design-system)
e2e/         Tests Playwright punta a punta (contra el stack de dev)
infra/       Docker compose (dev/app/prod), Caddy, nginx
docs/        Documentación
```
