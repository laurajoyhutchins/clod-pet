package engine

import (
	"math"
	"testing"

	"clod-pet/backend/internal/pet"
)

func testPet() *pet.Pet {
	return &pet.Pet{
		Header: pet.Header{Title: "Test", PetName: "test"},
		Image:  pet.Image{TilesX: 4, TilesY: 4},
		Spawns: []pet.Spawn{
			{ID: 1, Probability: 100, X: "100", Y: "200", NextAnimID: 1},
		},
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "walk",
				Start: pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				End:   pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				Frames:      []int{0, 1},
				Repeat:      "10",
				RepeatFrom:  0,
				SequenceNext: []pet.NextAnimation{
					{ID: 2, Probability: 50},
					{ID: 1, Probability: 50},
				},
			},
			2: {
				ID:   2,
				Name: "sit",
				Start: pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "300"},
				End:   pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "300"},
				Frames:      []int{2, 3},
				Repeat:      "5",
				RepeatFrom:  0,
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100},
				},
			},
		},
		Sounds: make(map[int][]pet.Sound),
	}
}

func TestNewEngineIdle(t *testing.T) {
	e := NewEngine(testPet())
	if e.state != StateIdle {
		t.Errorf("state = %v, want %v", e.state, StateIdle)
	}

	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result != nil {
		t.Error("Step on idle engine should return nil")
	}
}

func TestEngineStart(t *testing.T) {
	p := testPet()
	e := NewEngine(p)

	err := e.Start(1)
	if err != nil {
		t.Fatalf("Start error: %v", err)
	}

	if e.state != StateAnimating {
		t.Errorf("state = %v, want %v", e.state, StateAnimating)
	}
	if e.currentAnim != 1 {
		t.Errorf("currentAnim = %d, want 1", e.currentAnim)
	}

	x, y := e.GetPosition()
	if x != 100 {
		t.Errorf("X = %v, want 100", x)
	}
	if y != 200 {
		t.Errorf("Y = %v, want 200", y)
	}
}

func TestEngineStartFallbackToFirstSpawn(t *testing.T) {
	p := testPet()
	e := NewEngine(p)

	err := e.Start(999)
	if err != nil {
		t.Fatalf("Start error: %v", err)
	}

	if e.currentAnim != 1 {
		t.Errorf("currentAnim = %d, want 1 (fallback to first spawn)", e.currentAnim)
	}
}

func TestEngineStepProducesFrames(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}

	if result.FrameIndex != 0 {
		t.Errorf("FrameIndex = %d, want 0", result.FrameIndex)
	}
	if math.Abs(result.X-98) > 0.01 {
		t.Errorf("X = %v, want ~98", result.X)
	}
	if math.Abs(result.Y-200) > 0.01 {
		t.Errorf("Y = %v, want ~200", result.Y)
	}
	if result.IntervalMs != 200 {
		t.Errorf("IntervalMs = %d, want 200", result.IntervalMs)
	}
	if result.Opacity != 1.0 {
		t.Errorf("Opacity = %v, want 1.0", result.Opacity)
	}
}

func TestEngineStepCyclesFrames(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	expected := []int{0, 1, 0, 1, 0, 1}
	for i, want := range expected {
		result, err := e.Step(ContextNone)
		if err != nil {
			t.Fatalf("Step %d error: %v", i, err)
		}
		if result.FrameIndex != want {
			t.Errorf("Step %d FrameIndex = %d, want %d", i, result.FrameIndex, want)
		}
	}
}

func TestEngineStepAccumulatesPosition(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	_, _ = e.Step(ContextNone)
	_, _ = e.Step(ContextNone)
	_, _ = e.Step(ContextNone)

	x, _ := e.GetPosition()
	want := 100.0 + (-2)*3
	if math.Abs(x-want) > 0.01 {
		t.Errorf("X = %v, want %v", x, want)
	}
}

func TestEngineTransition(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.TransitionTo(2)
	if e.currentAnim != 2 {
		t.Errorf("currentAnim = %d, want 2", e.currentAnim)
	}
	if e.frameIdx != 0 {
		t.Errorf("frameIdx = %d, want 0", e.frameIdx)
	}
}

func TestEngineSetDrag(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.SetDrag()
	if e.state != StateDragging {
		t.Errorf("state = %v, want %v", e.state, StateDragging)
	}
}

func TestEngineSetFall(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.SetFall()
	if e.state != StateFalling {
		t.Errorf("state = %v, want %v", e.state, StateFalling)
	}
}

func TestEngineReset(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.Reset()
	if e.state != StateIdle {
		t.Errorf("state = %v, want %v", e.state, StateIdle)
	}
	if e.currentAnim != 0 {
		t.Errorf("currentAnim = %d, want 0", e.currentAnim)
	}
}

func TestEngineSetPosition(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.SetPosition(500, 600)
	x, y := e.GetPosition()
	if math.Abs(x-500) > 0.01 {
		t.Errorf("X = %v, want 500", x)
	}
	if math.Abs(y-600) > 0.01 {
		t.Errorf("Y = %v, want 600", y)
	}
}

func TestEngineStepTransitionTriggers(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "walk",
		Start: pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:   pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:      []int{0, 1},
		Repeat:      "2",
		RepeatFrom:  0,
		SequenceNext: []pet.NextAnimation{
					{ID: 2, Probability: 100, Only: "none"},
				},
	}

	e := NewEngine(p)
	e.Start(1)

	var transitionID int
	for i := 0; i < 10; i++ {
		result, err := e.Step(ContextNone)
		if err != nil {
			t.Fatalf("Step %d error: %v", i, err)
		}
		if result != nil && result.NextAnimID > 0 {
			transitionID = result.NextAnimID
			e.TransitionTo(transitionID)
			break
		}
	}

	if transitionID != 2 {
		t.Errorf("Transition ID = %d, want 2", transitionID)
	}

	if e.currentAnim != 2 {
		t.Errorf("currentAnim after transition = %d, want 2", e.currentAnim)
	}
}

func TestEngineBorderTransition(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "walk",
		Start: pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:   pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:      []int{0},
		Repeat:      "1",
		RepeatFrom:  0,
		BorderNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "taskbar"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(ContextTaskbar)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}
	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
}

func TestEngineBorderTransitionNoMatch(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "walk",
		Start: pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:   pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:      []int{0},
		Repeat:      "1",
		RepeatFrom:  0,
		BorderNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "window"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(ContextTaskbar)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}
	if result.NextAnimID != 0 {
		t.Errorf("NextAnimID = %d, want 0 (no match for taskbar)", result.NextAnimID)
	}
}

func TestEngineInvalidAnimation(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.TransitionTo(999)
	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result != nil {
		t.Error("Step on invalid animation should return nil")
	}
}

func TestEngineNoFrames(t *testing.T) {
	p := testPet()
	p.Animations[3] = pet.Animation{
		ID:   3,
		Name: "empty",
		Start: pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:   pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:      []int{},
		Repeat:      "1",
		RepeatFrom:  0,
	}

	e := NewEngine(p)
	e.Start(1)
	e.TransitionTo(3)

	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result != nil {
		t.Error("Step on empty animation should return nil")
	}
}

func TestEngineOpacityLerp(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "fade",
		Start: pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 0.0, Interval: "100"},
		End:   pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:      []int{0},
		Repeat:      "10",
		RepeatFrom:  0,
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}

	if result.Opacity != 0.0 {
		t.Errorf("Opacity = %v, want 0.0 (first step, progress=0)", result.Opacity)
	}
}

func TestEngineIntervalEvaluation(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:   1,
		Name: "walk",
		Start: pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:   pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
		Frames:      []int{0},
		Repeat:      "2",
		RepeatFrom:  0,
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	_, _ = e.Step(ContextNone)
	result, err := e.Step(ContextNone)
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}

	if result.IntervalMs < 100 || result.IntervalMs > 200 {
		t.Errorf("IntervalMs = %d, want between 100 and 200", result.IntervalMs)
	}
}
