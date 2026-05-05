# App

Electron shell and TypeScript UI for Clod Pet.

## Layout

- `main.ts` - Electron main process entry point.
- `chat.ts` - chat window renderer.
- `control-panel.ts` - settings window renderer.
- `src/` - shared app logic, backend client, window orchestration, and store code.
- `e2e/` - end-to-end tests.
- `assets/` - packaged app assets.
- `dist/` - generated JavaScript output from the TypeScript build.

## Common commands

```powershell
cd app
npm install
npm start
```

Use `npm run build:ts` for a TypeScript-only build and `npm test` for Jest unit tests.
