# DEVELOPMENT ONLY: remove the exact current-user Clod Pet development certificate.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "install-security.ps1")

$matches = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { Test-ClodPetLegacyDevCertificate $_ })
if ($matches.Count -eq 0) {
    Write-Host "No Clod Pet development certificate is present."
    exit 0
}
if ($matches.Count -ne 1) {
    throw "Cleanup is ambiguous because multiple matching development certificates exist. Remove them manually by thumbprint."
}

$certificate = Select-ClodPetUnambiguousLegacyDevCertificate -Certificates $matches
if ($null -eq $certificate) { throw "No unambiguous development certificate was selected." }

Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force
Write-Host "Removed the exact current-user Clod Pet development certificate."
