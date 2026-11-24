$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw 'The local environment is missing. Run .\scripts\setup.ps1 first.'
}

# Docker-free development defaults. Compose supplies PostgreSQL and Redis instead.
$env:APP_ENV = 'local'
$env:DATABASE_URL = 'sqlite:///./loopcut-local.db'
$env:REDIS_URL = 'memory://'
$env:S3_INTERNAL_ENDPOINT_URL = 'http://localhost:9000'
$env:S3_PUBLIC_ENDPOINT_URL = 'http://localhost:9000'
$env:S3_ACCESS_KEY = 'loopcut-dev'
$env:S3_SECRET_KEY = 'loopcut-dev-secret'
$env:S3_BUCKET = 'loopcut-media'
$env:LOCAL_MEDIA_DIR = (Join-Path $projectRoot 'backend\local_media')

Write-Host 'Starting the local API at http://127.0.0.1:8000'
Write-Host 'Press Ctrl+C to stop it.'
& $venvPython -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload --reload-dir (Join-Path $projectRoot 'backend')
