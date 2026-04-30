package ipc

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"clod-pet/backend/internal/engine"
)

type e2eMockService struct {
	*commonMockService
}

func newE2eMockService() *e2eMockService {
	return &e2eMockService{newCommonMockService("e2e-pet", "E2E Test Pet")}
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
	if err := json.NewDecoder(resp.Body).Decode(&addResp); err != nil {
		t.Fatalf("decode add response: %v", err)
	}
	if !addResp.OK {
		t.Fatalf("add pet failed: %s", addResp.Error)
	}

	statusReq := Request{Command: CmdGetStatus}
	statusResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(statusReq))
	if err != nil {
		t.Fatalf("status request failed: %v", err)
	}
	defer statusResp.Body.Close()
	var statusRespObj Response
	if err := json.NewDecoder(statusResp.Body).Decode(&statusRespObj); err != nil {
		t.Fatalf("decode status response: %v", err)
	}
	var status map[string]int
	if err := json.Unmarshal(statusRespObj.Payload, &status); err != nil {
		t.Fatalf("unmarshal status payload: %v", err)
	}
	if status["pet_count"] != 1 {
		t.Errorf("pet_count = %d, want 1", status["pet_count"])
	}

	removeReq := Request{Command: CmdRemovePet, Payload: mustMarshal(RemovePetPayload{PetID: "test-pet"})}
	removeResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(removeReq))
	if err != nil {
		t.Fatalf("remove request failed: %v", err)
	}
	defer removeResp.Body.Close()
	var removeRespObj Response
	if err := json.NewDecoder(removeResp.Body).Decode(&removeRespObj); err != nil {
		t.Fatalf("decode remove response: %v", err)
	}
	if !removeRespObj.OK {
		t.Fatalf("remove pet failed: %s", removeRespObj.Error)
	}

	statusResp2, err := http.Post(ts.URL+"/api", "application/json", jsonReader(statusReq))
	if err != nil {
		t.Fatalf("status2 request failed: %v", err)
	}
	defer statusResp2.Body.Close()
	if err := json.NewDecoder(statusResp2.Body).Decode(&statusRespObj); err != nil {
		t.Fatalf("decode status2 response: %v", err)
	}
	if err := json.Unmarshal(statusRespObj.Payload, &status); err != nil {
		t.Fatalf("unmarshal status2 payload: %v", err)
	}
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
	resp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))
	if err != nil {
		t.Fatalf("add pet request failed: %v", err)
	}
	var addResp Response
	if err := json.NewDecoder(resp.Body).Decode(&addResp); err != nil {
		t.Fatalf("decode add response: %v", err)
	}

	stepReq := Request{Command: CmdStepPet, Payload: mustMarshal(StepPetPayload{PetID: "step-pet", World: engine.WorldContext{}})}
	stepResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(stepReq))
	if err != nil {
		t.Fatalf("step pet request failed: %v", err)
	}
	defer stepResp.Body.Close()

	var stepResult Response
	if err := json.NewDecoder(stepResp.Body).Decode(&stepResult); err != nil {
		t.Fatalf("decode step response: %v", err)
	}
	if !stepResult.OK {
		t.Fatalf("step pet failed: %s", stepResult.Error)
	}

	var state PetState
	if err := json.Unmarshal(stepResult.Payload, &state); err != nil {
		t.Fatalf("unmarshal step payload: %v", err)
	}
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
	resp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))
	if err != nil {
		t.Fatalf("add pet request failed: %v", err)
	}
	var addResp Response
	if err := json.NewDecoder(resp.Body).Decode(&addResp); err != nil {
		t.Fatalf("decode add response: %v", err)
	}

	dragReq := Request{Command: CmdDragPet, Payload: mustMarshal(DragPetPayload{PetID: "drag-pet", X: 500, Y: 300})}
	dragResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(dragReq))
	if err != nil {
		t.Fatalf("drag pet request failed: %v", err)
	}
	defer dragResp.Body.Close()

	var dragResult Response
	if err := json.NewDecoder(dragResp.Body).Decode(&dragResult); err != nil {
		t.Fatalf("decode drag response: %v", err)
	}
	if !dragResult.OK {
		t.Fatalf("drag pet failed: %s", dragResult.Error)
	}

	dropReq := Request{Command: CmdDropPet, Payload: mustMarshal(DropPetPayload{PetID: "drag-pet"})}
	dropResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(dropReq))
	if err != nil {
		t.Fatalf("drop request failed: %v", err)
	}
	defer dropResp.Body.Close()
	var dropResult Response
	if err := json.NewDecoder(dropResp.Body).Decode(&dropResult); err != nil {
		t.Fatalf("decode drop response: %v", err)
	}
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
	resp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(addReq))
	if err != nil {
		t.Fatalf("add pet request failed: %v", err)
	}
	var addResp Response
	if err := json.NewDecoder(resp.Body).Decode(&addResp); err != nil {
		t.Fatalf("decode add response: %v", err)
	}

	borderReq := Request{Command: CmdBorderPet, Payload: mustMarshal(BorderPetPayload{PetID: "border-pet", Direction: engine.ContextTaskbar})}
	borderResp, err := http.Post(ts.URL+"/api", "application/json", jsonReader(borderReq))
	if err != nil {
		t.Fatalf("border pet request failed: %v", err)
	}
	defer borderResp.Body.Close()

	var borderResult Response
	if err := json.NewDecoder(borderResp.Body).Decode(&borderResult); err != nil {
		t.Fatalf("decode border response: %v", err)
	}
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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode invalid_cmd response: %v", err)
	}
	if result.OK {
		t.Error("expected failure for invalid command, got success")
	}

	resp2, err := http.Post(ts.URL+"/api", "application/json", jsonReader(Request{Command: ""}))
	if err != nil {
		t.Fatalf("empty command request failed: %v", err)
	}
	defer resp2.Body.Close()
	var result2 Response
	if err := json.NewDecoder(resp2.Body).Decode(&result2); err != nil {
		t.Fatalf("decode empty command response: %v", err)
	}
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
