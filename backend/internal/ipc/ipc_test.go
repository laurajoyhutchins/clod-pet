package ipc

import (
	"encoding/json"
	"testing"

	"clod-pet/backend/internal/engine"
)

type mockService struct {
	*commonMockService
}

func newMockService() *mockService {
	return &mockService{newCommonMockService("test", "Test")}
}

func (m *mockService) addEngine(id string) {
	e := engine.NewEngine(testPetDef())
	e.Start(1)
	m.engines[id] = e
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

func TestHandleAddPet(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	addPayload, _ := json.Marshal(AddPetPayload{PetPath: "new-pet", SpawnID: 1})
	resp := h.Handle(&Request{
		Command: CmdAddPet,
		Payload: addPayload,
	})

	if !resp.OK {
		t.Fatalf("resp.OK = false, want true, error: %s", resp.Error)
	}

	var result map[string]string
	if err := json.Unmarshal(resp.Payload, &result); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if result["pet_id"] != "new-pet" {
		t.Errorf("pet_id = %s, want new-pet", result["pet_id"])
	}
}

func TestHandleSetVolume(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	payload, _ := json.Marshal(SetVolumePayload{Volume: 0.5})
	resp := h.Handle(&Request{
		Command: CmdSetVolume,
		Payload: payload,
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleSetScale(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	payload, _ := json.Marshal(SetScalePayload{Scale: 1.5})
	resp := h.Handle(&Request{
		Command: CmdSetScale,
		Payload: payload,
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleGetSettings(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	resp := h.Handle(&Request{Command: CmdGetSettings})
	if !resp.OK {
		t.Fatalf("resp.OK = false, want true")
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(resp.Payload, &settings); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if settings["Volume"] != 0.3 {
		t.Errorf("Volume = %v, want 0.3", settings["Volume"])
	}
}

func TestHandleSetSettings(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	payload, _ := json.Marshal(map[string]interface{}{"Volume": 0.7})
	resp := h.Handle(&Request{
		Command: CmdSetSettings,
		Payload: payload,
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleListPets(t *testing.T) {
	svc := newMockService()
	h := NewHandler(svc)

	resp := h.Handle(&Request{Command: CmdListPets})
	if !resp.OK {
		t.Fatalf("resp.OK = false, want true")
	}

	var pets []string
	if err := json.Unmarshal(resp.Payload, &pets); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if len(pets) != 1 || pets[0] != "test" {
		t.Errorf("pets = %v, want [test]", pets)
	}
}

func TestHandleListActive(t *testing.T) {
	svc := newMockService()
	svc.addEngine("active-1")
	h := NewHandler(svc)

	resp := h.Handle(&Request{Command: CmdListActive})
	if !resp.OK {
		t.Fatalf("resp.OK = false, want true")
	}

	var active []map[string]interface{}
	if err := json.Unmarshal(resp.Payload, &active); err != nil {
		t.Fatalf("unmarshal payload error: %v", err)
	}
	if len(active) != 1 {
		t.Errorf("len(active) = %d, want 1", len(active))
	}
}

func TestHandleInvalidPayloads(t *testing.T) {
	h := NewHandler(newMockService())
	invalidPayload := json.RawMessage(`{invalid}`)

	commands := []Command{
		CmdAddPet, CmdRemovePet, CmdDragPet, CmdDropPet,
		CmdStepPet, CmdBorderPet, CmdGetPet, CmdSetVolume,
		CmdSetScale, CmdSetSettings,
	}

	for _, cmd := range commands {
		resp := h.Handle(&Request{Command: cmd, Payload: invalidPayload})
		if resp.OK {
			t.Errorf("cmd %s: resp.OK = true, want false for invalid payload", cmd)
		}
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
