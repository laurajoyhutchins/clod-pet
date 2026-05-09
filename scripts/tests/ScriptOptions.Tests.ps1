$scriptRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $scriptRoot "script-options.ps1")

Describe "script-options.ps1" {
    It "defaults run tests to backend and app" {
        $result = Get-ClodPetTestTargets -Arguments @()

        $result.RunBackend | Should Be $true
        $result.RunApp | Should Be $true
        $result.RunE2E | Should Be $false
    }

    It "enables only the requested test targets" {
        $result = Get-ClodPetTestTargets -Arguments @("backend", "e2e")

        $result.RunBackend | Should Be $true
        $result.RunApp | Should Be $false
        $result.RunE2E | Should Be $true
    }

    It "enables all targets when asked" {
        $result = Get-ClodPetTestTargets -Arguments @("all")

        $result.RunBackend | Should Be $true
        $result.RunApp | Should Be $true
        $result.RunE2E | Should Be $true
    }

    It "parses run options and passthrough arguments" {
        $result = Get-ClodPetRunOptions -Arguments @("-b", "--debug", "--", "--foo", "bar")

        $result.Build | Should Be $true
        $result.Debug | Should Be $true
        $result.PassthroughArgs.Count | Should Be 2
        $result.PassthroughArgs[0] | Should Be "--foo"
        $result.PassthroughArgs[1] | Should Be "bar"
    }

    It "passes unknown run arguments through to npm" {
        $result = Get-ClodPetRunOptions -Arguments @("--inspect", "--foo")

        $result.Build | Should Be $false
        $result.Debug | Should Be $false
        $result.PassthroughArgs.Count | Should Be 2
        $result.PassthroughArgs[0] | Should Be "--inspect"
        $result.PassthroughArgs[1] | Should Be "--foo"
    }

    It "parses backend build mode options" {
        (Get-ClodPetBuildOptions -Arguments @() -DefaultBuildMode "release").BuildMode | Should Be "release"
        (Get-ClodPetBuildOptions -Arguments @("--debug") -DefaultBuildMode "release").BuildMode | Should Be "debug"
        (Get-ClodPetBuildOptions -Arguments @("--release") -DefaultBuildMode "debug").BuildMode | Should Be "release"
    }

    It "builds debug Go arguments with tags and gcflags" {
        $result = Get-ClodPetGoBuildArgs -OutputPath "bin\backend.exe" -BuildMode "debug"

        $result | Should Be @("build", "-o", "bin\backend.exe", "-tags", "debug", "-gcflags", "all=-N -l")
    }

    It "builds release Go arguments with trimpath and stripped symbols" {
        $result = Get-ClodPetGoBuildArgs -OutputPath "bin\backend.exe" -BuildMode "release"

        $result | Should Be @("build", "-o", "bin\backend.exe", "-trimpath", "-ldflags", "-s -w")
    }
}
