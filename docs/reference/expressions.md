# Reference: Expression language

Expressions evaluate to numbers at runtime. They enable animations to adapt to screen size and add randomness.

## Variables

| Name | Description |
|------|-------------|
| `screenW` | Primary display width (pixels) |
| `screenH` | Primary display height (pixels) |
| `areaW` | Work area width (excludes taskbar) |
| `areaH` | Work area height |
| `imageW` | Pet sprite frame width |
| `imageH` | Pet sprite frame height |
| `imageX` | Current pet X position |
| `imageY` | Current pet Y position |
| `random` | Random float 0–99 (regenerated each step) |
| `randS` | Random float 0–99 (regenerated each step) |

## Operators

| Operator | Description | Precedence |
|----------|-------------|------------|
| `+` | Addition | Low |
| `-` | Subtraction | Low |
| `*` | Multiplication | High |
| `/` | Division | High |

## Examples

```
screenW+10              # 10 pixels past right edge
areaH-imageH            # Bottom of work area
random*(screenW-imageW-50)/100+25   # Random X with 25px padding
screenW/2-imageW/2      # Center of screen
```

## How evaluation works

The expression evaluator is a recursive descent parser:

1. **Literal check** — if the expression is a plain number, parse and return
2. **Variable lookup** — if it matches a known variable name, return its value
3. **Binary operators** — split on `+`, `-`, `*`, `/` (left-to-right) and recurse
4. **Functions** — `lerp(a,b,t)`, `clamp(v,min,max)` are available as built-ins

The engine regenerates `random` each animation step, so expressions like `random*100` produce different values on each evaluation.

## Limitations

- No parentheses support
- No unary negation (use `0-x` instead of `-x`)
- No comparison operators
- No function composition (can't nest `lerp` inside `clamp`)
