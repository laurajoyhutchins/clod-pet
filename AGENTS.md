# AGENTS.md

## Quick start
```bash
cd frontend && npm install && npm start
```
Compiles the TypeScript frontend, starts Electron, and spawns the Go backend automatically.

## Project structure
- `backend/` — Go animation engine & LLM provider (HTTP API on `:8080`)
- `frontend/` — TypeScript + Electron desktop shell & Chat UI
- `pets/` — Pet definitions (XML sprite sheets)
- `docs/` — MkDocs documentation (Diataxis)
- `scripts/` — Lifecycle & build scripts (PowerShell)

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
- `VERBOSE` — enable debug logging (default `false`)

## Backend
- Entry: `backend/main.go`
- Internal packages: 
  - `pet`: XML parser for animation definitions
  - `engine`: Animation state machine and world context
  - `expression`: Mathematical expression evaluator for XML
  - `ipc`: HTTP/JSON command handlers and streaming SSE
  - `llm`: AI provider integration (OpenAI, Anthropic, Gemini, Ollama)
  - `service`: Orchestration of pets, settings, and AI
  - `settings`: Configuration persistence
  - `sound`: SFX playback via `beep`
- API Spec: `backend/api-spec.yaml`
- Tests: Go built-in testing (run with `go test -v -cover ./...`)

## Frontend
- Source entry: `frontend/main.ts`; Electron runtime entry: generated `frontend/main.js`
- Build: `cd frontend && npm run build:ts`
- Jest config in `package.json` (`testEnvironment: "node"`)
- Coverage excludes `preload.js`, `pet-renderer.js`
- Key TypeScript modules: 
  - `backend-manager`: Spawns and monitors the Go process
  - `api-adapter`: High-level wrapper for backend communication
  - `backend-client`: Low-level HTTP/SSE client
  - `chat-manager`: Manages the AI chat window and lifecycle
  - `pet-manager`: Orchestrates multiple pet instances
  - `window-manager`: Low-level Electron window control
  - `tray-manager`: System tray icon and menu
  - `border-detector`: Screen boundary detection for pet physics
- UI: `index.html` (Main), `chat.html` (AI Chat), `control-panel.html` (Settings)

## Pet format
- Directory per pet under `pets/` (e.g., `pets/esheep64/`)
- `animations.xml` — sprite sheet + animation state machine
- XML supports expressions: `screenW`, `random`, `imageH`, etc.

## Notes
- Backend and frontend communicate via HTTP JSON and SSE (not Electron IPC)
- `repl.js` and `test-flow.js` are helper scripts (gitignored)
- No CI/CD configured
