# Clod Pet

A desktop pet application. Go backend handles animation logic; Electron frontend renders transparent sprite windows.

## Documentation (Diataxis)

|                | **Tutorials** (learning) | **How-to guides** (goals) | **Reference** (information) | **Explanation** (understanding) |
|----------------|--------------------------|---------------------------|-----------------------------|----------------------------------|
| **Purpose**    | Get started              | Solve real problems       | Look up facts               | Understand concepts             |
| **Where**      | [tutorials/](docs/tutorials/) | [howto/](docs/howto/)   | [reference/](docs/reference/) | [explanation/](docs/explanation/) |

### Quick start

```bash
# Full install (recommended)
powershell -ExecutionPolicy Bypass -File install.ps1

# Or manually:
cd frontend && npm install && npm start
```

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/install.ps1` | Full install: builds backend, creates cert, adds Defender exclusion, creates shortcuts |
| `scripts/build.ps1` | Quick rebuild of backend and frontend dependencies |
| `scripts/test.ps1` | Run tests (backend Go tests, frontend Jest, E2E) |
| `scripts/uninstall.ps1` | Clean removal of shortcuts, settings, and generated files |

### MCP Server Stub

A minimal MCP (Model Context Protocol) server implementation is available in `../mcp-server-stub/`. Currently provides basic tool stubs (`hello`, `calculate`) using [mcp-go](https://github.com/mark3labs/mcp-go). Additional functionality will be expanded at a later time.

### Project structure

```
clod-pet/
├── backend/                  # Go animation engine
│   ├── main.go               # HTTP server + API routes
│   └── internal/
│       ├── pet/              # XML parser (animations.xml)
│       ├── engine/           # Animation state machine
│       ├── expression/       # Expression evaluator (screenW, random, etc.)
│       ├── ipc/              # HTTP JSON protocol types & handlers
│       ├── settings/         # JSON config persistence
│       └── sound/            # Audio playback
├── frontend/                 # Electron desktop shell
│   ├── main.js               # Entry point, wires modules together
│   ├── pet.html              # Transparent pet window template
│   ├── index.html            # Options UI
│   └── src/
│       ├── backend-manager.js   # Backend process lifecycle
│       ├── pet-manager.js       # Pet creation, loop, IPC handlers
│       ├── backend-client.js    # HTTP client for backend API
│       ├── window-manager.js    # BrowserWindow management
│       ├── tray-manager.js      # System tray menu
│       ├── border-detector.js   # Screen edge detection
│       ├── preload.js           # Context bridge (ipcRenderer)
│       └── pet-renderer.js      # Canvas sprite sheet renderer
├── pets/                     # Pet data directories
│   └── esheep64/
│       └── animations.xml    # Sprite sheet + animation definitions
├── dist/                     # Built Electron executables
├── scripts/                  # PowerShell automation scripts
│   ├── install.ps1           # Full install script
│   ├── build.ps1             # Quick build script
│   ├── test.ps1              # Test runner script
│   └── uninstall.ps1         # Uninstall script
├── docs/                     # This documentation
```
