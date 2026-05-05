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

`npm start` compiles the app TypeScript before launching Electron. The main process starts the Go backend, opens the control panel, and spawns the default pet. Edit the `.ts` sources; generated files live under `app/dist/src/...` for Electron and browser script loading.

## Project structure

```text
clod-pet/
|-- backend/                  # Go animation engine, HTTP API, and AI providers
|-- app/                      # TypeScript + Electron desktop shell
|   |-- public/               # Static HTML/CSS entrypoints
|   |-- src/
|   |   |-- main/             # Electron main-process code
|   |   |-- preload/          # Context bridge for renderer windows
|   |   |-- renderer/         # Chat/control-panel/pet entrypoints
|   |   |-- editor/           # Standalone editor subsystem
|   |   `-- shared/           # Shared store and types
|   |-- tests/
|   |   |-- unit/             # Jest unit tests
|   |   `-- e2e/              # Backend API end-to-end tests
|   |-- tsconfig.json         # Main/preload TypeScript build
|   |-- tsconfig.browser.json # Renderer TypeScript build
|   `-- tsconfig.editor.json  # Editor TypeScript build
|-- pets/                     # Pet data directories
`-- docs/                     # Documentation
```
