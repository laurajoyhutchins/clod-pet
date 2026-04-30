# Explanation: Architecture

Clod Pet follows a client-server architecture split across two processes.

## Process model

```
┌─────────────────┐         HTTP POST          ┌──────────────────┐
│   Electron      │ ──────────────────────────▶ │   Go backend     │
│   (frontend)    │ ◀────────────────────────── │   (backend)      │
│                 │        JSON response        │                  │
│  - Tray menu    │                             │  - Animation     │
│  - Pet windows  │                             │    state machine │
│  - Sprite       │                             │  - XML parsing   │
│    rendering    │                             │  - Expression    │
│  - Drag/drop    │                             │    evaluation    │
│                 │                             │  - Sound         │
└─────────────────┘                             └──────────────────┘
```

## Why split frontend and backend?

The original desktop pet (eSheep) was a single Windows application. This project separates concerns:

- **Go** owns the animation logic because it's computationally simple, has good XML support, and compiles to a single binary
- **Electron** owns the window management because transparent frameless windows and cross-platform tray menus are well-supported

The communication layer is HTTP JSON — simple to debug, language-agnostic, and sufficient for 200ms polling intervals.

## Animation pipeline

1. **Load** — `POST /api/pet/load` reads `animations.xml`, parses the sprite sheet, returns base64 PNG and metadata
2. **Add** — `POST /api` with `add_pet` creates an `Engine` instance for the pet, starts at a spawn point
3. **Step** — `POST /api` with `step_pet` advances the engine one frame, returns `{frame_index, x, y, flip_h, opacity}`
4. **Render** — Electron draws the frame tile from the sprite sheet onto a transparent canvas
5. **Transition** — When an animation's sequence completes, the engine picks the next animation via weighted probability

## State machine

Each pet engine has a state: `Idle` | `Animating` | `Dragging` | `Falling`

The state determines which animation plays:
- `Animating` — follows the animation sequence
- `Dragging` — switches to `drag` animation
- `Falling` — switches to `fall` animation
- `Idle` — no frames produced

Transitions between animations are triggered by:
- **Sequence completion** — the `<sequence>` finishes its repeats
- **Border events** — the pet hits a screen edge (`border_ctx`)
- **Gravity events** — the pet falls off a ledge
- **User interaction** — click-and-drag

## Why HTTP polling instead of WebSockets?

The animation step interval is ~200ms. WebSocket adds complexity for a use case where:
- The client always drives the loop (request → response)
- There's no server-initiated push
- Debugging is easier with curl/Postman
- The Go stdlib `net/http` handles concurrent requests well
