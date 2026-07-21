# Tutorial: Run your first pet

In this tutorial you will build the application from source and watch a pet walk across your screen.

## Prerequisites

- Go 1.24+
- Node.js 22+
- npm
- PowerShell 7 (`pwsh`) on Windows

The Windows SDK is required only for explicit development or release signing. It is not part of ordinary source installation.

## Step 1: Install from source

From the repository root:

```powershell
pwsh -NoProfile -File .\scripts\install.ps1
```

The installer runs as the current user. It builds the Go backend, installs locked frontend dependencies with `npm ci`, compiles TypeScript, and creates a per-user launcher and Start Menu shortcut.

It does not request administrator rights, change PowerShell execution policy, add Windows Defender exclusions, create certificates, store credentials, stop processes, or disable Electron's sandbox.

Close a running Clod Pet instance before reinstalling. If a build output is locked, installation stops instead of killing processes by name.

For development without creating a launcher, use:

```powershell
pwsh -NoProfile -File .\scripts\bootstrap-dev.ps1
```

## Step 2: Start the application

After source installation, use the Start Menu shortcut or run:

```powershell
.\clod-pet.cmd
```

For iterative development:

```powershell
cd app
npm run dev
```

You will see:

1. A system tray icon appear.
2. The Go backend start on loopback only.
3. A sheep pet appear on your screen.
4. The control panel open automatically.

## Step 3: Watch the pet

The pet walks left across your screen. After 40 frames it decides what to do next, usually by continuing to walk. This is the `walk` animation with 20 repeats of a two-frame cycle.

## Step 4: Use the tray

Click the tray icon:

- `Add Pet` spawns another pet.
- `Options` shows the control panel.
- `Chat` opens the AI chat window.
- `Quit` closes the application.

## Step 5: Quit or uninstall

Select `Quit` from the tray menu. The main process closes its own pet windows and terminates the exact Go child process it started.

To remove generated installation files while preserving user settings:

```powershell
pwsh -NoProfile -File .\scripts\uninstall.ps1
```

Use `-RemoveUserData` only when you also intend to delete settings.

## What happens under the hood

1. `app/src/main/main.ts` compiles to `app/dist/src/main/main.js`, which Electron runs.
2. The main process starts the Go backend on `127.0.0.1`, loads settings, and spawns the default pet.
3. The preload exposes fixed APIs rather than arbitrary IPC channel access.
4. `app/src/main/pet-manager.ts` polls the loopback API with current world geometry.
5. Each step returns the next frame state, including position, opacity, and optional sound metadata.
6. `app/src/renderer/pet-renderer.ts` draws the correct tile from the sprite sheet.

## Next steps

- [Add a custom pet](../howto/add-custom-pet.md)
- [Understand the animation engine](../explanation/animation-engine.md)
