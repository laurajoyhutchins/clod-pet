# Main Process

Electron main-process code lives here.

## Responsibilities

- Start and supervise the Go backend.
- Create and manage app windows.
- Wire IPC-like app commands through the preload bridge and backend client.
- Coordinate tray, pet, chat, and control-panel lifecycle.

## Files

- `main.ts` - application bootstrap and top-level event wiring.
- `backend-client.ts` - HTTP and SSE client for the Go backend.
- `backend-manager.ts` - backend process startup, restart, and diagnostics.
- `chat-manager.ts` - chat-window lifecycle.
- `editor-window.ts` - editor window lifecycle.
- `logger.ts` - app logging helpers.
- `pet-manager.ts` - pet orchestration and window management.
- `project-paths.ts` - path helpers for the repo and runtime artifacts.
- `store-bridge.ts` - connects shared store state to runtime consumers.
- `tray-manager.ts` - tray icon and tray menu behavior.
- `window-manager.ts` - lower-level Electron window helpers.
