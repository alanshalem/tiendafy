#requires -Version 5
<#
  dev-up.ps1 — levanta el entorno de desarrollo de Tiendafy.
  Uso (después de reiniciar la máquina):
      ./dev-up.ps1
  Asume que Docker Desktop arranca solo al iniciar sesión. Si no, abrilo primero.
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$compose = Join-Path $root 'infra\docker\docker-compose.dev.yml'
$apiDir = Join-Path $root 'backend\src\Api'

function Wait-For($label, [scriptblock]$test, [int]$tries = 40, [int]$delay = 5) {
    Write-Host "Esperando $label..." -NoNewline
    for ($i = 0; $i -lt $tries; $i++) {
        if (& $test) { Write-Host " OK" -ForegroundColor Green; return $true }
        Write-Host "." -NoNewline; Start-Sleep -Seconds $delay
    }
    Write-Host " TIMEOUT" -ForegroundColor Red; return $false
}

# 1. Docker daemon
if (-not (Wait-For "Docker daemon" { docker info *> $null; $LASTEXITCODE -eq 0 })) {
    Write-Host "Docker no respondió. Abrí Docker Desktop y reintentá." -ForegroundColor Red; exit 1
}

# 2. Stack (postgres, redis, rabbitmq, minio, pgbouncer)
Write-Host "Levantando stack docker..."
docker compose -f $compose up -d | Out-Null

# 3. Postgres accesible desde el host (127.0.0.1:5432)
if (-not (Wait-For "Postgres en :5432" { (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded } 30 3)) {
    Write-Host "Postgres no expone :5432 al host. Revisá Docker Desktop." -ForegroundColor Red; exit 1
}

# 4. API (perfil http → :5080). Mata cualquier instancia previa en 5080/5000.
Get-NetTCPConnection -LocalPort 5080, 5000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Arrancando API (:5080)..."
Start-Process -FilePath "dotnet" -ArgumentList "run", "--launch-profile", "http" `
    -WorkingDirectory $apiDir `
    -RedirectStandardOutput (Join-Path $root 'backend\api-run.log') `
    -RedirectStandardError  (Join-Path $root 'backend\api-err.log')

# 5. Health
if (Wait-For "API health" { try { (Invoke-WebRequest "http://localhost:5080/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 } catch { $false } } 30 4) {
    Write-Host "`nTodo arriba:" -ForegroundColor Green
    Write-Host "  API        http://localhost:5080"
    Write-Host "  Admin      pnpm --filter admin dev   (http://localhost:3001)"
    Write-Host "  Storefront pnpm --filter storefront dev (http://localhost:3000)"
} else {
    Write-Host "API no levantó. Últimas líneas del log:" -ForegroundColor Red
    Get-Content (Join-Path $root 'backend\api-run.log') -Tail 15 -ErrorAction SilentlyContinue
}
