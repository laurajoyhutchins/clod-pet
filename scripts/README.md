# Scripts

Lifecycle and build automation for the project.

The app shell is organized under `app/src/main`, `app/src/preload`, `app/src/renderer`, `app/src/editor`, and `app/src/shared`, with static entry files in `app/public` and tests in `app/tests/unit` and `app/tests/e2e`.

## Files

- `install.ps1` / `install.sh` - full install flow.
- `build.ps1` / `build.sh` - quick build flow.
- `run.ps1` / `run.sh` - run from source.
- `test.ps1` / `test.sh` - test entry points.
- `uninstall.ps1` / `uninstall.sh` - cleanup and removal.
- `run-benchmarks.ps1` / `run-benchmarks.sh` - benchmark helpers.
- `utils.ps1` / `utils.sh` - shared script helpers.

## Usage

Run the platform-appropriate script from the repo root. On Windows, the PowerShell wrappers are the canonical entry points.
