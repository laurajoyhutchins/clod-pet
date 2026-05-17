# Clod Pet

Clod Pet is a desktop pet app with a Go backend and a TypeScript/Electron frontend. Pets walk, fall, drag, and react to screen borders using a physics engine. The app also includes an AI chat interface and a ReactFlow-based animation graph editor.

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

For iterative development, use `cd app && npm run dev` to watch TypeScript and Go changes and restart Electron automatically.

3. On Windows, use the full installer if you want the backend, shortcuts, and default settings set up for you.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

## Common Commands

- `cd app && npm run dev` — frontend development with auto-reload
- `cd app && npm test` — frontend unit tests
- `cd backend && go test ./...` — backend tests
- `cd backend && go run .` — run the backend directly
- `cd backend && go run ./cmd/pet-headless/ -pet <path>` — headless multi-pet runner
- `cd backend && go run ./cmd/export-modern-pet -src <legacy> -dst <new>` — convert legacy pet to modern JSON
- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` — run all tests on Windows

## Project Layout

- `backend/` — Go animation engine, HTTP API, LLM providers, CLI tools
- `app/` — Electron shell, chat UI, control panel, animation editor
- `pets/` — pet definitions and sprite assets
- `docs/` — documentation (MkDocs, Diataxis)
- `scripts/` — build, install, and test scripts

## Key Features

- **Desktop pets** — sprite-based pets that walk, fall, and react to screen edges
- **AI chat** — LLM-powered chat with streaming responses (OpenAI, Anthropic, Gemini, Ollama)
- **Animation editor** — ReactFlow-based graph editor for creating and editing pet animations
- **Multi-pet** — run multiple pets simultaneously
- **Custom pets** — define new pets with `animations.json` and a sprite sheet

## Notes

- The repo-wide instructions live in [AGENTS.md](AGENTS.md).
- `GEMINI.md` and `CLAUDE.md` mirror the same agent instructions for other tools.
