package engine

import (
	"testing"

	"clod-pet/backend/internal/pet"
)

func TestBorderMatches(t *testing.T) {
	tests := []struct {
		only string
		ctx  BorderContext
		want bool
	}{
		{"", ContextNone, true},
		{"", ContextFloor, true},
		{"none", ContextNone, true},
		{"none", ContextFloor, true},
		{"floor", ContextFloor, true},
		{"floor", ContextCeiling, false},
		{"taskbar", ContextFloor, true},
		{"taskbar", ContextNone, false},
		{"window", ContextObstacle, true},
		{"window", ContextFloor, false},
		{"vertical", ContextWalls, true},
		{"vertical", ContextCeiling, false},
		{"horizontal", ContextCeiling, true},
		{"horizontal", ContextWalls, false},
		{"horizontal+", ContextCeiling, true},
		{"horizontal+", ContextFloor, true},
		{"horizontal+", ContextWalls, false},
	}

	for _, tc := range tests {
		got := borderMatches(tc.only, tc.ctx)
		if got != tc.want {
			t.Errorf("borderMatches(%q, %v) = %v, want %v", tc.only, tc.ctx, got, tc.want)
		}
	}
}

func TestEngineBorderTransition(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withBorderNext(pet.NextAnimation{ID: 2, Probability: 100, Only: "taskbar"}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(100, 936)

	result, err := e.Step(WorldContext{
		Screen:  rectScreen1000,
		Desktop: rectScreen1000,
	})
	assertNoError(t, err)

	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineBorderTransitionNoMatch(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withBorderNext(pet.NextAnimation{ID: 2, Probability: 100, Only: "window"}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(100, 936)

	result, err := e.Step(WorldContext{
		Screen:  rectScreen1000,
		Desktop: Rect{X: 0, Y: 0, W: 2000, H: 1000},
	})
	assertNoError(t, err)

	if result.NextAnimID != 0 {
		t.Errorf("NextAnimID = %d, want 0 (no matching window border)", result.NextAnimID)
	}
	if result.BorderCtx != ContextFloor {
		t.Errorf("BorderCtx = %v, want %v", result.BorderCtx, ContextFloor)
	}
}

func TestEngineScreenSnapDoesNotUseDesktopUnion(t *testing.T) {
	tests := []struct {
		name  string
		start Rect
		wantX float64
		wantY float64
	}{
		{"left edge", Rect{X: 1, Y: 100}, 0, 100},
		{"right edge", Rect{X: 935, Y: 100}, 936, 100},
		{"top edge", Rect{X: 100, Y: 1}, 100, 0},
		{"bottom edge", Rect{X: 100, Y: 935}, 100, 936},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := testPet()
			p.Animations[1] = idleAnim(withID(1))

			e := startEngine(t, p, 1)
			e.SetPosition(tt.start.X, tt.start.Y)

			result, err := e.Step(WorldContext{
				Screen:  rectScreen1000,
				Desktop: Rect{X: 0, Y: 0, W: 2000, H: 1000},
			})
			assertNoError(t, err)

			if result.X != tt.wantX {
				t.Errorf("X = %v, want %v", result.X, tt.wantX)
			}
			if result.Y != tt.wantY {
				t.Errorf("Y = %v, want %v", result.Y, tt.wantY)
			}
		})
	}
}

func TestEngineBorderTriggeredOnce(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withBorderNext(pet.NextAnimation{ID: 2, Probability: 100, Only: "taskbar"}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(100, 936)

	world := WorldContext{
		Screen:  rectScreen1000,
		Desktop: rectScreen1000,
	}

	// First collision
	result, _ := e.Step(world)
	if result.NextAnimID != 2 {
		t.Errorf("First step NextAnimID = %d, want 2", result.NextAnimID)
	}

	// Second step with same collision should NOT trigger transition again
	result, _ = e.Step(world)
	if result.NextAnimID != 0 {
		t.Errorf("Second step NextAnimID = %d, want 0", result.NextAnimID)
	}
}

func TestEngineNoOscillationAfterWallFlip(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withMovement("-2", "0"),
		withFrames(0, 1),
		withRepeat("20"),
		withBorderNext(pet.NextAnimation{ID: 2, Probability: 100, Only: "none"}),
	)
	p.Animations[2] = walkAnim(
		withID(2),
		withName("rotate"),
		withAction("flip"),
		withFrames(0),
		withRepeat("1"),
		withSequenceNext(pet.NextAnimation{ID: 1, Probability: 100, Only: ""}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(2, 500)

	world := WorldContext{
		Screen:   rectScreen1000,
		WorkArea: rectScreen1000,
	}

	// First step: already at wall → border fires → rotate
	r, _ := e.Step(world)
	if r.NextAnimID != 2 {
		t.Fatalf("expected border transition to rotate, got nextAnim=%d", r.NextAnimID)
	}
	e.TransitionTo(r.NextAnimID)

	// Step through rotate
	r, _ = e.Step(world)
	if r.NextAnimID != 1 {
		t.Fatalf("expected rotate to transition back to walk, got nextAnim=%d", r.NextAnimID)
	}
	e.TransitionTo(r.NextAnimID)

	// First walk step after flip: must NOT re-trigger border transition
	r, _ = e.Step(world)
	if r.NextAnimID != 0 {
		t.Errorf("walk should not immediately re-trigger border; got nextAnim=%d", r.NextAnimID)
	}
}
