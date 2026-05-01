# ClodPet Install Script
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

# Helper functions for consistent output
function Write-Info($msg) {
    Write-Host "→ $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  • $msg" -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host "✗ $msg" -ForegroundColor Red
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "══ $title ══" -ForegroundColor Blue
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$backendBuildScript = Join-Path $backendDir "build.ps1"
$backendBinDir = Join-Path $backendDir "bin"
$appDir = Join-Path $repoRoot "app"
$distDir = Join-Path $repoRoot "dist"
$logFile = Join-Path $env:TEMP "clodpet-install.log"
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }
$binaryPath = Join-Path $backendBinDir "$backendOutput.exe"

# Initialize log
$timestamp = Get-Date -Format "o"
"$timestamp === Starting ClodPet install ===" | Out-File -FilePath $logFile -Encoding utf8
"$timestamp Repo root: $repoRoot" | Out-File -FilePath $logFile -Append -Encoding utf8

Write-Header "Installing ClodPet"
Write-Info "Log file: $logFile"

# Close running instances to avoid file locks
Write-Info "Closing running instances..."
$processesToStop = @("electron", "clod-pet-backend")
foreach ($proc in $processesToStop) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
        Write-Warn "Stopping $proc..."
        Stop-Process -Name $proc -Force -ErrorAction SilentlyContinue
    }
}

# 1. Check required tools
Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Error "Go is not installed or not in PATH"
    "$timestamp ERROR: Go is not installed or not in PATH" | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 1
}
if (-not (Test-CommandExists "npm")) {
    Write-Error "npm is not installed or not in PATH"
    "$timestamp ERROR: npm is not installed or not in PATH" | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 1
}
Write-Success "Required tools found"

# 2. Create self-signed code-signing cert (dev)
Write-Info "Checking for code-signing certificate..."
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.Subject -like "*ClodPet*" -and $_.EnhancedKeyUsageList.FriendlyName -contains "Code Signing"
} | Select-Object -First 1

if (-not $cert) {
    Write-Warn "Creating self-signed code-signing cert for development..."
    try {
        $cert = New-SelfSignedCertificate `
            -Type CodeSigningCert `
            -Subject "CN=ClodPet Dev" `
            -KeyUsage DigitalSignature `
            -FriendlyName "ClodPet Dev Cert" `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -NotAfter (Get-Date).AddYears(5)
        Write-Success "Certificate created: $($cert.Thumbprint)"
        "$timestamp Certificate created: $($cert.Thumbprint)" | Out-File -FilePath $logFile -Append -Encoding utf8
    }
    catch {
        Write-Warn "Failed to create certificate - continuing without signing"
        "$timestamp Failed to create certificate: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
    }
} else {
    Write-Success "Using existing certificate: $($cert.FriendlyName)"
    "$timestamp Using existing certificate: $($cert.FriendlyName)" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 3. Build Go backend
Write-Info "Building Go backend..."
if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found: $backendDir"
    exit 1
}

New-Item -ItemType Directory -Force -Path $backendBinDir | Out-Null
if (Test-Path $backendBuildScript) {
    & $backendBuildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        exit 1
    }
} else {
    Push-Location $backendDir
    go build -o (Join-Path $backendBinDir $backendOutput) .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        Pop-Location
        exit 1
    }
    Pop-Location
}
Write-Success "Backend built: $binaryPath"
"$timestamp Backend built: $binaryPath" | Out-File -FilePath $logFile -Append -Encoding utf8

# 4. Sign the backend executable
$signtool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
if ($cert -and $signtool) {
    Write-Info "Signing backend executable..."
    signtool sign /fd SHA256 /a /s My /n "ClodPet Dev Cert" $binaryPath
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Backend signed successfully"
        "$timestamp Backend signed successfully" | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        Write-Warn "Backend signing failed - continuing unsigned"
    }
} elseif ($cert) {
    Write-Warn "signtool.exe not found - skipping signing"
    Write-Warn "Install Windows SDK for signtool: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
}

# 5. Add Windows Defender exclusion for backend folder
Write-Info "Adding Windows Defender exclusion..."
try {
    Add-MpPreference -ExclusionPath $backendBinDir -ErrorAction Stop
    Write-Success "Defender exclusion added: $backendBinDir"
    "$timestamp Defender exclusion added: $backendBinDir" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
    Write-Warn "Could not add Defender exclusion (may need admin rights)"
    "$timestamp WARNING: Could not add Defender exclusion: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 6. Install app dependencies
Write-Info "Installing app dependencies..."
if (-not (Test-Path $appDir)) {
    Write-Error "App directory not found: $appDir"
    exit 1
}

Push-Location $appDir
try {
    if (Test-Path "package-lock.json") {
        npm ci --loglevel=error
    } else {
        npm install --loglevel=error
    }
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    Write-Success "Dependencies installed"
    "$timestamp App dependencies installed" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
    Write-Error "Failed to install app dependencies: $_"
    "$timestamp ERROR: Failed to install app dependencies: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
    Pop-Location
    exit 1
}
Pop-Location

# 7. Build Electron app (if dist doesn't exist)
$electronExe = Get-ChildItem $distDir -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $electronExe) {
    Write-Info "Building Electron app..."
    Push-Location $appDir
    try {
        $localBuilder = Join-Path $appDir "node_modules\.bin\electron-builder.cmd"
        if (Test-Path $localBuilder) {
            & $localBuilder --dir
            Write-Success "Electron app built"
            "$timestamp Electron app built" | Out-File -FilePath $logFile -Append -Encoding utf8
        } elseif (Test-CommandExists "electron-builder") {
            electron-builder --dir
            Write-Success "Electron app built"
            "$timestamp Electron app built" | Out-File -FilePath $logFile -Append -Encoding utf8
        } else {
            Write-Warn "electron-builder not found - skipping Electron build"
            Write-Warn "Install with: npm install --save-dev electron-builder"
        }
    }
    catch {
        Write-Warn "Failed to build Electron app: $_"
        "$timestamp WARNING: Failed to build Electron app: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
    }
    Pop-Location
} else {
    Write-Success "Electron executable found: $($electronExe.FullName)"
}

# 8. Sign Electron executable (if exists)
$electronExe = Get-ChildItem $distDir -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cert -and $electronExe -and $signtool) {
    Write-Info "Signing Electron executable..."
    signtool sign /fd SHA256 /a /s My /n "ClodPet Dev Cert" $electronExe.FullName
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Electron executable signed"
        "$timestamp Electron executable signed" | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        Write-Warn "Electron signing failed - continuing unsigned"
    }
}

# 9. Create Start Menu shortcut
Write-Info "Creating Start Menu shortcut..."
$installedExe = if ($electronExe) { $electronExe.FullName } else {
    Join-Path $appDir "node_modules\.bin\electron.cmd"
}

$shortcutDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$lnkPath = Join-Path $shortcutDir "ClodPet.lnk"

try {
    New-Item -ItemType Directory -Force -Path $shortcutDir | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = Split-Path $installedExe
    $shortcut.IconLocation = Join-Path $appDir "assets\icon.png"
    $shortcut.Save()
    Write-Success "Start Menu shortcut created"
    "$timestamp Start Menu shortcut created: $lnkPath" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
    Write-Warn "Failed to create shortcut: $_"
    "$timestamp WARNING: Failed to create shortcut: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 10. Write default settings
Write-Info "Writing default settings..."
$settingsPath = Join-Path $env:APPDATA "clod-pet-settings.json"
$settings = @{
    PETS_DIR      = Join-Path $repoRoot "pets"
    PORT          = 8080
    SETTINGS_PATH = $settingsPath
} | ConvertTo-Json -Depth 5

try {
    $settings | Out-File -FilePath $settingsPath -Encoding utf8
    Write-Success "Settings written: $settingsPath"
    "$timestamp Settings written: $settingsPath" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
    Write-Warn "Failed to write settings: $_"
    "$timestamp WARNING: Failed to write settings: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 11. Create clod-pet.cmd wrapper
$clodpetCmd = Join-Path $repoRoot "clod-pet.cmd"
if (-not (Test-Path $clodpetCmd)) {
    Write-Info "Creating clod-pet.cmd wrapper..."
    $wrapperContent = "@echo off`n`"$installedExe`" %*"
    $wrapperContent | Out-File -FilePath $clodpetCmd -Encoding ascii
    Write-Success "Wrapper created: $clodpetCmd"
    "$timestamp Wrapper created: $clodpetCmd" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# Finalize
"$timestamp === Install complete ===" | Out-File -FilePath $logFile -Append -Encoding utf8

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ClodPet installation complete!       ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Warn "Start Menu: $lnkPath"
Write-Warn "Backend:    $binaryPath"
Write-Warn "Settings:   $settingsPath"
Write-Warn "Log:        $logFile"
Write-Host ""
Write-Host "To start ClodPet, use the Start Menu shortcut or run:" -ForegroundColor Yellow
Write-Host "  $installedExe" -ForegroundColor White
