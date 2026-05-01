# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```
+-------------------+          HTTP POST          +--------------------+
| TypeScript/Electron| --------------------------> | Go backend         |
| app                | <-------------------------- | backend            |
|                    |        JSON response        |                    |
| - Tray menu        |                             | - Animation state  |
| - Pet windows      |                             |   machine          |
| - Sprite rendering |                             | - Physics & Collision|
| - Drag/drop        |                             | - JSON pet parsing |
| - Sensory Providing |                             | - Expression eval  |
|   (Screen Rects)   |                             | - Sound playback   |
+-------------------+                             +--------------------+
```

## Why split app and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic and physics (gravity, collision, snapping) because it is computationally simple, testable in isolation, and allows for a language-agnostic "headless" engine.
- **TypeScript/Electron** owns window management and sensory input (monitor bounds and work-area geometry) because transparent frameless windows and native display APIs are well-supported.

The communication layer is HTTP JSON: simple to debug, language-agnostic, and sufficient for 200ms polling intervals.

## App build model

The app source is TypeScript. `npm run build:ts` compiles:

- Main-process and preload code with `tsconfig.json`
- Browser scripts such as `control-panel.ts` and `src/pet-renderer.ts` with `tsconfig.browser.json`

Electron still loads generated JavaScript (`main.js`, `preload.js`, and browser `<script>` files). Treat `.ts` files as the source of truth and generated `.js` files as runtime artifacts.

## Animation pipeline

1. **Load** - `POST /api/pet/load` reads `animations.json` when available, falls back to legacy `animations.xml`, parses the sprite sheet, and returns base64 PNG plus metadata.
2. **Add** - `POST /api` with `add_pet` creates an `Engine` instance for the pet and starts at a spawn point.
3. **Step** - `POST /api` with `step_pet` passes raw world geometry (screen, work area, and desktop bounds). The engine performs physics calculations and returns `{frame_index, x, y, flip_h, opacity}`.
4. **Render** - the Electron renderer, compiled from TypeScript, draws the frame tile from the sprite sheet onto a transparent canvas at the coordinates provided by the backend.
5. **Transition** - when an animation sequence completes, the engine picks the next animation via weighted probability.

## State machine

Each pet engine has a state: `Idle` | `Animating` | `Dragging` | `Falling`.

The state determines which animation plays:

- `Animating` - follows the animation sequence
- `Dragging` - switches to `drag` animation
- `Falling` - switches to `fall` animation
- `Idle` - no frames produced

Transitions between animations are triggered by:

- **Sequence completion** - the animation sequence finishes its repeats
- **Internal Physics** - the engine detects the pet hit a screen edge or fell off a ledge using raw monitor geometry provided by the app.
- **User interaction** - click-and-drag (the app notifies the backend of state changes)

## Sound playback

When an animation transition occurs, the engine checks `pet.Sounds[animationID]` for associated sounds. If found, `sound.PickSound()` selects one based on weighted probability, encodes it as browser-playable audio, and includes it in the next `step_pet` response. The Electron renderer plays the sound through Chromium audio APIs.

Volume is controlled via the `set_volume` command and persisted to `clod-pet-settings.json`.

## Why HTTP polling instead of WebSockets?

The animation step interval is about 200ms. WebSocket adds complexity for a use case where:

- The client always drives the loop (request, then response)
- There is no server-initiated push
- Debugging is easier with curl/Postman
- The Go stdlib `net/http` handles concurrent requests well
