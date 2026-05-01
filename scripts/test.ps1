# ClodPet Test Script
# Run with: powershell -ExecutionPolicy Bypass -File scripts/test.ps1

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$appDir = Join-Path $repoRoot "app"
$logFile = Join-Path $env:TEMP "clodpet-test.log"

function Log($msg) {
    $timestamp = Get-Date -Format "o"
    $line = "$timestamp $msg"
    Write-Host $line
    $line | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Write-Section($title) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Test-Backend {
    Write-Section "Running Backend Go Tests"

    if (-not (Test-Path $backendDir)) {
        Write-Host "Backend directory not found: $backendDir" -ForegroundColor Red
        Log "Backend tests: SKIPPED (directory not found)"
        return @{ ExitCode = 1 }
    }

    Push-Location $backendDir

    Log "Starting Go backend tests..."

    $output = go test -v -cover ./... 2>&1
    $exitCode = $LASTEXITCODE

    $output | ForEach-Object { Write-Host $_ }

    $passed = ($output | Select-String "PASS:" | Measure-Object).Count
    $failed = ($output | Select-String "FAIL:" | Measure-Object).Count

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "All backend tests passed!" -ForegroundColor Green
        Log "Backend tests: ALL PASSED"
    } else {
        Write-Host ""
        Write-Host "Some backend tests failed!" -ForegroundColor Red
        Log "Backend tests: FAILED"
    }

    Pop-Location

    return @{
        Passed = $passed
        Failed = $failed
        ExitCode = $exitCode
    }
}

function Test-App {
    Write-Section "Running App Jest Tests"

    if (-not (Test-Path $appDir)) {
        Write-Host "App directory not found: $appDir" -ForegroundColor Red
        Log "App tests: SKIPPED (directory not found)"
        return @{ ExitCode = 1 }
    }

    Push-Location $appDir

    Log "Starting app tests..."

    $output = npm test -- --verbose 2>&1
    $exitCode = $LASTEXITCODE

    $output | Select-Object -Last 50 | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "All app tests passed!" -ForegroundColor Green
        Log "App tests: ALL PASSED"
    } else {
        Write-Host ""
        Write-Host "Some app tests failed!" -ForegroundColor Red
        Log "App tests: FAILED"
    }

    Pop-Location

    return @{
        ExitCode = $exitCode
    }
}

function Test-AppE2E {
    Write-Section "Running App E2E Tests"

    if (-not (Test-Path $appDir)) {
        Write-Host "App directory not found: $appDir" -ForegroundColor Red
        Log "E2E tests: SKIPPED (directory not found)"
        return @{ ExitCode = 1 }
    }

    Push-Location $appDir

    Log "Starting app E2E tests..."

    $output = npm run test:e2e 2>&1
    $exitCode = $LASTEXITCODE

    $output | Select-Object -Last 50 | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "All E2E tests passed!" -ForegroundColor Green
        Log "E2E tests: ALL PASSED"
    } else {
        Write-Host ""
        Write-Host "Some E2E tests failed!" -ForegroundColor Red
        Log "E2E tests: FAILED"
    }

    Pop-Location

    return @{
        ExitCode = $exitCode
    }
}

function Show-Summary {
    param($backendResult, $appResult, $e2eResult)

    $separator = "=" * 60
    Write-Host ""
    Write-Host $separator -ForegroundColor Yellow
    Write-Host "TEST SUMMARY" -ForegroundColor Yellow
    Write-Host $separator -ForegroundColor Yellow

    if ($backendResult) {
        if ($backendResult.ExitCode -eq 0) {
            Write-Host "Backend Tests:  PASSED" -ForegroundColor Green
        } else {
            Write-Host "Backend Tests:  FAILED" -ForegroundColor Red
        }
    }

    if ($appResult) {
        if ($appResult.ExitCode -eq 0) {
            Write-Host "App Tests: PASSED" -ForegroundColor Green
        } else {
            Write-Host "App Tests: FAILED" -ForegroundColor Red
        }
    }

    if ($e2eResult) {
        if ($e2eResult.ExitCode -eq 0) {
            Write-Host "E2E Tests:      PASSED" -ForegroundColor Green
        } else {
            Write-Host "E2E Tests:      FAILED" -ForegroundColor Red
        }
    }

    Write-Host $separator -ForegroundColor Yellow
    Write-Host "Log saved to: $logFile" -ForegroundColor Cyan
}

if (Test-Path $logFile) { Remove-Item $logFile }

Log "=== Starting ClodPet test suite ==="

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

Show-Summary $backendResult $appResult $e2eResult

$anyFailed = ($backendResult -and $backendResult.ExitCode -ne 0) -or
             ($appResult -and $appResult.ExitCode -ne 0) -or
             ($e2eResult -and $e2eResult.ExitCode -ne 0)

if ($anyFailed) {
    exit 1
} else {
    exit 0
}
