# AGENTS.md

## Quick start
```bash
cd frontend && npm install && npm start
```
Compiles the TypeScript frontend, starts Electron, and spawns the Go backend automatically.

## Project structure
- `backend/` — Go animation engine (HTTP API on `:8080`)
- `frontend/` — TypeScript + Electron desktop shell
- `pets/` — Pet definitions (XML sprite sheets)
- `docs/` — MkDocs documentation (Diataxis)

## Commands
| Action | Command |
|--------|---------|
| Install (full) | `powershell -ExecutionPolicy Bypass -File scripts/install.ps1` |
| Quick build | `powershell -ExecutionPolicy Bypass -File scripts/build.ps1` |
| Run tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` |
| Uninstall | `powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1` |
| Frontend dev | `cd frontend && npm run dev` |
| Frontend test | `cd frontend && npm test` |
| Backend run | `cd backend && go run .` |
| Docs serve | `mkdocs serve` |

### Test script options
- `test.ps1` - runs all tests (backend + frontend unit)
- `test.ps1 backend` - run only Go backend tests
- `test.ps1 frontend` - run only Jest unit tests
- `test.ps1 e2e` - run only end-to-end tests
- `test.ps1 all` - run everything including E2E

## Install script features
- Creates self-signed code-signing certificate for development
- Builds Go backend and signs the executable (requires Windows SDK for `signtool`)
- Adds Windows Defender exclusion for backend directory
- Installs frontend npm dependencies
- Builds Electron app (if `electron-builder` is available)
- Creates Start Menu shortcut
- Writes default settings to `%APPDATA%\clod-pet-settings.json`
- Creates `clod-pet.cmd` wrapper in repo root

NOTE: To avoid "Windows protected your PC" SmartScreen prompts, either:
1. Install the Windows SDK and ensure `signtool.exe` is in PATH, or
2. Run PowerShell as Administrator so the script can add Defender exclusions

## Environment variables
- `PORT` — backend HTTP port (default `8080`)
- `PETS_DIR` — pet definitions path (default `../pets`)
- `SETTINGS_PATH` — settings JSON path (default `clod-pet-settings.json`)

## Backend
- Entry: `backend/main.go`
- Internal packages: `pet` (XML parser), `engine` (state machine), `expression` (evaluator), `ipc` (HTTP handlers), `service` (orchestration), `settings`, `sound`
- Tests: Go built-in testing with coverage reporting (run with `go test -v -cover ./...`)

## Frontend
- Source entry: `frontend/main.ts`; Electron runtime entry: generated `frontend/main.js`
- Build: `cd frontend && npm run build:ts`
- Jest config in `package.json` (`testEnvironment: "node"`)
- Coverage excludes `preload.js`, `pet-renderer.js`
- Key TypeScript modules: `backend-manager` (spawns Go process), `api-adapter`, `backend-client`, `pet-manager`, `window-manager`, `tray-manager`, `border-detector`

## Pet format
- Directory per pet under `pets/` (e.g., `pets/esheep64/`)
- `animations.xml` — sprite sheet + animation state machine
- XML supports expressions: `screenW`, `random`, `imageH`, etc.

## Notes
- Backend and frontend communicate via HTTP JSON (not Electron IPC)
- `repl.js` and `test-flow.js` are helper scripts (gitignored)
- No CI/CD configured
