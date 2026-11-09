param(
  [int]$Port = 8080,
  [int]$FastSDPort = 8000,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$serverScript = Join-Path $root 'server.js'
$fastSdRoot = Join-Path $root 'fastsdcpu'
$fastSdPython = Join-Path $fastSdRoot 'env\Scripts\python.exe'
$fastSdApp = Join-Path $fastSdRoot 'src\app.py'
$ollamaUrl = 'http://127.0.0.1:11434/api/tags'
$ollamaExecutable = Join-Path ($env:LOCALAPPDATA) 'Programs\Ollama\ollama.exe'
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-HttpReady([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady $Url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18 or newer is required. Install it from https://nodejs.org/.'
}

$webUrl = "http://127.0.0.1:$Port/"
$fastSdUrl = "http://127.0.0.1:$FastSDPort/api/info"

if (-not (Test-HttpReady $webUrl)) {
  Write-Host "Starting Haunt Generator on port $Port..." -ForegroundColor Magenta
  Start-Process -FilePath 'node' -ArgumentList @($serverScript, '--host', '0.0.0.0', '--port', $Port) `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $logDir 'server.log') `
    -RedirectStandardError (Join-Path $logDir 'server-error.log') `
    -WindowStyle Hidden
}

if ((Test-Path $fastSdPython) -and (Test-Path $fastSdApp) -and -not (Test-HttpReady $fastSdUrl)) {
  Write-Host "Starting FastSD CPU API on port $FastSDPort..." -ForegroundColor Magenta
  $envPath = Join-Path $fastSdRoot 'env\Scripts'
  $oldPath = $env:Path
  $env:Path = "$envPath;$env:Path"
  try {
    Start-Process -FilePath $fastSdPython `
      -ArgumentList @($fastSdApp, '--api', '--port', $FastSDPort) `
      -WorkingDirectory $fastSdRoot `
      -RedirectStandardOutput (Join-Path $logDir 'fastsd.log') `
      -RedirectStandardError (Join-Path $logDir 'fastsd-error.log') `
      -WindowStyle Hidden
  } finally {
    $env:Path = $oldPath
  }
}

if ((Test-Path $ollamaExecutable) -and -not (Test-HttpReady $ollamaUrl)) {
  Write-Host 'Starting Ollama for the AI slideshow prompt model...' -ForegroundColor Magenta
  Start-Process -FilePath $ollamaExecutable -ArgumentList 'serve' -WindowStyle Hidden
}

$webReady = Wait-HttpReady $webUrl 30
$fastSdReady = Wait-HttpReady $fastSdUrl 90
$ollamaReady = Wait-HttpReady $ollamaUrl 20

if (-not $webReady) { Write-Warning "The player did not respond at $webUrl. Check data\logs\server-error.log." }
if ((Test-Path $fastSdPython) -and -not $fastSdReady) { Write-Warning "FastSD did not respond yet. Check data\logs\fastsd-error.log." }

if (-not $NoBrowser) {
  Start-Process $webUrl
}

Write-Host "Haunt Generator: $webUrl" -ForegroundColor Green
if ($fastSdReady) { Write-Host "FastSD CPU: ready" -ForegroundColor Green }
elseif (Test-Path $fastSdPython) { Write-Host "FastSD CPU: still starting or unavailable; see data\logs" -ForegroundColor Yellow }
else { Write-Host "FastSD CPU: not installed; run setup-fast-sd.ps1" -ForegroundColor Yellow }
if ($ollamaReady) { Write-Host 'Ollama: ready (the prompt model must still be downloaded once with setup-llm.ps1)' -ForegroundColor Green }
else { Write-Host 'Ollama: unavailable; run setup-llm.ps1 after installing Ollama' -ForegroundColor Yellow }
