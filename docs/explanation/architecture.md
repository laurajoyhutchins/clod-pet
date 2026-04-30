# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```
+-------------------+          HTTP POST          +--------------------+
| TypeScript/Electron| --------------------------> | Go backend         |
| frontend           | <-------------------------- | backend            |
|                    |        JSON response        |                    |
| - Tray menu        |                             | - Animation state  |
| - Pet windows      |                             |   machine          |
| - Sprite rendering |                             | - XML parsing      |
| - Drag/drop        |                             | - Expression eval  |
| - Border detection |                             | - Sound playback   |
+-------------------+                             +--------------------+
```

## Why split frontend and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic because it is computationally simple, has good XML support, and compiles to a single binary.
- **TypeScript/Electron** owns window management because transparent frameless windows and cross-platform tray menus are well-supported.

The communication layer is HTTP JSON: simple to debug, language-agnostic, and sufficient for 200ms polling intervals.

## Frontend build model

The frontend source is TypeScript. `npm run build:ts` compiles:

- Main-process and preload code with `tsconfig.json`
- Browser scripts such as `control-panel.ts` and `src/pet-renderer.ts` with `tsconfig.browser.json`

Electron still loads generated JavaScript (`main.js`, `preload.js`, and browser `<script>` files). Treat `.ts` files as the source of truth and generated `.js` files as runtime artifacts.

## Animation pipeline

1. **Load** - `POST /api/pet/load` reads `animations.xml`, parses the sprite sheet, and returns base64 PNG plus metadata.
2. **Add** - `POST /api` with `add_pet` creates an `Engine` instance for the pet and starts at a spawn point.
3. **Step** - `POST /api` with `step_pet` advances the engine one frame and returns `{frame_index, x, y, flip_h, opacity}`.
4. **Render** - the Electron renderer, compiled from TypeScript, draws the frame tile from the sprite sheet onto a transparent canvas.
5. **Transition** - when an animation sequence completes, the engine picks the next animation via weighted probability.

## State machine

Each pet engine has a state: `Idle` | `Animating` | `Dragging` | `Falling`.

The state determines which animation plays:

- `Animating` - follows the animation sequence
- `Dragging` - switches to `drag` animation
- `Falling` - switches to `fall` animation
- `Idle` - no frames produced

Transitions between animations are triggered by:

- **Sequence completion** - the `<sequence>` finishes its repeats
- **Border events** - the pet hits a screen edge (`border_ctx` from the frontend's per-display `BorderDetector`)
- **Gravity events** - the pet falls off a ledge (`gravity: true` from `BorderDetector.checkGravity()`)
- **User interaction** - click-and-drag

## Sound playback

When an animation transition occurs, the engine checks `pet.Sounds[animationID]` for associated sounds. If found, `sound.PickSound()` selects one based on weighted probability and plays it via the `oto` audio library.

Volume is controlled via the `set_volume` command and persisted to `clod-pet-settings.json`.

## Why HTTP polling instead of WebSockets?

The animation step interval is about 200ms. WebSocket adds complexity for a use case where:

- The client always drives the loop (request, then response)
- There is no server-initiated push
- Debugging is easier with curl/Postman
- The Go stdlib `net/http` handles concurrent requests well
