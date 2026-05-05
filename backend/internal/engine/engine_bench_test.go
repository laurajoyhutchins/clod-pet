package engine

import (
	"testing"

	"clod-pet/backend/internal/pet"
)

func benchPet() *pet.Pet {
	return &pet.Pet{
		Header: pet.Header{Title: "Bench", PetName: "bench"},
		Image:  pet.Image{TilesX: 4, TilesY: 4},
		FrameW: 64,
		FrameH: 64,
		Spawns: []pet.Spawn{
			{ID: 1, Probability: 100, X: mustParseExpr("100"), Y: mustParseExpr("200"), NextAnimID: 1},
		},
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "walk",
				Start: pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
				End:   pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
				Frames: []int{0, 1},
				Repeat: mustParseExpr("10"),
				SequenceNext: []pet.NextAnimation{
					{ID: 2, Probability: 50, Only: "none"},
					{ID: 1, Probability: 50, Only: "none"},
				},
			},
			2: {
				ID:   2,
				Name: "sit",
				Start: pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("300")},
				End:   pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("300")},
				Frames: []int{2, 3},
				Repeat: mustParseExpr("5"),
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100, Only: "none"},
				},
			},
			3: {
				ID:   3,
				Name: "drag",
				Start: pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
				End:   pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
				Frames: []int{4, 5},
				Repeat: mustParseExpr("1"),
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100, Only: "none"},
				},
			},
		},
		Sounds: make(map[int][]pet.Sound),
	}
}

// BenchmarkStep measures baseline Step() latency in µs/op.
func BenchmarkStep(b *testing.B) {
	p := benchPet()
	e := NewEngine(p)
	_ = e.Start(1)
	world := WorldContext{
		Screen:   Rect{W: 1920, H: 1080},
		WorkArea: Rect{W: 1920, H: 1040},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Step(world)
	}
}

// BenchmarkStepBorderCost measures per-frame cost when border collision is detected.
func BenchmarkStepBorderCost(b *testing.B) {
	p := benchPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "walk",
		Start: pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
		End:   pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
		Frames:     []int{0, 1},
		Repeat:     mustParseExpr("10"),
		BorderNext: []pet.NextAnimation{{ID: 2, Probability: 100, Only: "taskbar"}},
	}

	e := NewEngine(p)
	_ = e.Start(1)
	e.SetPosition(100, 936)
	world := WorldContext{
		Screen:  Rect{X: 0, Y: 0, W: 1000, H: 1000},
		Desktop: Rect{X: 0, Y: 0, W: 1000, H: 1000},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Step(world)
	}
}

// BenchmarkStepGravityCost measures per-frame cost when gravity transition is evaluated.
func BenchmarkStepGravityCost(b *testing.B) {
	p := &pet.Pet{
		FrameW: 64,
		FrameH: 64,
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "fall-detect",
				Start: pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), Interval: mustParseExpr("100")},
				End:   pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), Interval: mustParseExpr("100")},
				Frames:      []int{0},
				Repeat:      mustParseExpr("1"),
				GravityNext: []pet.NextAnimation{{ID: 2, Probability: 100, Only: "none"}},
			},
		},
		Spawns: []pet.Spawn{
			{ID: 1, X: mustParseExpr("100"), Y: mustParseExpr("100"), NextAnimID: 1},
		},
	}

	e := NewEngine(p)
	world := WorldContext{
		WorkArea: Rect{X: 0, Y: 0, W: 1000, H: 1000},
	}
	_ = e.Start(1, world)
	e.SetPosition(100, 100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Step(world)
	}
}

// BenchmarkStepFullAnimationLoop measures a complete animation cycle to detect regressions.
func BenchmarkStepFullAnimationLoop(b *testing.B) {
	p := benchPet()
	world := WorldContext{
		Screen:   Rect{W: 1920, H: 1080},
		WorkArea: Rect{W: 1920, H: 1040},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		e := NewEngine(p)
		_ = e.Start(1, world)
		for j := 0; j < 20; j++ {
			_, _ = e.Step(world)
		}
	}
}

// BenchmarkStepWithDrag measures Step() cost when in dragging state.
func BenchmarkStepWithDrag(b *testing.B) {
	p := benchPet()
	e := NewEngine(p)
	_ = e.Start(1)
	e.SetDrag()
	world := WorldContext{
		Screen:   Rect{W: 1920, H: 1080},
		WorkArea: Rect{W: 1920, H: 1040},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Step(world)
	}
}

// BenchmarkStepWithFall measures Step() cost when in falling state with gravity.
func BenchmarkStepWithFall(b *testing.B) {
	p := &pet.Pet{
		FrameW: 64,
		FrameH: 64,
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "fall",
				Start: pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("10"), Interval: mustParseExpr("100")},
				End:   pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("10"), Interval: mustParseExpr("100")},
				Frames: []int{1},
				Repeat: mustParseExpr("1"),
			},
		},
		Spawns: []pet.Spawn{
			{ID: 1, X: mustParseExpr("100"), Y: mustParseExpr("100"), NextAnimID: 1},
		},
	}

	e := NewEngine(p)
	world := WorldContext{
		WorkArea: Rect{W: 1920, H: 1080},
	}
	_ = e.Start(1, world)
	e.SetFall()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Step(world)
	}
}

// BenchmarkNewEngine measures the cost of creating a new engine instance.
func BenchmarkNewEngine(b *testing.B) {
	p := benchPet()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = NewEngine(p)
	}
}

// BenchmarkEngineStart measures the cost of starting an animation engine.
func BenchmarkEngineStart(b *testing.B) {
	p := benchPet()
	world := WorldContext{
		Screen:   Rect{W: 1920, H: 1080},
		WorkArea: Rect{W: 1920, H: 1040},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		e := NewEngine(p)
		_ = e.Start(1, world)
	}
}

// BenchmarkPositionTracking measures the cost of position queries during animation.
func BenchmarkPositionTracking(b *testing.B) {
	p := benchPet()
	e := NewEngine(p)
	_ = e.Start(1)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = e.Position()
	}
}

// BenchmarkBorderDetection isolated benchmark for border context calculation.
func BenchmarkBorderDetection(b *testing.B) {
	p := benchPet()
	e := NewEngine(p)
	_ = e.Start(1)
	e.SetPosition(0, 0)
	world := WorldContext{
		Screen:   Rect{X: 0, Y: 0, W: 1920, H: 1080},
		WorkArea: Rect{X: 0, Y: 0, W: 1920, H: 1040},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result, _ := e.Step(world)
		_ = result.BorderCtx
	}
}
