# Clod Pet safe Windows source uninstallation.
# Run from a normal user shell with:
#   pwsh -NoProfile -File .\scripts\uninstall.ps1

[CmdletBinding()]
param(
    [string]$AppDataRoot = $env:APPDATA,
    [switch]$RemoveUserData,
    [switch]$SkipLegacySecurityCleanup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "utils.ps1")
. (Join-Path $PSScriptRoot "script-paths.ps1")
. (Join-Path $PSScriptRoot "install-security.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }
$paths = Get-ClodPetUninstallPaths -RepoRoot $repoRoot -AppData $AppDataRoot -BackendOutput $backendOutput

function Remove-ClodPetFile([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path -PathType Leaf)) {
        Write-Info "$Label is already absent."
        return
    }

    Remove-Item -LiteralPath $Path -Force
    if (Test-Path $Path) { throw "Failed to remove $Label." }
    Write-Success "Removed $Label."
}

function Remove-LegacyDefenderExclusion {
    if (-not (Get-Command Get-MpPreference -ErrorAction SilentlyContinue) -or
        -not (Get-Command Remove-MpPreference -ErrorAction SilentlyContinue)) {
        Write-Warn "Windows Defender cmdlets are unavailable; no exclusion cleanup was attempted."
        return
    }

    $configured = @((Get-MpPreference -ErrorAction Stop).ExclusionPath)
    foreach ($candidate in Get-ClodPetLegacyDefenderExclusionCandidates -RepoRoot $repoRoot) {
        $exactMatch = @($configured | Where-Object { [string]::Equals($_, $candidate, [System.StringComparison]::OrdinalIgnoreCase) })
        if ($exactMatch.Count -eq 0) { continue }
        if ($exactMatch.Count -ne 1) {
            throw "Legacy Defender exclusion cleanup was ambiguous; no exclusion was removed."
        }

        try {
            Remove-MpPreference -ExclusionPath $candidate -ErrorAction Stop
            Write-Success "Removed the exact legacy Clod Pet Defender exclusion."
        } catch [System.UnauthorizedAccessException] {
            Write-Warn "A legacy Defender exclusion exists but Windows did not permit removal without elevation. No elevation was requested."
        }
    }
}

function Remove-LegacyDevelopmentCertificate {
    $store = Get-ChildItem Cert:\CurrentUser\My -ErrorAction Stop
    $matches = @($store | Where-Object { Test-ClodPetLegacyDevCertificate $_ })
    if ($matches.Count -eq 0) { return }
    if ($matches.Count -ne 1) {
        throw "Legacy development certificate cleanup was ambiguous; no certificate was removed."
    }

    $certificate = Select-ClodPetUnambiguousLegacyDevCertificate -Certificates $matches
    if ($null -eq $certificate) {
        throw "Legacy development certificate cleanup could not identify one exact certificate."
    }

    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force
    Write-Success "Removed the exact legacy current-user development certificate."
}

try {
    Write-Header "Uninstalling Clod Pet source installation"
    Write-Info "The uninstaller does not terminate processes or request administrator rights."

    Remove-ClodPetFile -Path $paths.ShortcutPath -Label "per-user Start Menu shortcut"
    Remove-ClodPetFile -Path $paths.WrapperPath -Label "source launcher"
    Remove-ClodPetFile -Path $paths.BackendExeBinPath -Label "built backend executable"
    Remove-ClodPetFile -Path $paths.BackendExeRepoPath -Label "legacy backend executable"

    if ($RemoveUserData) {
        Remove-ClodPetFile -Path $paths.SettingsPath -Label "user settings"
    } else {
        Write-Info "User settings were preserved. Use -RemoveUserData to delete them explicitly."
    }

    if (-not $SkipLegacySecurityCleanup) {
        Remove-LegacyDefenderExclusion
        Remove-LegacyDevelopmentCertificate
    }

    Write-Success "Clod Pet source uninstallation completed."
    Write-Info "Dependencies and pet files were preserved. Delete the repository manually to remove source files."
} catch {
    Write-Error $_.Exception.Message
    Write-Warn "Uninstallation stopped without broad cleanup. Resolve the reported item and run the command again."
    exit 1
}
