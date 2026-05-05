# Reference: Backend HTTP API

This page documents the HTTP API between the Electron main process and the Go backend.
Renderer windows communicate with the main process through the `preload.ts` bridge; they do not call the backend API directly.

## Request format

```json
{
  "command": "<command_name>",
  "payload": { ... }
}
```

## Response format

```json
{
  "ok": true,
  "payload": { ... }
}
```

or

```json
{
  "ok": false,
  "error": "error message"
}
```

## Commands

### `add_pet`

Register a pet with the animation engine.

**Payload:**
```json
{
  "pet_path": "../pets/eSheep-modern",
  "spawn_id": 1,
  "world": {
    "screen": { "x": 0, "y": 0, "w": 1920, "h": 1080 },
    "work_area": { "x": 0, "y": 0, "w": 1920, "h": 1040 },
    "desktop": { "x": 0, "y": 0, "w": 3840, "h": 1080 }
  }
}
```

**Response:**
```json
{
  "ok": true,
  "payload": {
    "pet_id": "pet_1",
    "x": 500,
    "y": 300,
    "flip_h": false,
    "current_anim_id": 1,
    "current_anim_name": "idle",
    "border_ctx": 0
  }
}
```

### `step_pet`

Advance the pet's animation by one frame and process physics.

**Payload:**
```json
{
  "pet_id": "pet_1",
  "world": {
    "screen": { "x": 0, "y": 0, "w": 1920, "h": 1080 },
    "work_area": { "x": 0, "y": 0, "w": 1920, "h": 1040 },
    "desktop": { "x": 0, "y": 0, "w": 3840, "h": 1080 }
  }
}
```

`world` is the raw display geometry used by the backend engine for collision detection and snapping.
- `screen`: physical monitor dimensions, used for ceiling and walls
- `work_area`: screen area excluding taskbar, used for floor contact
- `desktop`: aggregate geometry of all displays

**Response:**
```json
{
  "ok": true,
  "payload": {
    "pet_id": "pet_1",
    "frame_index": 2,
    "x": 8,
    "y": 0,
    "offset_y": 0,
    "opacity": 1,
    "interval_ms": 200,
    "flip_h": false,
    "current_anim_id": 1,
    "current_anim_name": "walk",
    "next_anim_id": 0,
    "border_ctx": 1
  }
}
```

`next_anim_id > 0` means a transition is triggered, either from internal physics or sequence completion.

### `remove_pet`

Remove a pet from the engine.

**Payload:**
```json
{ "pet_id": "pet_1" }
```

### `drag_pet`

Set the pet to dragging state and update position.

**Payload:**
```json
{ "pet_id": "pet_1", "x": 500, "y": 300 }
```

### `set_position`

Sync the current on-screen position back to the backend.

**Payload:**
```json
{ "pet_id": "pet_1", "x": 500, "y": 300 }
```

### `drop_pet`

Set the pet to falling state.

**Payload:**
```json
{ "pet_id": "pet_1" }
```

### `border_pet`

Notify the pet that it hit a screen border.

**Payload:**
```json
{ "pet_id": "pet_1", "border_ctx": 1 }
```

### `llm_chat`

Send a message to the AI pet.

**Payload:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false
}
```

**Response:**
```json
{
  "ok": true,
  "payload": {
    "role": "assistant",
    "content": "Hi there! I'm your desktop pet."
  }
}
```

### `get_status`

Get the current engine status, including the active pet count.

**Response:**
```json
{
  "ok": true,
  "payload": {
    "pet_count": 1,
    "uptime_seconds": 3600
  }
}
```

### `list_pets`

List available pet directories in `PETS_DIR`.

**Response:**
```json
{
  "ok": true,
  "payload": ["eSheep-modern", "esheep64"]
}
```

### `list_active`

List currently running pet instances.

**Response:**
```json
{
  "ok": true,
  "payload": [
    { "pet_id": "pet_1", "title": "eSheep 64bit", "pet_name": "eSheep" }
  ]
}
```

### `get_settings` / `set_settings`

Read or update global settings such as volume, scale, and the startup pet.

**`get_settings` response:**
```json
{
  "ok": true,
  "payload": {
    "Scale": 1,
    "Volume": 0.5,
    "GravityFactor": 2,
    "CurrentPet": "eSheep-modern"
  }
}
```

### `get_pet`

Load pet data from an `animations.json` file, or fall back to a legacy `animations.xml` pet when no JSON file is present.

**Payload:**
```json
{ "pet_path": "../pets/eSheep-modern" }
```

**Response:**
```json
{
  "ok": true,
  "payload": {
    "title": "eSheep 64bit",
    "pet_name": "eSheep",
    "tiles_x": 16,
    "tiles_y": 11,
    "png_base64": "iVBORw0KGgo...",
    "frame_w": 64,
    "frame_h": 64,
    "spawns": [{ "id": 1, "probability": 20 }],
    "anim_count": 77
  }
}
```

## Streaming and specialized endpoints

### `POST /api/llm/stream`

Stream AI response tokens using Server-sent Events.

**Payload:** Same as `llm_chat` but `stream` must be `true`.

**Events:**
- `data: <token>`: partial message content
- `event: error` + `data: <message>`: error occurred during streaming
- `event: done` + `data: {}`: stream completed successfully

### `GET /api/health`

Health check.

**Response:**
```json
{ "status": "ok" }
```

### `GET /api/version`

Return the backend version information.

**Response:**
```json
{ "ok": true, "version": "0.1.0" }
```
