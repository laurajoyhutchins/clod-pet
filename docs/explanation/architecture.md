# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```text
+----------------------------+     Electron IPC     +----------------------+
| Renderer windows           | ------------------>  | Electron main process |
| - control panel            | <------------------  | - store bridge        |
| - chat window              |      responses       | - tray/menu           |
| - pet window               |                      | - window management   |
| - editor window            |                      | - backend client      |
+----------------------------+                       +----------+-----------+
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
                                                     | - CLI tools          |
                                                     +----------------------+
```

## Why split app and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic and physics because it is computationally simple, testable in isolation, and allows for a language-agnostic headless engine. It also manages AI provider integrations (OpenAI, Gemini, etc.) to keep secrets and complex networking out of the frontend.
- **TypeScript/Electron** owns window management, the tray menu, the control panel, and the renderer bridge because transparent frameless windows and native display APIs are well-supported.
- **Electron main process** is the boundary between the two: renderer windows talk to it over Electron IPC through the preload bridge, and it talks to the Go backend over HTTP and SSE.

## Communication models

Clod Pet uses three communication patterns depending on the task:

1. **Electron IPC:** Renderer windows call methods exposed from `app/src/preload/preload.ts`. The control panel and chat window use this bridge to reach the main process.
2. **Request-response HTTP:** The animation loop uses standard HTTP POST requests. The main process sends world geometry to the Go backend and receives the next frame state. This is simple, easy to debug, and sufficient for 200 ms intervals.
3. **Server-sent events:** AI chat responses use SSE via the `/api/llm/stream` endpoint, with `/api/llm/health` available for provider checks. This allows the backend to stream tokens from LLM providers directly to the chat UI for a responsive typing effect.

The backend also exposes `/api/health`, `/api/describe`, and `/api/version` for health, discovery, and runtime metadata.

## Shared state

The `WorldStore` in `app/src/shared/store/` is the source of truth for UI state. It holds backend status, active pets, environment data, and UI state. The `StoreBridge` in the main process broadcasts the full store to all renderer windows via IPC on every update. Renderers subscribe to `store:updated` events.

Because `setState` is a shallow merge, nested state updates require full-object replacement. This is important when updating a single pet's properties — use `setPet` or `updatePet` rather than spreading into `setState`.

## Animation editor

The editor subsystem (`app/src/editor/`) is a standalone ReactFlow-based graph editor for creating and modifying pet animation definitions. It runs in its own `BrowserWindow` and communicates with the main process through the `editor:*` IPC channels.

Key concepts:
- **Document normalization** — the editor rewrites IDs and cross-references when animations are renamed or reordered, keeping transitions and sounds consistent
- **Sidecar layout files** — editor layout state is persisted next to the document, not inside it
- **Validation** — browser-side schema validation is intentionally limited; deeper checks happen in the main/editor process

## Build metadata

The `buildmode` package (`backend/internal/buildmode/`) provides build-time metadata (debug/release mode) that is surfaced through the `/api/version` and `/api/describe` endpoints. Build mode is controlled with Go build tags: `go build -tags debug .` for debug, or the default release build.

## App build model

The app source is TypeScript. `npm run build:ts` compiles:

- Main-process code with `tsconfig.json`
- Preload code with `tsconfig.json`
- Browser scripts such as `app/src/renderer/control-panel.ts`, `app/src/renderer/chat.ts`, and `app/src/renderer/pet-renderer.ts` with `tsconfig.browser.json`
- Editor code with `tsconfig.editor.json`

Electron still loads generated JavaScript from `app/dist/src/main/main.js`, `app/dist/src/preload/preload.js`, `app/dist/src/renderer/*.js`, and `app/dist/editor/*.js`. Treat `.ts` files as the source of truth and generated `.js` files as runtime artifacts.

## Animation pipeline

1. **Load** - `POST /api/pet/load` reads `animations.json` when available, falls back to legacy `animations.xml`, parses the sprite sheet, and returns base64 PNG plus metadata.
2. **Add** - `POST /api` with `add_pet` creates an `Engine` instance for the pet and starts at a spawn point.
3. **Step** - `POST /api` with `step_pet` or `step_pets` passes raw world geometry (`screen`, `work_area`, and `desktop`, each with `w` and `h` fields). The engine uses the geometry to evaluate borders, floor contact, and gravity before returning the next frame state.
4. **Sync** - `POST /api` with `set_position` updates the backend with the renderer's current position when the window is moved independently.
5. **Render** - the Electron renderer, compiled from TypeScript, draws the frame tile from the sprite sheet onto a transparent canvas at the coordinates provided by the backend.
6. **Transition** - when an animation sequence completes or a border/gravity transition is triggered, the engine picks the next animation via weighted probability.

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
