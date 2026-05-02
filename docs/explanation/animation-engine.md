# Explanation: Animation engine

The engine is a finite state machine that interprets animation definitions from `animations.json` (with legacy XML pets converted before they reach the engine).

## Core loop

```
Start(spawnID)
  └─▶ Load animation
       └─▶ Step(borderCtx)
            ├─▶ Return current frame + position
            ├─▶ If sequence complete → pick next animation
            │    └─▶ Return next_anim_id
            └─▶ If border hit → pick border transition
                 └─▶ Return next_anim_id
```

## Frame interpolation

Each animation defines `start` and `end` movement parameters. The engine interpolates between them over the course of the animation:

```
progress = steps_done / total_steps
x = lerp(start.x, end.x, progress)
y = lerp(start.y, end.y, progress)
opacity = lerp(start.opacity, end.opacity, progress)
```

This allows smooth acceleration, fading, and positional changes without keyframes.

## Animation states

| State | When | Animation |
|-------|------|-----------|
| `Idle` | Pet exists but hasn't started | None |
| `Animating` | Normal operation | Current animation from JSON |
| `Dragging` | User clicked and holds | `drag` animation (if defined) |
| `Falling` | User released after drag | `fall` animation (if defined) |

## Transitions

Animations define three kinds of transitions:

### Sequence transitions (`sequence.nexts`)

Triggered when the frame sequence completes its repeat count. Uses weighted probability:

```json
{
  "nexts": [
    { "probability": 90, "only": "none", "value": 1 },
    { "probability": 6, "only": "none", "value": 15 },
    { "probability": 2, "only": "window", "value": 11 }
  ]
}
```

The `only` field filters transitions by border context. `none` means "always eligible."

### Border transitions (`border[]`)

Triggered when the pet hits a screen edge or floor contact and `border_ctx` is non-zero. The TypeScript app detects boundaries per display and passes the context to each step. 

Standard Nomenclature:
- `floor`: Bottom of the work area (top of taskbar/dock).
- `ceiling`: Top edge of the display bounds.
- `walls`: Left or right edges of the display bounds.
- `obstacle`: Edge of another window or custom boundary.

Legacy aliases like `taskbar`, `horizontal`, and `vertical` are supported for backward compatibility with older pet definitions.

### Gravity transitions (`gravity[]`)

Triggered when the pet is above the `floor` and gravity is detected (`gravity: true` in step_pet payload). The app's `BorderDetector.checkGravity()` returns true when the pet's Y position is above the floor for the display containing the pet.

Example JSON:
```json
{
  "gravity": [
    { "probability": 100, "only": "none", "value": 5 }
  ]
}
```

## Weighted selection

When multiple transitions are eligible, one is picked by weighted random:

```
total = sum(probabilities)
r = random(0, total)
cumulative = 0
for each candidate:
    cumulative += candidate.probability
    if r < cumulative:
        return candidate.id
```

## Frame cycling

The sequence has a `repeat` count and a `repeat_from` index:

```json
{
  "sequence": {
    "repeat": "20",
    "repeat_from": 0,
    "frames": [2, 3]
  }
}
```

This cycles frames 2 and 3 twenty times, for 40 total steps, before checking transitions.

`repeat_from` allows looping a subset: a value of `1` would skip the first frame on loop-back.

## Position tracking

The engine maintains `parentX` and `parentY` as absolute screen coordinates. Each step:

1. Evaluates `start.x` and `end.x` as expressions
2. Interpolates to get `curX`
3. Accumulates: `parentX += curX`

This means the position is the integral of all per-step movements, not an absolute value from the JSON definition.
