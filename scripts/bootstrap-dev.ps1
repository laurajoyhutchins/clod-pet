# Local development bootstrap. This script does not install certificates,
# modify Defender, request elevation, or package release artifacts.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "utils.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "app"

if (-not (Test-CommandExists "go")) { throw "Go is required." }
if (-not (Test-CommandExists "npm")) { throw "npm is required." }
if (-not (Test-Path (Join-Path $appDir "package-lock.json") -PathType Leaf)) {
    throw "package-lock.json is required for deterministic dependency installation."
}

Push-Location $appDir
try {
    & npm ci --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

    & npm run build:ts
    if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed." }
} finally {
    Pop-Location
}

Push-Location (Join-Path $repoRoot "backend")
try {
    & go test ./...
    if ($LASTEXITCODE -ne 0) { throw "Go tests failed." }
} finally {
    Pop-Location
}

Write-Success "Development bootstrap completed. Use 'cd app; npm run dev' to start the watch workflow."
