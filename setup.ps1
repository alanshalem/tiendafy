<#
.SYNOPSIS
  Setup completo de Tiendafy para desarrollo local (Windows).

.DESCRIPTION
  1. Verifica prerequisitos (Docker, .NET 10, Node 22+, pnpm)
  2. Levanta infraestructura con Docker Compose (Postgres, PgBouncer, Redis, RabbitMQ, MinIO)
  3. Instala dependencias del workspace pnpm
  4. Compila el backend y corre los tests
  5. Muestra URLs y próximos pasos

.EXAMPLE
  .\setup.ps1            # setup completo
  .\setup.ps1 -SkipTests # sin tests del backend
#>
[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Write-Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Write-Ok($message)   { Write-Host "    OK: $message" -ForegroundColor Green }
function Fail($message)       { Write-Host "    ERROR: $message" -ForegroundColor Red; exit 1 }

# ---------- 1. Prerequisitos ----------
Write-Step "Verificando prerequisitos"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker no encontrado. Instalar Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Docker daemon no responde. Intentando arrancar Docker Desktop..." -ForegroundColor Yellow
    $dockerDesktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
        Start-Process $dockerDesktop
        $deadline = (Get-Date).AddMinutes(2)
        do {
            Start-Sleep -Seconds 5
            docker info *> $null
        } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
    }
    if ($LASTEXITCODE -ne 0) { Fail "Docker daemon no responde. Arrancar Docker Desktop y reintentar." }
}
Write-Ok "Docker"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Fail ".NET SDK no encontrado. Instalar .NET 10: https://dotnet.microsoft.com/download/dotnet/10.0"
}
$dotnetVersion = dotnet --version
if (-not $dotnetVersion.StartsWith('10.')) {
    Fail ".NET 10 requerido, encontrado $dotnetVersion"
}
Write-Ok ".NET SDK $dotnetVersion"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js no encontrado. Instalar Node 22+: https://nodejs.org"
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    Fail "Node 22+ requerido, encontrado $(node --version)"
}
Write-Ok "Node $(node --version)"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "    pnpm no encontrado, instalando via corepack..." -ForegroundColor Yellow
    corepack enable
    corepack prepare pnpm@latest --activate
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Fail "No se pudo instalar pnpm. Manual: npm install -g pnpm"
    }
}
Write-Ok "pnpm $(pnpm --version)"

# ---------- 2. Infraestructura Docker ----------
if (-not $SkipDocker) {
    Write-Step "Levantando infraestructura (Postgres, PgBouncer, Redis, RabbitMQ, MinIO)"
    docker compose -f (Join-Path $root 'infra/docker/docker-compose.dev.yml') up -d --wait
    if ($LASTEXITCODE -ne 0) { Fail "docker compose falló. Ver logs: docker compose -f infra/docker/docker-compose.dev.yml logs" }
    Write-Ok "Servicios arriba y healthy"
} else {
    Write-Step "Docker omitido (-SkipDocker)"
}

# ---------- 3. Dependencias frontend ----------
Write-Step "Instalando dependencias del workspace (pnpm)"
Push-Location $root
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { Fail "pnpm install falló" }
} finally { Pop-Location }
Write-Ok "Workspace instalado"

# ---------- 4. Backend: build + tests ----------
Write-Step "Compilando backend (.NET)"
# Si la API quedó corriendo (dev-up), bloquea las DLLs y el build falla con
# MSB3027 "file is locked by: Api". La paramos antes de compilar.
$apiPids = Get-NetTCPConnection -LocalPort 5080 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
if ($apiPids) {
    Write-Host "    API corriendo en :5080 — la detengo para poder compilar" -ForegroundColor Yellow
    $apiPids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
dotnet build (Join-Path $root 'backend/backend.slnx') --nologo -v minimal
if ($LASTEXITCODE -ne 0) { Fail "Build del backend falló" }
Write-Ok "Backend compila"

if (-not $SkipTests) {
    Write-Step "Corriendo tests del backend"
    dotnet test (Join-Path $root 'backend/backend.slnx') --nologo --no-build -v minimal
    if ($LASTEXITCODE -ne 0) { Fail "Tests del backend fallaron" }
    Write-Ok "Tests verdes"
}

# ---------- 5. Resumen ----------
Write-Host @"

============================================================
  Tiendafy: entorno listo
============================================================

  Infraestructura (Docker):
    PostgreSQL   localhost:5432  (tiendafy / tiendafy)
    PgBouncer    localhost:6432  (pool transaccional)
    Redis        localhost:6379
    RabbitMQ     localhost:5672  | UI: http://localhost:15672 (guest/guest)
    MinIO (S3)   localhost:9000  | UI: http://localhost:9001 (minioadmin/minioadmin)

  Levantar TODO con un comando:
    Nativo (hot-reload, recomendado en dev):   .\dev-up.ps1
    Full-docker (todo en contenedores):        .\dev-up.ps1 -Docker
    Bajar todo:                                .\dev-down.ps1   (o -Docker)

  URLs:
    API             http://localhost:5080   (Swagger: /scalar, Health: /health)
    Storefront      http://localhost:3000   (probá petify.localhost:3000)
    Admin           http://localhost:3001

  O a mano (nativo):
    Backend API     cd backend/src/Api; dotnet run
    Storefront      cd storefront; pnpm dev
    Admin           cd admin; pnpm dev

  Tests backend:    dotnet test backend/backend.slnx
  Type-check FE:    pnpm --filter "./shared/**" run type-check
  Bajar infra:      docker compose -f infra/docker/docker-compose.dev.yml down

  Estado del proyecto: IMPLEMENTATION_CHECKLIST.md
============================================================
"@ -ForegroundColor Green
