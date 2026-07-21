$scriptRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $scriptRoot "install-security.ps1")

Describe "Windows install security policy" {
    It "does not weaken host protections" {
        $policy = Get-ClodPetInstallSecurityPolicy

        $policy.CreatesDefenderExclusion | Should Be $false
        $policy.CreatesCertificate | Should Be $false
        $policy.RequiresAdministrator | Should Be $false
        $policy.ChangesExecutionPolicy | Should Be $false
        $policy.TerminatesProcesses | Should Be $false
        $policy.DisablesElectronSandbox | Should Be $false
        $policy.WritesCredentials | Should Be $false
    }

    It "limits legacy Defender cleanup to the exact historical bin directory" {
        $paths = @(Get-ClodPetLegacyDefenderExclusionCandidates -RepoRoot "C:\repo")

        $paths.Count | Should Be 1
        $paths[0] | Should Be "C:\repo\backend\bin"
    }

    It "selects only one exact current-user development certificate" {
        $codeSigningUsage = [pscustomobject]@{ FriendlyName = "Code Signing" }
        $exact = [pscustomobject]@{
            Subject = "CN=ClodPet Dev"
            Issuer = "CN=ClodPet Dev"
            FriendlyName = "ClodPet Dev Cert"
            EnhancedKeyUsageList = @($codeSigningUsage)
            Thumbprint = "ABC"
        }
        $unrelated = [pscustomobject]@{
            Subject = "CN=ClodPet Production"
            Issuer = "CN=Other CA"
            FriendlyName = "ClodPet"
            EnhancedKeyUsageList = @($codeSigningUsage)
            Thumbprint = "DEF"
        }

        (Select-ClodPetUnambiguousLegacyDevCertificate -Certificates @($exact, $unrelated)).Thumbprint | Should Be "ABC"
        (Select-ClodPetUnambiguousLegacyDevCertificate -Certificates @($exact, $exact)) | Should Be $null
    }

    It "generates a sandboxed wrapper for the exact built backend" {
        $wrapper = Get-ClodPetWrapperContent -RepoRoot "C:\repo"

        $wrapper | Should Not Match "--no-sandbox"
        $wrapper | Should Not Match "ExecutionPolicy"
        $wrapper | Should Match "CLOD_PET_BACKEND_MODE=exe"
        $wrapper | Should Match "backend\\bin\\clod-pet-backend\.exe"
        $wrapper | Should Match "electron\.cmd"
    }

    It "keeps dangerous operations out of the ordinary installer source" {
        $installer = Get-Content (Join-Path $scriptRoot "install.ps1") -Raw

        $installer | Should Not Match "Add-MpPreference"
        $installer | Should Not Match "New-SelfSignedCertificate"
        $installer | Should Not Match "Stop-Process\s+-Name"
        $installer | Should Not Match "--no-sandbox"
        $installer | Should Not Match "ExecutionPolicy\s+Bypass"
    }
}
