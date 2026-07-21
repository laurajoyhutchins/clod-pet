# DEVELOPMENT ONLY: optionally create and use an untrusted current-user
# self-signed certificate. Never invoke this from install.ps1 or packaging.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string[]]$ArtifactPath,
    [switch]$CreateCertificate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "install-security.ps1")

if (-not (Get-Command signtool.exe -ErrorAction SilentlyContinue)) {
    throw "signtool.exe is required for development signing."
}

$matches = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { Test-ClodPetLegacyDevCertificate $_ })
if ($matches.Count -gt 1) {
    throw "More than one Clod Pet development certificate exists. Run cleanup-dev-signing.ps1 before continuing."
}

$certificate = Select-ClodPetUnambiguousLegacyDevCertificate -Certificates $matches
if ($null -eq $certificate) {
    if (-not $CreateCertificate) {
        throw "No development certificate exists. Re-run with -CreateCertificate to opt in."
    }

    $certificate = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject "CN=ClodPet Dev" `
        -KeyUsage DigitalSignature `
        -FriendlyName "ClodPet Dev Cert" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(1)
}

foreach ($artifact in $ArtifactPath) {
    $resolved = Resolve-Path -LiteralPath $artifact -ErrorAction Stop
    & signtool.exe sign /fd SHA256 /sha1 $certificate.Thumbprint $resolved.Path
    if ($LASTEXITCODE -ne 0) { throw "Development signing failed for one artifact." }
}

Write-Warning "Development signing completed with an untrusted current-user certificate. It was not added to a trust store."
Write-Host "Run scripts\cleanup-dev-signing.ps1 when finished."
