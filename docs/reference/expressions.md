# Reference: Expression language

Expressions evaluate to numbers at runtime. They let animation definitions adapt to screen size and include randomness.

## Variables

| Name | Description |
|------|-------------|
| `screenX` | Display X origin |
| `screenY` | Display Y origin |
| `screenW` | Display width in pixels |
| `screenH` | Display height in pixels |
| `areaX` | Work area X origin |
| `areaY` | Work area Y origin |
| `areaW` | Work area width, excluding the taskbar or dock |
| `areaH` | Work area height |
| `desktopX` | Total desktop X origin |
| `desktopY` | Total desktop Y origin |
| `desktopW` | Total desktop width across all displays |
| `desktopH` | Total desktop height across all displays |
| `imageW` | Pet sprite frame width |
| `imageH` | Pet sprite frame height |
| `imageX` | Current pet X position |
| `imageY` | Current pet Y position |
| `random` | Random float from 0 to 99, regenerated each step |
| `randS` | Random float from 0 to 99, regenerated each step |

## Operators

| Operator | Description | Precedence |
|----------|-------------|------------|
| `+` | Addition | Low |
| `-` | Subtraction | Low |
| `*` | Multiplication | High |
| `/` | Division | High |
| `( )` | Parentheses | Highest |

## Examples

```text
screenW+10
areaH-imageH
random*(screenW-imageW-50)/100+25
(screenW/2)-(imageW/2)
```

## How evaluation works

The expression evaluator is a recursive descent parser:

1. Literal check - if the expression is a plain number, parse and return it.
2. Variable lookup - if it matches a known variable name, return its value.
3. Binary operators - split on `+`, `-`, `*`, or `/` and recurse while respecting operator precedence and parentheses.

The engine regenerates `random` and `randS` each animation step, so expressions using them produce different values over time.

## Limitations

- No unary negation. Use `0-x` instead of `-x`.
- No comparison operators.
- No function support. `lerp` and `clamp` are used internally by the engine but are not available in the expression language.
