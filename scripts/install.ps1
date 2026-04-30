# ClodPet Install Script
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$distDir = Join-Path $repoRoot "dist"
$logFile = Join-Path $env:TEMP "clodpet-install.log"
$signtool = $null

function Log($msg) {
    $timestamp = Get-Date -Format "o"
    $line = "$timestamp $msg"
    Write-Host $line
    $line | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

Log "=== Starting ClodPet install ==="
Log "Repo root: $repoRoot"

# 1 Create self-signed code-signing cert (dev)
Log "Checking for code-signing certificate..."
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.Subject -like "*ClodPet*" -and $_.EnhancedKeyUsageList.FriendlyName -contains "Code Signing"
} | Select-Object -First 1

if (-not $cert) {
    Log "Creating self-signed code-signing cert for development..."
    try {
        $cert = New-SelfSignedCertificate `
            -Type CodeSigningCert `
            -Subject "CN=ClodPet Dev" `
            -KeyUsage DigitalSignature `
            -FriendlyName "ClodPet Dev Cert" `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -NotAfter (Get-Date).AddYears(5)
        Log "Certificate created: $($cert.Thumbprint)"
    }
    catch {
        Log "Failed to create certificate: $_"
        Log "Continuing without signing - you may see execution prompts"
    }
}
else {
    Log "Using existing certificate: $($cert.FriendlyName)"
}

# 2 Build Go backend
Log "Building Go backend..."
if (-not (Test-CommandExists "go")) {
    Log "ERROR: Go is not installed or not in PATH. Please install Go from https://golang.org/dl/"
    exit 1
}

$binaryPath = Join-Path $backendDir "clod-pet-backend.exe"
Push-Location $backendDir
try {
    go build -o clod-pet-backend.exe .
    Log "Backend built: $binaryPath"
}
catch {
    Log "ERROR: Failed to build backend: $_"
    Pop-Location
    exit 1
}
Pop-Location

# 3 Sign the backend executable
if ($cert) {
    Log "Signing backend executable..."
    $signtool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
    if ($signtool) {
        signtool sign /fd SHA256 /a /s My /n "ClodPet Dev Cert" $binaryPath
        Log "Backend signed successfully"
    }
    else {
        Log "WARNING: signtool.exe not found - skipping signing"
        Log "Install Windows SDK for signtool: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    }
}

# 4 Add Windows Defender exclusion for backend folder
Log "Adding Windows Defender exclusion for backend directory..."
try {
    Add-MpPreference -ExclusionPath $backendDir -ErrorAction Stop
    Log "Defender exclusion added for: $backendDir"
}
catch {
    Log "WARNING: Could not add Defender exclusion (may need admin rights): $_"
}

# 5 Install frontend dependencies
Log "Installing frontend dependencies..."
if (-not (Test-CommandExists "npm")) {
    Log "ERROR: npm is not installed or not in PATH. Please install Node.js from https://nodejs.org/"
    exit 1
}

Push-Location $frontendDir
try {
    npm ci --loglevel=error
    Log "Frontend dependencies installed"
}
catch {
    Log "ERROR: Failed to install frontend dependencies: $_"
    Pop-Location
    exit 1
}
Pop-Location

# 6 Build Electron app (if dist doesn't exist or rebuild requested)
$electronExe = Get-ChildItem $distDir -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $electronExe) {
    Log "Building Electron app..."
    Push-Location $frontendDir
    try {
        # Check if electron-builder is available locally or globally
        $localBuilder = Join-Path $frontendDir "node_modules\.bin\electron-builder.cmd"
        if (Test-Path $localBuilder) {
            & $localBuilder --dir
            Log "Electron app built"
        }
        elseif (Test-CommandExists "electron-builder") {
            electron-builder --dir
            Log "Electron app built"
        }
        else {
            Log "WARNING: electron-builder not found - skipping Electron build"
            Log "Install with: npm install --save-dev electron-builder"
        }
    }
    catch {
        Log "WARNING: Failed to build Electron app: $_"
    }
    Pop-Location
}
else {
    Log "Electron executable found: $($electronExe.FullName)"
}

# 7 Sign Electron executable (if exists)
$electronExe = Get-ChildItem $distDir -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cert -and $electronExe -and $signtool) {
    Log "Signing Electron executable..."
    signtool sign /fd SHA256 /a /s My /n "ClodPet Dev Cert" $electronExe.FullName
    Log "Electron executable signed"
}

# 8 Create Start Menu shortcut
Log "Creating Start Menu shortcut..."
$installedExe = if ($electronExe) { $electronExe.FullName } else {
    # Fallback: point to electron in dev mode
    Join-Path $frontendDir "node_modules\.bin\electron.cmd"
}

$shortcutDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$lnkPath = Join-Path $shortcutDir "ClodPet.lnk"

try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = Split-Path $installedExe
    $shortcut.IconLocation = Join-Path $frontendDir "assets\icon.png"
    $shortcut.Save()
    Log "Start Menu shortcut created: $lnkPath"
}
catch {
    Log "WARNING: Failed to create shortcut: $_"
}

# 9 Write default settings
Log "Writing default settings..."
$settingsPath = Join-Path $env:APPDATA "clod-pet-settings.json"
$settings = @{
    PETS_DIR      = Join-Path $repoRoot "pets"
    PORT          = 8080
    SETTINGS_PATH = $settingsPath
} | ConvertTo-Json -Depth 5

try {
    $settings | Out-File -FilePath $settingsPath -Encoding utf8
    Log "Settings written to: $settingsPath"
}
catch {
    Log "WARNING: Failed to write settings: $_"
}

# 10 Add to PATH (optional, for CLI usage)
$clodpetCmd = Join-Path $repoRoot "clod-pet.cmd"
if (-not (Test-Path $clodpetCmd)) {
    Log "Creating clod-pet.cmd wrapper..."
    $wrapperContent = "@echo off`n`"$installedExe`" %*"
    $wrapperContent | Out-File -FilePath $clodpetCmd -Encoding ascii
    Log "Wrapper created: $clodpetCmd"
}

Log "=== Install complete ==="
Log "Log saved to: $logFile"
Write-Host ""
Write-Host "ClodPet installation complete!" -ForegroundColor Green
Write-Host "   Start Menu shortcut: $lnkPath" -ForegroundColor Cyan
Write-Host "   Backend: $binaryPath" -ForegroundColor Cyan
Write-Host "   Settings: $settingsPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start ClodPet, use the Start Menu shortcut or run:" -ForegroundColor Yellow
Write-Host "  $installedExe" -ForegroundColor White
