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
