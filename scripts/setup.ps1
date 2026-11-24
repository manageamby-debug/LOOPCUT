$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$pythonCommand = Get-Command python -ErrorAction Stop
& $pythonCommand.Source -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw 'Python 3.10 or newer is required. Install Python, then rerun this script.'
}

$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host 'Creating the project virtual environment...'
    & $pythonCommand.Source -m venv --system-site-packages (Join-Path $projectRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the virtual environment.' }
}

$venvConfig = Join-Path $projectRoot '.venv\pyvenv.cfg'
$venvConfigText = Get-Content -Raw -LiteralPath $venvConfig
if ($venvConfigText -match 'include-system-site-packages = false') {
    $venvConfigText = $venvConfigText -replace 'include-system-site-packages = false', 'include-system-site-packages = true'
    Set-Content -LiteralPath $venvConfig -Value $venvConfigText -Encoding Ascii
}

$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envFile
    Write-Host 'Created .env from .env.example.'
}

$missingModules = & $venvPython -c "import importlib.util; names=['fastapi','uvicorn','sqlalchemy','pydantic_settings','multipart']; print(' '.join(name for name in names if importlib.util.find_spec(name) is None))"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the local Python environment.' }
if (-not [string]::IsNullOrWhiteSpace(($missingModules -join '').Trim())) {
    Write-Host 'Installing the missing local API packages...'
    & $venvPython -m pip install -r (Join-Path $projectRoot 'backend\requirements-local.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Check your internet connection and rerun setup.ps1.' }
} else {
    Write-Host 'The required local API packages are already available.'
}

Write-Host ''
Write-Host 'Local setup is ready. Start the API with:'
Write-Host '  .\scripts\run-api.ps1'
