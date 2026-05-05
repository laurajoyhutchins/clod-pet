package expression

import (
	"math"
	"testing"
)

// testEval is a test helper that parses and evaluates an expression string.
func testEval(t *testing.T, expr string, env *Env) (float64, error) {
	t.Helper()
	parsed, err := Parse(expr)
	if err != nil {
		return 0, err
	}
	return parsed.Eval(env)
}

const epsilon = 1e-9

func withinEpsilon(got, want float64) bool {
	return math.Abs(got-want) < epsilon
}

func assertEval(t *testing.T, expr string, env *Env, want float64) {
	t.Helper()
	got, err := testEval(t, expr, env)
	if err != nil {
		t.Errorf("Eval(%q) error: %v", expr, err)
		return
	}
	if !withinEpsilon(got, want) {
		t.Errorf("Eval(%q) = %v, want %v", expr, got, want)
	}
}

func TestEvalLiteral(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"0", 0},
		{"42", 42},
		{"-3.14", -3.14},
		{"100", 100},
		{"  7  ", 7},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalVariables(t *testing.T) {
	env := &Env{
		ScreenW:  1920,
		ScreenH:  1080,
		ScreenX:  0,
		ScreenY:  0,
		AreaW:    1920,
		AreaH:    1040,
		AreaX:    0,
		AreaY:    0,
		DesktopX: 0,
		DesktopY: 0,
		DesktopW: 1920,
		DesktopH: 1080,
		ImageW:   64,
		ImageH:   64,
		ImageX:   100,
		ImageY:   200,
		Random:   50,
		RandS:    75,
	}

	tests := []struct {
		expr string
		want float64
	}{
		{"screenW", 1920},
		{"screenH", 1080},
		{"screenX", 0},
		{"screenY", 0},
		{"areaW", 1920},
		{"areaH", 1040},
		{"areaX", 0},
		{"areaY", 0},
		{"desktopX", 0},
		{"desktopY", 0},
		{"desktopW", 1920},
		{"desktopH", 1080},
		{"imageW", 64},
		{"imageH", 64},
		{"imageX", 100},
		{"imageY", 200},
		{"random", 50},
		{"randS", 75},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalAddition(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"1+2", 3},
		{"10+20+30", 60},
		{"100+10", 110},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalSubtraction(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"10-3", 7},
		{"100-50-10", 40},
		{"10-2-3", 5},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalMultiplication(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"3*4", 12},
		{"2*3*4", 24},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalDivision(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"10/2", 5},
		{"100/4/5", 5},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalDivisionByZero(t *testing.T) {
	_, err := testEval(t, "10/0", &Env{})
	if err == nil {
		t.Error("Eval(10/0) expected error, got nil")
	}
}

func TestEvalPrecedence(t *testing.T) {
	env := &Env{}
	tests := []struct {
		expr string
		want float64
	}{
		{"2+3*4", 14},
		{"10-2*3", 4},
		{"6/2+1", 4},
		{"1+2*3+4", 11},
		{"10+20-5", 25},
		{"10-5+2", 7},
		{"(10+20)*2", 60},
		{"(100-50)/2", 25},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalWithVariables(t *testing.T) {
	env := &Env{
		ScreenW: 1920,
		ScreenH: 1080,
		ImageW:  64,
		ImageH:  64,
	}

	tests := []struct {
		expr string
		want float64
	}{
		{"screenW-imageW", 1920 - 64},
		{"screenW/2", 960},
		{"screenH+100", 1180},
		{"screenW*2", 3840},
		{"screenW-imageW-50", 1920 - 64 - 50},
		{"screenW/2-imageW/2", 960.0 - 32.0},
	}

	for _, tc := range tests {
		t.Run(tc.expr, func(t *testing.T) {
			assertEval(t, tc.expr, env, tc.want)
		})
	}
}

func TestEvalInt(t *testing.T) {
	env := &Env{}
	parsed, err := Parse("42")
	if err != nil {
		t.Fatalf("Parse error: %v", err)
	}
	got, err := parsed.EvalInt(env)
	if err != nil {
		t.Fatalf("EvalInt error: %v", err)
	}
	if got != 42 {
		t.Errorf("EvalInt = %d, want 42", got)
	}
}

func TestLerp(t *testing.T) {
	tests := []struct {
		a, b, t, want float64
	}{
		{0, 100, 0, 0},
		{0, 100, 1, 100},
		{0, 100, 0.5, 50},
		{10, 20, 0.25, 12.5},
		{-10, 10, 0.5, 0},
	}

	for _, tc := range tests {
		t.Run("", func(t *testing.T) {
			got := Lerp(tc.a, tc.b, tc.t)
			if got != tc.want {
				t.Errorf("Lerp(%v, %v, %v) = %v, want %v", tc.a, tc.b, tc.t, got, tc.want)
			}
		})
	}
}

func TestClamp(t *testing.T) {
	tests := []struct {
		v, min, max, want float64
	}{
		{50, 0, 100, 50},
		{-10, 0, 100, 0},
		{150, 0, 100, 100},
		{0, 0, 100, 0},
		{100, 0, 100, 100},
	}

	for _, tc := range tests {
		t.Run("", func(t *testing.T) {
			got := Clamp(tc.v, tc.min, tc.max)
			if got != tc.want {
				t.Errorf("Clamp(%v, %v, %v) = %v, want %v", tc.v, tc.min, tc.max, got, tc.want)
			}
		})
	}
}

func TestNewEnv(t *testing.T) {
	env := NewEnv()
	if env.Random < 0 || env.Random >= RandomMax {
		t.Errorf("Random out of range: %v", env.Random)
	}
	if env.RandS < 0 || env.RandS >= RandomMax {
		t.Errorf("RandS out of range: %v", env.RandS)
	}
}

func TestRegenerateRandom(t *testing.T) {
	env := NewEnv()
	old := env.Random
	env.RandS = -1
	env.RegenerateRandom()
	if env.Random == old {
		t.Log("Random value unchanged after RegenerateRandom (low probability collision)")
	}
	if env.Random < 0 || env.Random >= RandomMax {
		t.Errorf("Random out of range: %v", env.Random)
	}
	if env.RandS < 0 || env.RandS >= RandomMax {
		t.Errorf("RandS out of range after RegenerateRandom: %v", env.RandS)
	}
}

func TestEvalUnknownVariable(t *testing.T) {
	_, err := testEval(t, "unknownVar", &Env{})
	if err == nil {
		t.Error("Eval(unknownVar) expected error, got nil")
	}
}

func TestEvalOperatorErrors(t *testing.T) {
	env := &Env{}
	badExprs := []string{
		"1+unknown",
		"unknown+1",
		"1-unknown",
		"unknown-1",
		"1*unknown",
		"unknown*1",
		"1/unknown",
		"unknown/1",
	}
	for _, expr := range badExprs {
		t.Run(expr, func(t *testing.T) {
			_, err := testEval(t, expr, env)
			if err == nil {
				t.Errorf("Eval(%q) expected error, got nil", expr)
			}
		})
	}
}

func TestEvalFloatLiteral(t *testing.T) {
	assertEval(t, "3.14", &Env{}, 3.14)
}
