$scriptRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $scriptRoot "script-paths.ps1")

Describe "script-paths.ps1" {
    It "builds the expected build paths" {
        $result = Get-ClodPetBuildPaths -RepoRoot "C:\repo" -BackendOutput "demo-backend"

        $result.RepoRoot | Should Be "C:\repo"
        $result.BackendDir | Should Be "C:\repo\backend"
        $result.BackendBuildScript | Should Be "C:\repo\backend\build.ps1"
        $result.AppDir | Should Be "C:\repo\app"
        $result.BackendOutput | Should Be "demo-backend"
        $result.BackendBinaryName | Should Be "demo-backend.exe"
    }

    It "builds the expected install paths" {
        $result = Get-ClodPetInstallPaths -RepoRoot "C:\repo" -AppData "C:\Users\Laura\AppData\Roaming" -Temp "C:\Temp" -BackendOutput "demo-backend"

        $result.BackendBinDir | Should Be "C:\repo\backend\bin"
        $result.DistDir | Should Be "C:\repo\dist"
        $result.LogFile | Should Be "C:\Temp\clodpet-install.log"
        $result.BinaryPath | Should Be "C:\repo\backend\bin\demo-backend.exe"
        $result.SettingsPath | Should Be "C:\Users\Laura\AppData\Roaming\clod-pet-settings.json"
        $result.ShortcutPath | Should Be "C:\Users\Laura\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\ClodPet.lnk"
        $result.WrapperPath | Should Be "C:\repo\clod-pet.cmd"
        $result.InstalledExeFallback | Should Be "C:\repo\app\node_modules\.bin\electron.cmd"
        $result.DefaultPetsDir | Should Be "C:\repo\pets"
    }

    It "builds the expected uninstall paths" {
        $result = Get-ClodPetUninstallPaths -RepoRoot "C:\repo" -AppData "C:\Users\Laura\AppData\Roaming" -BackendOutput "demo-backend"

        $result.BackendBinDir | Should Be "C:\repo\backend\bin"
        $result.ShortcutPath | Should Be "C:\Users\Laura\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\ClodPet.lnk"
        $result.SettingsPath | Should Be "C:\Users\Laura\AppData\Roaming\clod-pet-settings.json"
        $result.WrapperPath | Should Be "C:\repo\clod-pet.cmd"
        $result.BackendExeBinPath | Should Be "C:\repo\backend\bin\demo-backend.exe"
        $result.BackendExeRepoPath | Should Be "C:\repo\backend\demo-backend.exe"
    }

    It "selects the correct npm install command" {
        (Get-ClodPetNpmInstallCommand -HasPackageLock $true) | Should Be @("ci", "--loglevel=error")
        (Get-ClodPetNpmInstallCommand -HasPackageLock $false) | Should Be @("install", "--loglevel=error")
    }

    It "builds the default settings object" {
        $result = Get-ClodPetDefaultSettings -RepoRoot "C:\repo" -SettingsPath "C:\Users\Laura\AppData\Roaming\clod-pet-settings.json"

        $result.PETS_DIR | Should Be "C:\repo\pets"
        $result.PORT | Should Be 8080
        $result.SETTINGS_PATH | Should Be "C:\Users\Laura\AppData\Roaming\clod-pet-settings.json"
    }
}
