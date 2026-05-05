# Quick build script - rebuilds backend and app
# Run with: powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "utils.ps1")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$backendBuildScript = Join-Path $backendDir "build.ps1"
$appDir = Join-Path $repoRoot "app"
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }

Write-Header "Building ClodPet"

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Fail "Go is not installed or not in PATH"
    Show-FailureSheep "build failed!"
    exit 1
}
if (-not (Test-CommandExists "npm")) {
    Write-Fail "npm is not installed or not in PATH"
    Show-FailureSheep "build failed!"
    exit 1
}
Write-Success "Required tools found"

Write-Info "Building Go backend..."
if (Test-Path $backendBuildScript) {
    & $backendBuildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Backend build failed"
        Show-FailureSheep "build failed!"
        exit 1
    }
} else {
    Push-Location $backendDir
    try {
        go build -o $backendOutput .
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Backend build failed"
            Show-FailureSheep "build failed!"
            exit 1
        }
    } finally {
        Pop-Location
    }
}
Write-Success "Backend built: $backendDir\$backendOutput"

Write-Info "Building app..."
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
            Write-Fail "Failed to install app dependencies"
            Show-FailureSheep "build failed!"
            exit 1
        }
        Write-Success "Dependencies installed"
    } else {
        Write-Warn "Skipping dependency install (node_modules exists)"
    }

    Write-Info "Compiling TypeScript..."
    npm run build:ts
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "TypeScript build failed"
        Show-FailureSheep "build failed!"
        exit 1
    }
    Write-Success "TypeScript build complete"
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "===============================" -ForegroundColor Green
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Show-SuccessSheep "build completed successfully!"
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Warn "Backend:  $backendDir\$backendOutput"
Write-Warn "App:      $appDir"
