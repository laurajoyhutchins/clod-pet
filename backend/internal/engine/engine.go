package engine

import (
	"errors"
	"fmt"
	"math/rand"

	"clod-pet/backend/internal/expression"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/pet"
)

var ErrPetNotFound = errors.New("pet not found")
var ErrStepIdle = errors.New("engine step skipped: pet idle")
var ErrStepAnimationMissing = errors.New("engine step skipped: animation not found")
var ErrStepAnimationEmpty = errors.New("engine step skipped: animation has no frames")

type BorderContext int

const (
	ContextNone     BorderContext = 0
	ContextFloor    BorderContext = 1 << 0
	ContextCeiling  BorderContext = 1 << 1
	ContextLeft     BorderContext = 1 << 2
	ContextRight    BorderContext = 1 << 3
	ContextWalls    BorderContext = ContextLeft | ContextRight
	ContextObstacle BorderContext = 1 << 4
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
	Desktop  Rect `json:"desktop"`
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
	BorderCtx   BorderContext
}

type Engine struct {
	petDef           *pet.Pet
	animationIDs     map[string]int
	currentAnim      int
	frameIdx         int
	totalStepsDone   int
	state            PetState
	flipH            bool
	parentX          float64
	parentY          float64
	env              *expression.Env
	animFrames       []int
	animTotalSteps   int
	animRepeatFrom   int
	borderTriggered  bool
	gravityTriggered bool
	tolerance        float64
	gravityFactor    float64
	scale            float64
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
		tolerance:    1.0,
		gravityFactor: 2.0,
		scale:         1.0,
	}
	engine.env.ImageW = float64(p.FrameW)
	engine.env.ImageH = float64(p.FrameH)
	return engine
}

func (e *Engine) Start(spawnID int, worlds ...WorldContext) error {
	spawn := e.pickSpawn(spawnID)
	if spawn == nil {
		return nil
	}

	world := WorldContext{}
	if len(worlds) > 0 {
		world = worlds[0]
	}
	e.setWorldContext(world)
	e.env.RegenerateRandom()

	x, err := expression.Eval(spawn.X, e.env)
	if err != nil {
		return fmt.Errorf("spawn X expression: %w", err)
	}
	y, err := expression.Eval(spawn.Y, e.env)
	if err != nil {
		return fmt.Errorf("spawn Y expression: %w", err)
	}

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

func (e *Engine) pickSpawn(spawnID int) *pet.Spawn {
	if spawnID > 0 {
		for i := range e.petDef.Spawns {
			if e.petDef.Spawns[i].ID == spawnID {
				return &e.petDef.Spawns[i]
			}
		}
	}

	if len(e.petDef.Spawns) == 0 {
		return nil
	}

	total := 0
	for _, s := range e.petDef.Spawns {
		total += s.Probability
	}

	if total == 0 {
		return &e.petDef.Spawns[0]
	}

	r := rand.Intn(total)
	cumulative := 0
	for i := range e.petDef.Spawns {
		cumulative += e.petDef.Spawns[i].Probability
		if r < cumulative {
			return &e.petDef.Spawns[i]
		}
	}

	return &e.petDef.Spawns[len(e.petDef.Spawns)-1]
}

func (e *Engine) setWorldContext(world WorldContext) {
	e.env.ScreenX = world.Screen.X
	e.env.ScreenY = world.Screen.Y
	e.env.ScreenW = world.Screen.W
	e.env.ScreenH = world.Screen.H
	e.env.AreaX = world.WorkArea.X
	e.env.AreaY = world.WorkArea.Y
	e.env.AreaW = world.WorkArea.W
	e.env.AreaH = world.WorkArea.H
	e.env.DesktopX = world.Desktop.X
	e.env.DesktopY = world.Desktop.Y
	e.env.DesktopW = world.Desktop.W
	e.env.DesktopH = world.Desktop.H
}

func (e *Engine) Step(world WorldContext) (*StepResult, error) {
	if e.state == StateIdle {
		return nil, ErrStepIdle
	}

	petW := float64(e.petDef.FrameW) * e.scale
	petH := float64(e.petDef.FrameH) * e.scale

	if world.Screen.W > 0 {
		e.setWorldContext(world)
	}

	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return nil, ErrStepAnimationMissing
	}

	frameLen := len(e.animFrames)
	if frameLen == 0 {
		return nil, ErrStepAnimationEmpty
	}
	if e.frameIdx < 0 || e.frameIdx >= frameLen {
		e.frameIdx = 0
	}

	frame := e.animFrames[e.frameIdx]

	progress := 0.0
	if e.animTotalSteps > 0 {
		progress = expression.Clamp(float64(e.totalStepsDone)/float64(e.animTotalSteps), 0, 1)
	}

	startX, err := expression.Eval(anim.Start.X, e.env)
	if err != nil {
		log.Debug("eval start.X", "anim", e.currentAnim, "error", err)
	}
	startY, err := expression.Eval(anim.Start.Y, e.env)
	if err != nil {
		log.Debug("eval start.Y", "anim", e.currentAnim, "error", err)
	}
	startInterval, err := expression.EvalInt(anim.Start.Interval, e.env)
	if err != nil {
		log.Debug("eval start.Interval", "anim", e.currentAnim, "error", err)
	}
	endX, err := expression.Eval(anim.End.X, e.env)
	if err != nil {
		log.Debug("eval end.X", "anim", e.currentAnim, "error", err)
	}
	endY, err := expression.Eval(anim.End.Y, e.env)
	if err != nil {
		log.Debug("eval end.Y", "anim", e.currentAnim, "error", err)
	}
	endInterval, err := expression.EvalInt(anim.End.Interval, e.env)
	if err != nil {
		log.Debug("eval end.Interval", "anim", e.currentAnim, "error", err)
	}

	curX := expression.Lerp(startX, endX, progress) * e.scale
	curY := expression.Lerp(startY, endY, progress) * e.scale
	curInterval := int(expression.Lerp(float64(startInterval), float64(endInterval), progress))

	startOpacity := anim.Start.Opacity
	endOpacity := anim.End.Opacity
	curOpacity := expression.Lerp(startOpacity, endOpacity, progress)

	startOffsetY := float64(anim.Start.OffsetY) * e.scale
	endOffsetY := float64(anim.End.OffsetY) * e.scale
	curOffsetY := expression.Lerp(startOffsetY, endOffsetY, progress)

	gravity := e.detectGravity(world, petW, petH)
	if gravity && curY > 0 {
		curY *= e.gravityFactor
	}

	if e.flipH {
		e.parentX -= curX
	} else {
		e.parentX += curX
	}
	e.parentY += curY

	borderCtx := e.detectBorder(world, petW, petH)

	if e.state == StateDragging {
		e.frameIdx++
		e.totalStepsDone++

		if e.frameIdx >= frameLen {
			e.frameIdx = e.animRepeatFrom
			if e.totalStepsDone >= e.animTotalSteps {
				e.totalStepsDone = 0
			}
		}

		return e.stepResult(frame, curOffsetY, curOpacity, curInterval, 0, borderCtx), nil
	}

	// Physics Snapping
	e.applyPhysics(world, petW, petH, borderCtx)

	if gravity && !e.gravityTriggered {
		if nextID := e.pickGravityTransition(); nextID > 0 {
			e.gravityTriggered = true
			return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID, borderCtx), nil
		}

		if nextID := e.findAnimationByName("fall"); nextID > 0 {
			e.gravityTriggered = true
			return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID, borderCtx), nil
		}
	}

	if borderCtx != ContextNone && !e.borderTriggered {
		if nextID := e.pickBorderTransition(borderCtx, curX, curY); nextID > 0 {
			e.borderTriggered = true
			return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID, borderCtx), nil
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
				return e.stepResult(frame, curOffsetY, curOpacity, curInterval, nextID, borderCtx), nil
			}

			e.totalStepsDone = 0
			e.frameIdx = e.animRepeatFrom
		}
	}

	return e.stepResult(frame, curOffsetY, curOpacity, curInterval, 0, borderCtx), nil
}

func (e *Engine) detectBorder(world WorldContext, width, height float64) BorderContext {
	screen := world.Screen
	if screen.W == 0 {
		screen = world.Desktop
	}
	if screen.W == 0 {
		return ContextNone
	}

	floor := world.WorkArea
	if floor.W == 0 {
		floor = screen
	}

	x, y := e.parentX, e.parentY
	t := e.tolerance

	var ctx BorderContext
	if y+height >= floor.Y+floor.H-t {
		ctx |= ContextFloor
	}
	if y <= screen.Y+t {
		ctx |= ContextCeiling
	}
	if x <= screen.X+t {
		ctx |= ContextLeft
	}
	if x+width >= screen.X+screen.W-t {
		ctx |= ContextRight
	}

	return ctx
}

func (e *Engine) detectGravity(world WorldContext, width, height float64) bool {
	if world.WorkArea.W == 0 {
		return false
	}

	bottom := e.parentY + height
	wa := world.WorkArea

	return bottom < wa.Y+wa.H-e.tolerance
}

func (e *Engine) applyPhysics(world WorldContext, width, height float64, ctx BorderContext) {
	screen := world.Screen
	if screen.W == 0 {
		screen = world.Desktop
	}
	if screen.W == 0 {
		return
	}

	floor := world.WorkArea
	if floor.W == 0 {
		floor = screen
	}

	if (ctx & ContextFloor) != 0 {
		if e.parentY+height >= floor.Y+floor.H-e.tolerance {
			e.parentY = floor.Y + floor.H - height
		}
	}
	if (ctx & ContextCeiling) != 0 {
		if e.parentY <= screen.Y+e.tolerance {
			e.parentY = screen.Y
		}
	}
	if (ctx & ContextLeft) != 0 {
		if e.parentX <= screen.X+e.tolerance {
			e.parentX = screen.X
		}
	}
	if (ctx & ContextRight) != 0 {
		if e.parentX+width >= screen.X+screen.W-e.tolerance {
			e.parentX = screen.X + screen.W - width
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
	dragAnim := e.findAnimationByName("drag")
	if dragAnim <= 0 {
		return
	}
	if e.currentAnim == dragAnim {
		return
	}
	e.currentAnim = dragAnim
	e.frameIdx = 0
	e.totalStepsDone = 0
	e.loadAnimation()
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

func (e *Engine) SetGravityFactor(factor float64) {
	e.gravityFactor = factor
}

func (e *Engine) SetScale(scale float64) {
	e.scale = scale
	if e.petDef != nil {
		e.env.ImageW = float64(e.petDef.FrameW) * scale
		e.env.ImageH = float64(e.petDef.FrameH) * scale
	}
}

func (e *Engine) Reset() {
	e.state = StateIdle
	e.currentAnim = 0
	e.frameIdx = 0
	e.totalStepsDone = 0
}

func (e *Engine) TransitionTo(animID int) {
	e.env.RegenerateRandom()
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

	if len(anim.Frames) == 0 {
		e.animTotalSteps = 0
		e.animRepeatFrom = 0
		return
	}

	repeat, err := expression.EvalInt(anim.Repeat, e.env)
	if err != nil || repeat <= 0 {
		repeat = 1
	}

	e.animTotalSteps = len(anim.Frames) * repeat

	if e.animRepeatFrom >= len(anim.Frames) {
		e.animRepeatFrom = 0
	}
}

func (e *Engine) pickBorderTransition(ctx BorderContext, curX, curY float64) int {
	anim, ok := e.petDef.Animations[e.currentAnim]
	if !ok {
		return 0
	}

	var candidates []pet.NextAnimation
	for _, n := range anim.BorderNext {
		if !borderMatches(n.Only, ctx) {
			continue
		}

		// For catch-all transitions, we only trigger if moving INTO the border.
		if n.Only == "none" || n.Only == "" {
			if !e.isMovingIntoBorder(ctx, curX, curY) {
				continue
			}
		}

		candidates = append(candidates, n)
	}

	return weightedPick(candidates)
}

func (e *Engine) isMovingIntoBorder(ctx BorderContext, curX, curY float64) bool {
	effX := curX
	if e.flipH {
		effX = -curX
	}

	if (ctx&ContextFloor) != 0 && curY > 0 {
		return true
	}
	if (ctx&ContextCeiling) != 0 && curY < 0 {
		return true
	}
	if (ctx&ContextLeft) != 0 && effX < 0 {
		return true
	}
	if (ctx&ContextRight) != 0 && effX > 0 {
		return true
	}
	if (ctx & ContextObstacle) != 0 {
		return true
	}
	return false
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

func (e *Engine) stepResult(frame int, offsetY, opacity float64, intervalMs, nextAnimID int, borderCtx BorderContext) *StepResult {
	return &StepResult{
		FrameIndex: frame,
		X:          e.parentX,
		Y:          e.parentY,
		OffsetY:    offsetY,
		Opacity:    opacity,
		IntervalMs: intervalMs,
		NextAnimID: nextAnimID,
		ShouldFlip: e.flipH,
		BorderCtx:  borderCtx,
	}
}

func borderMatches(only string, ctx BorderContext) bool {
	switch only {
	case "", "none":
		return true
	case "floor", "taskbar":
		return (ctx & ContextFloor) != 0
	case "ceiling", "horizontal":
		return (ctx & ContextCeiling) != 0
	case "walls", "vertical":
		return (ctx & ContextWalls) != 0
	case "obstacle", "window":
		return (ctx & ContextObstacle) != 0
	case "horizontal+":
		return (ctx & (ContextCeiling | ContextFloor)) != 0
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
