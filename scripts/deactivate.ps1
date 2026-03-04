$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$cloudflaredPid = Join-Path $projectRoot "tools\cloudflared.pid"

function Stop-OrphanCloudflared {
  $all = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
  if (-not $all) {
    Write-Host "No cloudflared orphan processes found." -ForegroundColor Yellow
    return
  }

  $stopped = 0
  foreach ($proc in $all) {
    $cmd = [string]$proc.CommandLine
    if ($cmd -match "TuringMachine" -or $cmd -match "localhost:3000") {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      $stopped += 1
    }
  }

  if ($stopped -gt 0) {
    Write-Host "Stopped $stopped orphan cloudflared process(es)." -ForegroundColor Green
  } else {
    Write-Host "No matching cloudflared orphan process needed stopping." -ForegroundColor Yellow
  }
}

function Is-ServerUp {
  try {
    $null = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/health" -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

Write-Host "=== DEACTIVATE: Turing Game ===" -ForegroundColor Cyan

Write-Host "[1/3] Stopping public tunnel..." -ForegroundColor Yellow
if (Test-Path $cloudflaredPid) {
  $pidText = Get-Content $cloudflaredPid -Raw
  $cloudflaredProcessId = 0
  [void][int]::TryParse($pidText.Trim(), [ref]$cloudflaredProcessId)

  if ($cloudflaredProcessId -gt 0) {
    $proc = Get-Process -Id $cloudflaredProcessId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $cloudflaredProcessId -Force
      Write-Host "Stopped cloudflared PID $cloudflaredProcessId" -ForegroundColor Green
    } else {
      Write-Host "cloudflared PID file existed but process was already stopped." -ForegroundColor Yellow
    }
  }

  Remove-Item $cloudflaredPid -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "No cloudflared PID file found." -ForegroundColor Yellow
}

Stop-OrphanCloudflared

Write-Host "[2/3] Stopping web server containers..." -ForegroundColor Yellow
docker compose down | Out-Null

Start-Sleep -Seconds 2

Write-Host "[3/3] Verifying shutdown proof..." -ForegroundColor Yellow
$serverUp = Is-ServerUp

$remainingTunnel = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match "TuringMachine" -or $_.CommandLine -match "localhost:3000" }

if ($serverUp -or $remainingTunnel) {
  if ($serverUp) {
    Write-Host "PROOF FAILED: http://localhost:3000 is still responding." -ForegroundColor Red
  }
  if ($remainingTunnel) {
    Write-Host "PROOF FAILED: tunnel process still running." -ForegroundColor Red
  }
  exit 1
}

Write-Host "PROOF OK: Server is stopped (health endpoint unreachable) and tunnel is not running." -ForegroundColor Green
Write-Host "Web page deactivated successfully." -ForegroundColor Green
