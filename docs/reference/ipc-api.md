# Reference: IPC API

The app communicates with the Go backend via HTTP POST to `http://localhost:{PORT}/api`.

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
  "spawn_id": 1
}
```

**Response:**
```json
{
  "ok": true,
  "payload": { "pet_id": "../pets/eSheep-modern" }
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

`world`: Raw display geometry used by the backend engine for collision detection and snapping. 
- `screen`: (**DisplayBounds**) Physical monitor dimensions, used for `ceiling` and `walls`.
- `work_area`: (**WorkArea**) Screen area excluding taskbar, used for `floor` contact.
- `desktop`: (**Desktop**) Aggregate geometry of all displays.

**Response:**
```json
{
  "ok": true,
  "payload": {
    "pet_id": "pet_1",
    "frame_index": 2,
    "x": 8.0,
    "y": 0.0,
    "offset_y": 0.0,
    "opacity": 1.0,
    "interval_ms": 200,
    "flip_h": false,
    "next_anim_id": 0
  }
}
```

`next_anim_id > 0` means a transition is triggered (either from internal physics hit, or sequence completion).

### `remove_pet`

Remove a pet from the engine.

**Payload:**
```json
{ "pet_id": "../pets/eSheep-modern" }
```

### `drag_pet`

Set the pet to dragging state and update position.

**Payload:**
```json
{ "pet_id": "../pets/eSheep-modern", "x": 500, "y": 300 }
```

### `drop_pet`

Set the pet to falling state (gravity animation).

**Payload:**
```json
{ "pet_id": "../pets/eSheep-modern" }
```

### `border_pet`

Notify the pet that it hit a screen border.

**Payload:**
```json
{ "pet_id": "../pets/eSheep-modern", "border_ctx": 1 }
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

Get the current engine status (e.g., active pet count).

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

List available pet directories in the `PETS_DIR`.

**Response:**
```json
{
  "ok": true,
  "payload": ["eSheep-modern", "esheep64"]
}
```

### `list_active`

List currently running pet instances and their IDs.

**Response:**
```json
{
  "ok": true,
  "payload": [
    { "id": "pet_1", "path": "eSheep-modern" }
  ]
}
```

### `get_settings` / `set_settings`

Read or update global settings (volume, scale, AI provider).

**`get_settings` Response:**
```json
{
  "ok": true,
  "payload": {
    "volume": 0.5,
    "scale": 1.0,
    "llm_provider": "gemini"
  }
}
```

---

## Streaming and Specialized Endpoints

### `POST /api/llm/stream`

Stream AI response tokens using Server-Sent Events (SSE).

**Payload:** Same as `llm_chat` but `stream` must be `true`.

**Events:**
- `data: <token>`: Partial message content.
- `event: error\ndata: <message>`: Error occurred during streaming.
- `event: done\ndata: {}`: Stream completed successfully.

### `POST /api/pet/load`

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
    "spawns": [{"id": 1, "probability": 20}, ...],
    "anim_count": 77
  }
}
```

### `GET /api/health`

Health check.

**Response:**
```json
{ "status": "ok" }
```
