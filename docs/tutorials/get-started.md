# Tutorial: Run your first pet

In this tutorial you will start the application and watch a pet walk across your screen.

## Prerequisites

- Go 1.21+
- Node.js 18+
- npm
- Windows SDK (optional, for code signing)

## Step 1: Install dependencies

**Recommended:** Use the install script for automatic setup:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

This script will:
- Create a self-signed certificate for code signing
- Build the Go backend
- Sign the executable if the Windows SDK is installed
- Add a Windows Defender exclusion
- Install app dependencies
- Compile the app TypeScript when the app starts
- Create a Start Menu shortcut

**Manual install:**

```bash
cd app
npm install
```

## Step 2: Start the application

**If you used the install script:**
- Use the Start Menu shortcut `ClodPet`, or
- Run `npm start` in the `app/` directory

**Manual start:**

```bash
cd app
npm start
```

`npm start` compiles the app TypeScript and then launches Electron.

You will see:
1. A system tray icon appear
2. The Go backend start on port 8080
3. A sheep pet appear on your screen
4. The control panel open automatically

## Step 3: Watch the pet

The pet walks left across your screen. After 40 frames it decides what to do next, usually by continuing to walk. This is the `walk` animation with 20 repeats of a 2-frame cycle.

## Step 4: Use the tray

Click the tray icon:
- `Add Pet` - spawns another pet
- `Options` - shows the control panel
- `Chat` - opens the AI chat window
- `Quit` - closes the application

## Step 5: Quit

Select `Quit` from the tray menu. The main process shuts down the pets, closes the windows, and terminates the Go backend process.

## What happens under the hood

1. `app/main.ts` compiles to `app/dist/main.js`, which Electron runs
2. The main process starts the Go backend, loads settings, and spawns the default pet
3. `app/src/backend-client.ts` loads `pets/eSheep-modern/animations.json` data and creates a transparent `BrowserWindow`
4. `pet-manager.ts` polls `/api` every 200 ms with the current world geometry
5. Each step returns the next frame state, including position, opacity, and optional sound metadata
6. `pet-renderer.ts` draws the correct tile from the sprite sheet

## Next steps

- [Add a custom pet](../howto/add-custom-pet.md)
- [Understand the animation engine](../explanation/animation-engine.md)
