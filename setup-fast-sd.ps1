param(
  [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
$fastSdRoot = Join-Path $PSScriptRoot 'fastsdcpu'
$fastSdEnv = Join-Path $fastSdRoot 'env'
$fastSdPython = Join-Path $fastSdEnv 'Scripts\python.exe'

if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
  Write-Error 'Python 3.10+ is required. Install it from https://www.python.org/downloads/.'
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing uv, the package manager used by FastSD CPU…' -ForegroundColor Cyan
  & $Python -m pip install --user uv
  $userBase = (& $Python -c "import site; print(site.getuserbase())").Trim()
  $env:Path = "$userBase\Scripts$([IO.Path]::PathSeparator)$env:Path"
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Error 'uv could not be found after installation. Open a new PowerShell window and run this script again.'
}

if (-not (Test-Path (Join-Path $fastSdRoot 'src\app.py'))) {
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("fastsdcpu-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  try {
    $archive = Join-Path $tempRoot 'fastsdcpu.zip'
    Write-Host 'Downloading FastSD CPU…' -ForegroundColor Cyan
    Invoke-WebRequest -Uri 'https://github.com/rupeshs/fastsdcpu/archive/refs/heads/main.zip' -OutFile $archive
    Expand-Archive -Path $archive -DestinationPath $tempRoot
    Move-Item -LiteralPath (Join-Path $tempRoot 'fastsdcpu-main') -Destination $fastSdRoot
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $fastSdPython)) {
  Write-Host 'Creating the FastSD CPU environment and installing its CPU runtime…' -ForegroundColor Cyan
  Push-Location $fastSdRoot
  try {
    & uv venv --python $Python $fastSdEnv
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $fastSdPython)) { throw 'FastSD virtual environment creation failed.' }
    & uv pip install --python $fastSdPython torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
    if ($LASTEXITCODE -ne 0) { throw 'FastSD CPU PyTorch installation failed.' }
    & uv pip install --python $fastSdPython -r (Join-Path $fastSdRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'FastSD CPU dependency installation failed.' }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $fastSdPython)) { throw 'FastSD CPU setup did not create its Python environment.' }

Write-Host 'FastSD CPU is installed. Restart Haunt Generator and use Generate & play.' -ForegroundColor Green
