# Quick build script - rebuilds backend and frontend
# Run with: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

Write-Host "Building ClodPet..." -ForegroundColor Cyan

# Check for Go
if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Build Go backend
Write-Host "Building backend..." -ForegroundColor Yellow
Push-Location $backendDir
go build -o clod-pet-backend.exe .
if ($LASTEXITCODE -eq 0) {
    Write-Host "Backend built" -ForegroundColor Green
} else {
    Write-Host "Backend build failed" -ForegroundColor Red
}
Pop-Location

# Install frontend deps and rebuild
Write-Host "Building frontend..." -ForegroundColor Yellow
Push-Location $frontendDir
npm ci --loglevel=error
if ($LASTEXITCODE -eq 0) {
    Write-Host "Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "npm ci failed, trying npm install..." -ForegroundColor Yellow
    npm install --loglevel=error
}

Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
npm run build:ts
if ($LASTEXITCODE -eq 0) {
    Write-Host "Frontend built" -ForegroundColor Green
} else {
    Write-Host "Frontend build failed" -ForegroundColor Red
}
Pop-Location

Write-Host "Done!" -ForegroundColor Green
