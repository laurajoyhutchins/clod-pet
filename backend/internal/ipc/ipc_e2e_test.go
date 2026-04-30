package ipc

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/pet"
)

type e2eMockService struct {
	mu      sync.Mutex
	engines map[string]*engine.Engine
	petDef  *pet.Pet
}

func newE2eMockService() *e2eMockService {
	return &e2eMockService{
		engines: make(map[string]*engine.Engine),
		petDef: &pet.Pet{
			Header: pet.Header{Title: "E2E Test Pet", PetName: "e2e-pet"},
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
		},
	}
}

func (m *e2eMockService) AddPet(petPath string, spawnID int) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e := engine.NewEngine(m.petDef)
	e.Start(spawnID)
	m.engines[petPath] = e
	return petPath, nil
}

func (m *e2eMockService) RemovePet(petID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.engines, petID)
}

func (m *e2eMockService) StepPet(petID string, borderCtx engine.BorderContext, gravity bool) (*PetState, error) {
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

func (m *e2eMockService) DragPet(petID string, x, y float64) error {
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

func (m *e2eMockService) DropPet(petID string) error {
	m.mu.Lock()
	e, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	e.SetFall()
	return nil
}

func (m *e2eMockService) ValidatePetExists(petID string) error {
	m.mu.Lock()
	_, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	return nil
}

func (m *e2eMockService) Status() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return map[string]int{"pet_count": len(m.engines)}
}

func (m *e2eMockService) UpdateVolume(volume float64) error {
	return nil
}

func (m *e2eMockService) UpdateScale(scale float64) error {
	return nil
}

func (m *e2eMockService) Settings() map[string]interface{} {
	return map[string]interface{}{"Volume": 0.3, "Scale": 1.0, "CurrentPet": "e2e-pet"}
}

func (m *e2eMockService) SetSettings(settings map[string]interface{}) error {
	return nil
}

func (m *e2eMockService) ListPets() ([]string, error) {
	return []string{"e2e-pet"}, nil
}

func (m *e2eMockService) ListActive() ([]map[string]interface{}, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	active := make([]map[string]interface{}, 0, len(m.engines))
	for petID := range m.engines {
		active = append(active, map[string]interface{}{"pet_id": petID})
	}
	return active, nil
}

func (m *e2eMockService) Pet(petID string) (json.RawMessage, error) {
	return json.Marshal(map[string]string{"pet_id": petID})
}

func (m *e2eMockService) PetsDir() string {
	return "../pets"
}

func (m *e2eMockService) LoadPet(petPath string) (*PetInfo, error) {
	return &PetInfo{
		Title:     "E2E Test Pet",
		PetName:   "e2e-pet",
		TilesX:    4,
		TilesY:    4,
		AnimCount: 1,
	}, nil
}

func apiHandler(h *Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeTestError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeTestError(w, "invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}
		resp := h.Handle(&req)
		writeTestResponse(w, resp)
	}
}

func writeTestError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": msg})
}

func writeTestResponse(w http.ResponseWriter, resp *Response) {
	if !resp.OK {
		writeTestError(w, resp.Error, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func TestServerAddRemovePet(t *testing.T) {
	svc := newE2eMockService()
	h := NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(h))

	ts := httptest.NewServer(mux)
	defer ts.Close()

	addReq := Request{Command: CmdAddPet, Payload: mustMarshal(AddPetPayload{PetPath: "test-pet", SpawnID: 1})}
	resp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))
	if err != nil {
		t.Fatalf("add pet request failed: %v", err)
	}
	defer resp.Body.Close()

	var addResp Response
	json.NewDecoder(resp.Body).Decode(&addResp)
	if !addResp.OK {
		t.Fatalf("add pet failed: %s", addResp.Error)
	}

	statusReq := Request{Command: CmdGetStatus}
	statusResp, _ := http.Post(ts.URL+"/api", "application/json", jsonReader(statusReq))
	var statusRespObj Response
	json.NewDecoder(statusResp.Body).Decode(&statusRespObj)
	var status map[string]int
	json.Unmarshal(statusRespObj.Payload, &status)
	if status["pet_count"] != 1 {
		t.Errorf("pet_count = %d, want 1", status["pet_count"])
	}

	removeReq := Request{Command: CmdRemovePet, Payload: mustMarshal(RemovePetPayload{PetID: "test-pet"})}
	removeResp, _ := http.Post(ts.URL+"/api", "application/json", jsonReader(removeReq))
	var removeRespObj Response
	json.NewDecoder(removeResp.Body).Decode(&removeRespObj)
	if !removeRespObj.OK {
		t.Fatalf("remove pet failed: %s", removeRespObj.Error)
	}

	statusResp2, _ := http.Post(ts.URL+"/api", "application/json", jsonReader(statusReq))
	json.NewDecoder(statusResp2.Body).Decode(&statusRespObj)
	json.Unmarshal(statusRespObj.Payload, &status)
	if status["pet_count"] != 0 {
		t.Errorf("pet_count after remove = %d, want 0", status["pet_count"])
	}
}

func TestServerStepPet(t *testing.T) {
	svc := newE2eMockService()
	h := NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(h))

	ts := httptest.NewServer(mux)
	defer ts.Close()

	addReq := Request{Command: CmdAddPet, Payload: mustMarshal(AddPetPayload{PetPath: "step-pet", SpawnID: 1})}
	http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))

	stepReq := Request{Command: CmdStepPet, Payload: mustMarshal(StepPetPayload{PetID: "step-pet", BorderCtx: engine.ContextNone})}
	stepResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(stepReq))
	if err != nil {
		t.Fatalf("step pet request failed: %v", err)
	}
	defer stepResp.Body.Close()

	var stepResult Response
	json.NewDecoder(stepResp.Body).Decode(&stepResult)
	if !stepResult.OK {
		t.Fatalf("step pet failed: %s", stepResult.Error)
	}

	var state PetState
	json.Unmarshal(stepResult.Payload, &state)
	if state.PetID != "step-pet" {
		t.Errorf("PetID = %q, want \"step-pet\"", state.PetID)
	}
	if state.FrameIndex != 0 {
		t.Errorf("FrameIndex = %d, want 0", state.FrameIndex)
	}
}

func TestServerDragAndDropPet(t *testing.T) {
	svc := newE2eMockService()
	h := NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(h))

	ts := httptest.NewServer(mux)
	defer ts.Close()

	addReq := Request{Command: CmdAddPet, Payload: mustMarshal(AddPetPayload{PetPath: "drag-pet", SpawnID: 1})}
	http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))

	dragReq := Request{Command: CmdDragPet, Payload: mustMarshal(DragPetPayload{PetID: "drag-pet", X: 500, Y: 300})}
	dragResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(dragReq))
	if err != nil {
		t.Fatalf("drag pet request failed: %v", err)
	}
	defer dragResp.Body.Close()

	var dragResult Response
	json.NewDecoder(dragResp.Body).Decode(&dragResult)
	if !dragResult.OK {
		t.Fatalf("drag pet failed: %s", dragResult.Error)
	}

	dropReq := Request{Command: CmdDropPet, Payload: mustMarshal(DropPetPayload{PetID: "drag-pet"})}
	dropResp, _ := http.Post(ts.URL+"/api", "application/json", jsonReader(dropReq))
	var dropResult Response
	json.NewDecoder(dropResp.Body).Decode(&dropResult)
	if !dropResult.OK {
		t.Fatalf("drop pet failed: %s", dropResult.Error)
	}
}

func TestServerBorderDetection(t *testing.T) {
	svc := newE2eMockService()
	h := NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(h))

	ts := httptest.NewServer(mux)
	defer ts.Close()

	addReq := Request{Command: CmdAddPet, Payload: mustMarshal(AddPetPayload{PetPath: "border-pet", SpawnID: 1})}
	http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))

	borderReq := Request{Command: CmdBorderPet, Payload: mustMarshal(BorderPetPayload{PetID: "border-pet", Direction: engine.ContextTaskbar})}
	borderResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(borderReq))
	if err != nil {
		t.Fatalf("border pet request failed: %v", err)
	}
	defer borderResp.Body.Close()

	var borderResult Response
	json.NewDecoder(borderResp.Body).Decode(&borderResult)
	if !borderResult.OK {
		t.Fatalf("border pet failed: %s", borderResult.Error)
	}
}

func TestServerInvalidRequests(t *testing.T) {
	svc := newE2eMockService()
	h := NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(h))

	ts := httptest.NewServer(mux)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(Request{Command: "invalid_cmd"}))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var result Response
	json.NewDecoder(resp.Body).Decode(&result)
	if result.OK {
		t.Error("expected failure for invalid command, got success")
	}

	resp2, _ := http.Post(ts.URL+"/api", "application/json", jsonReader(Request{Command: ""}))
	var result2 Response
	json.NewDecoder(resp2.Body).Decode(&result2)
	if result2.OK {
		t.Error("expected failure for empty command, got success")
	}
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}

func jsonReader(v interface{}) *bytes.Reader {
	data, _ := json.Marshal(v)
	return bytes.NewReader(data)
}
