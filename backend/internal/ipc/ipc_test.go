package ipc

import (
	"encoding/json"
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
				ID:   1,
				Name: "walk",
				Start: pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				End:   pet.Movement{X: "-2", Y: "0", OffsetY: 0, Opacity: 1.0, Interval: "200"},
				Frames:      []int{0, 1},
				Repeat:      "10",
				RepeatFrom:  0,
				SequenceNext: []pet.NextAnimation{
					{ID: 1, Probability: 100, Only: "none"},
				},
			},
		},
		Sounds: make(map[int][]pet.Sound),
	}
}

func addTestEngine(h *Handler, id string) {
	e := engine.NewEngine(testPetDef())
	e.Start(1)
	h.engines[id] = e
}

func TestHandleGetStatus(t *testing.T) {
	h := NewHandler()

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
	h := NewHandler()
	addTestEngine(h, "pet-1")
	addTestEngine(h, "pet-2")

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
	h := NewHandler()
	addTestEngine(h, "step-test")

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
	h := NewHandler()

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
	h := NewHandler()
	addTestEngine(h, "remove-me")

	resp := h.Handle(&Request{
		Command: CmdRemovePet,
		Payload: json.RawMessage(`{"pet_id":"remove-me"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleRemovePetNotFound(t *testing.T) {
	h := NewHandler()

	resp := h.Handle(&Request{
		Command: CmdRemovePet,
		Payload: json.RawMessage(`{"pet_id":"nope"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true (delete of non-existent key is no-op)")
	}
}

func TestHandleDragPet(t *testing.T) {
	h := NewHandler()
	addTestEngine(h, "drag-test")

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
	h := NewHandler()

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
	h := NewHandler()
	addTestEngine(h, "drop-test")

	resp := h.Handle(&Request{
		Command: CmdDropPet,
		Payload: json.RawMessage(`{"pet_id":"drop-test"}`),
	})

	if !resp.OK {
		t.Errorf("resp.OK = false, want true, error: %s", resp.Error)
	}
}

func TestHandleBorderPet(t *testing.T) {
	h := NewHandler()
	addTestEngine(h, "border-test")

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
	h := NewHandler()

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
	if result["pet_path"] != "some-pet" {
		t.Errorf("pet_path = %q, want %q", result["pet_path"], "some-pet")
	}
}

func TestHandleUnknownCommand(t *testing.T) {
	h := NewHandler()

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

func TestBorderMatches(t *testing.T) {
	tests := []struct {
		only string
		ctx  engine.BorderContext
		want bool
	}{
		{"none", engine.ContextNone, true},
		{"none", engine.ContextTaskbar, true},
		{"taskbar", engine.ContextTaskbar, true},
		{"taskbar", engine.ContextNone, false},
		{"window", engine.ContextWindow, true},
		{"window", engine.ContextTaskbar, false},
		{"vertical", engine.ContextVertical, true},
		{"vertical", engine.ContextHorizontal, false},
		{"horizontal", engine.ContextHorizontal, true},
		{"horizontal", engine.ContextVertical, false},
		{"horizontal+", engine.ContextHorizontal, true},
	}

	for _, tc := range tests {
		got := engine.BorderMatches(tc.only, tc.ctx)
		if got != tc.want {
			t.Errorf("BorderMatches(%q, %v) = %v, want %v", tc.only, tc.ctx, got, tc.want)
		}
	}
}

func TestWeightedPick(t *testing.T) {
	candidates := []pet.NextAnimation{
		{ID: 1, Probability: 80},
		{ID: 2, Probability: 20},
	}

	for i := 0; i < 100; i++ {
		result := engine.WeightedPick(candidates)
		if result != 1 && result != 2 {
			t.Errorf("WeightedPick returned %d, want 1 or 2", result)
		}
	}
}

func TestWeightedPickEmpty(t *testing.T) {
	result := engine.WeightedPick([]pet.NextAnimation{})
	if result != 0 {
		t.Errorf("WeightedPick(empty) = %d, want 0", result)
	}
}

func TestWeightedPickZeroProbability(t *testing.T) {
	candidates := []pet.NextAnimation{
		{ID: 1, Probability: 0},
		{ID: 2, Probability: 0},
	}

	result := engine.WeightedPick(candidates)
	if result != 0 {
		t.Errorf("WeightedPick(zero prob) = %d, want 0", result)
	}
}
