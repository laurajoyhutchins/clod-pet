# Run Pester tests for the PowerShell scripts in scripts/
# Run with: powershell -ExecutionPolicy Bypass -File scripts/test-scripts.ps1

$ErrorActionPreference = "Stop"

$testsDir = Join-Path $PSScriptRoot "tests"

if (-not (Get-Command Invoke-Pester -ErrorAction SilentlyContinue)) {
    Write-Error "Pester is not installed. Install the Pester PowerShell module to run script tests."
    exit 1
}

Invoke-Pester -Script $testsDir -EnableExit
