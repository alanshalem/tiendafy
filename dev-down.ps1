#requires -Version 5
<#
.SYNOPSIS
    Para el entorno de desarrollo de Tiendafy.
.PARAMETER KeepInfra
    No frena los contenedores Docker (Postgres/Redis/etc), solo API + frontends.
.PARAMETER Docker
    Baja el stack full-docker (lo que levanta `dev-up.ps1 -Docker`): infra + API +
    storefront + admin en contenedores.
.EXAMPLE
    ./dev-down.ps1
    ./dev-down.ps1 -KeepInfra
    ./dev-down.ps1 -Docker
#>
param([switch]$KeepInfra, [switch]$Docker)

$root       = $PSScriptRoot
$compose    = Join-Path $root 'infra\docker\docker-compose.dev.yml'
$composeApp = Join-Path $root 'infra\docker\docker-compose.app.yml'

function Stop-Port([int]$port, [string]$label) {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    if ($pids) { Write-Host "  $label (:$port) frenado" -ForegroundColor Yellow }
}

Write-Host "`n== Tiendafy dev-down ==" -ForegroundColor Cyan

# Modo full-docker: baja infra + apps en contenedores y listo.
if ($Docker) {
    Write-Host '  Bajando stack full-docker (infra + apps)...' -ForegroundColor Yellow
    docker compose -f $compose -f $composeApp down 2>&1 | Out-Null
    Write-Host "Listo.`n" -ForegroundColor Green
    return
}

Stop-Port 5080 'API'
Stop-Port 5000 'API(default)'
Stop-Port 3001 'Admin'
Stop-Port 3000 'Storefront'

if ($KeepInfra) {
    Write-Host '  Infra Docker intacta (-KeepInfra)' -ForegroundColor Yellow
} else {
    Write-Host '  Frenando contenedores Docker...' -ForegroundColor Yellow
    docker compose -f $compose stop 2>&1 | Out-Null
}
Write-Host "Listo.`n" -ForegroundColor Green
