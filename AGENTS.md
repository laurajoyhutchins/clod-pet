# AGENTS.md

## Quick start
```bash
cd app && npm install && npm start
```
Compiles the TypeScript app, starts Electron, and spawns the Go backend automatically.
For iterative development, use `cd app && npm run dev` to watch TypeScript and Go changes and restart Electron automatically.

## Project structure
- `backend/` — Go animation engine, IPC handlers, & LLM providers (HTTP API on `:8080`)
- `app/` — TypeScript + Electron desktop shell, Chat UI, & animation graph editor
- `pets/` — Pet definitions (Modern `animations.json` or legacy `animations.xml` sprite sheets)
- `docs/` — MkDocs documentation (Diataxis)
- `scripts/` — Lifecycle & build scripts (PowerShell for Windows, Shell for Linux/macOS)

## Commands
| Action | Command |
|--------|---------|
| Install (full) | `powershell -ExecutionPolicy Bypass -File scripts/install.ps1` |
| Quick build | `powershell -ExecutionPolicy Bypass -File scripts/build.ps1` or `./scripts/build.sh` |
| Run tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` or `./scripts/test.sh` |
| Uninstall | `powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1` |
| Frontend dev | `cd app && npm run dev` |
| Frontend test | `cd app && npm test` |
| Backend run | `cd backend && go run .` |
| Pet port | `cd backend && go run ./cmd/pet-port/` |
| Pet step | `cd backend && go run ./cmd/pet-step/ -pet <id> [-n steps] [-v]` |
| Pet watch | `cd backend && go run ./cmd/pet-watch/ -pet <id> [-i ms] [-v]` |
| Pet simulate | `cd backend && go run ./cmd/pet-simulate/ -pet <path> [-n steps] [-v]` |
| Pet headless | `cd backend && go run ./cmd/pet-headless/ -pet <path> [-n steps]` |
| Export modern pet | `cd backend && go run ./cmd/export-modern-pet -src <legacy-pet> -dst <new-pet>` |
| Docs serve | `mkdocs serve` |

### Test script options
- `test.ps1` - runs all tests (backend + app unit)
- `test.ps1 backend` - run only Go backend tests
- `test.ps1 app` - run only Jest unit tests
- `test.ps1 e2e` - run only end-to-end tests
- `test.ps1 all` - run everything including E2E

## Install script features
- Creates self-signed code-signing certificate for development
- Builds Go backend and signs the executable (requires Windows SDK for `signtool`)
- Adds Windows Defender exclusion for backend directory
- Installs app npm dependencies
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
- `CLOD_PET_ALLOW_WAYLAND` — allow native Wayland on Linux (default forces X11)

## Backend
- Entry: `backend/main.go`
- Internal packages:
  - `pet`: Modern JSON pet loader and legacy XML parser with conversion
  - `engine`: Animation state machine, physics, border/gravity detection, and world context
  - `expression`: Mathematical expression evaluator for animation parameters
  - `ipc`: HTTP/JSON command handlers and streaming SSE
  - `llm`: AI provider integration (OpenAI, Anthropic, Gemini, Ollama)
  - `service`: Orchestration of pets, settings, worker pool, and AI
  - `settings`: Configuration persistence (Volume, Scale, GravityFactor, PanelStyle, LLM config, Autostart)
  - `sound`: Weighted sound selection and audio normalization
  - `buildmode`: Build-time metadata (debug/release), surfaced through the API
- API Spec: `backend/api-spec.yaml`
- Tests: Go built-in testing (run with `go test -v -cover ./...`)
- CLI tools (`backend/cmd/`): `pet-port`, `pet-step`, `pet-watch`, `pet-simulate`, `pet-headless`, `export-modern-pet`

## Frontend
- Source entry: `app/src/main/main.ts`; Electron runtime entry: generated `app/dist/src/main/main.js`
- Build: `cd app && npm run build:ts`
- Dev watch: `cd app && npm run dev`
- One-shot dev launch: `cd app && npm run dev:once`
- Jest config in `package.json` (`testEnvironment: "node"`)
- Coverage excludes `src/preload/preload.ts`, `src/renderer/pet-renderer.ts`
- Key TypeScript modules:
  - `main/`: backend startup, window lifecycle, tray, store bridge, and app commands
  - `preload/`: context bridge for renderer windows (IPC security boundary)
  - `renderer/`: chat, control-panel, and pet window entrypoints
  - `editor/`: ReactFlow-based animation graph editor with validation and document normalization
  - `shared/store/`: WorldStore (source of truth for UI state), diagnostics, and shared types
- UI: `public/index.html` (Main), `public/chat.html` (AI Chat), `public/control-panel.html` (Settings)

## Communication patterns
- **Main ↔ Go backend**: HTTP POST with `{ command, payload }` envelope on `:8080`. AI chat uses SSE via `/api/llm/stream`. Requests include `X-Request-Id` for correlation.
- **Main ↔ Renderer**: Electron IPC via `preload.ts` and `contextBridge`. Key channels: `store:updated`, `pet:frame`, `pet:drag`, `pet:drop`, `control:*`, `editor:*`. `window.clodPet` API is the security boundary.
- **Store broadcasts**: `StoreBridge` sends full `WorldState` to all renderer windows on every update. Renderers subscribe to `store:updated`.

## Pet format
- Directory per pet under `pets/` (e.g., `pets/eSheep-modern/`)
- `animations.json` — modern JSON format (preferred)
- `animations.xml` — legacy sprite sheet + animation state machine (still supported)
- Expressions in both formats: `screenW`, `random`, `imageH`, etc.

## Notes
- `border_pet` command only validates that the pet exists; border transitions happen during `step_pet`
- `get_pet` takes a `pet_id` (not a pet path); use `POST /api/pet/load` for full definition loading
- `step_pets` returns partial results with a joined error when any pet fails
- `list_active` returns pets sorted by ID for deterministic ordering
- `repl.js` and `test-flow.js` are helper scripts (gitignored)
- No CI/CD configured
