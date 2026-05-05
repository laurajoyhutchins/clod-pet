# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```text
+----------------------------+     Electron IPC     +----------------------+
| Renderer windows           | ------------------>  | Electron main process |
| - control panel            | <------------------  | - store bridge        |
| - chat window              |      responses       | - tray/menu           |
| - pet window               |                      | - window management   |
+----------------------------+                       | - backend client      |
                                                     +----------+-----------+
                                                                |
                                                                | HTTP POST / SSE
                                                                v
                                                     +----------------------+
                                                     | Go backend           |
                                                     | - animation engine   |
                                                     | - physics/collision  |
                                                     | - pet parsing        |
                                                     | - settings storage   |
                                                     | - AI providers       |
                                                     +----------------------+
```

## Why split app and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic and physics because it is computationally simple, testable in isolation, and allows for a language-agnostic headless engine. It also manages AI provider integrations (OpenAI, Gemini, etc.) to keep secrets and complex networking out of the frontend.
- **TypeScript/Electron** owns window management, the tray menu, the control panel, and the renderer bridge because transparent frameless windows and native display APIs are well-supported.
- **Electron main process** is the boundary between the two: renderer windows talk to it over Electron IPC, and it talks to the Go backend over HTTP and SSE.

## Communication models

Clod Pet uses three communication patterns depending on the task:

1. **Electron IPC:** Renderer windows call methods exposed from `app/src/preload.ts`. The control panel and chat window use this bridge to reach the main process.
2. **Request-response HTTP:** The animation loop uses standard HTTP POST requests. The main process sends world geometry to the Go backend and receives the next frame state. This is simple, easy to debug, and sufficient for 200 ms intervals.
3. **Server-sent events:** AI chat responses use SSE via the `/api/llm/stream` endpoint. This allows the backend to stream tokens from LLM providers directly to the chat UI for a responsive typing effect.

## App build model

The app source is TypeScript. `npm run build:ts` compiles:

- Main-process, preload, and window-management code with `tsconfig.json`
- Browser scripts such as `control-panel.ts`, `chat.ts`, and `src/pet-renderer.ts` with `tsconfig.browser.json`

Electron still loads generated JavaScript (`main.js`, `preload.js`, and browser `<script>` files). Treat `.ts` files as the source of truth and generated `.js` files as runtime artifacts.

## Animation pipeline

1. **Load** - `POST /api/pet/load` reads `animations.json` when available, falls back to legacy `animations.xml`, parses the sprite sheet, and returns base64 PNG plus metadata.
2. **Add** - `POST /api` with `add_pet` creates an `Engine` instance for the pet and starts at a spawn point.
3. **Step** - `POST /api` with `step_pet` passes raw world geometry (`screen`, `work_area`, and `desktop`, each with `w` and `h` fields). The engine uses the geometry to evaluate borders, floor contact, and gravity before returning the next frame state.
4. **Render** - the Electron renderer, compiled from TypeScript, draws the frame tile from the sprite sheet onto a transparent canvas at the coordinates provided by the backend.
5. **Transition** - when an animation sequence completes or a border/gravity transition is triggered, the engine picks the next animation via weighted probability.

## State machine

Each pet engine has a state: `Idle` | `Animating` | `Dragging` | `Falling`.

The state determines which animation plays:

- `Animating` - follows the animation sequence
- `Dragging` - switches to `drag` animation
- `Falling` - switches to `fall` animation
- `Idle` - no frames produced

Transitions between animations are triggered by:

- **Sequence completion** - the animation sequence finishes its repeats
- **Internal physics** - the engine detects the pet hit a screen edge or floor contact using raw monitor geometry provided by the app
- **User interaction** - click-and-drag, which the app notifies to the backend through the main process

## Sound playback

When an animation transition occurs, the engine checks `pet.Sounds[animationID]` for associated sounds. If found, `sound.PickSound()` selects one based on weighted probability, encodes it as browser-playable audio, and includes it in the next `step_pet` response. The Electron renderer plays the sound through Chromium audio APIs.

Volume is controlled via the `set_volume` command and persisted to `clod-pet-settings.json`.

## Why HTTP instead of WebSockets?

For the animation loop, HTTP polling at about 200 ms intervals is preferred because:

- The client always drives the loop by requesting world context and then receiving a frame response
- There is no server-initiated push for pet animations
- Debugging is easier with standard tools such as curl and Postman
- The Go `net/http` package handles concurrent requests efficiently

For AI chat where server-initiated push is required, Clod Pet uses Server-sent Events. SSE provides a unidirectional stream over standard HTTP, avoiding the full duplex complexity of WebSockets while still enabling real-time UI updates.
