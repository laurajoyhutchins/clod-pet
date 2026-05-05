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
```

Build outputs and coverage artifacts in this directory are generated files.
