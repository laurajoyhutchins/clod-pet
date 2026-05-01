# Backend-only build helper.
# Run from the backend directory with:
#   powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $scriptDir "bin"
$outExe = Join-Path $outDir "clod-pet-backend.exe"

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go is not installed or not in PATH" -ForegroundColor Red
    throw "Go is not installed or not in PATH"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $scriptDir
try {
    go build -o $outExe .
    Write-Host "Built backend: $outExe" -ForegroundColor Green
}
finally {
    Pop-Location
}
