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
    "taskbar": { "x": 0, "y": 1040, "w": 1920, "h": 40 }
  }
}
```

`world`: Raw monitor and taskbar geometry used by the backend engine for collision detection and snapping.

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

### `set_volume`

Set the audio volume for sound playback.

**Payload:**
```json
{ "volume": 0.5 }
```

`volume`: Float between 0.0 (mute) and 1.0 (full volume). Persisted to settings.

## Endpoints outside `/api`

### `POST /api/pet/load`

Load pet data from an `animations.xml` file.

**Payload:**
```json
{ "pet_path": "../pets/eSheep-modern" }
```

**Response:**
```json
{
  "ok": true,
  "pet": {
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
