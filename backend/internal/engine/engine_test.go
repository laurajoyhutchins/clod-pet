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
		FrameW: 64,
		FrameH: 64,
		Spawns: []pet.Spawn{
			{ID: 1, Probability: 100, X: "100", Y: "200", NextAnimID: 1},
		},
		Animations: map[int]pet.Animation{
			1: {
				ID:         1,
				Name:       "walk",
				Start:      pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				End:        pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				Frames:     []int{0, 1},
				Repeat:     "10",
				RepeatFrom: 0,
				SequenceNext: []pet.NextAnimation{
					{ID: 2, Probability: 50, Only: "none"},
					{ID: 1, Probability: 50, Only: "none"},
				},
			},
			2: {
				ID:         2,
				Name:       "sit",
				Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "300"},
				End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "300"},
				Frames:     []int{2, 3},
				Repeat:     "5",
				RepeatFrom: 0,
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100, Only: "none"},
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

	result, err := e.Step(WorldContext{})
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

	x, y := e.Position()
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

func TestEngineStartUsesWorldContextForSpawnExpressions(t *testing.T) {
	p := testPet()
	p.Spawns[0] = pet.Spawn{
		ID:          1,
		Probability: 100,
		X:           "screenW+10",
		Y:           "areaH-imageH",
		NextAnimID:  1,
	}

	e := NewEngine(p)
	err := e.Start(1, WorldContext{
		Screen:   Rect{W: 1920, H: 1080},
		WorkArea: Rect{W: 1920, H: 1040},
	})
	if err != nil {
		t.Fatalf("Start error: %v", err)
	}

	x, y := e.Position()
	if math.Abs(x-1930) > 0.01 {
		t.Errorf("X = %v, want 1930", x)
	}
	if math.Abs(y-976) > 0.01 {
		t.Errorf("Y = %v, want 976", y)
	}
}

func TestEngineStepProducesFrames(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(WorldContext{})
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
		result, err := e.Step(WorldContext{})
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

	_, _ = e.Step(WorldContext{})
	_, _ = e.Step(WorldContext{})
	_, _ = e.Step(WorldContext{})

	x, _ := e.Position()
	want := 100.0 + (-2)*3
	if math.Abs(x-want) > 0.01 {
		t.Errorf("X = %v, want %v", x, want)
	}
}

func TestEngineRandomStaysStableWithinAnimation(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:     1,
		Name:   "random-walk",
		Start:  pet.Movement{X: "random+1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:    pet.Movement{X: "random+1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames: []int{0},
		Repeat: "2",
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(0, 0)
	e.env.Random = 10
	e.env.RandS = 20

	first, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("first Step error: %v", err)
	}
	if first == nil {
		t.Fatal("first Step returned nil")
	}
	if math.Abs(first.X-11) > 0.01 {
		t.Errorf("first X = %v, want 11", first.X)
	}

	second, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("second Step error: %v", err)
	}
	if second == nil {
		t.Fatal("second Step returned nil")
	}
	if math.Abs(second.X-22) > 0.01 {
		t.Errorf("second X = %v, want 22", second.X)
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
	x, y := e.Position()
	if math.Abs(x-500) > 0.01 {
		t.Errorf("X = %v, want 500", x)
	}
	if math.Abs(y-600) > 0.01 {
		t.Errorf("Y = %v, want 600", y)
	}
}

func TestBorderMatches(t *testing.T) {
	tests := []struct {
		only string
		ctx  BorderContext
		want bool
	}{
		{"none", ContextNone, true},
		{"none", ContextTaskbar, true},
		{"taskbar", ContextTaskbar, true},
		{"taskbar", ContextNone, false},
		{"window", ContextWindow, true},
		{"window", ContextTaskbar, false},
		{"vertical", ContextVertical, true},
		{"vertical", ContextHorizontal, false},
		{"horizontal", ContextHorizontal, true},
		{"horizontal", ContextVertical, false},
		{"horizontal+", ContextHorizontal, true},
		{"horizontal+", ContextTaskbar, true},
		{"horizontal+", ContextVertical, false},
	}

	for _, tc := range tests {
		got := borderMatches(tc.only, tc.ctx)
		if got != tc.want {
			t.Errorf("borderMatches(%q, %v) = %v, want %v", tc.only, tc.ctx, got, tc.want)
		}
	}
}

func TestLoadAnimationCopiesFrames(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)

	e.animFrames[0] = 99
	if got := p.Animations[1].Frames[0]; got != 0 {
		t.Errorf("pet animation frame mutated through engine: got %d, want 0", got)
	}
}

func TestWeightedPick(t *testing.T) {
	candidates := []pet.NextAnimation{
		{ID: 1, Probability: 80},
		{ID: 2, Probability: 20},
	}

	for i := 0; i < 100; i++ {
		result := weightedPick(candidates)
		if result != 1 && result != 2 {
			t.Errorf("weightedPick returned %d, want 1 or 2", result)
		}
	}
}

func TestWeightedPickEmpty(t *testing.T) {
	result := weightedPick([]pet.NextAnimation{})
	if result != 0 {
		t.Errorf("weightedPick(empty) = %d, want 0", result)
	}
}

func TestEngineGravityTransition(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "1",
		RepeatFrom: 0,
		GravityNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(100, 100) // Clearly above any floor

	result, err := e.Step(WorldContext{
		WorkArea: Rect{X: 0, Y: 0, W: 1000, H: 1000},
	})
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

func TestEngineStartNoSpawns(t *testing.T) {
	p := testPet()
	p.Spawns = []pet.Spawn{}
	e := NewEngine(p)

	err := e.Start(1)
	if err != nil {
		t.Fatalf("Start error: %v", err)
	}
}

func TestLoadAnimationInvalidRepeat(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "bad",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "invalid",
		RepeatFrom: 0,
	}

	e := NewEngine(p)
	e.Start(1)
	if e.animTotalSteps != 1 {
		t.Errorf("animTotalSteps = %d, want 1 (fallback for invalid repeat)", e.animTotalSteps)
	}
}

func TestWeightedPickZeroProbability(t *testing.T) {
	candidates := []pet.NextAnimation{
		{ID: 1, Probability: 0},
		{ID: 2, Probability: 0},
	}

	result := weightedPick(candidates)
	if result != 0 {
		t.Errorf("weightedPick(zero prob) = %d, want 0", result)
	}
}

func TestEngineStepTransitionTriggers(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0, 1},
		Repeat:     "2",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	var transitionID int
	for i := 0; i < 10; i++ {
		result, err := e.Step(WorldContext{})
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
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "1",
		RepeatFrom: 0,
		BorderNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "taskbar"},
		},
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(0, 900) // Touching taskbar below

	result, err := e.Step(WorldContext{
		Screen:  Rect{X: 0, Y: 0, W: 1000, H: 1000},
		Taskbar: Rect{X: 0, Y: 900, W: 1000, H: 100},
	})
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
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "-1", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "1",
		RepeatFrom: 0,
		BorderNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "window"},
		},
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(0, 900)

	result, err := e.Step(WorldContext{
		Screen:  Rect{X: 0, Y: 0, W: 1000, H: 1000},
		Taskbar: Rect{X: 0, Y: 900, W: 1000, H: 100},
	})
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
	result, err := e.Step(WorldContext{})
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
		ID:         3,
		Name:       "empty",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{},
		Repeat:     "1",
		RepeatFrom: 0,
	}

	e := NewEngine(p)
	e.Start(1)
	e.TransitionTo(3)

	result, err := e.Step(WorldContext{})
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
		ID:         1,
		Name:       "fade",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 0.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "10",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	result, err := e.Step(WorldContext{})
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
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
		Frames:     []int{0},
		Repeat:     "2",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	_, _ = e.Step(WorldContext{})
	result, err := e.Step(WorldContext{})
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

func TestEngineFlipAction(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "flip-anim",
		Action:     "flip",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "1",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	if e.flipH {
		t.Errorf("flipH = %v, want false (start state)", e.flipH)
	}

	result, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result.NextAnimID != 2 {
		t.Errorf("NextAnimID = %d, want 2", result.NextAnimID)
	}
	if !e.flipH {
		t.Errorf("flipH = %v, want true after flip action", e.flipH)
	}
}

func TestEngineMirroredMovement(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "10",
		RepeatFrom: 0,
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(100, 200)

	// Normal movement (flipH = false)
	_, _ = e.Step(WorldContext{})
	x, _ := e.Position()
	if math.Abs(x-98) > 0.01 {
		t.Errorf("X = %v, want 98", x)
	}

	// Mirrored movement (flipH = true)
	e.flipH = true
	_, _ = e.Step(WorldContext{})
	x, _ = e.Position()
	if math.Abs(x-100) > 0.01 {
		t.Errorf("X = %v, want 100 (98 + 2)", x)
	}
}

func TestEngineBorderTriggeredOnce(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "10",
		RepeatFrom: 0,
		BorderNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "taskbar"},
		},
	}

	e := NewEngine(p)
	e.Start(1)
	e.SetPosition(0, 900)

	world := WorldContext{
		Screen:  Rect{X: 0, Y: 0, W: 1000, H: 1000},
		Taskbar: Rect{X: 0, Y: 900, W: 1000, H: 100},
	}

	// First collision
	result, _ := e.Step(world)
	if result.NextAnimID != 2 {
		t.Errorf("First step NextAnimID = %d, want 2", result.NextAnimID)
	}

	// Stay in same animation (simulated by not calling TransitionTo)
	// Second step with same collision should NOT trigger transition again
	result, _ = e.Step(world)
	if result.NextAnimID != 0 {
		t.Errorf("Second step NextAnimID = %d, want 0", result.NextAnimID)
	}
}

func TestEngineSelfTransitionReset(t *testing.T) {
	p := testPet()
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "2",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100, Only: "none"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	// Step 1: totalStepsDone = 0 -> 1
	e.Step(WorldContext{})
	// Step 2: totalStepsDone = 1 -> 2, triggers transition to 1
	result, _ := e.Step(WorldContext{})
	if result.NextAnimID != 1 {
		t.Errorf("NextAnimID = %d, want 1", result.NextAnimID)
	}

	// Simulated Service behavior: call TransitionTo(1)
	e.TransitionTo(result.NextAnimID)

	if e.totalStepsDone != 0 {
		t.Errorf("totalStepsDone = %d, want 0 after TransitionTo(self)", e.totalStepsDone)
	}
}

func TestEngineSequenceTransitionAlwaysResets(t *testing.T) {
	p := testPet()
	// Animation with SequenceNext but none match (e.g., only taskbar but we are none)
	p.Animations[1] = pet.Animation{
		ID:         1,
		Name:       "walk",
		Start:      pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		End:        pet.Movement{X: "0", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "100"},
		Frames:     []int{0},
		Repeat:     "1",
		RepeatFrom: 0,
		SequenceNext: []pet.NextAnimation{
			{ID: 2, Probability: 100, Only: "taskbar"},
		},
	}

	e := NewEngine(p)
	e.Start(1)

	// Step triggers end of sequence
	result, _ := e.Step(WorldContext{})

	// Should return self ID (1) because SequenceNext is present but no match
	if result.NextAnimID != 1 {
		t.Errorf("NextAnimID = %d, want 1 (self-reset)", result.NextAnimID)
	}
}
