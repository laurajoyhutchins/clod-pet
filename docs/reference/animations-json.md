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

The current format does not yet contain an explicit schema-version field. Do not add one ad hoc to a pet and assume the runtime will apply migration semantics. Schema versioning is an owner-controlled compatibility decision recorded in the repository review register.

## Project-local asset rule

`header.icon` and `image.spritesheet` are asset references relative to the directory containing `animations.json`.

Valid examples:

```json
{
  "header": { "icon": "icon.png" },
  "image": { "spritesheet": "sprites/sheet.png" }
}
```

Invalid references include:

- absolute Windows paths such as `C:\\pets\\sheet.png`;
- UNC paths such as `\\\\server\\share\\sheet.png`;
- POSIX absolute paths such as `/tmp/sheet.png`;
- any segment equal to `..`;
- a symlink or Windows reparse point that resolves outside the pet project.

The editor domain validator rejects unsafe references, and Electron main independently resolves existing files canonically inside the approved editor project. The Go runtime independently resolves the pet directory canonically inside `PETS_DIR`. These checks are intentionally duplicated at different trust boundaries.

Pet definitions must not contain executable commands, provider configuration, credentials, or arbitrary host paths.

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
| `icon` | path | Project-relative path to the icon image file |

The current header fields are descriptive only. They are not sufficient asset-license evidence. Bundled release assets must also appear in the asset license and attribution register.

## `image`

Sprite sheet definition.

| Field | Type | Description |
|-------|------|-------------|
| `tiles_x` | int | Number of columns |
| `tiles_y` | int | Number of rows |
| `spritesheet` | path | Project-relative sprite sheet filename. Defaults to `spritesheet.png` |
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
| `only` | string | Optional condition: `none`, `floor` (`taskbar` legacy), `ceiling` (`horizontal` legacy), `walls` (`vertical` legacy), `obstacle` (`window` legacy) |
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
| `only` | string | Optional filter: `none`, `floor` (`taskbar` legacy), `ceiling` (`horizontal` legacy), `walls` (`vertical` legacy), `obstacle` (`window` legacy) |
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

Legacy XML is a compatibility and import format, not a second equally authoritative runtime model. Converted output must pass modern validation before use. A future converter review must continue to test external-entity rejection, deterministic conversion, lossy-field diagnostics, and source preservation.
