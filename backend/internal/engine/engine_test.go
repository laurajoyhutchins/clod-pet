package engine

import (
	"errors"
	"math"
	"testing"

	"clod-pet/backend/internal/expression"
	"clod-pet/backend/internal/pet"
)

func mustParseExpr(s string) *expression.ParsedExpr {
	parsed, err := expression.Parse(s)
	if err != nil {
		panic(err)
	}
	return parsed
}

func testPet() *pet.Pet {
	return &pet.Pet{
		Header: pet.Header{Title: "Test", PetName: "test"},
		Image:  pet.Image{TilesX: 4, TilesY: 4},
		FrameW: 64,
		FrameH: 64,
		Spawns: []pet.Spawn{
			{ID: 1, Probability: 100, X: mustParseExpr("100"), Y: mustParseExpr("200"), NextAnimID: 1},
		},
		Animations: map[int]pet.Animation{
			1: {
				ID:         1,
				Name:       "walk",
				Start:      pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
				End:        pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("200")},
				Frames:     []int{0, 1},
				Repeat:     mustParseExpr("10"),
				RepeatFrom: 0,
				SequenceNext: []pet.NextAnimation{
					{ID: 2, Probability: 50, Only: "none"},
					{ID: 1, Probability: 50, Only: "none"},
				},
			},
			2: {
				ID:         2,
				Name:       "sit",
				Start:      pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("300")},
				End:        pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("300")},
				Frames:     []int{2, 3},
				Repeat:     mustParseExpr("5"),
				RepeatFrom: 0,
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100, Only: "none"},
				},
			},
			3: {
				ID:         3,
				Name:       "drag",
				Start:      pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
				End:        pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
				Frames:     []int{4, 5},
				Repeat:     mustParseExpr("1"),
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
	if !errors.Is(err, ErrStepIdle) {
		t.Fatalf("Step error = %v, want ErrStepIdle", err)
	}
	if result != nil {
		t.Error("Step on idle engine should return nil")
	}
}

func TestEngineStart(t *testing.T) {
	tests := []struct {
		name     string
		spawnID  int
		wantAnim int
		wantX    float64
		wantY    float64
		wantErr  bool
	}{
		{"valid spawn", 1, 1, 100, 200, false},
		{"fallback to first", 999, 1, 100, 200, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := testPet()
			e := NewEngine(p)
			err := e.Start(tt.spawnID)

			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if e.currentAnim != tt.wantAnim {
				t.Errorf("currentAnim = %d, want %d", e.currentAnim, tt.wantAnim)
			}
			x, y := e.Position()
			if math.Abs(x-tt.wantX) > 0.01 {
				t.Errorf("X = %v, want %v", x, tt.wantX)
			}
			if math.Abs(y-tt.wantY) > 0.01 {
				t.Errorf("Y = %v, want %v", y, tt.wantY)
			}
		})
	}
}

func TestEngineStartUsesWorldContextForSpawnExpressions(t *testing.T) {
	p := testPet()
	p.Spawns[0] = pet.Spawn{
		ID:          1,
		Probability: 100,
		X:           mustParseExpr("screenW+10"),
		Y:           mustParseExpr("areaH-imageH"),
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
	if result.BorderCtx != ContextNone {
		t.Errorf("BorderCtx = %v, want %v", result.BorderCtx, ContextNone)
	}
}

func TestEngineStepWithEmptyAnimationFrames(t *testing.T) {
	p := testPet()
	p.Animations[3] = pet.Animation{
		ID:     3,
		Name:   "empty",
		Start:  pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), Interval: mustParseExpr("100")},
		End:    pet.Movement{X: mustParseExpr("0"), Y: mustParseExpr("0"), Interval: mustParseExpr("100")},
		Frames: []int{},
		Repeat: mustParseExpr("1"),
	}

	e := NewEngine(p)
	e.currentAnim = 3
	e.state = StateAnimating
	e.loadAnimation()

	if e.animTotalSteps != 0 {
		t.Fatalf("animTotalSteps = %d, want 0", e.animTotalSteps)
	}

	result, err := e.Step(WorldContext{})
	if !errors.Is(err, ErrStepAnimationEmpty) {
		t.Fatalf("Step error = %v, want ErrStepAnimationEmpty", err)
	}
	if result != nil {
		t.Fatal("Step on empty animation should return nil")
	}
}

func TestEngineStepClampsFrameIndex(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)
	e.frameIdx = len(e.animFrames)

	result, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result == nil {
		t.Fatal("Step returned nil")
	}
	if result.FrameIndex != 0 {
		t.Errorf("FrameIndex = %d, want 0 after clamping", result.FrameIndex)
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
		Start:  pet.Movement{X: mustParseExpr("random+1"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
		End:    pet.Movement{X: mustParseExpr("random+1"), Y: mustParseExpr("0"), OffsetY: 0, Opacity: 1.0, Interval: mustParseExpr("100")},
		Frames: []int{0},
		Repeat: mustParseExpr("2"),
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

func TestEngineStateTransitions(t *testing.T) {
	tests := []struct {
		name        string
		action      func(*Engine)
		wantState   PetState
		wantAnim    int
		wantFrameIdx int
	}{
		{"transition to anim 2", func(e *Engine) { e.TransitionTo(2) }, StateAnimating, 2, 0},
		{"set drag", func(e *Engine) { e.SetDrag() }, StateDragging, 3, 0},
		{"set fall", func(e *Engine) { e.SetFall() }, StateFalling, 0, 0},
		{"reset", func(e *Engine) { e.Reset() }, StateIdle, 0, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := testPet()
			e := NewEngine(p)
			e.Start(1)

			tt.action(e)

			if e.state != tt.wantState {
				t.Errorf("state = %v, want %v", e.state, tt.wantState)
			}
			if tt.wantAnim > 0 && e.currentAnim != tt.wantAnim {
				t.Errorf("currentAnim = %d, want %d", e.currentAnim, tt.wantAnim)
			}
			if e.frameIdx != tt.wantFrameIdx {
				t.Errorf("frameIdx = %d, want %d", e.frameIdx, tt.wantFrameIdx)
			}
		})
	}
}

func TestEngineSetDragDoesNotResetActiveDragAnimation(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)
	e.SetDrag()

	_, _ = e.Step(WorldContext{})

	e.SetDrag()
	if e.frameIdx != 1 {
		t.Errorf("frameIdx = %d, want 1", e.frameIdx)
	}
	if e.totalStepsDone != 1 {
		t.Errorf("totalStepsDone = %d, want 1", e.totalStepsDone)
	}
}

func TestEngineDragAnimationLoopsUntilDrop(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)
	e.SetDrag()

	first, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("first Step error: %v", err)
	}
	if first.FrameIndex != 4 {
		t.Errorf("first frame = %d, want 4", first.FrameIndex)
	}

	second, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("second Step error: %v", err)
	}
	if second.FrameIndex != 5 {
		t.Errorf("second frame = %d, want 5", second.FrameIndex)
	}
	if second.NextAnimID != 0 {
		t.Errorf("second NextAnimID = %d, want 0", second.NextAnimID)
	}
	if e.currentAnim != 3 {
		t.Errorf("currentAnim = %d, want 3", e.currentAnim)
	}

	third, err := e.Step(WorldContext{})
	if err != nil {
		t.Fatalf("third Step error: %v", err)
	}
	if third.FrameIndex != 4 {
		t.Errorf("third frame = %d, want 4", third.FrameIndex)
	}
}

func TestEngineDragStepDoesNotSnapPosition(t *testing.T) {
	p := testPet()
	e := NewEngine(p)
	e.Start(1)
	e.SetDrag()
	e.SetPosition(-10, -20)

	result, err := e.Step(WorldContext{
		Screen:   Rect{X: 0, Y: 0, W: 100, H: 100},
		WorkArea: Rect{X: 0, Y: 0, W: 100, H: 100},
	})
	if err != nil {
		t.Fatalf("Step error: %v", err)
	}
	if result.X != -10 || result.Y != -20 {
		t.Errorf("position = (%v, %v), want (-10, -20)", result.X, result.Y)
	}
	if result.BorderCtx != ContextCeiling|ContextLeft {
		t.Errorf("BorderCtx = %v, want %v", result.BorderCtx, ContextCeiling|ContextLeft)
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
	tests := []struct {
		name   string
		posX   float64
		posY   float64
		wantX   float64
		wantY   float64
	}{
		{"positive", 500, 600, 500, 600},
		{"negative", -10, -20, -10, -20},
		{"zero", 0, 0, 0, 0},
		{"fractional", 100.5, 200.5, 100.5, 200.5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := testPet()
			e := NewEngine(p)
			e.Start(1)

			e.SetPosition(tt.posX, tt.posY)
			x, y := e.Position()
			if math.Abs(x-tt.wantX) > 0.01 {
				t.Errorf("X = %v, want %v", x, tt.wantX)
			}
			if math.Abs(y-tt.wantY) > 0.01 {
				t.Errorf("Y = %v, want %v", y, tt.wantY)
			}
		})
	}
}

