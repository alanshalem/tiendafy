# Tiendafy

Plataforma de e-commerce de una importadora argentina para operar varias
tiendas propias (una por rubro) desde un solo panel: tienda online por
subdominio o dominio propio, checkout con Mercado Pago, Payway, transferencia o efectivo,
envíos (Correo Argentino, Andreani, Zipnova), facturación electrónica ARCA,
Mercado Libre, compras, tesorería y marketing. En producción desde
octubre de 2026.

| Pieza      | Stack                                                       | Carpeta       |
| ---------- | ----------------------------------------------------------- | ------------- |
| API        | .NET 10, monolito modular (minimal APIs, EF Core, Postgres) | `backend/`    |
| Panel      | React 19 + Vite (SPA)                                       | `admin/`      |
| Tienda     | Next.js 16 (SSR, resuelve la tienda por host)               | `storefront/` |
| Compartido | Paquetes pnpm (`@tiendafy/types`, `ui`, `design-system`)    | `shared/`     |
| E2E        | Playwright                                                  | `e2e/`        |
| Infra      | Docker Compose (dev, stack de prod, borde Caddy)            | `infra/`      |

## Arranque rápido (desarrollo)

Requisitos: Docker, .NET 10 SDK, Node 26 (versión exacta en `.node-version`) y
pnpm (`npm install -g pnpm`; se ajusta solo a la versión de `packageManager`
en `package.json`).

```powershell
.\setup.ps1      # primera vez: chequea requisitos, levanta Postgres/MinIO/pgAdmin, instala, compila y testea
.\dev-up.ps1     # día a día: infra + API + panel + tienda con hot-reload
.\dev-down.ps1   # apagar
```

En Linux/macOS: `./setup.sh` y después cada app a mano (ver
[docs/primeros-pasos.md](./docs/primeros-pasos.md)).

- Panel: http://localhost:5173 — entrá con `admin@tiendafy.local` / `password123`
  ([usuarios de prueba](./docs/usuarios-de-prueba.md)).
- Tiendas: `http://<subdominio>.localhost:3000` (`dev-up.ps1` lista las que hay).
- API: http://localhost:5080 (docs navegables en `/scalar`, solo en Development).

Todos los puertos: [docs/urls-y-puertos.md](./docs/urls-y-puertos.md).

## Comandos

```bash
pnpm verify                          # lo de CI menos el e2e, en local (--front, --back, --coverage, --seq)
dotnet build backend/backend.slnx
dotnet test backend/backend.slnx
pnpm --filter ./admin dev            # o type-check / lint / build / test
pnpm --filter ./storefront dev
pnpm test:e2e                        # con el stack levantado
pnpm test:smoke                      # solo los e2e @smoke
```

## Documentación

- [docs/primeros-pasos.md](./docs/primeros-pasos.md) — primer día: setup, cómo correr, dónde vive cada cosa.
- [docs/README.md](./docs/README.md) — índice de toda la documentación.
- [docs/configuracion.md](./docs/configuracion.md) — variables de entorno y credenciales.
- [docs/tests.md](./docs/tests.md) — tests y CI.
- [AGENTS.md](./AGENTS.md) — lo que un agente de código (o una persona) tiene que saber antes de tocar el repo.
