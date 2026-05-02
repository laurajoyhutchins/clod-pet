# Reference: animations.json format

The modern pet definition file. New pets should use JSON. The backend loads `animations.json` first and falls back to legacy `animations.xml` only when no JSON file is present.

## Root object

```json
{
  "header": {},
  "image": {},
  "spawns": [],
  "animations": [],
  "children": [],
  "sounds": []
}
```

`children` and `sounds` are optional arrays.

## `header`

Metadata about the pet.

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Author name |
| `title` | string | Display title |
| `petname` | string | Internal pet name |
| `version` | string | Version string |
| `info` | string | Description |
| `application` | int | Source application |
| `icon` | path | Relative path to the icon image file |

## `image`

Sprite sheet definition.

| Field | Type | Description |
|-------|------|-------------|
| `tiles_x` | int | Number of columns |
| `tiles_y` | int | Number of rows |
| `spritesheet` | path | Sprite sheet filename. Defaults to `spritesheet.png` |
| `transparency` | string | Optional transparency color name or value |

## `spawns`

Collection of spawn points. Each entry is a possible starting position.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique spawn ID |
| `probability` | int | Selection weight |
| `x` | expression | Spawn X position |
| `y` | expression | Spawn Y position |
| `next` | transition | Animation to enter after spawn |

`next` uses the same transition shape as animation transitions:

| Field | Type | Description |
|-------|------|-------------|
| `probability` | int | Selection weight |
| `only` | string | Optional condition: `none`, `floor` (`taskbar` legacy alias), `window`, `horizontal`, `vertical` |
| `value` | int | Target animation ID |

## `animations`

Collection of animation definitions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique animation ID |
| `name` | string | Animation name, for example `walk` or `fall` |
| `start` | movement | Initial movement parameters |
| `end` | movement | Final movement parameters. Optional; defaults to `start` |
| `sequence` | sequence | Frame sequence and transitions |
| `border` | transition[] | Border collision transitions |
| `gravity` | transition[] | Gravity event transitions |

### `start` / `end` (`movement`)

| Field | Type | Description |
|-------|------|-------------|
| `x` | expression | Horizontal movement per step |
| `y` | expression | Vertical movement per step |
| `interval` | expression | Milliseconds between frames |
| `offset_y` | int | Y offset |
| `opacity` | float | Transparency from `0.0` to `1.0` |

Values are [expressions](expressions.md) and can reference variables like `screenW`, `random`, and `imageH`.

### `sequence`

| Field | Type | Description |
|-------|------|-------------|
| `frames` | int[] | Frame indexes, zero-based into the sprite sheet |
| `nexts` | transition[] | Weighted transitions after the sequence completes |
| `action` | string | Optional engine hint such as `flip` |
| `repeat` | expression | Number of full loop cycles, `0` = infinite |
| `repeat_from` | int | Frame index to loop back to |

### `border` / `gravity`

Arrays of transitions triggered by border or gravity events.

### Transition object

| Field | Type | Description |
|-------|------|-------------|
| `probability` | int | Selection weight |
| `only` | string | Optional filter: `none`, `floor` (`taskbar` legacy alias), `window`, `horizontal`, `vertical` |
| `value` | int | Target animation ID |

## `children`

Child pets that follow this pet, for example a baby sheep.

| Field | Type | Description |
|-------|------|-------------|
| `animation_id` | int | Child animation ID |
| `x` | expression | Child X position |
| `y` | expression | Child Y position |
| `next` | transition | Transition after spawning |

## `sounds`

Sound effects triggered by animations.

| Field | Type | Description |
|-------|------|-------------|
| `animation_id` | int | Animation ID that triggers the sound |
| `probability` | int | Selection weight |
| `loop` | int | Optional loop count |
| `base64` | base64 | Encoded audio data |

## Legacy support

Older pets can still use `animations.xml`, but `animations.json` is the preferred format for new pets and for exported modern pets.
