# Run ClodPet from source
# Run with: powershell -ExecutionPolicy Bypass -File scripts/run.ps1 [options] [-- npm-args]

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "utils.ps1")
. (Join-Path $PSScriptRoot "script-options.ps1")

function Show-Usage {
    Write-Host "Usage: powershell -ExecutionPolicy Bypass -File scripts/run.ps1 [options] [-- npm-args]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -b, --build    Run build.ps1 before starting"
    Write-Host "  -d, --debug    Enable debug logging (sets VERBOSE=true and NODE_ENV=development)"
    Write-Host "  -h, --help     Show this help"
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/run.ps1 --debug"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$appDir = Join-Path $repoRoot "app"
$settingsPath = Join-Path $env:APPDATA "clod-pet-settings.json"

$runOptions = Get-ClodPetRunOptions -Arguments $Arguments
$build = $runOptions.Build
$debug = $runOptions.Debug
$passthroughArgs = $runOptions.PassthroughArgs

foreach ($arg in $Arguments) {
    switch ($arg) {
        "-h" { Show-Usage; exit 0 }
        "--help" { Show-Usage; exit 0 }
    }
}

Write-Header "Running ClodPet"

if ($build) {
    Write-Info "Build flag set, running build.ps1..."
    $buildScript = Join-Path $scriptDir "build.ps1"
    if (-not (Test-Path $buildScript)) {
        Write-Error "build.ps1 not found at $buildScript"
        Show-FailureSheep "run failed!"
        exit 1
    }
    & $buildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "build.ps1 failed with exit code $LASTEXITCODE"
        Show-FailureSheep "run failed!"
        exit $LASTEXITCODE
    }
    Write-Success "Build completed"
}

if ($debug) {
    Write-Info "Debug mode enabled"
    $env:VERBOSE = "true"
    $env:NODE_ENV = "development"
    $env:CLOD_PET_BUILD_MODE = "debug"
}

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Error "Go is not installed or not in PATH"
    Show-FailureSheep "run failed!"
    exit 1
}

if (-not (Test-CommandExists "npm")) {
    Write-Error "npm is not installed or not in PATH"
    Show-FailureSheep "run failed!"
    exit 1
}
Write-Success "Required tools found"

if (-not (Test-Path $appDir)) {
    Write-Error "App directory not found: $appDir"
    Show-FailureSheep "run failed!"
    exit 1
}

Push-Location $appDir
try {
    $tscShim = Join-Path $appDir "node_modules\.bin\tsc.cmd"
    $needsInstall = (-not (Test-Path "node_modules")) -or (-not (Test-Path $tscShim))

    if ($needsInstall) {
        if (-not (Test-Path "node_modules")) {
            Write-Info "Installing app dependencies..."
        } else {
            Write-Warn "App dependencies look incomplete; reinstalling..."
        }

        if (Test-Path "package-lock.json") {
            npm ci --loglevel=error
        } else {
            npm install --loglevel=error
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install app dependencies"
            Show-FailureSheep "run failed!"
            exit 1
        }
        Write-Success "Dependencies installed"
    } else {
        Write-Warn "Skipping dependency install (node_modules exists)"
    }

    if (-not $env:SETTINGS_PATH) {
        $env:SETTINGS_PATH = $settingsPath
    }

    if (-not $env:CLOD_PET_INSTALL_ROOT) {
        $env:CLOD_PET_INSTALL_ROOT = Join-Path $appDir "dist"
    }

    $distMain = Join-Path $appDir "dist\src\main\main.js"
    $electronCmd = Join-Path $appDir "node_modules\.bin\electron.cmd"
    if (-not (Test-Path $distMain)) {
        Write-Error "Built app not found at $distMain. Run scripts/build.ps1 first."
        Show-FailureSheep "run failed!"
        exit 1
    }
    if (-not (Test-Path $electronCmd)) {
        Write-Error "Electron executable not found at $electronCmd. Reinstall app dependencies."
        Show-FailureSheep "run failed!"
        exit 1
    }

    Write-Info "Starting Electron app..."
    & $electronCmd --no-sandbox "." @passthroughArgs
    $exit = $LASTEXITCODE
    if ($exit -ne 0) {
        Show-FailureSheep "app exited with errors!"
    }
    exit $exit
}
finally {
    Pop-Location
}
