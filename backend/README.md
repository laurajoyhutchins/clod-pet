# Backend

Go HTTP backend for pet animation, settings, IPC handlers, and LLM provider integration.

## Layout

- `main.go` - backend entry point.
- `api-spec.yaml` - HTTP API specification.
- `internal/engine` - animation state machine and world context.
- `internal/pet` - pet definition parsing and conversion.
- `internal/expression` - XML expression evaluator.
- `internal/ipc` - JSON command handlers and SSE streaming.
- `internal/llm` - AI provider integrations.
- `internal/service` - orchestration of pets, settings, and AI.
- `internal/settings` - configuration persistence.
- `internal/sound` - sound playback helpers.

## Common commands

```powershell
cd backend
go test ./...
go run .
go run ./cmd/pet-headless/ -pet eSheep-modern
go run ./cmd/pet-headless/ -pet eSheep-modern -pet eSheep-modern -jsonl -seed 1
go run ./cmd/pet-headless/ -pet eSheep-modern -spawn 1 -jsonl-file trace.jsonl
go run ./cmd/pet-headless/ -pet eSheep-modern -pet eSheep-modern -spawn 1 -spawn 2 -screen-w 2560 -screen-h 1440
```

Backend release builds are the default. Use `CLOD_PET_BUILD_MODE=debug` or `../scripts/build.sh --debug` to compile with the `debug` build tag and `-gcflags='all=-N -l'`; release builds use `-trimpath` and stripped linker flags.

- Repeat `-pet` for multi-pet runs.
- Repeat `-spawn` once per pet to override spawn IDs in order, or use `-spawn-default` as a fallback.
- Use `-screen-*`, `-work-area-*`, and `-desktop-*` to override the simulated world geometry.
- Use `-jsonl-file` to write JSONL snapshots to disk.

Build outputs and coverage artifacts in this directory are generated files.
