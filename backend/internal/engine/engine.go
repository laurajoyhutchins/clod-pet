package engine

import (
	"errors"
	"math/rand"

	"clod-pet/backend/internal/expression"
	"clod-pet/backend/internal/pet"
)

var ErrPetNotFound = errors.New("pet not found")

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

type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type WorldContext struct {
	Screen   Rect `json:"screen"`
	WorkArea Rect `json:"work_area"`
	Taskbar  Rect `json:"taskbar"`
}

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
	animationIDs   map[string]int
	currentAnim    int
	frameIdx       int
	totalStepsDone int
	state          PetState
	flipH          bool
	parentX        float64
	parentY        float64
	env            *expression.Env
	animFrames       []int
	animTotalSteps   int
	animRepeatFrom   int
	borderTriggered  bool
	gravityTriggered bool
	tolerance        float64
}

func (e *Engine) CurrentAnim() int {
	return e.currentAnim
}

func (e *Engine) PetDef() *pet.Pet {
	return e.petDef
}

func NewEngine(p *pet.Pet) *Engine {
	animationIDs := make(map[string]int, len(p.Animations))
	for id, anim := range p.Animations {
		if anim.Name != "" {
			animationIDs[anim.Name] = id
		}
	}

	engine := &Engine{
		petDef:       p,
		animationIDs: animationIDs,
		state:        StateIdle,
		env:          expression.NewEnv(),
		tolerance:    2.0,
	}
	engine.env.ImageW = float64(p.FrameW)
	engine.env.ImageH = float64(p.FrameH)
	return engine
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

func (e *Engine) Step(world WorldContext) (*StepResult, error) {
	if e.state == StateIdle {
		return nil, nil
	}

	petW := float64(e.petDef.FrameW)
	petH := float64(e.petDef.FrameH)

	if world.Screen.W > 0 {
		e.env.ScreenW = world.Screen.W
		e.env.ScreenH = world.Screen.H
		e.env.AreaW = world.WorkArea.W
		e.env.AreaH = world.WorkArea.H
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

	progress := expression.Clamp(float64(e.totalStepsDone)/float64(e.animTotalSteps), 0, 1)

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

	if e.flipH {
		e.parentX -= curX
	} else {
		e.parentX += curX
	}
	e.parentY += curY

	// Internal Border & Gravity Detection
	borderCtx := e.detectBorder(world, petW, petH)
	gravity := e.detectGravity(world, petW, petH)

	// Physics Snapping
	e.applyPhysics(world, petW, petH, borderCtx)

	if borderCtx != ContextNone && !e.borderTriggered {
		if nextID := e.pickBorderTransition(borderCtx); nextID > 0 {
			e.borderTriggered = true
			return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID), nil
		}
	}

	if gravity && !e.gravityTriggered {
		if nextID := e.pickGravityTransition(); nextID > 0 {
			e.gravityTriggered = true
			return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID), nil
		}
	}

	e.frameIdx++
	e.totalStepsDone++

	if e.frameIdx >= frameLen {
		e.frameIdx = e.animRepeatFrom

		if e.totalStepsDone >= e.animTotalSteps {
			nextID := e.pickSequenceTransition(borderCtx)
			if nextID == 0 && len(anim.SequenceNext) > 0 {
				nextID = e.currentAnim
			}

			if nextID > 0 {
				e.applyAction(anim.Action)
				return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID), nil
			}

			e.totalStepsDone = 0
			e.frameIdx = e.animRepeatFrom
		}
	}

	return e.stepResult(frame, curOffsetY, curOpacity, curInterval, 0), nil
}

func (e *Engine) detectBorder(world WorldContext, width, height float64) BorderContext {
	if world.Screen.W == 0 {
		return ContextNone
	}

	x, y := e.parentX, e.parentY
	b := world.Screen
	t := e.tolerance

	onTop := y <= b.Y+t
	onBottom := y+height >= b.Y+b.H-t
	onLeft := x <= b.X+t
	onRight := x+width >= b.X+b.W-t
	onTaskbar := e.onTaskbar(world.Taskbar, x, y, width, height)

	if onTaskbar {
		return ContextTaskbar
	}
	if onTop || onBottom {
		return ContextHorizontal
	}
	if onLeft || onRight {
		return ContextVertical
	}

	return ContextNone
}

func (e *Engine) detectGravity(world WorldContext, width, height float64) bool {
	if world.WorkArea.W == 0 {
		return false
	}

	bottom := e.parentY + height
	wa := world.WorkArea

	// If we are above the work area bottom, we fall.
	if bottom < wa.Y+wa.H-e.tolerance {
		// But check if we are on the taskbar first
		if e.onTaskbar(world.Taskbar, e.parentX, e.parentY, width, height) {
			return false
		}
		return true
	}

	return false
}

func (e *Engine) onTaskbar(tb Rect, x, y, width, height float64) bool {
	if tb.W == 0 || tb.H == 0 {
		return false
	}
	t := e.tolerance
	return !(x+width < tb.X-t || x > tb.X+tb.W+t || y+height < tb.Y-t || y > tb.Y+tb.H+t)
}

func (e *Engine) applyPhysics(world WorldContext, width, height float64, ctx BorderContext) {
	if world.Screen.W == 0 {
		return
	}

	// Snap to Taskbar top if we are hitting it from above
	if ctx == ContextTaskbar {
		tb := world.Taskbar
		// Only snap if we are roughly at the top of it
		if e.parentY+height > tb.Y && e.parentY < tb.Y {
			e.parentY = tb.Y - height
		}
	} else if ctx == ContextHorizontal {
		// Snap to Screen Floor
		if e.parentY+height >= world.Screen.Y+world.Screen.H-e.tolerance {
			e.parentY = world.Screen.Y + world.Screen.H - height
		} else if e.parentY <= world.Screen.Y+e.tolerance {
			e.parentY = world.Screen.Y
		}
	}
}

func (e *Engine) applyAction(action string) {
	if action == "flip" {
		e.flipH = !e.flipH
	}
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

func (e *Engine) Position() (float64, float64) {
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

	e.animFrames = append(e.animFrames[:0], anim.Frames...)
	e.animRepeatFrom = anim.RepeatFrom
	e.borderTriggered = false
	e.gravityTriggered = false

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
		if n.Only == "none" || borderMatches(n.Only, ctx) {
			candidates = append(candidates, n)
		}
	}

	return weightedPick(candidates)
}

func (e *Engine) pickSequenceTransition(ctx BorderContext) int {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return 0
	}

	var candidates []pet.NextAnimation
	for _, n := range anim.SequenceNext {
		if n.Only == "none" || borderMatches(n.Only, ctx) {
			candidates = append(candidates, n)
		}
	}

	return weightedPick(candidates)
}

func (e *Engine) pickGravityTransition() int {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return 0
	}

	if len(anim.GravityNext) == 0 {
		return 0
	}

	return weightedPick(anim.GravityNext)
}

func (e *Engine) findAnimationByName(name string) int {
	return e.animationIDs[name]
}

func (e *Engine) stepResult(frame int, offsetY, opacity float64, intervalMs, nextAnimID int) *StepResult {
	return &StepResult{
		FrameIndex: frame,
		X:          e.parentX,
		Y:          e.parentY,
		OffsetY:    offsetY,
		Opacity:    opacity,
		IntervalMs: intervalMs,
		NextAnimID: nextAnimID,
		ShouldFlip: e.flipH,
	}
}

func borderMatches(only string, ctx BorderContext) bool {
	switch only {
	case "none":
		return true
	case "taskbar":
		return ctx == ContextTaskbar
	case "window":
		return ctx == ContextWindow
	case "vertical":
		return ctx == ContextVertical
	case "horizontal":
		return ctx == ContextHorizontal
	case "horizontal+":
		return ctx == ContextHorizontal || ctx == ContextTaskbar
	}
	return false
}

func weightedPick(candidates []pet.NextAnimation) int {
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
