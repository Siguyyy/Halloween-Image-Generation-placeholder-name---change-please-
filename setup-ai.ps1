param(
  [string]$Python = 'python'
)

& (Join-Path $PSScriptRoot 'setup-fast-sd.ps1') -Python $Python
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'setup-llm.ps1')
exit $LASTEXITCODE
