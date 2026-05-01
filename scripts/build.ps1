# Quick build script - rebuilds backend and app
# Run with: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"

# Helper functions for consistent output
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$backendBuildScript = Join-Path $backendDir "build.ps1"
$appDir = Join-Path $repoRoot "app"
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }

Write-Header "Building ClodPet"

# Check required tools
Write-Info "Checking required tools..."
if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Error "Go is not installed or not in PATH"
    exit 1
}
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed or not in PATH"
    exit 1
}
Write-Success "Required tools found"

# Close running instances to avoid file locks
Write-Info "Closing running instances..."
$processesToStop = @("electron", "clod-pet-backend")
foreach ($proc in $processesToStop) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
        Write-Warn "Stopping $proc..."
        Stop-Process -Name $proc -Force -ErrorAction SilentlyContinue
    }
}

# Build Go backend
Write-Info "Building Go backend..."
if (Test-Path $backendBuildScript) {
    & $backendBuildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        exit 1
    }
} else {
    Push-Location $backendDir
    go build -o $backendOutput .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        Pop-Location
        exit 1
    }
    Pop-Location
}
Write-Success "Backend built: $backendDir\$backendOutput"

# Build app
Write-Info "Building app..."
Push-Location $appDir

# Install dependencies only if node_modules doesn't exist
if (-not (Test-Path "node_modules")) {
    Write-Info "Installing app dependencies..."
    if (Test-Path "package-lock.json") {
        npm ci --loglevel=error
    } else {
        npm install --loglevel=error
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install app dependencies"
        Pop-Location
        exit 1
    }
    Write-Success "Dependencies installed"
} else {
    Write-Warn "Skipping dependency install (node_modules exists)"
}

# Build TypeScript
Write-Info "Compiling TypeScript..."
npm run build:ts
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript build failed"
    Pop-Location
    exit 1
}
Write-Success "TypeScript build complete"

Pop-Location

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Build complete!                       ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Warn "Backend:  $backendDir\$backendOutput"
Write-Warn "App:      $appDir"
