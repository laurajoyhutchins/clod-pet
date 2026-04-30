# Reference: animations.xml format

The pet definition file. An XML document describing the sprite sheet, spawn points, and animation state machine.

## Root element

```xml
<animations>
  <header>...</header>
  <image>...</image>
  <spawns>...</spawns>
  <animations>...</animations>
  <childs>...</childs>
  <sounds>...</sounds>
</animations>
```

## `<header>`

Metadata about the pet.

| Element | Type | Description |
|---------|------|-------------|
| `<author>` | string | Author name |
| `<title>` | string | Display title |
| `<petname>` | string | Internal pet name |
| `<version>` | string | Version string |
| `<info>` | string | Description |
| `<application>` | string | Source application |
| `<icon>` | base64 | Icon image data |

## `<image>`

Sprite sheet definition.

| Attribute | Type | Description |
|-----------|------|-------------|
| `tilesx` | int | Number of columns |
| `tilesy` | int | Number of rows |

| Element | Type | Description |
|---------|------|-------------|
| `<png>` | base64 | PNG sprite sheet data |

## `<spawns>`

Collection of spawn points. Each `<spawn>` is a possible starting position.

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | int | Unique spawn ID |
| `probability` | int | Selection weight |

| Element | Type | Description |
|---------|------|-------------|
| `<x>` | expression | Spawn X position |
| `<y>` | expression | Spawn Y position |
| `<next>` | transition | Animation to enter after spawn |

## `<animations>`

Collection of animation definitions.

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | int | Unique animation ID |

| Element | Type | Description |
|---------|------|-------------|
| `<name>` | string | Animation name (e.g. "walk", "fall") |
| `<start>` | movement | Initial movement parameters |
| `<end>` | movement | Final movement parameters (optional; defaults to `<start>`) |
| `<sequence>` | sequence | Frame sequence and transitions |
| `<border>` | transitions | Border collision transitions |
| `<gravity>` | transitions | Gravity event transitions |

### `<start>` / `<end>` (movement)

| Element | Type | Description |
|---------|------|-------------|
| `<x>` | expression | Horizontal movement per step |
| `<y>` | expression | Vertical movement per step |
| `<interval>` | expression | Milliseconds between frames |
| `<offsety>` | int | Y offset |
| `<opacity>` | float | Transparency (0.0–1.0) |

Values are [expressions](expressions.md) — they can reference variables like `screenW`, `random`, etc.

### `<sequence>`

| Attribute | Type | Description |
|-----------|------|-------------|
| `repeat` | expression | Number of full loop cycles (0 = infinite) |
| `repeatfrom` | int | Frame index to loop back to |

| Element | Type | Description |
|---------|------|-------------|
| `<frame>` | int | Frame index (0-based into sprite sheet tiles) |
| `<next>` | transition | Transition at sequence end |

### `<border>` / `<gravity>` (transitions)

Collection of `<next>` elements triggered on border/gravity events.

### `<next>` (transition)

| Attribute | Type | Description |
|-----------|------|-------------|
| `probability` | int | Selection weight |
| `only` | string | Condition: `none`, `taskbar`, `window`, `horizontal`, `vertical` |

Chardata is the target animation ID.

## `<childs>`

Child pets that follow this pet (e.g. a baby sheep).

## `<sounds>`

Sound effects triggered by animations.

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | int | Sound ID |

| Element | Type | Description |
|---------|------|-------------|
| `<wav>` | base64 | WAV audio data |
