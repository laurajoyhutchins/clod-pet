# Clod Pet safe Windows source installation.
# Run from a normal user shell with:
#   pwsh -NoProfile -File .\scripts\install.ps1

[CmdletBinding()]
param(
    [string]$AppDataRoot = $env:APPDATA,
    [string]$TempRoot = $env:TEMP,
    [switch]$SkipShortcut
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "utils.ps1")
. (Join-Path $PSScriptRoot "script-paths.ps1")
. (Join-Path $PSScriptRoot "script-options.ps1")
. (Join-Path $PSScriptRoot "install-security.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }
$paths = Get-ClodPetInstallPaths -RepoRoot $repoRoot -AppData $AppDataRoot -Temp $TempRoot -BackendOutput $backendOutput
$buildMode = (Get-ClodPetBuildOptions -Arguments @()).BuildMode

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
$logFile = $paths.LogFile
"$(Get-Date -Format o) install started" | Set-Content -Path $logFile -Encoding utf8

function Add-InstallLog([string]$Message) {
    "$(Get-Date -Format o) $Message" | Add-Content -Path $logFile -Encoding utf8
}

function Assert-Command([string]$Name) {
    if (-not (Test-CommandExists $Name)) {
        throw "$Name is required but was not found in PATH."
    }
}

try {
    Write-Header "Installing Clod Pet from source"
    Write-Info "This installation runs as the current user and does not alter Windows security settings."
    Add-InstallLog "security policy: no elevation, exclusions, certificates, credentials, or process termination"

    Assert-Command "go"
    Assert-Command "npm"

    if (-not (Test-Path $paths.BackendDir -PathType Container)) { throw "Backend source directory is missing." }
    if (-not (Test-Path $paths.AppDir -PathType Container)) { throw "Application source directory is missing." }
    if (-not (Test-Path (Join-Path $paths.AppDir "package-lock.json") -PathType Leaf)) {
        throw "package-lock.json is required for a deterministic source installation."
    }

    Write-Info "Building the Go backend..."
    New-Item -ItemType Directory -Force -Path $paths.BackendBinDir | Out-Null
    if (Test-Path $paths.BackendBuildScript -PathType Leaf) {
        & $paths.BackendBuildScript -BuildMode $buildMode -OutputName $backendOutput
    } else {
        Push-Location $paths.BackendDir
        try {
            $goBuildArgs = Get-ClodPetGoBuildArgs -OutputPath $paths.BinaryPath -BuildMode $buildMode
            & go @goBuildArgs .
            if ($LASTEXITCODE -ne 0) { throw "Go backend build failed." }
        } finally {
            Pop-Location
        }
    }
    if (-not (Test-Path $paths.BinaryPath -PathType Leaf)) { throw "Backend build did not produce the expected executable." }
    Add-InstallLog "backend build completed"

    Write-Info "Installing locked frontend dependencies..."
    Push-Location $paths.AppDir
    try {
        & npm ci --loglevel=error
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

        Write-Info "Building the TypeScript application..."
        & npm run build:ts
        if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed." }
    } finally {
        Pop-Location
    }
    Add-InstallLog "frontend dependency and build steps completed"

    $mainEntry = Join-Path $paths.AppDir "dist\src\main\main.js"
    $electronCommand = Join-Path $paths.AppDir "node_modules\.bin\electron.cmd"
    if (-not (Test-Path $mainEntry -PathType Leaf)) { throw "Application build output is missing." }
    if (-not (Test-Path $electronCommand -PathType Leaf)) { throw "Electron launcher is missing." }

    Write-Info "Creating the source launcher..."
    Get-ClodPetWrapperContent -RepoRoot $repoRoot | Set-Content -Path $paths.WrapperPath -Encoding ascii
    Add-InstallLog "launcher created"

    if (-not $SkipShortcut) {
        Write-Info "Creating a per-user Start Menu shortcut..."
        New-Item -ItemType Directory -Force -Path $paths.ShortcutDir | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($paths.ShortcutPath)
        $shortcut.TargetPath = $env:ComSpec
        $shortcut.Arguments = "/d /c `"$($paths.WrapperPath)`""
        $shortcut.WorkingDirectory = $repoRoot
        if (Test-Path $paths.ElectronIconPath -PathType Leaf) {
            $shortcut.IconLocation = $paths.ElectronIconPath
        }
        $shortcut.Save()
        Add-InstallLog "per-user shortcut created"
    }

    Add-InstallLog "install completed"
    Write-Success "Clod Pet source installation completed."
    Write-Info "Start it with .\clod-pet.cmd or the per-user Start Menu shortcut."
    Write-Info "Existing user settings were not changed."
} catch {
    Add-InstallLog "install failed: $($_.Exception.GetType().Name)"
    Write-Error $_.Exception.Message
    Write-Warn "No Windows security setting was changed. Close any running Clod Pet instance and retry if a build file was locked."
    exit 1
}
