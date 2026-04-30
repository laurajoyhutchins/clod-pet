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

	if idx := strings.Index(expr, "+"); idx > 0 {
		left, err := evalExpr(expr[:idx], env)
		if err != nil {
			return 0, err
		}
		right, err := evalExpr(expr[idx+1:], env)
		if err != nil {
			return 0, err
		}
		return left + right, nil
	}

	if idx := strings.LastIndex(expr, "-"); idx > 0 {
		left, err := evalExpr(expr[:idx], env)
		if err != nil {
			return 0, err
		}
		right, err := evalExpr(expr[idx+1:], env)
		if err != nil {
			return 0, err
		}
		return left - right, nil
	}

	if idx := strings.LastIndex(expr, "*"); idx > 0 {
		left, err := evalExpr(expr[:idx], env)
		if err != nil {
			return 0, err
		}
		right, err := evalExpr(expr[idx+1:], env)
		if err != nil {
			return 0, err
		}
		return left * right, nil
	}

	if idx := strings.LastIndex(expr, "/"); idx > 0 {
		left, err := evalExpr(expr[:idx], env)
		if err != nil {
			return 0, err
		}
		right, err := evalExpr(expr[idx+1:], env)
		if err != nil {
			return 0, err
		}
		if right == 0 {
			return 0, fmt.Errorf("division by zero in %q", expr)
		}
		return left / right, nil
	}

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
