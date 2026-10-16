#!/usr/bin/env bash
#
# Setup completo de Tiendafy para desarrollo local (Linux/macOS/WSL).
#
#   ./setup.sh              setup completo
#   ./setup.sh --skip-tests sin tests del backend
#   ./setup.sh --skip-docker sin levantar infraestructura
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_DOCKER=false
SKIP_TESTS=false

for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=true ;;
    --skip-tests)  SKIP_TESTS=true ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[0;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[0;32mOK: %s\033[0m\n' "$1"; }
fail() { printf '    \033[0;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------- 1. Prerequisitos ----------
step "Verificando prerequisitos"

command -v docker >/dev/null 2>&1 || fail "Docker no encontrado. https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || fail "Docker instalado pero el daemon no responde."
ok "Docker"

command -v dotnet >/dev/null 2>&1 || fail ".NET SDK no encontrado. https://dotnet.microsoft.com/download/dotnet/10.0"
DOTNET_VERSION="$(dotnet --version)"
[[ "$DOTNET_VERSION" == 10.* ]] || fail ".NET 10 requerido, encontrado $DOTNET_VERSION"
ok ".NET SDK $DOTNET_VERSION"

# La versión la fija .node-version (la misma que usan CI y las imágenes).
NODE_REQUIRED="$(head -n1 "$ROOT/.node-version" | tr -d '[:space:]v' | cut -d. -f1)"
command -v node >/dev/null 2>&1 || fail "Node.js no encontrado. Instalar Node $NODE_REQUIRED: https://nodejs.org"
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" -ge "$NODE_REQUIRED" ]] || fail "Node $NODE_REQUIRED requerido (ver .node-version), encontrado $(node --version)"
ok "Node $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  # Node 25+ ya no trae corepack. pnpm se cambia solo a la versión fijada en
  # package.json (packageManager) la primera vez que corre en el repo.
  echo "    pnpm no encontrado, instalando con npm..."
  npm install -g pnpm
  command -v pnpm >/dev/null 2>&1 || fail "No se pudo instalar pnpm. Manual: npm install -g pnpm"
fi
ok "pnpm $(pnpm --version)"

# ---------- 2. Infraestructura Docker ----------
if [[ "$SKIP_DOCKER" == false ]]; then
  step "Levantando infraestructura (Postgres, MinIO)"
  docker compose -f "$ROOT/infra/docker/docker-compose.dev.yml" up -d --wait \
    || fail "docker compose falló. Ver logs: docker compose -f infra/docker/docker-compose.dev.yml logs"
  ok "Servicios arriba y healthy"
else
  step "Docker omitido (--skip-docker)"
fi

# ---------- 3. Dependencias frontend ----------
step "Instalando dependencias del workspace (pnpm)"
(cd "$ROOT" && pnpm install) || fail "pnpm install falló"
ok "Workspace instalado"

# ---------- 4. Backend: build + tests ----------
step "Compilando backend (.NET)"
dotnet build "$ROOT/backend/backend.slnx" --nologo -v minimal || fail "Build del backend falló"
ok "Backend compila"

if [[ "$SKIP_TESTS" == false ]]; then
  step "Corriendo tests del backend"
  dotnet test "$ROOT/backend/backend.slnx" --nologo --no-build -v minimal || fail "Tests del backend fallaron"
  ok "Tests verdes"
fi

# ---------- 5. Resumen ----------
printf '\033[0;32m'
cat <<'EOF'

============================================================
  Tiendafy: entorno listo
============================================================

  Infraestructura (Docker):
    PostgreSQL   localhost:5432  (tiendafy / tiendafy)
    MinIO (S3)   localhost:9000  | UI: http://localhost:9001 (minioadmin/minioadmin)
    pgAdmin      http://localhost:8081  (entra sin login, con la base ya cargada)

  Para desarrollar (Windows: usar dev-up.ps1; Linux/WSL: a mano):
    Backend API     cd backend/src/Api && dotnet run   -> http://localhost:5080  (Swagger: /scalar)
    Storefront      cd storefront && pnpm dev          -> http://localhost:3000
    Admin           cd admin && pnpm dev               -> http://localhost:5173

  Cada tienda vive en su propio subdominio del storefront:
    http://<subdominio>.localhost:3000
  Las que haya en la base:
    docker exec tiendafy-postgres psql -U tiendafy -d tiendafy -c "select subdomain, name from tenants"
  Las tiendas se crean desde el panel (Mis tiendas). Para llenar una con datos
  de demo: POST /api/v1/dev/demo-seed con la sesión del dueño y la tienda en
  X-Tenant-Id (?reset=true vuelve a empezar). Solo existe en Development.

  Tests backend:    dotnet test backend/backend.slnx
  Type-check FE:    pnpm --filter "./shared/**" run type-check
  Bajar infra:      docker compose -f infra/docker/docker-compose.dev.yml down

  Mapa de la documentación: docs/primeros-pasos.md
============================================================
EOF
printf '\033[0m'
