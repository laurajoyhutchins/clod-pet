package ipc

import (
	"encoding/json"
	"sync"
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/pet"
)

func testPetDef() *pet.Pet {
	return &pet.Pet{
		Header: pet.Header{Title: "Test", PetName: "test"},
		Image:  pet.Image{TilesX: 4, TilesY: 4},
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
					{ID: 1, Probability: 100, Only: "none"},
				},
			},
		},
		Sounds: make(map[int][]pet.Sound),
	}
}

type mockService struct {
	mu      sync.Mutex
	engines map[string]*engine.Engine
}

func newMockService() *mockService {
	return &mockService{engines: make(map[string]*engine.Engine)}
}

func (m *mockService) addEngine(id string) {
	e := engine.NewEngine(testPetDef())
	e.Start(1)
	m.engines[id] = e
}

func (m *mockService) AddPet(petPath string, spawnID int) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e := engine.NewEngine(testPetDef())
	e.Start(1)
	m.engines[petPath] = e
	return petPath, nil
}

func (m *mockService) RemovePet(petID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.engines, petID)
}

func (m *mockService) StepPet(petID string, borderCtx engine.BorderContext, gravity bool) (*PetState, error) {
	m.mu.Lock()
	e, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return nil, engine.ErrPetNotFound
	}

	step, err := e.Step(borderCtx, gravity)
	if err != nil {
		return nil, err
	}
	if step == nil {
		return nil, nil
	}

	if step.NextAnimID > 0 {
		e.TransitionTo(step.NextAnimID)
	}

	return &PetState{
		PetID:      petID,
		FrameIndex: step.FrameIndex,
		X:          step.X,
		Y:          step.Y,
		OffsetY:    step.OffsetY,
		Opacity:    step.Opacity,
		IntervalMs: step.IntervalMs,
		FlipH:      step.ShouldFlip,
		NextAnimID: step.NextAnimID,
	}, nil
}

func (m *mockService) DragPet(petID string, x, y float64) error {
	m.mu.Lock()
	e, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	e.SetDrag()
	e.SetPosition(x, y)
	return nil
}

func (m *mockService) DropPet(petID string) error {
	m.mu.Lock()
	e, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	e.SetFall()
	return nil
}

func (m *mockService) ValidatePetExists(petID string) error {
	m.mu.Lock()
	_, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	return nil
}

func (m *mockService) Status() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return map[string]int{"pet_count": len(m.engines)}
}

func (m *mockService) UpdateVolume(volume float64) error {
	return nil
}

func (m *mockService) UpdateScale(scale float64) error {
	return nil
}

func (m *mockService) Settings() map[string]interface{} {
	return map[string]interface{}{"Volume": 0.3, "Scale": 1.0, "CurrentPet": "test"}
}

func (m *mockService) SetSettings(settings map[string]interface{}) error {
	return nil
}

func (m *mockService) ListPets() ([]string, error) {
	return []string{"test"}, nil
}

func (m *mockService) ListActive() ([]map[string]interface{}, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	active := make([]map[string]interface{}, 0, len(m.engines))
	for petID := range m.engines {
		active = append(active, map[string]interface{}{"pet_id": petID})
	}
	return active, nil
}

func (m *mockService) Pet(petID string) (json.RawMessage, error) {
	return json.Marshal(map[string]string{"pet_id": petID})
}

func (m *mockService) PetsDir() string {
	return "../pets"
}

func (m *mockService) LoadPet(petPath string) (*PetInfo, error) {
	return &PetInfo{
		Title:     "Test",
		PetName:   "test",
		TilesX:    4,
		TilesY:    4,
		AnimCount: 1,
	}, nil
}

func TestHandleGetStatus(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	resp := h.Handle(&Request{Command: CmdGetStatus})
	if !resp.OK {
		t.Fatalf("resp.OK = false, want true")
	}

	var status map[string]int
	if err := json.Unmarshal(resp.Payload, &status); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if status["pet_count"] != 0 {
		t.Errorf("pet_count = %d, want 0", status["pet_count"])
	}
}

func TestHandleGetStatusWithPets(t *testing.T) {
	svc := newMockService()
	svc.addEngine("pet-1")
	svc.addEngine("pet-2")
	h := NewHandler(svc)

	resp := h.Handle(&Request{Command: CmdGetStatus})

	var status map[string]int
	if err := json.Unmarshal(resp.Payload, &status); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if status["pet_count"] != 2 {
		t.Errorf("pet_count = %d, want 2", status["pet_count"])
	}
}

func TestHandleStepPet(t *testing.T) {
	svc := newMockService()
	svc.addEngine("step-test")
	h := NewHandler(svc)

	stepPayload, _ := json.Marshal(StepPetPayload{PetID: "step-test", BorderCtx: engine.ContextNone})
	resp := h.Handle(&Request{
		Command: CmdStepPet,
		Payload: stepPayload,
	})

	if !resp.OK {
		t.Fatalf("resp.OK = false, want true, error: %s", resp.Error)
	}

	var state PetState
	if err := json.Unmarshal(resp.Payload, &state); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}

	if state.FrameIndex != 0 {
		t.Errorf("FrameIndex = %d, want 0", state.FrameIndex)
	}
}

func TestHandleStepPetNotFound(t *testing.T) {
	h := NewHandler(newMockService())

	stepPayload, _ := json.Marshal(StepPetPayload{PetID: "nope", BorderCtx: engine.ContextNone})
	resp := h.Handle(&Request{
		Command: CmdStepPet,
		Payload: stepPayload,
	})

	if resp.OK {
		t.Error("resp.OK = true, want false")
	}
}

func TestHandleRemovePet(t *testing.T) {
	svc := newMockService()
	svc.addEngine("remove-me")
	h := NewHandler(svc)

	resp := h.Handle(&Request{
		Command: CmdRemovePet,
		Payload: json.RawMessage(`{"pet_id":"remove-me"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleRemovePetNotFound(t *testing.T) {
	h := NewHandler(newMockService())

	resp := h.Handle(&Request{
		Command: CmdRemovePet,
		Payload: json.RawMessage(`{"pet_id":"nope"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true (delete of non-existent key is no-op)")
	}
}

func TestHandleDragPet(t *testing.T) {
	svc := newMockService()
	svc.addEngine("drag-test")
	h := NewHandler(svc)

	dragPayload, _ := json.Marshal(DragPetPayload{PetID: "drag-test", X: 500, Y: 300})
	resp := h.Handle(&Request{
		Command: CmdDragPet,
		Payload: dragPayload,
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleDragPetNotFound(t *testing.T) {
	h := NewHandler(newMockService())

	dragPayload, _ := json.Marshal(DragPetPayload{PetID: "nope", X: 0, Y: 0})
	resp := h.Handle(&Request{
		Command: CmdDragPet,
		Payload: dragPayload,
	})

	if resp.OK {
		t.Error("resp.OK = true, want false")
	}
}

func TestHandleDropPet(t *testing.T) {
	svc := newMockService()
	svc.addEngine("drop-test")
	h := NewHandler(svc)

	resp := h.Handle(&Request{
		Command: CmdDropPet,
		Payload: json.RawMessage(`{"pet_id":"drop-test"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleBorderPet(t *testing.T) {
	svc := newMockService()
	svc.addEngine("border-test")
	h := NewHandler(svc)

	borderPayload, _ := json.Marshal(BorderPetPayload{PetID: "border-test", Direction: engine.ContextTaskbar})
	resp := h.Handle(&Request{
		Command: CmdBorderPet,
		Payload: borderPayload,
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleGetPet(t *testing.T) {
	h := NewHandler(newMockService())

	resp := h.Handle(&Request{
		Command: CmdGetPet,
		Payload: json.RawMessage(`{"pet_path":"some-pet"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true")
	}

	var result map[string]string
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if result["pet_id"] != "some-pet" {
		t.Errorf("pet_id = %q, want %q", result["pet_id"], "some-pet")
	}
}

func TestHandleUnknownCommand(t *testing.T) {
	h := NewHandler(newMockService())

	resp := h.Handle(&Request{Command: "unknown_cmd"})

	if resp.OK {
		t.Error("resp.OK = true, want false")
	}
}

func TestResponseHelpers(t *testing.T) {
	data, _ := json.Marshal(map[string]int{"count": 5})

	resp := successResponse(data)
	if !resp.OK {
		t.Error("successResponse: OK = false, want true")
	}
	if resp.Error != "" {
		t.Errorf("successResponse: Error = %q, want empty", resp.Error)
	}

	resp = errorResponse("something broke")
	if resp.OK {
		t.Error("errorResponse: OK = true, want false")
	}
	if resp.Error != "something broke" {
		t.Errorf("errorResponse: Error = %q, want %q", resp.Error, "something broke")
	}
}

func TestPetStateJSON(t *testing.T) {
	state := PetState{
		PetID:      "test",
		FrameIndex: 3,
		X:          100.5,
		Y:          200.5,
		OffsetY:    5.0,
		Opacity:    0.75,
		IntervalMs: 200,
		FlipH:      true,
		NextAnimID: 2,
	}

	data, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if decoded["pet_id"] != "test" {
		t.Errorf("pet_id = %v, want test", decoded["pet_id"])
	}
	if int(decoded["frame_index"].(float64)) != 3 {
		t.Errorf("frame_index = %v, want 3", decoded["frame_index"])
	}
	if int(decoded["next_anim_id"].(float64)) != 2 {
		t.Errorf("next_anim_id = %v, want 2", decoded["next_anim_id"])
	}
}
