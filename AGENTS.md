# Clod Pet contributor guide

## Safe workflow boundaries

Clod Pet keeps three Windows workflows separate:

1. **End-user release installation** — use a publisher-signed GitHub Release package. Never ask users to disable SmartScreen, antivirus, firewall, browser protections, or code-signing checks.
2. **Local development** — run `pwsh -NoProfile -File .\scripts\bootstrap-dev.ps1`, then `cd app && npm run dev`. This workflow makes no host trust changes.
3. **Release packaging and signing** — release maintainers run `scripts/package-release.ps1` with a pre-existing certificate thumbprint. It never creates or imports a certificate.

The per-user source installer is:

```powershell
pwsh -NoProfile -File .\scripts\install.ps1
```

It must remain non-privileged, idempotent, and fail closed. It must not add Defender exclusions, create certificates, change execution policy, write credentials, terminate processes by executable name, or disable Electron's sandbox.

Development signing is opt-in through `scripts/dev-signing.ps1 -CreateCertificate`. It is current-user scoped, not trusted automatically, never called by the installer, and cleaned up with `scripts/cleanup-dev-signing.ps1`.

## Project structure

- `backend/` — Go animation engine, loopback-only HTTP API, LLM providers, and CLI tools
- `app/` — TypeScript/Electron shell, renderer IPC boundary, chat UI, control panel, and animation editor
- `pets/` — modern JSON and legacy XML pet definitions
- `docs/` — MkDocs documentation
- `scripts/` — separate install, development, test, signing, packaging, and cleanup workflows

## Commands

| Action | Command |
|---|---|
| Safe source install | `pwsh -NoProfile -File .\scripts\install.ps1` |
| Uninstall generated files | `pwsh -NoProfile -File .\scripts\uninstall.ps1` |
| Development bootstrap | `pwsh -NoProfile -File .\scripts\bootstrap-dev.ps1` |
| Frontend development | `cd app && npm run dev` |
| Frontend tests/build | `cd app && npm test` |
| Backend tests | `cd backend && go test ./...` |
| Installer helper tests | `pwsh -NoProfile -File .\scripts\test-scripts.ps1` |
| Full Windows checks | `pwsh -NoProfile -File .\scripts\test.ps1 all` |
| Docs | `mkdocs serve` |

## Security invariants

- Electron renderers use context isolation, no Node integration, and only fixed preload APIs.
- The Go backend listens on `127.0.0.1` and does not grant cross-origin access.
- Do not expose absolute local paths through public API responses or persistent logs.
- Do not persist or log API keys, authorization headers, provider configuration, prompts, chat messages, or model output.
- Validate pet and editor paths before reading or writing files.
- Use exact child-process ownership for shutdown; never kill unrelated Electron or Go processes by name.

## Runtime notes

- `PORT` — loopback backend port (default `8080`)
- `PETS_DIR` — pet definitions path (default `../pets`)
- `SETTINGS_PATH` — settings JSON path
- `VERBOSE` — debug logging (`false` by default)
- `CLOD_PET_ALLOW_WAYLAND` — allow native Wayland (`0` by default)

The backend entry point is `backend/main.go`. The Electron entry point is `app/src/main/main.ts`, and `app/src/preload/preload.ts` is the renderer security boundary.
