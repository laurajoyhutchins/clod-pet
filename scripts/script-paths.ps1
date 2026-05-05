# ClodPet PowerShell path and command helpers.
# These functions are safe to dot-source from Pester tests.

function Get-ClodPetBuildPaths {
    param(
        [string]$RepoRoot,
        [string]$BackendOutput = "clod-pet-backend"
    )

    $backendDir = Join-Path $RepoRoot "backend"
    $appDir = Join-Path $RepoRoot "app"

    [pscustomobject]@{
        RepoRoot          = $RepoRoot
        BackendDir        = $backendDir
        BackendBuildScript = Join-Path $backendDir "build.ps1"
        AppDir            = $appDir
        BackendOutput     = $BackendOutput
        BackendBinaryName  = "$BackendOutput.exe"
    }
}

function Get-ClodPetInstallPaths {
    param(
        [string]$RepoRoot,
        [string]$AppData,
        [string]$Temp,
        [string]$BackendOutput = "clod-pet-backend"
    )

    $backendDir = Join-Path $RepoRoot "backend"
    $appDir = Join-Path $RepoRoot "app"
    $backendBinDir = Join-Path $backendDir "bin"
    $distDir = Join-Path $RepoRoot "dist"
    $settingsPath = Join-Path $AppData "clod-pet-settings.json"

    [pscustomobject]@{
        RepoRoot               = $RepoRoot
        BackendDir             = $backendDir
        BackendBuildScript     = Join-Path $backendDir "build.ps1"
        BackendBinDir          = $backendBinDir
        AppDir                 = $appDir
        DistDir                = $distDir
        LogFile                = Join-Path $Temp "clodpet-install.log"
        BackendOutput          = $BackendOutput
        BinaryPath             = Join-Path $backendBinDir "$BackendOutput.exe"
        SettingsPath           = $settingsPath
        ShortcutDir            = Join-Path $AppData "Microsoft\Windows\Start Menu\Programs"
        ShortcutPath           = Join-Path (Join-Path $AppData "Microsoft\Windows\Start Menu\Programs") "ClodPet.lnk"
        WrapperPath            = Join-Path $RepoRoot "clod-pet.cmd"
        InstalledExeFallback   = Join-Path $appDir "node_modules\.bin\electron.cmd"
        ElectronIconPath       = Join-Path $appDir "assets\icon.png"
        DefaultPetsDir         = Join-Path $RepoRoot "pets"
    }
}

function Get-ClodPetUninstallPaths {
    param(
        [string]$RepoRoot,
        [string]$AppData,
        [string]$BackendOutput = "clod-pet-backend"
    )

    $backendDir = Join-Path $RepoRoot "backend"
    $backendBinDir = Join-Path $backendDir "bin"

    [pscustomobject]@{
        RepoRoot            = $RepoRoot
        BackendDir          = $backendDir
        BackendBinDir       = $backendBinDir
        BackendOutput       = $BackendOutput
        ShortcutPath        = Join-Path $AppData "Microsoft\Windows\Start Menu\Programs\ClodPet.lnk"
        SettingsPath        = Join-Path $AppData "clod-pet-settings.json"
        WrapperPath         = Join-Path $RepoRoot "clod-pet.cmd"
        BackendExeBinPath   = Join-Path $backendBinDir "$BackendOutput.exe"
        BackendExeRepoPath  = Join-Path $backendDir "$BackendOutput.exe"
    }
}

function Get-ClodPetNpmInstallCommand {
    param(
        [bool]$HasPackageLock
    )

    if ($HasPackageLock) {
        return @("ci", "--loglevel=error")
    }

    return @("install", "--loglevel=error")
}

function Get-ClodPetDefaultSettings {
    param(
        [string]$RepoRoot,
        [string]$SettingsPath
    )

    [pscustomobject]@{
        PETS_DIR      = Join-Path $RepoRoot "pets"
        PORT          = 8080
        SETTINGS_PATH = $SettingsPath
    }
}
