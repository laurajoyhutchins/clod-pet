# Scripts Reference

Clod Pet provides PowerShell scripts for Windows and shell scripts for Linux/macOS build and test workflows.

## Available Scripts

| Script | Description |
|--------|-------------|
| `install.ps1` | Full installation with code signing, Defender exclusions, and shortcuts |
| `build.ps1` | Quick rebuild of backend and app dependencies |
| `test.ps1` | Run test suites (backend, app, E2E) |
| `uninstall.ps1` | Clean removal of installed components |
| `build.sh` | Linux/macOS build for the Go backend and TypeScript app |
| `test.sh` | Linux/macOS test runner for backend, app, and optional E2E tests |

---

## install.ps1

Full installation script that sets up Clod Pet for development or production use.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

**What it does:**
1. Creates a self-signed code-signing certificate (for development)
2. Builds the Go backend executable
3. Signs the backend executable (requires Windows SDK `signtool.exe`)
4. Adds Windows Defender exclusion for the backend directory
5. Installs app npm dependencies
6. Builds Electron app (if `electron-builder` is available)
7. Creates Start Menu shortcut
8. Writes default settings to `%APPDATA%\clod-pet-settings.json`
9. Creates `clod-pet.cmd` wrapper in repo root

**Output:** Log file saved to `%TEMP%\clodpet-install.log`

---

## build.ps1

Quick build script for rebuilding the backend and installing app dependencies.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

**What it does:**
1. Builds Go backend to `backend/clod-pet-backend.exe`
2. Installs/updates app npm dependencies

The app npm scripts run the TypeScript compiler before launching or testing:

| npm script | Description |
|------------|-------------|
| `npm run build:ts` | Compile Electron/main/preload TypeScript and browser-script TypeScript |
| `npm start` | Compile TypeScript, then launch Electron |
| `npm run dev` | Compile TypeScript, then launch Electron with `NODE_ENV=development` |
| `npm test` | Compile TypeScript, then run app unit tests |
| `npm run test:e2e` | Run app E2E tests that spawn the Go backend |

---

## test.ps1

Comprehensive test runner for backend (Go) and app (Jest) test suites.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1 [backend|app|e2e|all]
```

**Options:**
- No arguments: runs backend + app unit tests
- `backend`: runs only Go backend tests with coverage
- `app`: runs only Jest unit tests
- `e2e`: runs end-to-end tests
- `all`: runs all test suites including E2E

**Example:**
```powershell
# Run only backend tests
powershell -ExecutionPolicy Bypass -File scripts/test.ps1 backend

# Run everything
powershell -ExecutionPolicy Bypass -File scripts/test.ps1 all
```

**Output:** Log file saved to `%TEMP%\clodpet-test.log`

---

## build.sh and test.sh

Unix-like systems can use the shell scripts from the repo root.

**Usage:**
```bash
scripts/build.sh
scripts/test.sh [backend|app|e2e|all]
```

Sound playback runs in Electron/Chromium, so Unix backend builds do not need native audio development headers.

---

## uninstall.ps1

Removes Clod Pet shortcuts, settings, and generated files.

**Usage:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1
```

**What it removes:**
- Start Menu shortcut
- Settings file (`%APPDATA%\clod-pet-settings.json`)
- Wrapper script (`clod-pet.cmd`)
- Backend executable
- Self-signed certificate (optional)
- Windows Defender exclusion (optional)

**Note:** Node modules and pets folder are not removed. To fully clean up, delete the repo directory.

---

## Troubleshooting

### "Windows protected your PC" SmartScreen prompt

To avoid this prompt, either:
1. Install the Windows SDK and ensure `signtool.exe` is in PATH
2. Run PowerShell as Administrator so the script can add Defender exclusions

### Missing signtool.exe

Download and install the Windows SDK:
https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

### Permission errors

Some operations (like adding Defender exclusions) require administrator privileges. Run PowerShell as Administrator.
