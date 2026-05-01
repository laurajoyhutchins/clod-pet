# ClodPet Test Script
# Run with: powershell -ExecutionPolicy Bypass -File scripts/test.ps1 [backend|app|e2e|all]

$ErrorActionPreference = "Continue"

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

function Write-Section($title) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$appDir = Join-Path $repoRoot "app"
$logFile = Join-Path $env:TEMP "clodpet-test.log"

# Initialize log
if (Test-Path $logFile) { Remove-Item $logFile }
$timestamp = Get-Date -Format "o"
"$timestamp === Starting ClodPet test suite ===" | Out-File -FilePath $logFile -Encoding utf8

function Test-Backend {
    Write-Section "Running Backend Go Tests"

    if (-not (Test-Path $backendDir)) {
        Write-Error "Backend directory not found: $backendDir"
        "$timestamp Backend tests: SKIPPED (directory not found)" | Out-File -FilePath $logFile -Append -Encoding utf8
        return @{ ExitCode = 1 }
    }

    Push-Location $backendDir
    Write-Info "Running Go tests..."

    $output = go test -v -cover ./... 2>&1
    $exitCode = $LASTEXITCODE

    # Filter and display test output
    $output | Where-Object { $_ -match "^(=== RUN|--- PASS|--- FAIL|PASS|FAIL|ok|coverage:)" } | ForEach-Object { Write-Host $_ }

    $passed = ($output | Select-String "PASS:" | Measure-Object).Count
    $failed = ($output | Select-String "FAIL:" | Measure-Object).Count

    if ($exitCode -eq 0) {
        Write-Success "All backend tests passed!"
        "$timestamp Backend tests: ALL PASSED" | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        Write-Error "Some backend tests failed!"
        "$timestamp Backend tests: FAILED" | Out-File -FilePath $logFile -Append -Encoding utf8
    }

    Pop-Location

    return @{
        Passed   = $passed
        Failed   = $failed
        ExitCode = $exitCode
    }
}

function Test-App {
    Write-Section "Running App Jest Tests"

    if (-not (Test-Path $appDir)) {
        Write-Error "App directory not found: $appDir"
        "$timestamp App tests: SKIPPED (directory not found)" | Out-File -FilePath $logFile -Append -Encoding utf8
        return @{ ExitCode = 1 }
    }

    Push-Location $appDir
    Write-Info "Running Jest tests..."

    $output = npm test -- --verbose 2>&1
    $exitCode = $LASTEXITCODE

    # Display last 50 lines of output
    $output | Select-Object -Last 50 | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        Write-Success "All app tests passed!"
        "$timestamp App tests: ALL PASSED" | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        Write-Error "Some app tests failed!"
        "$timestamp App tests: FAILED" | Out-File -FilePath $logFile -Append -Encoding utf8
    }

    Pop-Location

    return @{
        ExitCode = $exitCode
    }
}

function Test-AppE2E {
    Write-Section "Running App E2E Tests"

    if (-not (Test-Path $appDir)) {
        Write-Error "App directory not found: $appDir"
        "$timestamp E2E tests: SKIPPED (directory not found)" | Out-File -FilePath $logFile -Append -Encoding utf8
        return @{ ExitCode = 1 }
    }

    Push-Location $appDir
    Write-Info "Running E2E tests..."

    $output = npm run test:e2e 2>&1
    $exitCode = $LASTEXITCODE

    # Display last 50 lines of output
    $output | Select-Object -Last 50 | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        Write-Success "All E2E tests passed!"
        "$timestamp E2E tests: ALL PASSED" | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        Write-Error "Some E2E tests failed!"
        "$timestamp E2E tests: FAILED" | Out-File -FilePath $logFile -Append -Encoding utf8
    }

    Pop-Location

    return @{
        ExitCode = $exitCode
    }
}

# Parse arguments
$runBackend = $true
$runApp = $true
$runE2E = $false

if ($args.Count -gt 0) {
    $runBackend = $false
    $runApp = $false
    $runE2E = $false

    foreach ($arg in $args) {
        switch ($arg.ToLower()) {
            "backend" { $runBackend = $true }
            "app" { $runApp = $true }
            "e2e" { $runE2E = $true }
            "all" {
                $runBackend = $true
                $runApp = $true
                $runE2E = $true
            }
        }
    }
}

# Run tests
$backendResult = $null
$appResult = $null
$e2eResult = $null

if ($runBackend) {
    $backendResult = Test-Backend
}

if ($runApp) {
    $appResult = Test-App
}

if ($runE2E) {
    $e2eResult = Test-AppE2E
}

# Show summary
Write-Section "Test Summary"

if ($backendResult) {
    if ($backendResult.ExitCode -eq 0) {
        Write-Success "Backend Tests: PASSED"
    } else {
        Write-Error "Backend Tests: FAILED"
    }
}

if ($appResult) {
    if ($appResult.ExitCode -eq 0) {
        Write-Success "App Tests:     PASSED"
    } else {
        Write-Error "App Tests:     FAILED"
    }
}

if ($e2eResult) {
    if ($e2eResult.ExitCode -eq 0) {
        Write-Success "E2E Tests:     PASSED"
    } else {
        Write-Error "E2E Tests:     FAILED"
    }
}

Write-Host ""
Write-Warn "Log saved to: $logFile"

# Exit with appropriate code
$anyFailed = ($backendResult -and $backendResult.ExitCode -ne 0) -or
             ($appResult -and $appResult.ExitCode -ne 0) -or
             ($e2eResult -and $e2eResult.ExitCode -ne 0)

if ($anyFailed) {
    exit 1
} else {
    exit 0
}
