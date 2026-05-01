# Clod Pet

A desktop pet application. Go backend handles animation logic; the TypeScript/Electron frontend renders transparent sprite windows.

## Documentation (Diataxis)

|                | **Tutorials** (learning) | **How-to guides** (goals) | **Reference** (information) | **Explanation** (understanding) |
|----------------|--------------------------|---------------------------|-----------------------------|----------------------------------|
| **Purpose**    | Get started              | Solve real problems       | Look up facts               | Understand concepts             |
| **Where**      | [tutorials/](docs/tutorials/) | [howto/](docs/howto/)   | [reference/](docs/reference/) | [explanation/](docs/explanation/) |

### Quick start

```bash
# Windows full install (recommended on Windows)
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# Linux/macOS build and run from source
scripts/build.sh
cd frontend && npm install && npm start
```

`npm start` compiles the frontend TypeScript first, then launches Electron. The emitted `.js` files are runtime artifacts used by Electron and browser windows; edit the `.ts` files.

Sound playback runs in Electron/Chromium, so Linux builds do not need native ALSA development headers.

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/install.ps1` | Full install: builds backend, creates cert, adds Defender exclusion, creates shortcuts |
| `scripts/build.ps1` | Quick rebuild of backend and frontend dependencies |
| `scripts/test.ps1` | Run tests (backend Go tests, frontend Jest, E2E) |
| `scripts/uninstall.ps1` | Clean removal of shortcuts, settings, and generated files |
| `scripts/build.sh` | Linux/macOS build: builds the Go backend and TypeScript frontend |
| `scripts/test.sh` | Linux/macOS tests: backend Go tests, frontend Jest, optional E2E |

### MCP Server Stub

A minimal MCP (Model Context Protocol) server implementation is available in `../mcp-server-stub/`. Currently provides basic tool stubs (`hello`, `calculate`) using [mcp-go](https://github.com/mark3labs/mcp-go). Additional functionality will be expanded at a later time.

### Project structure

```
clod-pet/
|-- backend/                  # Go animation engine
|   |-- main.go               # HTTP server + API routes
|   `-- internal/
|       |-- pet/              # XML parser (animations.xml)
|       |-- engine/           # Animation state machine
|       |-- expression/       # Expression evaluator (screenW, random, etc.)
|       |-- ipc/              # HTTP JSON protocol types & handlers
|       |-- settings/         # JSON config persistence
|       `-- sound/            # Sound selection and browser-playable audio encoding
|-- frontend/                 # TypeScript + Electron desktop shell
|   |-- main.ts               # Source entry point
|   |-- main.js               # Generated Electron entry point
|   |-- control-panel.ts      # Source for the options UI renderer
|   |-- control-panel.js      # Generated browser script
|   |-- pet.html              # Transparent pet window template
|   |-- control-panel.html    # Options UI
|   |-- tsconfig.json         # Main/preload TypeScript build
|   |-- tsconfig.browser.json # Browser-script TypeScript build
|   `-- src/
|       |-- backend-manager.ts   # Backend process lifecycle
|       |-- pet-manager.ts       # Pet creation, loop, IPC handlers
|       |-- backend-client.ts    # HTTP client for backend API
|       |-- api-adapter.ts       # Backend API payload adapter
|       |-- window-manager.ts    # BrowserWindow management
|       |-- tray-manager.ts      # System tray menu
|       |-- border-detector.ts   # Per-display screen geometry provider
|       |-- preload.ts           # Context bridge (ipcRenderer)
|       `-- pet-renderer.ts      # Canvas sprite sheet renderer
|-- pets/                     # Pet data directories
|   `-- esheep64/
|       `-- animations.xml    # Sprite sheet + animation definitions
|-- dist/                     # Built Electron executables
|-- scripts/                  # PowerShell automation scripts
`-- docs/                     # This documentation
```
