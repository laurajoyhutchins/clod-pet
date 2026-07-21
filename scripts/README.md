# Scripts

Lifecycle, build, test, development, and release automation for Clod Pet.

## Windows boundaries

- `install.ps1` — current-user source installation. No elevation, Defender changes, certificates, process termination, credentials, execution-policy changes, or sandbox disabling.
- `uninstall.ps1` — idempotent generated-file removal plus exact, ambiguity-safe cleanup of historical project-created security artifacts.
- `bootstrap-dev.ps1` — local development dependency/bootstrap checks only.
- `dev-signing.ps1` — explicit development-only current-user signing helper. Never called by installation.
- `cleanup-dev-signing.ps1` — exact cleanup for the development certificate.
- `package-release.ps1` — release-maintainer packaging with a pre-existing certificate thumbprint.
- `install-security.ps1` — pure security policy and selection helpers, safe to test without host modification.

## Build and test

- `build.ps1` / `build.sh` — quick backend and app builds.
- `run.ps1` / `run.sh` — run from source.
- `test.ps1` / `test.sh` — repository test entry points.
- `test-scripts.ps1` — Pester runner for PowerShell helpers.
- `run-benchmarks.ps1` / `run-benchmarks.sh` — benchmark helpers.
- `utils.ps1` / `utils.sh` — shared script helpers.
- `script-options.ps1` — shared PowerShell argument parsing.
- `script-paths.ps1` — shared path and command construction.
- `tests/` — host-independent Pester specifications.

Run Windows scripts from the repository root without changing execution policy:

```powershell
pwsh -NoProfile -File .\scripts\install.ps1
pwsh -NoProfile -File .\scripts\test-scripts.ps1
```

Backend builds default to `release`. Use `scripts/build.sh --debug`, `scripts/build.ps1 --debug`, or `CLOD_PET_BUILD_MODE=debug` for a debug backend build.
