# Quick build script - rebuilds backend and app
# Run with: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$backendBuildScript = Join-Path $backendDir "build.ps1"
$appDir = Join-Path $repoRoot "app"

Write-Host "Building ClodPet..." -ForegroundColor Cyan

# Close running instances to avoid file locks
Write-Host "Closing running instances..." -ForegroundColor Yellow
$processesToStop = @("electron", "clod-pet-backend")
foreach ($proc in $processesToStop) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
        Write-Host "Stopping $proc..." -ForegroundColor Gray
        Stop-Process -Name $proc -Force -ErrorAction SilentlyContinue
    }
}

# Build Go backend
Write-Host "Building backend..." -ForegroundColor Yellow
try {
    & $backendBuildScript
    Write-Host "Backend built" -ForegroundColor Green
}
catch {
    Write-Host "Backend build failed" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
}

# Install app deps and rebuild
Write-Host "Building app..." -ForegroundColor Yellow
Push-Location $appDir
npm ci --loglevel=error
if ($LASTEXITCODE -eq 0) {
    Write-Host "App dependencies installed" -ForegroundColor Green
} else {
    Write-Host "npm ci failed, trying npm install..." -ForegroundColor Yellow
    npm install --loglevel=error
}

Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
npm run build:ts
if ($LASTEXITCODE -eq 0) {
    Write-Host "App built" -ForegroundColor Green
} else {
    Write-Host "App build failed" -ForegroundColor Red
}
Pop-Location

Write-Host "Done!" -ForegroundColor Green
