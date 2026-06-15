#requires -Version 5
<#
.SYNOPSIS
    Levanta TODO el entorno de desarrollo de Tiendafy en orden, con healthchecks.
    Infra (Docker) -> API (.NET) -> Frontends (admin + storefront).

.DESCRIPTION
    Arranca Docker Desktop si está apagado, levanta el stack (Postgres, Redis,
    RabbitMQ, MinIO), espera a que cada puerto responda, arranca la API y solo
    cuando /health da 200 lanza los frontends. Idempotente: se puede correr de
    nuevo sin romper nada.

.PARAMETER BackendOnly
    No lanza admin/storefront, solo infra + API.

.PARAMETER InWindows
    Lanza cada frontend en su propia ventana de PowerShell (default). Con -InWindows:$false
    los lanza en background y escribe logs a backend/.

.EXAMPLE
    ./dev-up.ps1
    ./dev-up.ps1 -BackendOnly
#>
param(
    [switch]$BackendOnly,
    [bool]$InWindows = $true
)

# 'Continue' a propósito: comandos nativos (docker) escriben a stderr cuando el
# daemon está apagado; con 'Stop' eso mataría el script antes de poder arrancarlo.
# Los fallos críticos se manejan explícitamente con checks + exit.
$ErrorActionPreference = 'Continue'
$root      = $PSScriptRoot
$compose   = Join-Path $root 'infra\docker\docker-compose.dev.yml'
$apiDir    = Join-Path $root 'backend\src\Api'
$adminDir  = Join-Path $root 'admin'
$storeDir  = Join-Path $root 'storefront'
$dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

# ---- Mapa de puertos (única fuente de verdad para el script) ----
$PORTS = [ordered]@{
    'API'        = 5080   # backend .NET (launchSettings perfil http)
    'Admin'      = 3001   # vite (strictPort en vite.config.ts)
    'Storefront' = 3000   # next dev
    'Postgres'   = 5432
    'Redis'      = 6379
    'MinIO'      = 9000
}

function Info($m)  { Write-Host $m -ForegroundColor Cyan }
function Ok($m)    { Write-Host $m -ForegroundColor Green }
function Warn($m)  { Write-Host $m -ForegroundColor Yellow }
function Err($m)   { Write-Host $m -ForegroundColor Red }

function Test-Port([int]$port) {
    (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
}

function Test-DockerUp {
    docker info 2>$null 1>$null
    return ($LASTEXITCODE -eq 0)
}

function Wait-Until($label, [scriptblock]$test, [int]$tries = 60, [int]$delay = 3) {
    Write-Host "  $label " -NoNewline
    for ($i = 0; $i -lt $tries; $i++) {
        try { if (& $test) { Ok 'OK'; return $true } } catch {}
        Write-Host '.' -NoNewline; Start-Sleep -Seconds $delay
    }
    Err 'TIMEOUT'; return $false
}

function Stop-Port([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Info '== Tiendafy dev-up =='

# 1) Docker daemon (arranca Docker Desktop si hace falta) ----------------------
Info "`n[1/4] Docker"
if (-not (Test-DockerUp)) {
    if (Test-Path $dockerExe) { Warn '  Docker apagado, abriendo Docker Desktop...'; Start-Process $dockerExe }
    else { Err '  No encuentro Docker Desktop. Abrilo manualmente.'; exit 1 }
}
if (-not (Wait-Until 'daemon' { Test-DockerUp } 60 5)) {
    Err '  Docker no respondió. Revisá Docker Desktop ("Engine running").'; exit 1
}

# 2) Stack de infraestructura --------------------------------------------------
Info "`n[2/4] Infra (compose)"
docker compose -f $compose up -d | Out-Null
$infraOk = $true
foreach ($svc in 'Postgres', 'Redis', 'MinIO') {
    if (-not (Wait-Until "$svc :$($PORTS[$svc])" { Test-Port $PORTS[$svc] } 30 3)) { $infraOk = $false }
}
if (-not $infraOk) {
    Err '  Algún servicio no publicó su puerto al host. `docker compose ps` para ver estado.'
    exit 1
}

# 3) API .NET ------------------------------------------------------------------
Info "`n[3/4] API (.NET :$($PORTS.API))"
Stop-Port $PORTS.API
Stop-Port 5000   # por si quedó una instancia con el perfil default
Start-Process -FilePath 'dotnet' `
    -ArgumentList 'run', '--launch-profile', 'http' `
    -WorkingDirectory $apiDir `
    -RedirectStandardOutput (Join-Path $root 'backend\api-run.log') `
    -RedirectStandardError  (Join-Path $root 'backend\api-err.log')

$apiUp = Wait-Until 'health' {
    try { (Invoke-WebRequest "http://localhost:$($PORTS.API)/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 }
    catch { $false }
} 40 4
if (-not $apiUp) {
    Err '  La API no levantó. Últimas líneas del log:'
    Get-Content (Join-Path $root 'backend\api-run.log') -Tail 20 -ErrorAction SilentlyContinue
    exit 1
}

# 4) Frontends -----------------------------------------------------------------
if ($BackendOnly) {
    Info "`n[4/4] Frontends omitidos (-BackendOnly)"
} else {
    Info "`n[4/4] Frontends"
    foreach ($f in @(
        @{ Name = 'Admin';      Dir = $adminDir; Port = $PORTS.Admin },
        @{ Name = 'Storefront'; Dir = $storeDir; Port = $PORTS.Storefront }
    )) {
        Stop-Port $f.Port
        if ($InWindows) {
            Start-Process 'powershell' -ArgumentList '-NoExit', '-Command', "Set-Location '$($f.Dir)'; pnpm dev"
        } else {
            Start-Process 'pnpm' -ArgumentList 'dev' -WorkingDirectory $f.Dir `
                -RedirectStandardOutput (Join-Path $root "backend\$($f.Name.ToLower())-dev.log") `
                -RedirectStandardError  (Join-Path $root "backend\$($f.Name.ToLower())-dev.err.log")
        }
        Write-Host "  $($f.Name) lanzado (:$($f.Port))" -ForegroundColor Green
    }
}

# Resumen ----------------------------------------------------------------------
Write-Host ''
Ok '== Todo arriba =='
Write-Host "  API        http://localhost:$($PORTS.API)"
Write-Host "  Swagger    http://localhost:$($PORTS.API)/scalar"
Write-Host "  Health     http://localhost:$($PORTS.API)/health"
if (-not $BackendOnly) {
    Write-Host "  Admin      http://localhost:$($PORTS.Admin)"
    Write-Host "  Storefront http://localhost:$($PORTS.Storefront)"
}
Write-Host "`n  Parar todo: ./dev-down.ps1`n"
