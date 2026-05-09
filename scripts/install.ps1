# ClodPet Install Script
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "utils.ps1")
. (Join-Path $PSScriptRoot "script-paths.ps1")
. (Join-Path $PSScriptRoot "script-options.ps1")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$installPaths = Get-ClodPetInstallPaths -RepoRoot $repoRoot -AppData $env:APPDATA -Temp $env:TEMP -BackendOutput ($(if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }))
$backendDir = $installPaths.BackendDir
$backendBuildScript = $installPaths.BackendBuildScript
$backendBinDir = $installPaths.BackendBinDir
$appDir = $installPaths.AppDir
$distDir = $installPaths.DistDir
$logFile = $installPaths.LogFile
$backendOutput = $installPaths.BackendOutput
$binaryPath = $installPaths.BinaryPath
$clodpetCmd = $installPaths.WrapperPath
$buildMode = (Get-ClodPetBuildOptions -Arguments @()).BuildMode

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
    Show-FailureSheep "installation failed!"
    exit 1
}
if (-not (Test-CommandExists "npm")) {
    Write-Error "npm is not installed or not in PATH"
    "$timestamp ERROR: npm is not installed or not in PATH" | Out-File -FilePath $logFile -Append -Encoding utf8
    Show-FailureSheep "installation failed!"
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
Write-Info "Building Go backend ($buildMode)..."
if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found: $backendDir"
    Show-FailureSheep "installation failed!"
    exit 1
}

New-Item -ItemType Directory -Force -Path $backendBinDir | Out-Null
if (Test-Path $backendBuildScript) {
    & $backendBuildScript -BuildMode $buildMode -OutputName $backendOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        Show-FailureSheep "installation failed!"
        exit 1
    }
} else {
    Push-Location $backendDir
    $goBuildArgs = Get-ClodPetGoBuildArgs -OutputPath $binaryPath -BuildMode $buildMode
    go @goBuildArgs .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        Show-FailureSheep "installation failed!"
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
    Show-FailureSheep "installation failed!"
    exit 1
}

Push-Location $appDir
try {
    if (Test-Path "package-lock.json") {
        $installCommand = Get-ClodPetNpmInstallCommand -HasPackageLock $true
    } else {
        $installCommand = Get-ClodPetNpmInstallCommand -HasPackageLock $false
    }
    if ($installCommand[0] -eq "ci") {
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
    Show-FailureSheep "installation failed!"
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

$shortcutDir = $installPaths.ShortcutDir
$lnkPath = $installPaths.ShortcutPath

try {
    New-Item -ItemType Directory -Force -Path $shortcutDir | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $env:ComSpec
    $shortcut.Arguments = "/c `"$clodpetCmd`""
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.IconLocation = Join-Path $appDir "assets\icon.png"
    $shortcut.Save()
    Write-Success "Start Menu shortcut created"
    "$timestamp Start Menu shortcut created: $lnkPath" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
    Write-Warn "Failed to create shortcut: $_"
    "$timestamp WARNING: Failed to create shortcut: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 10. Ensure settings location exists
Write-Info "Preparing settings location..."
$settingsPath = $installPaths.SettingsPath
if (Test-Path $settingsPath) {
    Write-Warn "Settings already exist: $settingsPath"
    "$timestamp Settings already exist: $settingsPath" | Out-File -FilePath $logFile -Append -Encoding utf8
}
else {
    Write-Info "Settings will be created on first launch: $settingsPath"
    "$timestamp Settings will be created on first launch: $settingsPath" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 11. Create clod-pet.cmd wrapper
Write-Info "Creating clod-pet.cmd wrapper..."
$wrapperContent = "@echo off`r`nset `"repo_root=%~dp0`"`r`nset `"app_dir=%repo_root%app`"`r`nset `"settings_path=%APPDATA%\clod-pet-settings.json`"`r`nif not defined CLOD_PET_INSTALL_ROOT set `"CLOD_PET_INSTALL_ROOT=%app_dir%\dist`"`r`nif not defined SETTINGS_PATH set `"SETTINGS_PATH=%settings_path%`"`r`nif not exist `"%app_dir%\dist\src\main\main.js`" (`r`n  echo Built app not found at %app_dir%\dist\src\main\main.js. Run scripts\build.ps1 first.& exit /b 1`r`n)`r`nif not exist `"%app_dir%\node_modules\.bin\electron.cmd`" (`r`n  echo Electron executable not found at %app_dir%\node_modules\.bin\electron.cmd. Reinstall app dependencies.& exit /b 1`r`n)`r`ncd /d `"%app_dir%`"`r`ncall `"%app_dir%\node_modules\.bin\electron.cmd`" --no-sandbox . %*"
$wrapperContent | Out-File -FilePath $clodpetCmd -Encoding ascii
Write-Success "Wrapper created: $clodpetCmd"
"$timestamp Wrapper created: $clodpetCmd" | Out-File -FilePath $logFile -Append -Encoding utf8

# Finalize
"$timestamp === Install complete ===" | Out-File -FilePath $logFile -Append -Encoding utf8
Write-Host ""
Write-Host "===============================" -ForegroundColor Green
Write-Host "  ClodPet installation complete!  " -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Warn "Start Menu: $lnkPath"
Write-Warn "Backend:    $binaryPath"
Write-Warn "Settings:   $settingsPath"
Write-Warn "Log:        $logFile"
Write-Host ""
Write-Host "To start ClodPet, use the Start Menu shortcut or run:" -ForegroundColor Yellow
Write-Host "  $clodpetCmd" -ForegroundColor White
