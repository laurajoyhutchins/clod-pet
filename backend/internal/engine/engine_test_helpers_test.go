package engine

import (
	"errors"
	"math"
	"testing"

	"clod-pet/backend/internal/pet"
)

// Test constants
const (
	defaultFrameW = 64
	defaultFrameH = 64
	screen1000    = 1000.0
	area1000      = 1000.0
)

var (
	rectScreen1000 = Rect{X: 0, Y: 0, W: 1000, H: 1000}
	rectArea1000   = Rect{X: 0, Y: 0, W: 1000, H: 1000}
)

// Animation builder helpers

type animOpts struct {
	ID          int
	Name        string
	X, Y        string
	Opacity     float64
	Interval    string
	Frames      []int
	Repeat      string
	RepeatFrom  int
	Action      string
	SequenceNext []pet.NextAnimation
	BorderNext   []pet.NextAnimation
	GravityNext  []pet.NextAnimation
}

func buildAnim(opts animOpts) pet.Animation {
	if opts.X == "" {
		opts.X = "0"
	}
	if opts.Y == "" {
		opts.Y = "0"
	}
	if opts.Interval == "" {
		opts.Interval = "100"
	}
	if opts.Repeat == "" {
		opts.Repeat = "1"
	}
	if opts.Frames == nil {
		opts.Frames = []int{0}
	}

	return pet.Animation{
		ID:          opts.ID,
		Name:        opts.Name,
		Start:       pet.Movement{X: mustParseExpr(opts.X), Y: mustParseExpr(opts.Y), OffsetY: 0, Opacity: opts.Opacity, Interval: mustParseExpr(opts.Interval)},
		End:         pet.Movement{X: mustParseExpr(opts.X), Y: mustParseExpr(opts.Y), OffsetY: 0, Opacity: opts.Opacity, Interval: mustParseExpr(opts.Interval)},
		Frames:      opts.Frames,
		Repeat:      mustParseExpr(opts.Repeat),
		RepeatFrom:  opts.RepeatFrom,
		Action:      opts.Action,
		SequenceNext: opts.SequenceNext,
		BorderNext:   opts.BorderNext,
		GravityNext:  opts.GravityNext,
	}
}

func walkAnim(opts ...func(*animOpts)) pet.Animation {
	o := &animOpts{
		Name:   "walk",
		X:      "-2",
		Frames: []int{0, 1},
		Repeat: "10",
		SequenceNext: []pet.NextAnimation{
			{ID: 2, Probability: 50, Only: "none"},
			{ID: 1, Probability: 50, Only: "none"},
		},
	}
	for _, fn := range opts {
		fn(o)
	}
	return buildAnim(*o)
}

func idleAnim(opts ...func(*animOpts)) pet.Animation {
	o := &animOpts{
		Name:   "idle",
		Frames: []int{0},
		Repeat: "5",
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100, Only: "none"},
		},
	}
	for _, fn := range opts {
		fn(o)
	}
	return buildAnim(*o)
}

func fallAnim(opts ...func(*animOpts)) pet.Animation {
	o := &animOpts{
		Name:   "fall",
		Y:      "3",
		Frames: []int{1},
		Repeat: "1",
	}
	for _, fn := range opts {
		fn(o)
	}
	return buildAnim(*o)
}

func dragAnim(opts ...func(*animOpts)) pet.Animation {
	o := &animOpts{
		Name:   "drag",
		Frames: []int{4, 5},
		Repeat: "1",
		SequenceNext: []pet.NextAnimation{
			{ID: 1, Probability: 100, Only: "none"},
		},
	}
	for _, fn := range opts {
		fn(o)
	}
	return buildAnim(*o)
}

// Option functions
func withID(id int) func(*animOpts) {
	return func(o *animOpts) { o.ID = id }
}

func withName(name string) func(*animOpts) {
	return func(o *animOpts) { o.Name = name }
}

func withMovement(x, y string) func(*animOpts) {
	return func(o *animOpts) {
		o.X = x
		o.Y = y
	}
}

func withFrames(frames ...int) func(*animOpts) {
	return func(o *animOpts) { o.Frames = frames }
}

func withRepeat(repeat string) func(*animOpts) {
	return func(o *animOpts) { o.Repeat = repeat }
}

func withSequenceNext(next ...pet.NextAnimation) func(*animOpts) {
	return func(o *animOpts) { o.SequenceNext = next }
}

func withBorderNext(next ...pet.NextAnimation) func(*animOpts) {
	return func(o *animOpts) { o.BorderNext = next }
}

func withGravityNext(next ...pet.NextAnimation) func(*animOpts) {
	return func(o *animOpts) { o.GravityNext = next }
}

func withAction(action string) func(*animOpts) {
	return func(o *animOpts) { o.Action = action }
}

// Test setup helpers

func startEngine(t *testing.T, p *pet.Pet, animID int, worlds ...WorldContext) *Engine {
	t.Helper()
	e := NewEngine(p)
	err := e.Start(animID, worlds...)
	if err != nil {
		t.Fatalf("Start(%d) error: %v", animID, err)
	}
	return e
}

func stepUntilTransition(t *testing.T, e *Engine, world WorldContext) (*StepResult, int) {
	t.Helper()
	for i := 0; i < 100; i++ {
		result, err := e.Step(world)
		if err != nil {
			t.Fatalf("Step %d error: %v", i, err)
		}
		if result != nil && result.NextAnimID > 0 {
			return result, result.NextAnimID
		}
	}
	return nil, 0
}

func assertStep(t *testing.T, result *StepResult, wantFrame int, wantX, wantY float64) {
	t.Helper()
	if result.FrameIndex != wantFrame {
		t.Errorf("FrameIndex = %d, want %d", result.FrameIndex, wantFrame)
	}
	if math.Abs(result.X-wantX) > 0.01 {
		t.Errorf("X = %v, want %v", result.X, wantX)
	}
	if math.Abs(result.Y-wantY) > 0.01 {
		t.Errorf("Y = %v, want %v", result.Y, wantY)
	}
}

func assertNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func assertErrorIs(t *testing.T, err, target error) {
	t.Helper()
	if !errors.Is(err, target) {
		t.Fatalf("error = %v, want %v", err, target)
	}
}
