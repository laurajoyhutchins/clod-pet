# Clod Pet

A desktop pet application. Go backend handles animation logic; the TypeScript/Electron app renders transparent sprite windows.

## Documentation (Diataxis)

|                | **Tutorials** (learning) | **How-to guides** (goals) | **Reference** (information) | **Explanation** (understanding) |
|----------------|--------------------------|---------------------------|-----------------------------|----------------------------------|
| **Purpose**    | Get started              | Solve real problems       | Look up facts               | Understand concepts             |
| **Where**      | [Get started](tutorials/get-started.md) | [Add a custom pet](howto/add-custom-pet.md) | [IPC API](reference/ipc-api.md) | [Architecture](explanation/architecture.md) |

## Quick start

```bash
cd app && npm install && npm start
```

`npm start` compiles the app TypeScript before launching Electron. Edit `.ts` files; generated files live under `dist/` for Electron and browser script loading.

## Project structure

```
clod-pet/
|-- backend/                  # Go animation engine
|   |-- main.go               # HTTP server + API routes
|   `-- internal/             # Pet parser, engine, IPC, settings, sound
|-- app/                      # TypeScript + Electron desktop shell
|   |-- main.ts               # Source entry point
|   |-- main.js               # Generated Electron entry point
|   |-- control-panel.ts      # Source for the options UI renderer
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
|       |-- border-detector.ts   # Per-display screen edge detection
|       |-- preload.ts           # Context bridge
|       `-- pet-renderer.ts      # Canvas sprite sheet renderer
|-- pets/                     # Pet data directories
`-- docs/                     # Documentation
```
