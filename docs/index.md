# Clod Pet

A desktop pet application with AI chat capabilities. A Go backend handles animation logic and AI provider integration; a TypeScript/Electron app owns the windows, control panel, chat UI, and renderer bridge.

## Documentation

|                | **Tutorials** (learning) | **How-to guides** (goals) | **Reference** (information) | **Explanation** (understanding) |
|----------------|--------------------------|---------------------------|-----------------------------|----------------------------------|
| **Purpose**    | Get started              | Solve real problems       | Look up facts               | Understand concepts             |
| **Where**      | [Get started](tutorials/get-started.md) | [Add a custom pet](howto/add-custom-pet.md) | [Backend HTTP API](reference/ipc-api.md) | [Architecture](explanation/architecture.md) |

## Quick start

```bash
cd app && npm install && npm start
```

`npm start` compiles the app TypeScript before launching Electron. The main process starts the Go backend, opens the control panel, and spawns the default pet. Edit the `.ts` sources; generated files live under `dist/` for Electron and browser script loading.

## Project structure

```text
clod-pet/
|-- backend/                  # Go animation engine, HTTP API, and AI providers
|-- app/                      # TypeScript + Electron desktop shell
|   |-- main.ts               # Electron main process entry point
|   |-- control-panel.ts      # Control panel renderer script
|   |-- chat.ts               # Chat window renderer script
|   |-- index.html            # Pet window shell
|   |-- control-panel.html    # Control panel UI
|   |-- chat.html             # Chat UI
|   |-- pet.html              # Pet renderer UI
|   |-- tsconfig.json         # Main/preload TypeScript build
|   |-- tsconfig.browser.json # Browser-script TypeScript build
|   `-- src/
|       |-- backend-client.ts # HTTP client for backend API
|       |-- backend-manager.ts # Backend process lifecycle
|       |-- border-detector.ts # Screen/work-area geometry helpers
|       |-- chat-manager.ts    # AI chat window management
|       |-- logger.ts          # Logging utility
|       |-- pet-manager.ts     # Pet creation and animation loop
|       |-- pet-renderer.ts    # Canvas sprite renderer
|       |-- preload.ts         # Context bridge for renderer windows
|       |-- project-paths.ts   # Repository path helpers
|       |-- store-bridge.ts    # Broadcasts store updates to renderers
|       |-- tray-manager.ts    # System tray menu
|       |-- window-manager.ts  # BrowserWindow management
|       `-- store/
|           |-- index.ts
|           `-- state.ts
|-- pets/                     # Pet data directories
`-- docs/                     # Documentation
```
