package expression

import (
	"testing"
)

func BenchmarkParseSimple(b *testing.B) {
	exprs := []string{
		"42",
		"3.14",
		"screenW",
		"imageH",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, expr := range exprs {
			_, _ = Parse(expr)
		}
	}
}

func BenchmarkParseComplex(b *testing.B) {
	exprs := []string{
		"screenW - imageW - 50",
		"(screenW + screenH) / 2",
		"screenW * 2 + areaH / 3",
		"random + randS * 2",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, expr := range exprs {
			_, _ = Parse(expr)
		}
	}
}

func BenchmarkEvalSimple(b *testing.B) {
	env := &Env{
		ScreenW:  1920,
		ScreenH:  1080,
		ImageW:   64,
		ImageH:   64,
		Random:   50,
		RandS:    75,
	}

	simpleExprs := []string{"42", "screenW", "imageH", "random"}

	parsed := make([]*ParsedExpr, len(simpleExprs))
	for i, expr := range simpleExprs {
		parsed[i], _ = Parse(expr)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, p := range parsed {
			_, _ = p.Eval(env)
		}
	}
}

func BenchmarkEvalComplex(b *testing.B) {
	env := &Env{
		ScreenW:  1920,
		ScreenH:  1080,
		AreaW:    1920,
		AreaH:    1040,
		ImageW:   64,
		ImageH:   64,
		ImageX:   100,
		ImageY:   200,
		Random:   50,
		RandS:    75,
	}

	complexExprs := []string{
		"screenW - imageW - 50",
		"screenW/2 - imageW/2",
		"areaH - imageH",
		"(screenW + screenH) / 2 + random",
	}

	parsed := make([]*ParsedExpr, len(complexExprs))
	for i, expr := range complexExprs {
		parsed[i], _ = Parse(expr)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, p := range parsed {
			_, _ = p.Eval(env)
		}
	}
}

func BenchmarkParseEvalRoundtrip(b *testing.B) {
	env := &Env{
		ScreenW: 1920,
		ScreenH: 1080,
		ImageW:  64,
		ImageH:  64,
	}

	expr := "screenW - imageW"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parsed, _ := Parse(expr)
		_, _ = parsed.Eval(env)
	}
}

func BenchmarkLerp(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Lerp(0, 100, 0.5)
		_ = Lerp(10, 20, 0.25)
		_ = Lerp(-10, 10, 0.5)
	}
}

func BenchmarkClamp(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Clamp(50, 0, 100)
		_ = Clamp(-10, 0, 100)
		_ = Clamp(150, 0, 100)
	}
}

func BenchmarkNewEnv(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = NewEnv()
	}
}

func BenchmarkRegenerateRandom(b *testing.B) {
	env := NewEnv()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		env.RegenerateRandom()
	}
}

func BenchmarkEvalWithDivision(b *testing.B) {
	env := &Env{ScreenW: 1920, ImageW: 64}

	exprs := []string{"10/2", "100/4/5", "screenW/2", "screenW/imageW"}

	parsed := make([]*ParsedExpr, len(exprs))
	for i, expr := range exprs {
		parsed[i], _ = Parse(expr)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, p := range parsed {
			_, _ = p.Eval(env)
		}
	}
}

func BenchmarkEvalWithMultiplication(b *testing.B) {
	env := &Env{ScreenW: 1920, ScreenH: 1080}

	exprs := []string{"3*4", "2*3*4", "screenW*2", "screenW*screenH"}

	parsed := make([]*ParsedExpr, len(exprs))
	for i, expr := range exprs {
		parsed[i], _ = Parse(expr)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, p := range parsed {
			_, _ = p.Eval(env)
		}
	}
}

func BenchmarkSlowPatterns(b *testing.B) {
	env := &Env{
		ScreenW:  1920,
		ScreenH:  1080,
		AreaW:    1920,
		AreaH:    1040,
		ImageW:   64,
		ImageH:   64,
		ImageX:   100,
		ImageY:   200,
		DesktopW: 1920,
		DesktopH: 1080,
	}

	slowExprs := []string{
		"(screenW - imageW - 50) * 2 + (screenH - imageH) / 3",
		"screenW * 2 + areaH / 3 - imageX * 2",
		"(desktopW + desktopH) / (imageW + imageH) + random * randS",
	}

	parsed := make([]*ParsedExpr, len(slowExprs))
	for i, expr := range slowExprs {
		parsed[i], _ = Parse(expr)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, p := range parsed {
			_, _ = p.Eval(env)
		}
	}
}
