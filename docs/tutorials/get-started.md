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
- Sign the executable (if Windows SDK is installed)
- Add Windows Defender exclusion
- Install app dependencies
- Compile the app TypeScript when the app starts
- Create Start Menu shortcut

**Manual install (alternative):**

```bash
cd app
npm install
```

## Step 2: Start the application

**If you used the install script:**
- Use the Start Menu shortcut "ClodPet", or
- Run `npm start` in the app directory

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

## Step 3: Watch the pet

The pet walks left across your screen. After 40 frames it decides what to do next (usually keeps walking). This is the `walk` animation (id 1) with 20 repeats of a 2-frame cycle.

## Step 4: Interact via the tray

Click the tray icon:
- **Add Pet** — spawns another pet
- **Quit** — closes the application

## Step 5: Quit

Select **Quit** from the tray menu. The Go backend process terminates automatically.

## What happens under the hood

1. `app/main.ts` compiles to `app/dist/main.js`, which Electron runs
2. The Go backend reads `pets/eSheep-modern/animations.json` and `spritesheet.png`
3. `addPet()` loads the pet data, creates a transparent `BrowserWindow`
4. The animation loop polls `/api` every 200ms for the next frame
5. Each frame sends `{frame_index, x, y, flip_h, opacity}` to the renderer
6. The canvas draws the correct tile from the sprite sheet

## Next steps

- [Add a custom pet](../howto/add-custom-pet.md)
- [Understand the animation engine](../explanation/animation-engine.md)
