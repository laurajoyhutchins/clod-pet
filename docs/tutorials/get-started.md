# Tutorial: Run your first pet

In this tutorial you will start the application and watch a pet walk across your screen.

## Prerequisites

- Go 1.21+
- Node.js 18+
- npm

## Step 1: Install dependencies

```bash
cd frontend
npm install
```

## Step 2: Start the application

```bash
npm start
```

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

1. `frontend/main.js` spawns the Go binary as a child process
2. The Go backend reads `pets/esheep64/animations.xml` — a sprite sheet and 77 animation definitions
3. `addPet()` loads the pet data, creates a transparent `BrowserWindow`
4. The animation loop polls `/api` every 200ms for the next frame
5. Each frame sends `{frame_index, x, y, flip_h, opacity}` to the renderer
6. The canvas draws the correct tile from the sprite sheet

## Next steps

- [Add a custom pet](../howto/add-custom-pet.md)
- [Understand the animation engine](../explanation/animation-engine.md)
