package ipc

import (
	"clod-pet/backend/internal/engine"
	"encoding/json"
	"sync"
)

type Command string

const (
	CmdAddPet     Command = "add_pet"
	CmdRemovePet  Command = "remove_pet"
	CmdSetPet     Command = "set_pet"
	CmdDragPet    Command = "drag_pet"
	CmdDropPet    Command = "drop_pet"
	CmdGetStatus  Command = "get_status"
	CmdSetVolume  Command = "set_volume"
	CmdSetScale   Command = "set_scale"
	CmdStepPet    Command = "step_pet"
	CmdBorderPet  Command = "border_pet"
	CmdGetPet     Command = "get_pet"
)

type Request struct {
	Command Command         `json:"command"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Response struct {
	OK      bool            `json:"ok"`
	Error   string          `json:"error,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type AddPetPayload struct {
	PetPath string `json:"pet_path"`
	SpawnID int    `json:"spawn_id,omitempty"`
}

type RemovePetPayload struct {
	PetID string `json:"pet_id"`
}

type DragPetPayload struct {
	PetID string  `json:"pet_id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
}

type DropPetPayload struct {
	PetID string `json:"pet_id"`
}

type StepPetPayload struct {
	PetID     string              `json:"pet_id"`
	BorderCtx engine.BorderContext `json:"border_ctx"`
}

type BorderPetPayload struct {
	PetID     string              `json:"pet_id"`
	Direction engine.BorderContext `json:"direction"`
}

type SetVolumePayload struct {
	Volume float64 `json:"volume"`
}

type SetScalePayload struct {
	Scale float64 `json:"scale"`
}

type PetState struct {
	PetID      string  `json:"pet_id"`
	FrameIndex int     `json:"frame_index"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	OffsetY    float64 `json:"offset_y"`
	Opacity    float64 `json:"opacity"`
	IntervalMs int     `json:"interval_ms"`
	FlipH      bool    `json:"flip_h"`
	NextAnimID int     `json:"next_anim_id,omitempty"`
}

type PetInfo struct {
	PetID      string `json:"pet_id"`
	Title      string `json:"title"`
	PetName    string `json:"pet_name"`
	TilesX     int    `json:"tiles_x"`
	TilesY     int    `json:"tiles_y"`
	PngBase64  string `json:"png_base64"`
	FrameW     int    `json:"frame_w"`
	FrameH     int    `json:"frame_h"`
}

type Handler struct {
	mu     sync.RWMutex
	engines map[string]*engine.Engine
}

func NewHandler() *Handler {
	return &Handler{
		engines: make(map[string]*engine.Engine),
	}
}

func (h *Handler) Handle(req *Request) *Response {
	h.mu.Lock()
	defer h.mu.Unlock()

	switch req.Command {
	case CmdAddPet:
		return h.handleAddPet(req.Payload)
	case CmdRemovePet:
		return h.handleRemovePet(req.Payload)
	case CmdDragPet:
		return h.handleDragPet(req.Payload)
	case CmdDropPet:
		return h.handleDropPet(req.Payload)
	case CmdGetStatus:
		return h.handleGetStatus()
	case CmdStepPet:
		return h.handleStepPet(req.Payload)
	case CmdBorderPet:
		return h.handleBorderPet(req.Payload)
	case CmdGetPet:
		return h.handleGetPet(req.Payload)
	default:
		return errorResponse("unknown command: " + string(req.Command))
	}
}

func (h *Handler) handleAddPet(payload json.RawMessage) *Response {
	var p AddPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	// Use pet_path as unique ID for now
	e := engine.NewEngine(nil)
	if err := e.Start(p.SpawnID); err != nil {
		return errorResponse("start failed: " + err.Error())
	}

	h.engines[p.PetPath] = e

	data, _ := json.Marshal(map[string]string{"pet_id": p.PetPath})
	return successResponse(data)
}

func (h *Handler) handleRemovePet(payload json.RawMessage) *Response {
	var p RemovePetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	delete(h.engines, p.PetID)
	return successResponse(nil)
}

func (h *Handler) handleDragPet(payload json.RawMessage) *Response {
	var p DragPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	e, ok := h.engines[p.PetID]
	if !ok {
		return errorResponse("pet not found: " + p.PetID)
	}

	e.SetDrag()
	e.SetPosition(p.X, p.Y)
	return successResponse(nil)
}

func (h *Handler) handleDropPet(payload json.RawMessage) *Response {
	var p DropPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	e, ok := h.engines[p.PetID]
	if !ok {
		return errorResponse("pet not found: " + p.PetID)
	}

	e.SetFall()
	return successResponse(nil)
}

func (h *Handler) handleStepPet(payload json.RawMessage) *Response {
	var p StepPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	e, ok := h.engines[p.PetID]
	if !ok {
		return errorResponse("pet not found: " + p.PetID)
	}

	step, err := e.Step(p.BorderCtx)
	if err != nil {
		return errorResponse("step failed: " + err.Error())
	}
	if step == nil {
		return successResponse(nil)
	}

	if step.NextAnimID > 0 {
		e.TransitionTo(step.NextAnimID)
	}

	data, _ := json.Marshal(PetState{
		PetID:      p.PetID,
		FrameIndex: step.FrameIndex,
		X:          step.X,
		Y:          step.Y,
		OffsetY:    step.OffsetY,
		Opacity:    step.Opacity,
		IntervalMs: step.IntervalMs,
		FlipH:      step.ShouldFlip,
		NextAnimID: step.NextAnimID,
	})
	return successResponse(data)
}

func (h *Handler) handleBorderPet(payload json.RawMessage) *Response {
	var p BorderPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	_, ok := h.engines[p.PetID]
	if !ok {
		return errorResponse("pet not found: " + p.PetID)
	}

	return successResponse(nil)
}

func (h *Handler) handleGetStatus() *Response {
	data, _ := json.Marshal(map[string]int{"pet_count": len(h.engines)})
	return successResponse(data)
}

func (h *Handler) handleGetPet(payload json.RawMessage) *Response {
	var p struct {
		PetPath string `json:"pet_path"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	// Return placeholder - actual pet loading handled separately
	data, _ := json.Marshal(map[string]string{"pet_path": p.PetPath})
	return successResponse(data)
}

func successResponse(payload json.RawMessage) *Response {
	return &Response{OK: true, Payload: payload}
}

func errorResponse(msg string) *Response {
	return &Response{OK: false, Error: msg}
}
