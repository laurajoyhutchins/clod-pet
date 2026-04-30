package expression

import (
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
)

const RandomMax = 100

type Env struct {
	ScreenW float64
	ScreenH float64
	AreaW   float64
	AreaH   float64
	ImageW  float64
	ImageH  float64
	ImageX  float64
	ImageY  float64
	Random  float64
	RandS   float64
}

func Eval(expr string, env *Env) (float64, error) {
	expr = strings.TrimSpace(expr)
	return evalExpr(expr, env)
}

func EvalInt(expr string, env *Env) (int, error) {
	v, err := Eval(expr, env)
	if err != nil {
		return 0, err
	}
	return int(v), nil
}

func evalExpr(expr string, env *Env) (float64, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return 0, nil
	}

	// Remove outermost parentheses if they wrap the entire expression
	for len(expr) > 0 && expr[0] == '(' && expr[len(expr)-1] == ')' {
		// Verify if these parentheses actually match each other
		depth := 0
		matches := true
		for i := 0; i < len(expr)-1; i++ {
			if expr[i] == '(' {
				depth++
			} else if expr[i] == ')' {
				depth--
			}
			if depth == 0 {
				matches = false
				break
			}
		}
		if matches {
			expr = strings.TrimSpace(expr[1 : len(expr)-1])
		} else {
			break
		}
	}

	// Find the last lowest-precedence operator (+, -) that is not inside parentheses
	splitIdx := -1
	op := ""
	depth := 0
	for i := len(expr) - 1; i >= 0; i-- {
		c := expr[i]
		if c == ')' {
			depth++
		} else if c == '(' {
			depth--
		} else if depth == 0 {
			if (c == '+' || c == '-') && i > 0 { // i > 0 to avoid unary plus/minus at start
				splitIdx = i
				op = string(c)
				break
			}
		}
	}

	// If no +, - found, look for *, /
	if splitIdx == -1 {
		depth = 0
		for i := len(expr) - 1; i >= 0; i-- {
			c := expr[i]
			if c == ')' {
				depth++
			} else if c == '(' {
				depth--
			} else if depth == 0 {
				if (c == '*' || c == '/') && i > 0 {
					splitIdx = i
					op = string(c)
					break
				}
			}
		}
	}

	if splitIdx != -1 {
		leftStr := expr[:splitIdx]
		rightStr := expr[splitIdx+1:]
		left, err := evalExpr(leftStr, env)
		if err != nil {
			return 0, err
		}
		right, err := evalExpr(rightStr, env)
		if err != nil {
			return 0, err
		}

		switch op {
		case "+":
			return left + right, nil
		case "-":
			return left - right, nil
		case "*":
			return left * right, nil
		case "/":
			if right == 0 {
				return 0, fmt.Errorf("division by zero in %q", expr)
			}
			return left / right, nil
		}
	}

	// No operators found, handle as literal or variable
	if val, err := strconv.ParseFloat(expr, 64); err == nil {
		return val, nil
	}

	switch expr {
	case "screenW":
		return env.ScreenW, nil
	case "screenH":
		return env.ScreenH, nil
	case "areaW":
		return env.AreaW, nil
	case "areaH":
		return env.AreaH, nil
	case "imageW":
		return env.ImageW, nil
	case "imageH":
		return env.ImageH, nil
	case "imageX":
		return env.ImageX, nil
	case "imageY":
		return env.ImageY, nil
	case "random":
		return env.Random, nil
	case "randS":
		return env.RandS, nil
	}

	return 0, fmt.Errorf("unknown expression %q", expr)
}

func NewEnv() *Env {
	return &Env{
		Random: float64(rand.Intn(RandomMax)),
		RandS:  float64(rand.Intn(RandomMax)),
	}
}

func (e *Env) RegenerateRandom() {
	e.Random = float64(rand.Intn(RandomMax))
	e.RandS = float64(rand.Intn(RandomMax))
}

func Clamp(v, min, max float64) float64 {
	return math.Max(min, math.Min(max, v))
}

func Lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}
