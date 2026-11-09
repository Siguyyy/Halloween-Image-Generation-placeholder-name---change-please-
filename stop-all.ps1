param(
  [switch]$StopOllama
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$serverPattern = [regex]::Escape((Join-Path $root 'server.js'))
$fastSdPattern = [regex]::Escape((Join-Path $root 'fastsdcpu'))

$targets = @(Get-CimInstance Win32_Process | Where-Object {
  ($_.CommandLine -match $serverPattern -and $_.CommandLine -match 'server\.js') -or
  ($_.CommandLine -match $fastSdPattern -and $_.CommandLine -match 'src\\app\.py.*--api')
})

if ($StopOllama) {
  $targets += @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'ollama.exe' -and $_.CommandLine -match '\bserve\b'
  })
}

$stopped = @{}
foreach ($target in $targets) {
  if ($stopped.ContainsKey($target.ProcessId)) { continue }
  try {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
    $stopped[$target.ProcessId] = $true
    Write-Host "Stopped $($target.Name) (PID $($target.ProcessId))." -ForegroundColor Green
  } catch {
    Write-Warning "Could not stop PID $($target.ProcessId): $($_.Exception.Message)"
  }
}

if (-not $stopped.Count) {
  Write-Host 'Haunt Generator and FastSD are not running.' -ForegroundColor Yellow
} elseif (-not $StopOllama) {
  Write-Host 'FastSD and Haunt Generator stopped. Ollama was left running; use -StopOllama to stop its service too.' -ForegroundColor Cyan
}
