# Backend-only build helper.
# Run from the backend directory with:
#   powershell -ExecutionPolicy Bypass -File build.ps1 [-BuildMode debug|release]

param(
    [ValidateSet("debug", "release")]
    [string]$BuildMode = $(if ($env:CLOD_PET_BUILD_MODE) { $env:CLOD_PET_BUILD_MODE } else { "release" }),
    [string]$OutputName = $(if ($env:CLOD_PET_BACKEND_OUTPUT) { "$($env:CLOD_PET_BACKEND_OUTPUT).exe" } else { "clod-pet-backend.exe" })
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
. (Join-Path $repoRoot "scripts\script-options.ps1")

$outDir = Join-Path $scriptDir "bin"
if (-not $OutputName.EndsWith(".exe")) {
    $OutputName = "$OutputName.exe"
}
$outExe = Join-Path $outDir $OutputName

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go is not installed or not in PATH" -ForegroundColor Red
    throw "Go is not installed or not in PATH"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $scriptDir
try {
    $goBuildArgs = Get-ClodPetGoBuildArgs -OutputPath $outExe -BuildMode $BuildMode
    go @goBuildArgs .
    Write-Host "Built backend ($BuildMode): $outExe" -ForegroundColor Green
}
finally {
    Pop-Location
}
