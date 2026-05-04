# Run ClodPet from source
# Run with: powershell -ExecutionPolicy Bypass -File scripts/run.ps1 [options] [-- npm-args]

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host "-> $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "OK $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "!! $msg" -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host "ERROR $msg" -ForegroundColor Red
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "== $title ==" -ForegroundColor Blue
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

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

$build = $false
$debug = $false
$passthroughArgs = @()
$stopParsing = $false

foreach ($arg in $Arguments) {
    if ($stopParsing) {
        $passthroughArgs += $arg
        continue
    }

    switch ($arg) {
        "-b" { $build = $true }
        "--build" { $build = $true }
        "-d" { $debug = $true }
        "--debug" { $debug = $true }
        "-h" { Show-Usage; exit 0 }
        "--help" { Show-Usage; exit 0 }
        "--" { $stopParsing = $true }
        default { $passthroughArgs += $arg }
    }
}

Write-Header "Running ClodPet"

if ($build) {
    Write-Info "Build flag set, running build.ps1..."
    $buildScript = Join-Path $scriptDir "build.ps1"
    if (-not (Test-Path $buildScript)) {
        Write-Error "build.ps1 not found at $buildScript"
        exit 1
    }
    & $buildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "build.ps1 failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Success "Build completed"
}

if ($debug) {
    Write-Info "Debug mode enabled"
    $env:VERBOSE = "true"
    $env:NODE_ENV = "development"
}

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Error "Go is not installed or not in PATH"
    exit 1
}

if (-not (Test-CommandExists "npm")) {
    Write-Error "npm is not installed or not in PATH"
    exit 1
}
Write-Success "Required tools found"

if (-not (Test-Path $appDir)) {
    Write-Error "App directory not found: $appDir"
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
            throw "Failed to install app dependencies"
        }
        Write-Success "Dependencies installed"
    } else {
        Write-Warn "Skipping dependency install (node_modules exists)"
    }

    if (-not $env:PETS_DIR) {
        $env:PETS_DIR = Join-Path $repoRoot "pets"
    }

    if (-not $env:SETTINGS_PATH) {
        $env:SETTINGS_PATH = $settingsPath
    }

    Write-Info "Starting Electron app..."
    if ($passthroughArgs.Count -gt 0) {
        npm start -- @passthroughArgs
    } else {
        npm start
    }
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
