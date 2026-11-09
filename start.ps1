param(
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js 18 or newer is required. Install it from https://nodejs.org/.'
}

Write-Host "Starting Haunt Generator on port $Port..." -ForegroundColor Magenta
node (Join-Path $PSScriptRoot 'server.js') --host 0.0.0.0 --port $Port
