package ipc

import (
	"context"
	"github.com/goccy/go-json"
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/llm"
	"clod-pet/backend/internal/pet"
)

type benchMockService struct {
	engines map[string]*engine.Engine
}

func newBenchMockService() *benchMockService {
	return &benchMockService{
		engines: make(map[string]*engine.Engine),
	}
}

func (m *benchMockService) addEngine(id string) {
	p := &pet.Pet{
		FrameW: 64,
		FrameH: 64,
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "walk",
				Start: pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				End:   pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				Frames: []int{0, 1},
				Repeat: mustParseExpr("10"),
			},
		},
		Spawns: []pet.Spawn{
			{ID: 1, X: mustParseExpr("100"), Y: mustParseExpr("200"), NextAnimID: 1},
		},
	}
	e := engine.NewEngine(p)
	e.Start(1)
	m.engines[id] = e
}

func (m *benchMockService) StepPet(id string, world engine.WorldContext) (*PetState, error) {
	e, ok := m.engines[id]
	if !ok {
		return nil, engine.ErrPetNotFound
	}
	result, err := e.Step(world)
	if err != nil {
		return nil, err
	}
	return &PetState{
		PetID:         id,
		FrameIndex:     result.FrameIndex,
		X:              result.X,
		Y:              result.Y,
		CurrentAnimID:  result.NextAnimID,
	}, nil
}

func (m *benchMockService) AddPet(petPath string, spawnID int, worlds ...engine.WorldContext) (*PetState, error) {
	p := &pet.Pet{
		FrameW: 64,
		FrameH: 64,
		Animations: map[int]pet.Animation{
			1: {
				ID:   1,
				Name: "walk",
				Start: pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				End:   pet.Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				Frames: []int{0, 1},
				Repeat: mustParseExpr("10"),
			},
		},
		Spawns: []pet.Spawn{
			{ID: 1, X: mustParseExpr("100"), Y: mustParseExpr("200"), NextAnimID: 1},
		},
	}
	e := engine.NewEngine(p)
	world := engine.WorldContext{}
	if len(worlds) > 0 {
		world = worlds[0]
	}
	e.Start(1, world)
	m.engines[petPath] = e
	return &PetState{PetID: petPath, CurrentAnimID: 1}, nil
}

func (m *benchMockService) RemovePet(id string) {
	delete(m.engines, id)
}

func (m *benchMockService) Status() map[string]int {
	return map[string]int{"pet_count": len(m.engines)}
}

func (m *benchMockService) StepPets(petIDs []string, world engine.WorldContext) ([]*PetState, error) {
	states := make([]*PetState, len(petIDs))
	for i, id := range petIDs {
		state, err := m.StepPet(id, world)
		if err != nil {
			states[i] = nil
		} else {
			states[i] = state
		}
	}
	return states, nil
}

func (m *benchMockService) SetPosition(petID string, x, y float64) error {
	return nil
}

func (m *benchMockService) DragPet(petID string, x, y float64) error {
	return nil
}

func (m *benchMockService) DropPet(petID string) error {
	return nil
}

func (m *benchMockService) ValidatePetExists(petID string) error {
	return nil
}

func (m *benchMockService) UpdateVolume(volume float64) error {
	return nil
}

func (m *benchMockService) UpdateScale(scale float64) error {
	return nil
}

func (m *benchMockService) Settings() map[string]interface{} {
	return map[string]interface{}{"Volume": 0.3}
}

func (m *benchMockService) SetSettings(settings map[string]interface{}) error {
	return nil
}

func (m *benchMockService) ListPets() ([]string, error) {
	return []string{"test"}, nil
}

func (m *benchMockService) ListActive() ([]map[string]interface{}, error) {
	return []map[string]interface{}{}, nil
}

func (m *benchMockService) Pet(petID string) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}

func (m *benchMockService) PetsDir() string {
	return "pets"
}

func (m *benchMockService) LoadPet(petPath string) (*PetInfo, error) {
	return &PetInfo{Title: "Test"}, nil
}

func (m *benchMockService) LLMChat(payload json.RawMessage) (*Response, error) {
	return &Response{OK: true}, nil
}

func (m *benchMockService) LLMStream(ctx context.Context, payload json.RawMessage) (<-chan llm.StreamEvent, error) {
	ch := make(chan llm.StreamEvent)
	go func() {
		defer close(ch)
		ch <- llm.StreamEvent{Content: "Hello"}
		ch <- llm.StreamEvent{Content: " world"}
		ch <- llm.StreamEvent{Done: true}
	}()
	return ch, nil
}

// BenchmarkHandleStepPet measures step_pet handler latency under load.
func BenchmarkHandleStepPet(b *testing.B) {
	svc := newBenchMockService()
	svc.addEngine("bench-pet")
	h := NewHandler(svc)

	stepPayload, _ := json.Marshal(StepPetPayload{
		PetID: "bench-pet",
		World: engine.WorldContext{},
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := h.Handle(&Request{
			Command: CmdStepPet,
			Payload: stepPayload,
		})
		_ = resp.OK
	}
}

// BenchmarkHandleAddPet measures add_pet handler latency.
func BenchmarkHandleAddPet(b *testing.B) {
	svc := newBenchMockService()
	h := NewHandler(svc)

	addPayload, _ := json.Marshal(AddPetPayload{
		PetPath: "bench-pet",
		SpawnID: 1,
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := h.Handle(&Request{
			Command: CmdAddPet,
			Payload: addPayload,
		})
		_ = resp.OK
	}
}

// BenchmarkHandleGetStatus measures get_status handler latency.
func BenchmarkHandleGetStatus(b *testing.B) {
	svc := newBenchMockService()
	svc.addEngine("pet-1")
	svc.addEngine("pet-2")
	h := NewHandler(svc)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := h.Handle(&Request{Command: CmdGetStatus})
		_ = resp.OK
	}
}

// BenchmarkHandleRemovePet measures remove_pet handler latency.
func BenchmarkHandleRemovePet(b *testing.B) {
	svc := newBenchMockService()
	h := NewHandler(svc)

	removePayload, _ := json.Marshal(RemovePetPayload{PetID: "bench-pet"})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.addEngine("bench-pet")
		resp := h.Handle(&Request{
			Command: CmdRemovePet,
			Payload: removePayload,
		})
		_ = resp.OK
	}
}

// BenchmarkHandleDragPet measures drag_pet handler latency.
func BenchmarkHandleDragPet(b *testing.B) {
	svc := newBenchMockService()
	svc.addEngine("bench-pet")
	h := NewHandler(svc)

	dragPayload, _ := json.Marshal(DragPetPayload{
		PetID: "bench-pet",
		X:     500,
		Y:     300,
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := h.Handle(&Request{
			Command: CmdDragPet,
			Payload: dragPayload,
		})
		_ = resp.OK
	}
}

// BenchmarkHandleListActive measures list_active handler latency.
func BenchmarkHandleListActive(b *testing.B) {
	svc := newBenchMockService()
	svc.addEngine("pet-1")
	svc.addEngine("pet-2")
	h := NewHandler(svc)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp := h.Handle(&Request{Command: CmdListActive})
		_ = resp.OK
	}
}

// BenchmarkJSONMarshalPetState measures PetState serialization overhead.
func BenchmarkJSONMarshalPetState(b *testing.B) {
	state := PetState{
		PetID:         "bench-pet",
		FrameIndex:    0,
		X:             100.5,
		Y:             200.5,
		OffsetY:       5.0,
		Opacity:       1.0,
		IntervalMs:    200,
		FlipH:         false,
		CurrentAnimID: 1,
		NextAnimID:    2,
		BorderCtx:     engine.ContextFloor,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(state)
	}
}

// BenchmarkJSONUnmarshalRequest measures Request deserialization overhead.
func BenchmarkJSONUnmarshalRequest(b *testing.B) {
	data := []byte(`{"command":"step_pet","payload":{"pet_id":"bench-pet","world":{"screen":{"w":1920,"h":1080}}}}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var req Request
		_ = json.Unmarshal(data, &req)
	}
}
