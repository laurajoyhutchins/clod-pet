package engine

import (
	"math"
	"testing"

	"clod-pet/backend/internal/pet"
)

func TestEngineGravityTransition(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withMovement("0", "0"),
		withFrames(0),
		withRepeat("1"),
		withGravityNext(pet.NextAnimation{ID: 2, Probability: 100, Only: "none"}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(100, 100)

	result, err := e.Step(WorldContext{
		WorkArea: rectArea1000,
	})
	assertNoError(t, err)

	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineGravityFallsBackToNamedFallAnimation(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withMovement("0", "0"),
		withFrames(0),
		withRepeat("1"),
	)
	p.Animations[2] = fallAnim(withID(2))

	e := startEngine(t, p, 1)
	e.SetPosition(100, 100)

	result, err := e.Step(WorldContext{
		WorkArea: rectArea1000,
	})
	assertNoError(t, err)

	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineVerticalEdgeDoesNotSuppressGravity(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withMovement("0", "0"),
		withFrames(0),
		withRepeat("1"),
		withGravityNext(pet.NextAnimation{ID: 2, Probability: 100}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(1, 100)

	result, err := e.Step(WorldContext{
		Screen:   rectScreen1000,
		WorkArea: Rect{X: 40, Y: 0, W: 960, H: 1000},
		Desktop:  rectScreen1000,
	})
	assertNoError(t, err)

	if result.X != 0 {
		t.Errorf("X = %v, want 0", result.X)
	}
	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineGravityTakesPriorityWhenAirborneAtScreenBorder(t *testing.T) {
	p := testPet()
	p.Animations[1] = walkAnim(
		withID(1),
		withMovement("0", "0"),
		withFrames(0),
		withRepeat("1"),
		withBorderNext(pet.NextAnimation{ID: 3, Probability: 100, Only: "none"}),
		withGravityNext(pet.NextAnimation{ID: 2, Probability: 100}),
	)

	e := startEngine(t, p, 1)
	e.SetPosition(0, 0)

	result, err := e.Step(WorldContext{
		Screen:   rectScreen1000,
		WorkArea: rectArea1000,
	})
	assertNoError(t, err)

	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineGravityDoubled(t *testing.T) {
	p := &pet.Pet{
		FrameW: defaultFrameW,
		FrameH: defaultFrameH,
		Animations: map[int]pet.Animation{
			1: fallAnim(
				withID(1),
				withMovement("0", "10"),
				withFrames(0),
				withRepeat("1"),
			),
		},
		Spawns: []pet.Spawn{
			{ID: 1, X: mustParseExpr("100"), Y: mustParseExpr("100"), NextAnimID: 1},
		},
	}

	e := NewEngine(p)
	world := WorldContext{
		Screen:   rectScreen1000,
		WorkArea: rectArea1000,
	}
	e.SetGravityFactor(2.0)
	e.SetScale(1.5)
	_ = e.Start(1, world)

	// Base Y speed is 10. Effective: 10 * 2.0 * 1.5 = 30
	_, _ = e.Step(world)

	_, y := e.Position()
	expectedY := 100.0 + 30.0
	if math.Abs(y-expectedY) > 0.001 {
		t.Errorf("Y = %v, want %v (gravity factor and scale should both impact speed)", y, expectedY)
	}
}
