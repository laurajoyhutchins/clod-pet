# Security-sensitive helpers for the Windows lifecycle scripts.
# This file performs no host mutation and is safe to dot-source from tests.

function Get-ClodPetInstallSecurityPolicy {
    [pscustomobject]@{
        CreatesDefenderExclusion = $false
        CreatesCertificate       = $false
        RequiresAdministrator    = $false
        ChangesExecutionPolicy   = $false
        TerminatesProcesses      = $false
        DisablesElectronSandbox  = $false
        WritesCredentials        = $false
    }
}

function Get-ClodPetLegacyDefenderExclusionCandidates {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    # Historical install.ps1 added only this exact directory. Do not broaden it.
    return @((Join-Path (Join-Path $RepoRoot "backend") "bin"))
}

function Test-ClodPetLegacyDevCertificate {
    param([Parameter(Mandatory = $true)]$Certificate)

    if ($Certificate.Subject -ne "CN=ClodPet Dev") { return $false }
    if ($Certificate.Issuer -ne $Certificate.Subject) { return $false }
    if ($Certificate.FriendlyName -ne "ClodPet Dev Cert") { return $false }

    $usageNames = @($Certificate.EnhancedKeyUsageList | ForEach-Object { $_.FriendlyName })
    return $usageNames -contains "Code Signing"
}

function Select-ClodPetUnambiguousLegacyDevCertificate {
    param([Parameter(Mandatory = $true)][object[]]$Certificates)

    $matches = @($Certificates | Where-Object { Test-ClodPetLegacyDevCertificate $_ })
    if ($matches.Count -eq 1) { return $matches[0] }
    return $null
}

function Get-ClodPetWrapperContent {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    @"
@echo off
setlocal
set "repo_root=$RepoRoot"
set "app_dir=%repo_root%\app"
set "settings_path=%APPDATA%\clod-pet-settings.json"
if not defined CLOD_PET_INSTALL_ROOT set "CLOD_PET_INSTALL_ROOT=%repo_root%"
if not defined CLOD_PET_BACKEND_MODE set "CLOD_PET_BACKEND_MODE=exe"
if not defined SETTINGS_PATH set "SETTINGS_PATH=%settings_path%"
if not exist "%repo_root%\backend\bin\clod-pet-backend.exe" (
  echo Built backend not found. Run scripts\install.ps1 again.
  exit /b 1
)
if not exist "%app_dir%\dist\src\main\main.js" (
  echo Built app not found. Run scripts\install.ps1 again.
  exit /b 1
)
if not exist "%app_dir%\node_modules\.bin\electron.cmd" (
  echo Electron executable not found. Run scripts\install.ps1 again.
  exit /b 1
)
cd /d "%app_dir%"
call "%app_dir%\node_modules\.bin\electron.cmd" . %*
"@
}
