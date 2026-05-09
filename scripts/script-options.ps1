# ClodPet PowerShell script option helpers.
# These functions are safe to dot-source from Pester tests.

function Get-ClodPetRunOptions {
    param(
        [string[]]$Arguments
    )

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
            "--" { $stopParsing = $true }
            default { $passthroughArgs += $arg }
        }
    }

    [pscustomobject]@{
        Build          = $build
        Debug          = $debug
        PassthroughArgs = $passthroughArgs
    }
}

function Get-ClodPetBuildOptions {
    param(
        [string[]]$Arguments,
        [string]$DefaultBuildMode = $(if ($env:CLOD_PET_BUILD_MODE) { $env:CLOD_PET_BUILD_MODE } else { "release" })
    )

    $buildMode = $DefaultBuildMode.ToLowerInvariant()
    $help = $false

    foreach ($arg in $Arguments) {
        switch ($arg.ToLowerInvariant()) {
            "--debug" { $buildMode = "debug" }
            "-d" { $buildMode = "debug" }
            "--release" { $buildMode = "release" }
            "-h" { $help = $true }
            "--help" { $help = $true }
            default { throw "Unknown build option: $arg" }
        }
    }

    if ($buildMode -ne "debug" -and $buildMode -ne "release") {
        throw "Invalid build mode: $buildMode"
    }

    [pscustomobject]@{
        BuildMode = $buildMode
        Help      = $help
    }
}

function Get-ClodPetGoBuildArgs {
    param(
        [string]$OutputPath,
        [string]$BuildMode = "release"
    )

    switch ($BuildMode.ToLowerInvariant()) {
        "debug" {
            return @("build", "-o", $OutputPath, "-tags", "debug", "-gcflags", "all=-N -l")
        }
        "release" {
            return @("build", "-o", $OutputPath, "-trimpath", "-ldflags", "-s -w")
        }
        default {
            throw "Invalid build mode: $BuildMode"
        }
    }
}

function Get-ClodPetTestTargets {
    param(
        [string[]]$Arguments
    )

    $runBackend = $true
    $runApp = $true
    $runE2E = $false

    if ($Arguments.Count -gt 0) {
        $runBackend = $false
        $runApp = $false
        $runE2E = $false

        foreach ($arg in $Arguments) {
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

    [pscustomobject]@{
        RunBackend = $runBackend
        RunApp     = $runApp
        RunE2E     = $runE2E
    }
}
