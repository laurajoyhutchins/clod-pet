# RELEASE MAINTAINERS ONLY: package and sign release artifacts with a
# pre-existing certificate. This script never creates or imports certificates.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$CertificateThumbprint
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "utils.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "app"
$backendPath = Join-Path $repoRoot "backend\bin\clod-pet-backend.exe"
$builder = Join-Path $appDir "node_modules\.bin\electron-builder.cmd"

if (-not (Get-Command signtool.exe -ErrorAction SilentlyContinue)) { throw "signtool.exe is required." }
if (-not (Test-Path $builder -PathType Leaf)) { throw "electron-builder is required for release packaging." }

$certificate = Get-ChildItem "Cert:\CurrentUser\My\$CertificateThumbprint" -ErrorAction Stop
if ($certificate.HasPrivateKey -ne $true) { throw "The release certificate does not expose a private key to the current user." }

& (Join-Path $PSScriptRoot "install.ps1") -SkipShortcut
if ($LASTEXITCODE -ne 0) { throw "Release build failed." }

& signtool.exe sign /fd SHA256 /sha1 $CertificateThumbprint $backendPath
if ($LASTEXITCODE -ne 0) { throw "Backend signing failed." }

Push-Location $appDir
try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    & $builder --win
    if ($LASTEXITCODE -ne 0) { throw "Electron packaging failed." }
} finally {
    Pop-Location
}

$artifacts = @(Get-ChildItem (Join-Path $appDir "dist") -Filter "*.exe" -Recurse -File)
if ($artifacts.Count -eq 0) { throw "Packaging produced no Windows executable artifacts." }
foreach ($artifact in $artifacts) {
    & signtool.exe sign /fd SHA256 /sha1 $CertificateThumbprint $artifact.FullName
    if ($LASTEXITCODE -ne 0) { throw "Release signing failed for one packaged artifact." }
}

Write-Success "Release packaging and signing completed with the supplied certificate."
