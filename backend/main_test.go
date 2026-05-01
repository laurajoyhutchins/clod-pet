package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"clod-pet/backend/internal/ipc"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/service"
	"clod-pet/backend/internal/settings"
)

func TestMain(m *testing.M) {
	log.Init(false)
	os.Exit(m.Run())
}

func TestEnvOr(t *testing.T) {
	os.Unsetenv("TEST_VAR")
	result := envOr("TEST_VAR", "default")
	if result != "default" {
		t.Errorf("expected 'default', got %q", result)
	}

	os.Setenv("TEST_VAR", "custom")
	defer os.Unsetenv("TEST_VAR")
	result = envOr("TEST_VAR", "default")
	if result != "custom" {
		t.Errorf("expected 'custom', got %q", result)
	}
}

func TestLoadSettingsExisting(t *testing.T) {
	cfg := loadSettings("clod-pet-settings.json")
	if cfg == nil {
		t.Fatal("loadSettings returned nil")
	}
	if cfg.Volume == 0 {
		t.Error("expected non-zero volume")
	}
}

func TestLoadSettingsNonExistent(t *testing.T) {
	cfg := loadSettings("non-existent-settings.json")
	if cfg == nil {
		t.Fatal("loadSettings returned nil for non-existent file")
	}
	if cfg.Volume != 0.3 {
		t.Errorf("expected default volume 0.3, got %v", cfg.Volume)
	}
}

func TestWriteJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]interface{}{"ok": true, "message": "test"}
	writeJSON(rr, data)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["ok"] != true {
		t.Error("expected ok to be true")
	}
}

func TestWriteError(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, "test error", http.StatusBadRequest)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["ok"] != false {
		t.Error("expected ok to be false")
	}
}

func TestWriteResponseOK(t *testing.T) {
	rr := httptest.NewRecorder()
	resp := &ipc.Response{OK: true, Payload: []byte(`{"test":true}`)}
	writeResponse(rr, resp)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}
}

func TestWriteResponseError(t *testing.T) {
	rr := httptest.NewRecorder()
	resp := &ipc.Response{OK: false, Error: "something went wrong"}
	writeResponse(rr, resp)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}
}

func TestWriteResponseErrorNotFound(t *testing.T) {
	rr := httptest.NewRecorder()
	resp := &ipc.Response{OK: false, Error: "pet not found"}
	writeResponse(rr, resp)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", rr.Code)
	}
}

func TestApiHandler(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := apiHandler(nil)

	// Test wrong method
	req := httptest.NewRequest(http.MethodGet, "/api", nil)
	handler(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestApiHandlerSuccess(t *testing.T) {
	svc := service.New("../pets", "test-settings.json", settings.DefaultConfig())
	h := ipc.NewHandler(svc)
	handler := apiHandler(h)

	body := `{"command": "get_status"}`
	req := httptest.NewRequest(http.MethodPost, "/api", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp ipc.Response
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.OK {
		t.Error("expected resp.OK to be true")
	}
}

func TestApiHandlerUnknownCommand(t *testing.T) {
	svc := service.New("../pets", "test-settings.json", settings.DefaultConfig())
	h := ipc.NewHandler(svc)
	handler := apiHandler(h)

	body := `{"command": "unknown"}`
	req := httptest.NewRequest(http.MethodPost, "/api", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestLoadPetHandler(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := loadPetHandler(nil)

	// Test wrong method
	req := httptest.NewRequest(http.MethodGet, "/api/pet/load", nil)
	handler(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestLoadPetHandlerSuccess(t *testing.T) {
	svc := service.New("../pets", "test-settings.json", settings.DefaultConfig())
	h := ipc.NewHandler(svc)
	handler := loadPetHandler(h)

	body := `{"pet_path": "../pets/esheep64"}`
	req := httptest.NewRequest(http.MethodPost, "/api/pet/load", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestHealthHandlerOK(t *testing.T) {
	rr := httptest.NewRecorder()
	cfg := settings.DefaultConfig()
	svc := service.New("../pets", "test-settings.json", cfg)
	// Add a pet to make it OK
	svc.AddPet("../pets/esheep64", 1)

	handler := healthHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	var result map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&result)
	if result["status"] != "ok" {
		t.Errorf("expected status ok, got %v", result["status"])
	}
}

func TestLoadPetHandlerInvalidJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := loadPetHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/api/pet/load", strings.NewReader("invalid"))
	handler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestLoadPetHandlerFail(t *testing.T) {
	svc := service.New("../pets", "test-settings.json", settings.DefaultConfig())
	h := ipc.NewHandler(svc)
	handler := loadPetHandler(h)

	body := `{"pet_path": "non-existent"}`
	req := httptest.NewRequest(http.MethodPost, "/api/pet/load", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestVersionHandler(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := versionHandler("../pets", "settings.json")
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestHealthHandler(t *testing.T) {
	rr := httptest.NewRecorder()
	// Use a simple mock or skip if service creation fails
	cfg := settings.DefaultConfig()
	svc := service.New("../pets", "test-settings.json", cfg)
	if svc == nil {
		t.Skip("service creation returned nil")
	}
	handler := healthHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	handler(rr, req)

	if rr.Code != http.StatusOK && rr.Code != http.StatusBadRequest {
		t.Errorf("expected 200 or 400, got %d", rr.Code)
	}
}

func TestDescribeHandler(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := describeHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/describe", nil)
	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if _, ok := result["commands"]; !ok {
		t.Error("expected commands in response")
	}
}

func TestHealthHandlerDegraded(t *testing.T) {
	rr := httptest.NewRecorder()
	cfg := settings.DefaultConfig()
	svc := service.New("../pets", "test-settings.json", cfg)
	if svc == nil {
		t.Skip("service creation returned nil")
	}
	handler := healthHandler(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	handler(rr, req)

	var result map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&result)
	if status, ok := result["status"]; ok && status != "degraded" {
		t.Errorf("expected degraded status, got %v", status)
	}
}

func TestWriteResponseNil(t *testing.T) {
	rr := httptest.NewRecorder()
	// This tests the case where resp might have different fields
	resp := &ipc.Response{OK: true}
	writeResponse(rr, resp)
}

func TestApiHandlerInvalidJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	handler := apiHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/api", strings.NewReader("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	handler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}
