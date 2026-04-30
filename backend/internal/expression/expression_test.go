package expression

import (
	"math"
	"testing"
)

func TestEvalLiteral(t *testing.T) {
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

	env := &Env{}
	for _, tc := range tests {
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
	}
}

func TestEvalVariables(t *testing.T) {
	env := &Env{
		ScreenW: 1920,
		ScreenH: 1080,
		AreaW:   1920,
		AreaH:   1040,
		ImageW:  64,
		ImageH:  64,
		ImageX:  100,
		ImageY:  200,
		Random:  50,
		RandS:   75,
	}

	tests := []struct {
		expr string
		want float64
	}{
		{"screenW", 1920},
		{"screenH", 1080},
		{"areaW", 1920},
		{"areaH", 1040},
		{"imageW", 64},
		{"imageH", 64},
		{"imageX", 100},
		{"imageY", 200},
		{"random", 50},
		{"randS", 75},
	}

	for _, tc := range tests {
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
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
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
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
	}

	for _, tc := range tests {
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
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
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
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
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
	}
}

func TestEvalDivisionByZero(t *testing.T) {
	_, err := Eval("10/0", &Env{})
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
	}

	for _, tc := range tests {
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
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
	}

	for _, tc := range tests {
		got, err := Eval(tc.expr, env)
		if err != nil {
			t.Errorf("Eval(%q) error: %v", tc.expr, err)
			continue
		}
		if got != tc.want {
			t.Errorf("Eval(%q) = %v, want %v", tc.expr, got, tc.want)
		}
	}
}

func TestEvalComplexExpression(t *testing.T) {
	env := &Env{
		ScreenW: 1920,
		ImageW:  64,
	}

	got, err := Eval("screenW-imageW-50", env)
	if err != nil {
		t.Fatalf("Eval error: %v", err)
	}

	want := float64(1920 - 64 - 50)
	if got != want {
		t.Errorf("Eval = %v, want %v", got, want)
	}
}

func TestEvalInt(t *testing.T) {
	env := &Env{}
	got, err := EvalInt("42", env)
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
		got := Lerp(tc.a, tc.b, tc.t)
		if got != tc.want {
			t.Errorf("Lerp(%v, %v, %v) = %v, want %v", tc.a, tc.b, tc.t, got, tc.want)
		}
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
		got := Clamp(tc.v, tc.min, tc.max)
		if got != tc.want {
			t.Errorf("Clamp(%v, %v, %v) = %v, want %v", tc.v, tc.min, tc.max, got, tc.want)
		}
	}
}

func TestNewEnv(t *testing.T) {
	env := NewEnv()
	if env.Random < 0 || env.Random >= 100 {
		t.Errorf("Random out of range: %v", env.Random)
	}
	if env.RandS < 0 || env.RandS >= 100 {
		t.Errorf("RandS out of range: %v", env.RandS)
	}
}

func TestRegenerateRandom(t *testing.T) {
	env := NewEnv()
	old := env.Random
	env.RegenerateRandom()
	if env.Random == old {
		t.Log("Random value unchanged after RegenerateRandom (low probability collision)")
	}
	if env.Random < 0 || env.Random >= 100 {
		t.Errorf("Random out of range: %v", env.Random)
	}
}

func TestEvalUnknownVariable(t *testing.T) {
	_, err := Eval("unknownVar", &Env{})
	if err == nil {
		t.Error("Eval(unknownVar) expected error, got nil")
	}
}

func TestEvalMixedOps(t *testing.T) {
	env := &Env{ScreenW: 1920, ImageW: 64}

	got, err := Eval("screenW/2-imageW/2", env)
	if err != nil {
		t.Fatalf("Eval error: %v", err)
	}

	want := 960.0 - 32.0
	if got != want {
		t.Errorf("Eval = %v, want %v", got, want)
	}
}

func TestEvalFloatLiteral(t *testing.T) {
	got, err := Eval("3.14", &Env{})
	if err != nil {
		t.Fatalf("Eval error: %v", err)
	}
	if math.Abs(got-3.14) > 1e-9 {
		t.Errorf("Eval = %v, want 3.14", got)
	}
}
