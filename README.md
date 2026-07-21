# Clod Pet

Clod Pet is a desktop pet app with a Go backend and a TypeScript/Electron frontend. Pets walk, fall, drag, and react to screen borders using a physics engine. The app also includes an AI chat interface and a ReactFlow-based animation graph editor.

## Install on Windows

### End users

Use a publisher-signed package from the GitHub Releases page when one is available. A release package must be built and signed by the release workflow; the project does not ask users to trust a self-signed certificate or weaken Windows protections.

Do not disable SmartScreen, add antivirus exclusions, or change PowerShell execution policy to install Clod Pet. Source checkouts are development artifacts and may be unsigned.

### Install from source

The source installer is a per-user contributor workflow. It requires Go, Node.js, and npm, builds the checked-out source, and creates a per-user launcher and Start Menu shortcut.

```powershell
pwsh -NoProfile -File .\scripts\install.ps1
```

The source installer is intentionally non-privileged. It does not:

- request administrator rights;
- change Windows Defender, firewall, browser, or operating-system settings;
- create or trust certificates;
- change PowerShell execution policy;
- store credentials;
- terminate running processes;
- disable Electron's sandbox.

Close Clod Pet yourself before reinstalling so the build can fail closed if a file is in use. Running the installer repeatedly is supported.

Uninstall the generated launcher and backend build with:

```powershell
pwsh -NoProfile -File .\scripts\uninstall.ps1
```

User settings are preserved unless `-RemoveUserData` is supplied. Uninstall also removes one exact legacy project-created Defender exclusion or development certificate when it can identify that artifact unambiguously; it never broadens the cleanup or requests elevation.

## Local development

Bootstrap locked dependencies and validate the development environment:

```powershell
pwsh -NoProfile -File .\scripts\bootstrap-dev.ps1
cd app
npm run dev
```

Development signing is optional and isolated in `scripts/dev-signing.ps1`. It uses only the current user's certificate store, never adds the certificate to a trust store, and requires an explicit `-CreateCertificate` opt-in. Remove it with `scripts/cleanup-dev-signing.ps1`.

Release maintainers use `scripts/package-release.ps1` with a pre-existing release certificate thumbprint. The release script never creates or imports a signing identity.

## Common commands

- `cd app && npm run dev` — frontend development with auto-reload
- `cd app && npm test` — frontend unit tests and TypeScript build
- `cd backend && go test ./...` — backend tests
- `cd backend && go run .` — run the loopback-only backend directly
- `cd backend && go run ./cmd/pet-headless/ -pet <path>` — headless multi-pet runner
- `cd backend && go run ./cmd/export-modern-pet -src <legacy> -dst <new>` — convert legacy pet to modern JSON
- `pwsh -NoProfile -File .\scripts\test-scripts.ps1` — installer helper tests

## Project layout

- `backend/` — Go animation engine, loopback HTTP API, LLM providers, CLI tools
- `app/` — sandboxed Electron shell, chat UI, control panel, animation editor
- `pets/` — pet definitions and sprite assets
- `docs/` — documentation (MkDocs, Diataxis)
- `scripts/` — separate installation, development, signing, packaging, and test workflows

## Key features

- **Desktop pets** — sprite-based pets that walk, fall, and react to screen edges
- **AI chat** — LLM-powered chat with streaming responses (OpenAI, Anthropic, Gemini, Ollama)
- **Animation editor** — ReactFlow-based graph editor for creating and editing pet animations
- **Multi-pet** — run multiple pets simultaneously
- **Custom pets** — define new pets with `animations.json` and a sprite sheet

## Notes

- The repo-wide instructions live in [AGENTS.md](AGENTS.md).
- `GEMINI.md` and `CLAUDE.md` mirror the same contributor instructions.
