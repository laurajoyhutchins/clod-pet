# Clod Pet

Clod Pet is a desktop pet app with a Go backend and a TypeScript/Electron frontend.

## Quickstart

1. Install the frontend dependencies.

```bash
cd app
npm install
```

2. Start the desktop app from source.

```bash
cd app && npm start
```

3. On Windows, use the full installer if you want the backend, shortcuts, and default settings set up for you.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

## Common Commands

- `cd app && npm run dev` - frontend development
- `cd app && npm test` - frontend unit tests
- `cd backend && go run .` - run the backend directly
- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` - run all tests on Windows

## Project Layout

- `backend/` - Go animation engine, IPC handlers, and LLM providers
- `app/` - Electron shell and chat UI
- `pets/` - pet definitions and sprite assets
- `docs/` - documentation
- `scripts/` - build, install, and test scripts

## Notes

- The repo-wide instructions live in [AGENTS.md](AGENTS.md).
- `GEMINI.md` and `CLAUDE.md` mirror the same agent instructions for other tools.
