# ClodPet Uninstall Script
# Run with: powershell -ExecutionPolicy Bypass -File uninstall.ps1

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host "Uninstalling ClodPet..." -ForegroundColor Yellow

# Remove Start Menu shortcut
$shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\ClodPet.lnk"
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "Removed Start Menu shortcut" -ForegroundColor Green
}

# Remove settings file
$settingsPath = Join-Path $env:APPDATA "clod-pet-settings.json"
if (Test-Path $settingsPath) {
    Remove-Item $settingsPath -Force
    Write-Host "Removed settings file" -ForegroundColor Green
}

# Remove wrapper script
$wrapperPath = Join-Path $repoRoot "clod-pet.cmd"
if (Test-Path $wrapperPath) {
    Remove-Item $wrapperPath -Force
    Write-Host "Removed wrapper script" -ForegroundColor Green
}

# Remove backend exe
$backendExe = Join-Path $repoRoot "backend\clod-pet-backend.exe"
if (Test-Path $backendExe) {
    Remove-Item $backendExe -Force
    Write-Host "Removed backend executable" -ForegroundColor Green
}

# Optional: Remove Defender exclusion
try {
    Remove-MpPreference -ExclusionPath (Join-Path $repoRoot "backend") -ErrorAction SilentlyContinue
    Write-Host "Removed Defender exclusion" -ForegroundColor Green
}
catch {
    Write-Host "Could not remove Defender exclusion (may need admin rights)" -ForegroundColor Yellow
}

# Optional: Remove self-signed cert
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.Subject -like "*ClodPet*"
} | Select-Object -First 1
if ($cert) {
    try {
        Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
        Write-Host "Removed self-signed certificate" -ForegroundColor Green
    }
    catch {
        Write-Host "Could not remove certificate (may need admin rights)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "ClodPet uninstalled!" -ForegroundColor Green
Write-Host "Note: Node modules and pets folder were not removed." -ForegroundColor Cyan
Write-Host "To fully clean up, delete: $repoRoot" -ForegroundColor Cyan
