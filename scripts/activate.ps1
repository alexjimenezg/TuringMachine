$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$toolsDir = Join-Path $projectRoot "tools"
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$cloudflaredLog = Join-Path $toolsDir "cloudflared-runtime.log"
$cloudflaredPid = Join-Path $toolsDir "cloudflared.pid"

function Read-EnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }

  foreach ($line in Get-Content $path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith("#")) { continue }
    $parts = $line.Split("=", 2)
    if ($parts.Count -eq 2) {
      $map[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  return $map
}

function Wait-Health([int]$maxTries = 20) {
  for ($i = 0; $i -lt $maxTries; $i++) {
    try {
      $null = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/health" -TimeoutSec 3
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Get-QuickTunnelUrl([string]$logPath, [int]$maxTries = 25) {
  for ($i = 0; $i -lt $maxTries; $i++) {
    if (Test-Path $logPath) {
      $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
      if ($content) {
        $match = [regex]::Match($content, "https://[a-zA-Z0-9\.-]+\.trycloudflare\.com")
        if ($match.Success) {
          return $match.Value
        }
      }
    }
    Start-Sleep -Seconds 1
  }

  return $null
}

function Stop-OrphanCloudflared {
  $all = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
  if (-not $all) { return }

  foreach ($proc in $all) {
    $cmd = [string]$proc.CommandLine
    if ($cmd -match "TuringMachine" -or $cmd -match "localhost:3000") {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "=== ACTIVATE: Turing Game ===" -ForegroundColor Cyan

if (-not (Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

if (-not (Test-Path $cloudflaredPath)) {
  Write-Host "[1/5] Downloading cloudflared..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflaredPath
}

Write-Host "[2/5] Starting web server (Docker Compose)..." -ForegroundColor Yellow
docker compose up -d --build | Out-Null

if (-not (Wait-Health)) {
  Write-Host "Server did not become healthy on http://localhost:3000" -ForegroundColor Red
  exit 1
}

Write-Host "[3/5] Starting public tunnel..." -ForegroundColor Yellow
Stop-OrphanCloudflared
if (Test-Path $cloudflaredLog) { Remove-Item $cloudflaredLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $cloudflaredPid) { Remove-Item $cloudflaredPid -Force -ErrorAction SilentlyContinue }

$envMap = Read-EnvFile (Join-Path $projectRoot ".env")
$tunnelToken = if ($envMap.ContainsKey("CF_TUNNEL_TOKEN")) { $envMap["CF_TUNNEL_TOKEN"] } else { "" }
$publicUrl = if ($envMap.ContainsKey("CF_PUBLIC_URL")) { $envMap["CF_PUBLIC_URL"] } else { "" }

$arguments = @("--no-autoupdate", "--loglevel", "info", "--logfile", $cloudflaredLog, "tunnel")
if ([string]::IsNullOrWhiteSpace($tunnelToken)) {
  $arguments += @("--url", "http://localhost:3000")
} else {
  $arguments += @("run", "--token", $tunnelToken)
}

$process = Start-Process -FilePath $cloudflaredPath -ArgumentList $arguments -PassThru -WindowStyle Hidden
Set-Content -Path $cloudflaredPid -Value $process.Id

if ([string]::IsNullOrWhiteSpace($tunnelToken)) {
  $publicUrl = Get-QuickTunnelUrl $cloudflaredLog
}

Write-Host "[4/5] Collecting dashboard metrics..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/health"
$metrics = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/metrics"

Write-Host ""
Write-Host "=== LIVE STATUS ===" -ForegroundColor Green
if ($publicUrl) {
  Write-Host ("Public URL: " + $publicUrl) -ForegroundColor Green
} else {
  Write-Host "Public URL: tunnel running, but URL not parsed yet. Check tools/cloudflared-runtime.log" -ForegroundColor Yellow
}
Write-Host "Local URL:  http://localhost:3000" -ForegroundColor Green
Write-Host ("Health:     ok=" + $health.ok + " timestamp=" + $health.timestamp) -ForegroundColor Green
Write-Host ""
Write-Host "Dashboard metrics:" -ForegroundColor Cyan
$metrics | ConvertTo-Json -Depth 6

Write-Host ""
Write-Host "[5/5] Activation complete." -ForegroundColor Green
Write-Host "To deactivate and prove shutdown, run: deactivate.bat" -ForegroundColor Cyan
