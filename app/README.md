# App

Electron shell and TypeScript UI for Clod Pet.

## Layout

- `src/main/` - Electron main process code and window orchestration.
- `src/preload/` - preload bridge exposed to renderer windows.
- `src/renderer/` - browser-side entrypoints and renderer helpers.
- `src/editor/` - standalone editor subsystem.
- `src/shared/` - shared state and types used across app processes.
- `tests/unit/` - Jest unit tests.
- `tests/e2e/` - end-to-end backend API tests.
- `public/` - static HTML and CSS entrypoints.
- `assets/` - packaged app assets.
- `dist/` - generated JavaScript output from the TypeScript build.

## Common commands

```powershell
cd app
npm install
npm start
```

Use `npm run build:ts` for a TypeScript-only build and `npm test` for Jest unit tests.
