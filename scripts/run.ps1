# Run ClodPet from source
# Run with: powershell -ExecutionPolicy Bypass -File scripts/run.ps1

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host "→ $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  • $msg" -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host "✗ $msg" -ForegroundColor Red
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "══ $title ══" -ForegroundColor Blue
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$appDir = Join-Path $repoRoot "app"
$settingsPath = Join-Path $env:APPDATA "clod-pet-settings.json"

Write-Header "Running ClodPet"

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Error "Go is not installed or not in PATH"
    exit 1
}

if (-not (Test-CommandExists "npm")) {
    Write-Error "npm is not installed or not in PATH"
    exit 1
}
Write-Success "Required tools found"

if (-not (Test-Path $appDir)) {
    Write-Error "App directory not found: $appDir"
    exit 1
}

Push-Location $appDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installing app dependencies..."
        if (Test-Path "package-lock.json") {
            npm ci --loglevel=error
        } else {
            npm install --loglevel=error
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install app dependencies"
        }
        Write-Success "Dependencies installed"
    } else {
        Write-Warn "Skipping dependency install (node_modules exists)"
    }

    if (-not $env:PETS_DIR) {
        $env:PETS_DIR = Join-Path $repoRoot "pets"
    }

    if (-not $env:SETTINGS_PATH) {
        $env:SETTINGS_PATH = $settingsPath
    }

    Write-Info "Starting Electron app..."
    npm start -- @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
