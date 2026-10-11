#requires -Version 5
<#
.SYNOPSIS
    Levanta TODO el entorno de desarrollo de Tiendafy en orden, con healthchecks.
    Infra (Docker) -> API (.NET) -> Frontends (admin + storefront).

.DESCRIPTION
    Arranca Docker Desktop si está apagado, levanta el stack (Postgres, PgBouncer,
    MinIO), espera a que cada puerto responda, arranca la API y solo
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
    [bool]$InWindows = $true,
    # Levanta un túnel cloudflared para exponer la API (webhooks MercadoPago) y
    # auto-inyecta la URL pública a la API (RedirectUri + PublicApiBaseUrl).
    [switch]$Tunnel,
    # Corre TODO el sistema en contenedores (infra + API + storefront + admin),
    # en vez del modo nativo con hot-reload. Ideal para demo/smoke/onboarding.
    [switch]$Docker,
    # Puerto del storefront. Se puede mover cuando otra app de la máquina ya
    # usa el 3000 (Next escala solo y después nada sabe dónde quedó). El panel
    # se entera solo: Sync-StorefrontOrigin le actualiza admin/.env.local.
    [int]$StorefrontPort = 3000
)

# 'Continue' a propósito: comandos nativos (docker) escriben a stderr cuando el
# daemon está apagado; con 'Stop' eso mataría el script antes de poder arrancarlo.
# Los fallos críticos se manejan explícitamente con checks + exit.
$ErrorActionPreference = 'Continue'
$root      = $PSScriptRoot
$compose   = Join-Path $root 'infra\docker\docker-compose.dev.yml'
$composeApp = Join-Path $root 'infra\docker\docker-compose.app.yml'  # overlay full-docker (-Docker)
$apiDir    = Join-Path $root 'backend\src\Api'
$adminDir  = Join-Path $root 'admin'
$storeDir  = Join-Path $root 'storefront'
$dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
# cloudflared: en la raíz del repo (cualquier nombre cloudflared*.exe) o en el PATH.
$cloudflared = @(
    (Join-Path $root 'cloudflared.exe'),
    (Join-Path $root 'cloudflared-windows-amd64.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cloudflared) {
    $found = Get-ChildItem -Path $root -Filter 'cloudflared*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    $cloudflared = if ($found) { $found.FullName } else { 'cloudflared' }
}

# ---- Las tiendas que hay, leídas de la base ----
# Un ejemplo fijo en el resumen envejece mal: la tienda que nombraba podía no
# existir, y quien recién llega probaba una URL que daba "tienda no encontrada".
# Esto imprime las que hay de verdad, con la dirección que les corresponde.
function Show-Stores {
    $rows = docker exec tiendafy-postgres psql -U tiendafy -d tiendafy -Atc `
        "select subdomain, name, status from tenants order by created_at_utc" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $rows) { return }

    Write-Host ''
    Write-Host '  Tiendas:' -ForegroundColor Cyan
    foreach ($row in $rows) {
        $cols = $row -split '\|'
        if ($cols.Count -lt 3) { continue }
        $suspendida = if ($cols[2] -ne 'Active') { "  [$($cols[2])]" } else { '' }
        Write-Host ("    {0,-34} {1}{2}" -f "http://$($cols[0]).localhost:$($PORTS.Storefront)", $cols[1], $suspendida)
    }
    Write-Host '    (el dominio pelado muestra la landing de la plataforma,' -ForegroundColor DarkGray
    Write-Host '     salvo que una tienda lo reclame como dominio propio)' -ForegroundColor DarkGray
}

# ---- Que el panel sepa en qué puerto quedó el storefront ----
# El admin arma los links a las tiendas y el preview del editor con la
# plantilla de VITE_STOREFRONT_ORIGIN. Vivía en admin/.env.local y había que
# acordarse de tocarla a mano: cuando el puerto se movía, el panel seguía
# linkeando al viejo y el editor mostraba un recuadro roto, sin un error que
# dijera por qué. El puerto lo decide este script, así que lo escribe él.
function Sync-StorefrontOrigin([int]$port) {
    $envFile = Join-Path $adminDir '.env.local'
    $deseado = "http://{sub}.localhost:$port"

    $lineas = if (Test-Path $envFile) { @(Get-Content $envFile) } else { @() }
    $actual = ($lineas | Where-Object { $_ -match '^\s*VITE_STOREFRONT_ORIGIN\s*=' } |
               Select-Object -First 1) -replace '^\s*VITE_STOREFRONT_ORIGIN\s*=\s*', ''

    if ($actual -eq $deseado) { return }

    # Si apunta a otro lado a propósito (un túnel, un dominio real), no se pisa.
    if ($actual -and $actual -notmatch '^http://\{sub\}\.localhost(:\d+)?/?$') {
        Warn "  VITE_STOREFRONT_ORIGIN apunta a $actual y el storefront va en :$port. No lo toco."
        return
    }

    $nueva = "VITE_STOREFRONT_ORIGIN=$deseado"
    $salida = if ($actual) {
        $lineas | ForEach-Object {
            if ($_ -match '^\s*VITE_STOREFRONT_ORIGIN\s*=') { $nueva } else { $_ }
        }
    } else {
        @($lineas) + $nueva
    }
    Set-Content -Path $envFile -Value $salida -Encoding utf8
    Write-Host "  admin/.env.local -> storefront en :$port" -ForegroundColor DarkGray
}

# ---- Mapa de puertos (única fuente de verdad para el script) ----
$PORTS = [ordered]@{
    'API'        = 5080   # backend .NET (launchSettings perfil http)
    'Admin'      = 5173   # vite (strictPort en vite.config.ts)
    'Storefront' = $StorefrontPort  # next dev -p (default 3000)
    'Postgres'   = 5432
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

# Reinicio limpio de Docker Desktop. Cura el bug donde "Engine running" miente:
# el engine corre en WSL pero com.docker.backend (broker host: pipe del CLI +
# forwarding de puertos) murió, dejando 127.0.0.1:<puerto> inalcanzable.
function Restart-Docker {
    Warn '  Reiniciando Docker Desktop (backend host caído)...'
    'Docker Desktop','com.docker.backend','com.docker.build','com.docker.dev-envs','vpnkit','vpnkit-bridge' |
        ForEach-Object { Get-Process $_ -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 4
    wsl --shutdown 2>$null
    Start-Sleep -Seconds 4
    if (Test-Path $dockerExe) { Start-Process $dockerExe }
    Wait-Until 'daemon (post-restart)' { Test-DockerUp } 60 5 | Out-Null
}

function Wait-Until($label, [scriptblock]$test, [int]$tries = 60, [int]$delay = 3) {
    Write-Host "  $label " -NoNewline
    for ($i = 0; $i -lt $tries; $i++) {
        try { if (& $test) { Ok 'OK'; return $true } } catch {}
        Write-Host '.' -NoNewline; Start-Sleep -Seconds $delay
    }
    Err 'TIMEOUT'; return $false
}

# Procesos que este script puede haber arrancado. Cualquier otra cosa escuchando
# en "nuestros" puertos es de otro proyecto (o de Docker) y NO se toca: en una
# máquina con varios proyectos, matar el proceso equivocado puede llevarse
# puesto el demonio de Docker y dejar todo peor que antes.
$OURS = @('dotnet', 'Api', 'node', 'pnpm', 'next-server')

function Stop-Port([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
            if (-not $proc) { return }
            if ($OURS -contains $proc.ProcessName) {
                Warn "  :$port ocupado por $($proc.ProcessName) (PID $_) — lo freno"
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            } else {
                Warn "  :$port lo tiene $($proc.ProcessName) (PID $_), que no es nuestro — lo dejo"
                Warn "     Si es de otro proyecto, corré el storefront en otro puerto: -StorefrontPort <puerto>"
            }
        }
}

# Levanta un quick tunnel cloudflared sobre la API y devuelve la URL pública
# https://xxxx.trycloudflare.com (o $null si no se pudo).
function Start-Tunnel([int]$port) {
    $exists = ($cloudflared -ne 'cloudflared') -or (Get-Command cloudflared -ErrorAction SilentlyContinue)
    if (-not $exists) {
        Warn '  cloudflared no encontrado. Descargalo y ponelo como cloudflared.exe en la raíz del repo.'
        Warn '  https://github.com/cloudflare/cloudflared/releases (cloudflared-windows-amd64.exe)'
        return $null
    }
    $log = Join-Path $root 'backend\cloudflared.log'
    if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath $cloudflared `
        -ArgumentList 'tunnel', '--url', "http://localhost:$port", '--no-autoupdate' `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden

    Write-Host '  esperando URL del túnel ' -NoNewline
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        $content = (Get-Content $log, "$log.err" -ErrorAction SilentlyContinue) -join "`n"
        $m = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($m.Success) { Ok 'OK'; return $m.Value }
        Write-Host '.' -NoNewline
    }
    Err 'TIMEOUT'; return $null
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

# 1b) Modo full-docker: TODO en contenedores (infra + API + storefront + admin) -
# Corta acá el flujo nativo. Un solo `compose up --build` levanta todo.
if ($Docker) {
    Info "`n[2/2] Stack completo en Docker (build + up)"
    # Liberar puertos por si quedó corriendo el modo nativo (dotnet/pnpm en el host).
    foreach ($p in $PORTS.API, $PORTS.Admin, $PORTS.Storefront) { Stop-Port $p }
    docker compose -f $compose -f $composeApp up -d --build
    if ($LASTEXITCODE -ne 0) { Err '  compose up falló. Revisá el output de arriba.'; exit 1 }

    $apiUp = Wait-Until 'health' {
        try { (Invoke-WebRequest "http://localhost:$($PORTS.API)/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 }
        catch { $false }
    } 60 4
    if (-not $apiUp) {
        Err '  La API en Docker no respondió. Logs:  docker compose -f infra\docker\docker-compose.dev.yml -f infra\docker\docker-compose.app.yml logs api'
        exit 1
    }

    Write-Host ''
    Ok '== Todo arriba (Docker) =='
    Write-Host "  API        http://localhost:$($PORTS.API)"
    Write-Host "  Swagger    http://localhost:$($PORTS.API)/scalar"
    Write-Host "  Storefront http://localhost:$($PORTS.Storefront)   (la plataforma; cada tienda va en su subdominio)"
    Write-Host "  Admin      http://localhost:$($PORTS.Admin)"
    Write-Host "  pgAdmin    http://localhost:8081   (entra sin login, con la base ya cargada)"
    Write-Host "  MinIO      http://localhost:9001   (minioadmin / minioadmin)"
    Show-Stores
    Write-Host "`n  Parar todo: ./dev-down.ps1 -Docker`n"
    exit 0
}

# 2) Stack de infraestructura --------------------------------------------------
Info "`n[2/4] Infra (compose)"
function Start-Infra {
    docker compose -f $compose up -d 2>$null | Out-Null
    $ok = $true
    foreach ($svc in 'Postgres', 'MinIO') {
        if (-not (Wait-Until "$svc :$($PORTS[$svc])" { Test-Port $PORTS[$svc] } 20 3)) { $ok = $false }
    }
    return $ok
}
if (-not (Start-Infra)) {
    # Auto-reparación: el síntoma típico es el backend host muerto → reiniciar Docker y reintentar 1 vez.
    Restart-Docker
    if (-not (Start-Infra)) {
        Err '  La infra no publicó puertos ni tras reiniciar Docker. Revisá Docker Desktop manualmente.'
        exit 1
    }
}

# 3) API .NET ------------------------------------------------------------------
Info "`n[3/4] API (.NET :$($PORTS.API))"
Stop-Port $PORTS.API
Stop-Port 5000   # por si quedó una instancia con el perfil default

# Túnel cloudflared (opcional): expone la API y auto-inyecta la URL pública a
# la config de MercadoPago vía variables de entorno (override de appsettings).
$tunnelUrl = $null
if ($Tunnel) {
    $tunnelUrl = Start-Tunnel $PORTS.API
    if ($tunnelUrl) {
        $env:MercadoPago__PublicApiBaseUrl = $tunnelUrl
        $env:MercadoPago__RedirectUri = "$tunnelUrl/api/v1/payments/mercadopago/callback"
        Ok "  túnel: $tunnelUrl"
        Warn "  Registrá ese Redirect URI en tu app de MercadoPago (cambia en cada corrida)."
    }
}

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
    # Antes de levantar el admin: vite lee .env.local una sola vez, al arrancar.
    Sync-StorefrontOrigin $PORTS.Storefront
    foreach ($f in @(
        @{ Name = 'Admin';      Dir = $adminDir; Port = $PORTS.Admin },
        @{ Name = 'Storefront'; Dir = $storeDir; Port = $PORTS.Storefront }
    )) {
        Stop-Port $f.Port
        # El storefront va con -p explícito: sin eso Next escala solo al 3001
        # cuando el 3000 está tomado y el admin queda apuntando a la nada.
        $devArgs = if ($f.Name -eq 'Storefront') { @('dev', '-p', "$($f.Port)") } else { @('dev') }
        if ($InWindows) {
            Start-Process 'powershell' -ArgumentList '-NoExit', '-Command', "Set-Location '$($f.Dir)'; pnpm $($devArgs -join ' ')"
        } else {
            # 'pnpm.cmd' y no 'pnpm': en Windows pnpm es un shim .cmd y
            # Start-Process no lo resuelve solo ("%1 is not a valid Win32 application").
            Start-Process 'pnpm.cmd' -ArgumentList $devArgs -WorkingDirectory $f.Dir `
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
if ($tunnelUrl) {
    Write-Host "  Túnel API  $tunnelUrl  (webhooks MercadoPago)" -ForegroundColor Cyan
}
if (-not $BackendOnly) {
    Write-Host "  Admin      http://localhost:$($PORTS.Admin)"
    Write-Host "  Storefront http://localhost:$($PORTS.Storefront)   (la plataforma; cada tienda va en su subdominio)"
}
Write-Host "  MinIO      http://localhost:9001   (minioadmin / minioadmin)"
Write-Host "  pgAdmin    http://localhost:8081   (entra sin login, con la base ya cargada)"
if (-not $BackendOnly) { Show-Stores }
Write-Host "`n  Parar todo: ./dev-down.ps1`n"
