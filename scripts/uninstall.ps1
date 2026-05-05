# ClodPet Uninstall Script
# Run with: powershell -ExecutionPolicy Bypass -File uninstall.ps1

$ErrorActionPreference = "Continue"

. (Join-Path $PSScriptRoot "utils.ps1")
. (Join-Path $PSScriptRoot "script-paths.ps1")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$uninstallPaths = Get-ClodPetUninstallPaths -RepoRoot $repoRoot -AppData $env:APPDATA -BackendOutput ($(if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }))
$backendDir = $uninstallPaths.BackendDir
$backendBinDir = $uninstallPaths.BackendBinDir
$backendOutput = $uninstallPaths.BackendOutput

Write-Header "Uninstalling ClodPet"

# Remove Start Menu shortcut
Write-Info "Removing Start Menu shortcut..."
$shortcutPath = $uninstallPaths.ShortcutPath
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Success "Removed: Start Menu shortcut"
} else {
    Write-Warn "Not found: Start Menu shortcut"
}

# Remove settings file
Write-Info "Removing settings..."
$settingsPath = $uninstallPaths.SettingsPath
if (Test-Path $settingsPath) {
    Remove-Item $settingsPath -Force
    Write-Success "Removed: $settingsPath"
} else {
    Write-Warn "Not found: $settingsPath"
}

# Remove wrapper script
Write-Info "Removing wrapper script..."
$wrapperPath = $uninstallPaths.WrapperPath
if (Test-Path $wrapperPath) {
    Remove-Item $wrapperPath -Force
    Write-Success "Removed: $wrapperPath"
} else {
    Write-Warn "Not found: $wrapperPath"
}

# Remove backend executables
Write-Info "Removing backend executables..."
$backendExecutables = @(
    $uninstallPaths.BackendExeBinPath,
    $uninstallPaths.BackendExeRepoPath
)
foreach ($backendExe in $backendExecutables) {
    if (Test-Path $backendExe) {
        Remove-Item $backendExe -Force
        Write-Success "Removed: $backendExe"
    }
}

# Remove Defender exclusions
Write-Info "Removing Defender exclusions..."
try {
    Remove-MpPreference -ExclusionPath $backendBinDir -ErrorAction SilentlyContinue
    Remove-MpPreference -ExclusionPath $backendDir -ErrorAction SilentlyContinue
    Write-Success "Removed Defender exclusions"
} catch {
    Write-Warn "Could not remove Defender exclusion (may need admin rights)"
}

# Remove self-signed cert
Write-Info "Checking for self-signed certificate..."
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.Subject -like "*ClodPet*"
} | Select-Object -First 1
if ($cert) {
    try {
        Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
        Write-Success "Removed certificate: $($cert.FriendlyName)"
    } catch {
        Write-Warn "Could not remove certificate (may need admin rights)"
    }
}

Write-Host ""
Write-Host "===============================" -ForegroundColor Green
Write-Host "  ClodPet uninstall complete!   " -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host ""
Write-Warn "Note: Node modules and pets folder were not removed."
Write-Warn "To fully clean up, delete: $repoRoot"
