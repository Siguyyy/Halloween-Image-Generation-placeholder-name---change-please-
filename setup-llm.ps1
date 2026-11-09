param(
  [string]$Model = 'qwen2.5:0.5b'
)

$ErrorActionPreference = 'Stop'
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  throw 'Ollama is required for AI slideshow prompt generation. Install it from https://ollama.com/download/windows, then run this script again.'
}

try {
  Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null
} catch {
  Write-Host 'Starting Ollama locally…' -ForegroundColor Cyan
  Start-Process -FilePath $ollama.Source -ArgumentList 'serve' -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    try { Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  }
}

Write-Host "Downloading the small local prompt model: $Model" -ForegroundColor Cyan
& $ollama.Source pull $Model
if ($LASTEXITCODE -ne 0) { throw "Ollama could not download $Model." }

Write-Host "Local prompt model $Model is ready. Start the player with start-all.ps1." -ForegroundColor Green
