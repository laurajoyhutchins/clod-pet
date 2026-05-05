# Run all backend benchmarks and generate a summary report
# Run with: powershell -ExecutionPolicy Bypass -File scripts/run-benchmarks.ps1

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "utils.ps1")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$benchResultsDir = Join-Path $repoRoot "bench-results"

Write-Header "Running all backend benchmarks"

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Error "Go is not installed or not in PATH"
    Show-FailureSheep "benchmarks failed!"
    exit 1
}

if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found: $backendDir"
    Show-FailureSheep "benchmarks failed!"
    exit 1
}

# Create output directory
if (-not (Test-Path $benchResultsDir)) {
    New-Item -ItemType Directory -Path $benchResultsDir | Out-Null
}

$packages = @(
    @{ Name = "engine"; Path = "./internal/engine/..." },
    @{ Name = "expression"; Path = "./internal/expression/..." },
    @{ Name = "pet"; Path = "./internal/pet/..." },
    @{ Name = "ipc"; Path = "./internal/ipc/..." },
    @{ Name = "service"; Path = "./internal/service/..." },
    @{ Name = "llm"; Path = "./internal/llm/..." }
)

Push-Location $backendDir
try {
    foreach ($pkg in $packages) {
        Write-Host ""
        Write-Host "=== $($pkg.Name) Benchmarks ===" -ForegroundColor Cyan
        $outputPath = Join-Path $benchResultsDir "$($pkg.Name).txt"
        
        go test -bench=. -benchtime=3s -count=3 $($pkg.Path) | Tee-Object -FilePath $outputPath | Where-Object { $_ -match "^(Benchmark|ns/op)" }
        if ($LASTEXITCODE -ne 0) {
            Show-FailureSheep "benchmarks failed!"
            exit $LASTEXITCODE
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host ("=" * 42) -ForegroundColor Cyan
Write-Info "Benchmark results saved to $benchResultsDir"
Show-SuccessSheep "benchmarks completed!"
