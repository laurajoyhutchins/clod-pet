package engine

import (
	"math/rand"

	"clod-pet/backend/internal/expression"
	"clod-pet/backend/internal/pet"
)

type BorderContext int

const (
	ContextNone BorderContext = iota
	ContextTaskbar
	ContextWindow
	ContextHorizontal
	ContextVertical
)

type PetState int

const (
	StateIdle PetState = iota
	StateAnimating
	StateDragging
	StateFalling
)

type StepResult struct {
	FrameIndex  int
	X           float64
	Y           float64
	OffsetY     float64
	Opacity     float64
	IntervalMs  int
	NextAnimID  int
	ShouldFlip  bool
	ShouldSpawn bool
	SoundID     int
}

type Engine struct {
	petDef         *pet.Pet
	currentAnim    int
	frameIdx       int
	totalStepsDone int
	state          PetState
	flipH          bool
	parentX        float64
	parentY        float64
	env            *expression.Env
	animFrames     []int
	animTotalSteps int
	animRepeatFrom int
}

func (e *Engine) GetCurrentAnim() int {
	return e.currentAnim
}

func (e *Engine) GetPetDef() *pet.Pet {
	return e.petDef
}

func NewEngine(p *pet.Pet) *Engine {
	return &Engine{
		petDef: p,
		state:  StateIdle,
		env:    expression.NewEnv(),
	}
}

func (e *Engine) Start(spawnID int) error {
	var spawn *pet.Spawn
	for i := range e.petDef.Spawns {
		if e.petDef.Spawns[i].ID == spawnID {
			spawn = &e.petDef.Spawns[i]
			break
		}
	}
	if spawn == nil {
		if len(e.petDef.Spawns) == 0 {
			return nil
		}
		spawn = &e.petDef.Spawns[0]
	}

	e.env.RegenerateRandom()

	x, _ := expression.Eval(spawn.X, e.env)
	y, _ := expression.Eval(spawn.Y, e.env)

	e.parentX = x
	e.parentY = y
	e.currentAnim = spawn.NextAnimID
	e.frameIdx = 0
	e.totalStepsDone = 0
	e.state = StateAnimating
	e.flipH = false

	e.loadAnimation()
	return nil
}

func (e *Engine) Step(borderCtx BorderContext) (*StepResult, error) {
	if e.state == StateIdle {
		return nil, nil
	}

	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return nil, nil
	}

	frameLen := len(e.animFrames)
	if frameLen == 0 {
		return nil, nil
	}

	frame := e.animFrames[e.frameIdx]

	e.env.RegenerateRandom()

	progress := float64(e.totalStepsDone) / float64(e.animTotalSteps)
	if progress > 1 {
		progress = 1
	}

	startX, _ := expression.Eval(anim.Start.X, e.env)
	startY, _ := expression.Eval(anim.Start.Y, e.env)
	startInterval, _ := expression.EvalInt(anim.Start.Interval, e.env)
	endX, _ := expression.Eval(anim.End.X, e.env)
	endY, _ := expression.Eval(anim.End.Y, e.env)
	endInterval, _ := expression.EvalInt(anim.End.Interval, e.env)

	curX := expression.Lerp(startX, endX, progress)
	curY := expression.Lerp(startY, endY, progress)
	curInterval := int(expression.Lerp(float64(startInterval), float64(endInterval), progress))

	startOpacity := anim.Start.Opacity
	endOpacity := anim.End.Opacity
	curOpacity := expression.Lerp(startOpacity, endOpacity, progress)

	startOffsetY := float64(anim.Start.OffsetY)
	endOffsetY := float64(anim.End.OffsetY)
	curOffsetY := expression.Lerp(startOffsetY, endOffsetY, progress)

	e.parentX += curX
	e.parentY += curY

	if borderCtx != ContextNone {
		if nextID := e.pickBorderTransition(borderCtx); nextID > 0 {
			return &StepResult{
				FrameIndex: frame,
				X:          e.parentX,
				Y:          e.parentY,
				OffsetY:    curOffsetY,
				Opacity:    curOpacity,
				IntervalMs: curInterval,
				NextAnimID: nextID,
				ShouldFlip: e.flipH,
			}, nil
		}
	}

	e.frameIdx++
	e.totalStepsDone++

	if e.frameIdx >= frameLen {
		e.frameIdx = e.animRepeatFrom

		if e.totalStepsDone >= e.animTotalSteps {
			if nextID := e.pickSequenceTransition(borderCtx); nextID > 0 {
				return &StepResult{
					FrameIndex: frame,
					X:          e.parentX,
					Y:          e.parentY,
					OffsetY:    curOffsetY,
					Opacity:    curOpacity,
					IntervalMs: curInterval,
					NextAnimID: nextID,
					ShouldFlip: e.flipH,
				}, nil
			}
			e.totalStepsDone = 0
			e.frameIdx = e.animRepeatFrom
		}
	}

	return &StepResult{
		FrameIndex: frame,
		X:          e.parentX,
		Y:          e.parentY,
		OffsetY:    curOffsetY,
		Opacity:    curOpacity,
		IntervalMs: curInterval,
		ShouldFlip: e.flipH,
	}, nil
}

func (e *Engine) SetDrag() {
	e.state = StateDragging
	e.currentAnim = e.findAnimationByName("drag")
	if e.currentAnim > 0 {
		e.frameIdx = 0
		e.totalStepsDone = 0
		e.loadAnimation()
	}
}

func (e *Engine) SetFall() {
	e.state = StateFalling
	e.currentAnim = e.findAnimationByName("fall")
	if e.currentAnim > 0 {
		e.frameIdx = 0
		e.totalStepsDone = 0
		e.loadAnimation()
	}
}

func (e *Engine) SetPosition(x, y float64) {
	e.parentX = x
	e.parentY = y
}

func (e *Engine) GetPosition() (float64, float64) {
	return e.parentX, e.parentY
}

func (e *Engine) Reset() {
	e.state = StateIdle
	e.currentAnim = 0
	e.frameIdx = 0
	e.totalStepsDone = 0
}

func (e *Engine) TransitionTo(animID int) {
	e.currentAnim = animID
	e.frameIdx = 0
	e.totalStepsDone = 0
	e.loadAnimation()
}

func (e *Engine) loadAnimation() {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return
	}

	e.animFrames = anim.Frames
	e.animRepeatFrom = anim.RepeatFrom

	repeat, err := expression.EvalInt(anim.Repeat, e.env)
	if err != nil || repeat <= 0 {
		repeat = 1
	}

	e.animTotalSteps = len(anim.Frames) * repeat

	if e.animRepeatFrom >= len(anim.Frames) {
		e.animRepeatFrom = 0
	}
}

func (e *Engine) pickBorderTransition(ctx BorderContext) int {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return 0
	}

	var candidates []pet.NextAnimation
	for _, n := range anim.BorderNext {
		if n.Only == "none" || BorderMatches(n.Only, ctx) {
			candidates = append(candidates, n)
		}
	}

	return WeightedPick(candidates)
}

func (e *Engine) pickSequenceTransition(ctx BorderContext) int {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return 0
	}

	var candidates []pet.NextAnimation
	for _, n := range anim.SequenceNext {
		if n.Only == "none" || BorderMatches(n.Only, ctx) {
			candidates = append(candidates, n)
		}
	}

	return WeightedPick(candidates)
}

func (e *Engine) findAnimationByName(name string) int {
	for id, anim := range e.petDef.Animations {
		if anim.Name == name {
			return id
		}
	}
	return 0
}

func BorderMatches(only string, ctx BorderContext) bool {
	switch only {
	case "none":
		return true
	case "taskbar":
		return ctx == ContextTaskbar
	case "window":
		return ctx == ContextWindow
	case "vertical":
		return ctx == ContextVertical
	case "horizontal", "horizontal+":
		return ctx == ContextHorizontal
	}
	return false
}

func WeightedPick(candidates []pet.NextAnimation) int {
	if len(candidates) == 0 {
		return 0
	}

	total := 0
	for _, c := range candidates {
		total += c.Probability
	}
	if total == 0 {
		return 0
	}

	r := rand.Intn(total)
	cumulative := 0
	for _, c := range candidates {
		cumulative += c.Probability
		if r < cumulative {
			return c.ID
		}
	}

	return candidates[len(candidates)-1].ID
}
