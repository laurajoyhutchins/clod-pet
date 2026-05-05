$scriptRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $scriptRoot "utils.ps1")

Describe "utils.ps1" {
    It "detects when a command exists" {
        Mock Get-Command { @{ Name = "go" } }

        Test-CommandExists "go" | Should Be $true
    }

    It "detects when a command is missing" {
        Mock Get-Command { $null }

        Test-CommandExists "missing-command" | Should Be $false
    }

    It "formats info messages" {
        Mock Write-Host {}

        Write-Info "hello"

        Assert-MockCalled Write-Host -Exactly 1 -Scope It -ParameterFilter {
            $Object -eq "INFO: hello" -and $ForegroundColor -eq "Cyan"
        }
    }

    It "formats success messages" {
        Mock Write-Host {}

        Write-Success "done"

        Assert-MockCalled Write-Host -Exactly 1 -Scope It -ParameterFilter {
            $Object -eq "SUCCESS: done" -and $ForegroundColor -eq "Green"
        }
    }

    It "formats warning messages" {
        Mock Write-Host {}

        Write-Warn "careful"

        Assert-MockCalled Write-Host -Exactly 1 -Scope It -ParameterFilter {
            $Object -eq "WARN: careful" -and $ForegroundColor -eq "Yellow"
        }
    }

    It "formats header output" {
        Mock Write-Host {}

        Write-Header "Title"

        Assert-MockCalled Write-Host -Exactly 2 -Scope It
    }

    It "formats section output" {
        Mock Write-Host {}

        Write-Section "Section"

        Assert-MockCalled Write-Host -Exactly 4 -Scope It
    }

    It "routes write fail through write error" {
        Mock Write-Error {}

        Write-Fail "boom"

        Assert-MockCalled Write-Error -Exactly 1 -Scope It -ParameterFilter {
            $msg -eq "boom"
        }
    }
}
