package ipc

import (
	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/llm"
	"context"
	"encoding/json"
)

type Command string

const (
	CmdAddPet      Command = "add_pet"
	CmdRemovePet   Command = "remove_pet"
	CmdDragPet     Command = "drag_pet"
	CmdDropPet     Command = "drop_pet"
	CmdGetStatus   Command = "get_status"
	CmdSetVolume   Command = "set_volume"
	CmdSetScale    Command = "set_scale"
	CmdStepPet     Command = "step_pet"
	CmdBorderPet   Command = "border_pet"
	CmdGetPet      Command = "get_pet"
	CmdGetSettings Command = "get_settings"
	CmdSetSettings Command = "set_settings"
	CmdListPets    Command = "list_pets"
	CmdListActive  Command = "list_active"
	CmdSetPosition Command = "set_position"
	CmdLLMChat     Command = "llm_chat"
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
	PetPath string              `json:"pet_path"`
	SpawnID int                 `json:"spawn_id,omitempty"`
	World   engine.WorldContext `json:"world,omitempty"`
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
	PetID string              `json:"pet_id"`
	World engine.WorldContext `json:"world"`
}

type SetPositionPayload struct {
	PetID string  `json:"pet_id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
}

type BorderPetPayload struct {
	PetID     string               `json:"pet_id"`
	Direction engine.BorderContext `json:"direction"`
}

type SetVolumePayload struct {
	Volume float64 `json:"volume"`
}

type SetScalePayload struct {
	Scale float64 `json:"scale"`
}

type PetState struct {
	PetID      string        `json:"pet_id"`
	FrameIndex int           `json:"frame_index"`
	X          float64       `json:"x"`
	Y          float64       `json:"y"`
	OffsetY    float64       `json:"offset_y"`
	Opacity    float64       `json:"opacity"`
	IntervalMs int           `json:"interval_ms"`
	FlipH      bool          `json:"flip_h"`
	NextAnimID int           `json:"next_anim_id,omitempty"`
	Sound      *SoundPayload `json:"sound,omitempty"`
}

type SoundPayload struct {
	MIMEType   string `json:"mime_type"`
	DataBase64 string `json:"data_base64"`
	Loop       int    `json:"loop,omitempty"`
}

type SpawnInfo struct {
	ID          int `json:"id"`
	Probability int `json:"probability"`
}

type PetInfo struct {
	Title     string      `json:"title"`
	PetName   string      `json:"pet_name"`
	TilesX    int         `json:"tiles_x"`
	TilesY    int         `json:"tiles_y"`
	PngBase64 string      `json:"png_base64"`
	FrameW    int         `json:"frame_w"`
	FrameH    int         `json:"frame_h"`
	Spawns    []SpawnInfo `json:"spawns"`
	AnimCount int         `json:"anim_count"`
}

type Service interface {
	AddPet(petPath string, spawnID int, world ...engine.WorldContext) (*PetState, error)
	RemovePet(petID string)
	StepPet(petID string, world engine.WorldContext) (*PetState, error)
	SetPosition(petID string, x, y float64) error
	DragPet(petID string, x, y float64) error
	DropPet(petID string) error
	ValidatePetExists(petID string) error
	Status() map[string]int
	UpdateVolume(volume float64) error
	UpdateScale(scale float64) error
	Settings() map[string]interface{}
	SetSettings(settings map[string]interface{}) error
	ListPets() ([]string, error)
	ListActive() ([]map[string]interface{}, error)
	Pet(petID string) (json.RawMessage, error)
	PetsDir() string
	LoadPet(petPath string) (*PetInfo, error)
	LLMChat(payload json.RawMessage) (*Response, error)
	LLMStream(ctx context.Context, payload json.RawMessage) (<-chan llm.StreamEvent, error)
}

type Handler struct {
	svc Service
}

func NewHandler(svc Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Service() Service {
	return h.svc
}

func (h *Handler) Handle(req *Request) *Response {
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
	case CmdSetVolume:
		return h.handleSetVolume(req.Payload)
	case CmdSetScale:
		return h.handleSetScale(req.Payload)
	case CmdGetSettings:
		return h.handleGetSettings()
	case CmdSetSettings:
		return h.handleSetSettings(req.Payload)
	case CmdListPets:
		return h.handleListPets()
	case CmdListActive:
		return h.handleListActive()
	case CmdSetPosition:
		return h.handleSetPosition(req.Payload)
	case CmdLLMChat:
		return h.handleLLMChat(req.Payload)
	default:
		return errorResponse("unknown command: " + string(req.Command))
	}
}

func (h *Handler) handleLLMChat(payload json.RawMessage) *Response {
	resp, err := h.svc.LLMChat(payload)
	if err != nil {
		return errorResponse(err.Error())
	}
	return resp
}

func (h *Handler) handleSetPosition(payload json.RawMessage) *Response {
	var p SetPositionPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.SetPosition(p.PetID, p.X, p.Y); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleAddPet(payload json.RawMessage) *Response {
	var p AddPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	state, err := h.svc.AddPet(p.PetPath, p.SpawnID, p.World)
	if err != nil {
		return errorResponse(err.Error())
	}

	return marshalSuccess(state)
}

func (h *Handler) handleRemovePet(payload json.RawMessage) *Response {
	var p RemovePetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	h.svc.RemovePet(p.PetID)
	return successResponse(nil)
}

func (h *Handler) handleDragPet(payload json.RawMessage) *Response {
	var p DragPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.DragPet(p.PetID, p.X, p.Y); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleDropPet(payload json.RawMessage) *Response {
	var p DropPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.DropPet(p.PetID); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleStepPet(payload json.RawMessage) *Response {
	var p StepPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	state, err := h.svc.StepPet(p.PetID, p.World)
	if err != nil {
		return errorResponse(err.Error())
	}
	if state == nil {
		return successResponse(nil)
	}

	return marshalSuccess(state)
}

func (h *Handler) handleBorderPet(payload json.RawMessage) *Response {
	var p BorderPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.ValidatePetExists(p.PetID); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleGetStatus() *Response {
	status := h.svc.Status()
	return marshalSuccess(status)
}

func (h *Handler) handleGetPet(payload json.RawMessage) *Response {
	var p struct {
		PetPath string `json:"pet_path"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	data, err := h.svc.Pet(p.PetPath)
	if err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(data)
}

func (h *Handler) handleSetVolume(payload json.RawMessage) *Response {
	var p SetVolumePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.UpdateVolume(p.Volume); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleSetScale(payload json.RawMessage) *Response {
	var p SetScalePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.UpdateScale(p.Scale); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleGetSettings() *Response {
	settings := h.svc.Settings()
	return marshalSuccess(settings)
}

func (h *Handler) handleSetSettings(payload json.RawMessage) *Response {
	var settings map[string]interface{}
	if err := json.Unmarshal(payload, &settings); err != nil {
		return errorResponse("invalid payload: " + err.Error())
	}

	if err := h.svc.SetSettings(settings); err != nil {
		return errorResponse(err.Error())
	}
	return successResponse(nil)
}

func (h *Handler) handleListPets() *Response {
	pets, err := h.svc.ListPets()
	if err != nil {
		return errorResponse(err.Error())
	}
	return marshalSuccess(pets)
}

func (h *Handler) handleListActive() *Response {
	active, err := h.svc.ListActive()
	if err != nil {
		return errorResponse(err.Error())
	}
	return marshalSuccess(active)
}

func successResponse(payload json.RawMessage) *Response {
	return &Response{OK: true, Payload: payload}
}

func marshalSuccess(v interface{}) *Response {
	data, err := json.Marshal(v)
	if err != nil {
		return errorResponse("marshal response: " + err.Error())
	}
	return successResponse(data)
}

func errorResponse(msg string) *Response {
	return &Response{OK: false, Error: msg}
}
