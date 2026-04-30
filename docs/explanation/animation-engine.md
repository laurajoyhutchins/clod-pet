# Explanation: Animation engine

The engine is a finite state machine that interprets animation definitions from `animations.xml`.

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

Each animation defines `<start>` and `<end>` movement parameters. The engine interpolates between them over the course of the animation:

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
| `Animating` | Normal operation | Current animation from XML |
| `Dragging` | User clicked and holds | `drag` animation (if defined) |
| `Falling` | User released after drag | `fall` animation (if defined) |

## Transitions

Animations define three kinds of transitions:

### Sequence transitions (`<sequence><next>`)

Triggered when the frame sequence completes its repeat count. Uses weighted probability:

```xml
<next probability="90" only="none">1</next>    <!-- 90% keep walking -->
<next probability="6" only="none">15</next>    <!-- 6% sit down -->
<next probability="2" only="window">11</next>  <!-- 2% if near window -->
```

The `only` attribute filters transitions by border context. `none` means "always eligible."

### Border transitions (`<border><next>`)

Triggered when the pet hits a screen edge and `border_ctx` is non-zero. The TypeScript frontend detects screen boundaries per display and passes the context to each step.

### Gravity transitions (`<gravity><next>`)

Triggered when the pet is above the work area and gravity is detected (`gravity: true` in step_pet payload). The frontend's `BorderDetector.checkGravity()` returns true when the pet's Y position is above the work area bottom for the display containing the pet.

Example XML:
```xml
<gravity>
  <next probability="100">fall</next>
</gravity>
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

The sequence has a `repeat` count and a `repeatfrom` index:

```xml
<sequence repeat="20" repeatfrom="0">
  <frame>2</frame>
  <frame>3</frame>
</sequence>
```

This cycles frames 2,3 twenty times (40 total steps) before checking transitions.

`repeatfrom` allows looping a subset: `repeatfrom="1"` would skip the first frame on loop-back.

## Position tracking

The engine maintains `parentX` and `parentY` as absolute screen coordinates. Each step:

1. Evaluates `start.x` and `end.x` as expressions
2. Interpolates to get `curX`
3. Accumulates: `parentX += curX`

This means the position is the integral of all per-step movements, not an absolute value from the XML.
