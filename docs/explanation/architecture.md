# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```
+-------------------+          HTTP POST          +--------------------+
| TypeScript/Electron| --------------------------> | Go backend         |
| app                | <-------------------------- | backend            |
|                    |        JSON response        |                    |
| - Tray menu        |                             | - Animation state  |
| - Pet windows      | <~~~~~~~~~~~~~~~~~~~~~~~~~~ |   machine          |
| - Sprite rendering |          SSE Stream         | - Physics & Collision|
| - Drag/drop        |         (LLM Chat)          | - JSON pet parsing |
| - Sensory Providing|                             | - Expression eval  |
|   (Screen Rects)   |                             | - Sound playback   |
| - LLM Chat UI      |                             | - AI Providers     |
+-------------------+                             +--------------------+
```

## Why split app and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic and physics (gravity, collision, snapping) because it is computationally simple, testable in isolation, and allows for a language-agnostic "headless" engine. It also manages AI provider integrations (OpenAI, Gemini, etc.) to keep secrets and complex networking out of the frontend.
- **TypeScript/Electron** owns window management and sensory input (monitor bounds and work-area geometry) because transparent frameless windows and native display APIs are well-supported.

## Communication models

Clod Pet uses two different communication patterns depending on the task:

1.  **Request-Response (Polling):** The animation loop uses standard HTTP POST requests. The client drives the loop by sending world geometry and receiving the next frame state. This is simple, easy to debug, and sufficient for 200ms intervals.
2.  **Server-Sent Events (Streaming):** AI chat responses use SSE via the `/api/llm/stream` endpoint. This allows the backend to stream tokens from LLM providers directly to the Chat UI for a responsive "typing" effect.

## App build model

The app source is TypeScript. `npm run build:ts` compiles:

- Main-process and preload code with `tsconfig.json`
- Browser scripts such as `control-panel.ts` and `src/pet-renderer.ts` with `tsconfig.browser.json`

Electron still loads generated JavaScript (`main.js`, `preload.js`, and browser `<script>` files). Treat `.ts` files as the source of truth and generated `.js` files as runtime artifacts.

## Animation pipeline

1. **Load** - `POST /api/pet/load` reads `animations.json` when available, falls back to legacy `animations.xml`, parses the sprite sheet, and returns base64 PNG plus metadata.
2. **Add** - `POST /api` with `add_pet` creates an `Engine` instance for the pet and starts at a spawn point.
3. **Step** - `POST /api` with `step_pet` passes raw world geometry (screen, work area, and desktop bounds). The engine uses screen bounds for walls and work-area bounds for floor contact, then returns `{frame_index, x, y, flip_h, opacity}`.
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
- **Internal Physics** - the engine detects the pet hit a screen edge or floor contact using raw monitor geometry provided by the app.
- **User interaction** - click-and-drag (the app notifies the backend of state changes)

## Sound playback

When an animation transition occurs, the engine checks `pet.Sounds[animationID]` for associated sounds. If found, `sound.PickSound()` selects one based on weighted probability, encodes it as browser-playable audio, and includes it in the next `step_pet` response. The Electron renderer plays the sound through Chromium audio APIs.

Volume is controlled via the `set_volume` command and persisted to `clod-pet-settings.json`.

## Why HTTP instead of WebSockets?

For the animation loop, HTTP polling at ~200ms intervals is preferred because:

- The client always drives the loop (request world context, then receive frame response).
- There is no server-initiated push for pet animations.
- Debugging is easier with standard tools (curl, Postman).
- The Go `net/http` package handles concurrent requests efficiently.

For AI chat where server-initiated push is required (streaming tokens), Clod Pet uses **Server-Sent Events (SSE)**. SSE provides a unidirectional stream over standard HTTP, avoiding the full duplex complexity of WebSockets while still enabling real-time UI updates.
