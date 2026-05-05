# Source Tree

This directory contains the runtime code for the Electron app.

## Subdirectories

- `main/` - Electron main-process logic, backend process management, window lifecycle, and shared app orchestration.
- `preload/` - the preload bridge that exposes `window.clodPet` to renderer pages.
- `renderer/` - browser-side entrypoints for the chat, control panel, and pet windows.
- `editor/` - the standalone editor subsystem and its internal UI/runtime logic.
- `shared/` - code shared between the main process, preload, and renderer layers.

## Notes

- Main-process code runs under Node/Electron and can use filesystem, process, and window APIs.
- Renderer code should stay browser-safe and use the preload bridge for privileged operations.
