package main

import (
	"github.com/goccy/go-json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/service"
	"clod-pet/backend/internal/settings"
)

func TestMain(m *testing.M) {
	log.Init(false)
	os.Exit(m.Run())
}

func writeTempSettingsFile(t *testing.T, cfg *settings.Config) string {
	t.Helper()

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}

	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	return path
}

func newTestService(t *testing.T, addPet bool) *service.Service {
	t.Helper()

	svc := service.New("../pets", "test-settings.json", settings.DefaultConfig())
	if addPet {
		if _, err := svc.AddPet("../pets/eSheep-modern", 1); err != nil {
			t.Fatalf("add pet: %v", err)
		}
	}
	return svc
}

func invokeHandler(t *testing.T, handler http.HandlerFunc, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

func TestRecoveryMiddleware(t *testing.T) {
	handler := recoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	}))

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/panic", nil)

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", rr.Code)
	}
	if rr.Header().Get(requestIDHeader) == "" {
		t.Fatal("expected request id header to be set")
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["ok"] != false {
		t.Fatalf("expected ok=false, got %#v", result["ok"])
	}
	if result["error"] != "internal server error" {
		t.Fatalf("expected internal server error, got %#v", result["error"])
	}
	if result["request_id"] == "" {
		t.Fatal("expected request_id in panic response")
	}
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
	want := settings.DefaultConfig()
	cfg := loadSettings(writeTempSettingsFile(t, want))
	if cfg == nil {
		t.Fatal("loadSettings returned nil")
	}
	if cfg.Volume != want.Volume {
		t.Errorf("expected volume %v, got %v", want.Volume, cfg.Volume)
	}
}

func TestLoadSettingsNonExistent(t *testing.T) {
	cfg := loadSettings(filepath.Join(t.TempDir(), "missing-settings.json"))
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
	if !strings.Contains(contentType, "application/json") {
		t.Errorf("expected application/json content type, got %s", contentType)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["ok"] != true || result["message"] != "test" {
		t.Errorf("unexpected JSON body: %#v", result)
	}
}

func TestWriteError(t *testing.T) {
	rr := httptest.NewRecorder()
	writeError(rr, "test error", http.StatusBadRequest)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}

	rawBody, err := io.ReadAll(rr.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !strings.Contains(string(rawBody), "test error") {
		t.Errorf("expected error text in body, got %q", string(rawBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rawBody, &result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["ok"] != false || result["error"] != "test error" {
		t.Errorf("unexpected JSON body: %#v", result)
	}
}

func TestWriteResponse(t *testing.T) {
	tests := []struct {
		name        string
		resp        *ipc.Response
		wantStatus  int
		wantOK      bool
		wantError   string
		wantPayload string
	}{
		{
			name:        "success",
			resp:        &ipc.Response{OK: true, Payload: []byte(`{"test":true}`)},
			wantStatus:  http.StatusOK,
			wantOK:      true,
			wantPayload: `{"test":true}`,
		},
		{
			name:       "not found",
			resp:       &ipc.Response{OK: false, Error: engine.ErrPetNotFound.Error()},
			wantStatus: http.StatusNotFound,
			wantError:  engine.ErrPetNotFound.Error(),
		},
		{
			name:       "generic error",
			resp:       &ipc.Response{OK: false, Error: "something went wrong"},
			wantStatus: http.StatusBadRequest,
			wantError:  "something went wrong",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			writeResponse(rr, tt.resp)

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}

			var got ipc.Response
			if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if got.OK != tt.wantOK {
				t.Errorf("expected ok=%v, got %v", tt.wantOK, got.OK)
			}
			if tt.wantError != "" && got.Error != tt.wantError {
				t.Errorf("expected error %q, got %q", tt.wantError, got.Error)
			}
			if tt.wantPayload != "" {
				if string(got.Payload) != tt.wantPayload {
					t.Errorf("expected payload %s, got %s", tt.wantPayload, string(got.Payload))
				}
			}
		})
	}
}

func TestApiHandler(t *testing.T) {
	handler := apiHandler(ipc.NewHandler(newTestService(t, false)))

	tests := []struct {
		name       string
		method     string
		body       string
		wantStatus int
		wantOK     bool
	}{
		{
			name:       "success",
			method:     http.MethodPost,
			body:       `{"command":"get_status"}`,
			wantStatus: http.StatusOK,
			wantOK:     true,
		},
		{
			name:       "unknown command",
			method:     http.MethodPost,
			body:       `{"command":"unknown"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid json",
			method:     http.MethodPost,
			body:       `invalid json`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid method",
			method:     http.MethodGet,
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := invokeHandler(t, handler, tt.method, "/api", tt.body)

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}

			var resp ipc.Response
			if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if tt.wantOK && !resp.OK {
				t.Error("expected resp.OK to be true")
			}
			if rr.Header().Get(requestIDHeader) == "" {
				t.Fatal("expected request id header to be set")
			}
			if resp.RequestID == "" {
				t.Fatal("expected request_id in response")
			}
			if resp.RequestID != rr.Header().Get(requestIDHeader) {
				t.Fatalf("expected request id %q, got %q", rr.Header().Get(requestIDHeader), resp.RequestID)
			}
		})
	}
}

func TestLoadPetHandler(t *testing.T) {
	handler := loadPetHandler(ipc.NewHandler(newTestService(t, false)))

	tests := []struct {
		name       string
		method     string
		body       string
		wantStatus int
		wantOK     bool
		wantTitle  bool
	}{
		{
			name:       "success",
			method:     http.MethodPost,
			body:       `{"pet_path":"../pets/eSheep-modern"}`,
			wantStatus: http.StatusOK,
			wantOK:     true,
			wantTitle:  true,
		},
		{
			name:       "missing pet",
			method:     http.MethodPost,
			body:       `{"pet_path":"non-existent"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid json",
			method:     http.MethodPost,
			body:       `invalid`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid method",
			method:     http.MethodGet,
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := invokeHandler(t, handler, tt.method, "/api/pet/load", tt.body)

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}

			if tt.wantOK {
				var resp ipc.Response
				if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}
				if !resp.OK {
					t.Fatal("expected resp.OK to be true")
				}
				var petInfo ipc.PetInfo
				if err := json.Unmarshal(resp.Payload, &petInfo); err != nil {
					t.Fatalf("failed to decode payload: %v", err)
				}
				if tt.wantTitle && (petInfo.Title == "" || petInfo.PetName == "") {
					t.Errorf("expected non-empty pet info, got %#v", petInfo)
				}
			}
		})
	}
}

func TestHealthHandler(t *testing.T) {
	tests := []struct {
		name        string
		addPet      bool
		wantStatus  string
		wantMessage string
	}{
		{
			name:        "degraded when empty",
			wantStatus:  "degraded",
			wantMessage: "no pets loaded",
		},
		{
			name:       "ok when pet loaded",
			addPet:     true,
			wantStatus: "ok",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := newTestService(t, tt.addPet)

			rr := invokeHandler(t, healthHandler(svc), http.MethodGet, "/api/health", "")

			if rr.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", rr.Code)
			}

			var result map[string]interface{}
			if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if result["request_id"] == "" {
				t.Fatal("expected request_id in health response")
			}
			if result["status"] != tt.wantStatus {
				t.Fatalf("expected status %q, got %v", tt.wantStatus, result["status"])
			}
			if tt.wantMessage != "" && result["message"] != tt.wantMessage {
				t.Fatalf("expected message %q, got %v", tt.wantMessage, result["message"])
			}
		})
	}
}

func TestVersionHandler(t *testing.T) {
	handler := versionHandler("../pets", "settings.json")

	tests := []struct {
		name       string
		method     string
		wantStatus int
		wantOK     bool
	}{
		{
			name:       "get",
			method:     http.MethodGet,
			wantStatus: http.StatusOK,
			wantOK:     true,
		},
		{
			name:       "invalid method",
			method:     http.MethodPost,
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := invokeHandler(t, handler, tt.method, "/api/version", "")

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}
			if tt.wantOK {
				var result map[string]interface{}
				if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}
				if result["request_id"] == "" {
					t.Fatal("expected request_id in version response")
				}
				if result["version"] == nil || result["pid"] == nil {
					t.Fatalf("unexpected response body: %#v", result)
				}
				if result["pets_dir"] != "../pets" || result["settings_path"] != "settings.json" {
					t.Fatalf("unexpected metadata: %#v", result)
				}
			}
		})
	}
}

func TestDescribeHandler(t *testing.T) {
	handler := describeHandler()

	tests := []struct {
		name       string
		method     string
		wantStatus int
		wantOK     bool
	}{
		{
			name:       "get",
			method:     http.MethodGet,
			wantStatus: http.StatusOK,
			wantOK:     true,
		},
		{
			name:       "invalid method",
			method:     http.MethodPost,
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := invokeHandler(t, handler, tt.method, "/api/describe", "")

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}
			if tt.wantOK {
				var result map[string]interface{}
				if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}
				if result["request_id"] == "" {
					t.Fatal("expected request_id in describe response")
				}
				if result["version"] == nil || result["commands"] == nil || result["endpoints"] == nil {
					t.Fatalf("unexpected response body: %#v", result)
				}
			}
		})
	}
}

func TestWriteResponseNil(t *testing.T) {
	rr := httptest.NewRecorder()
	writeResponse(rr, &ipc.Response{OK: true})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	var resp ipc.Response
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.OK {
		t.Fatal("expected resp.OK to be true")
	}
}

func TestApiHandlerInvalidJSON(t *testing.T) {
	rr := invokeHandler(t, apiHandler(nil), http.MethodPost, "/api", "invalid json")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestLLMHealthHandler(t *testing.T) {
	cfg := settings.DefaultConfig()
	cfg.LLM.Provider = "unsupported"
	svc := service.New("../pets", "test-settings.json", cfg)

	rr := invokeHandler(t, llmHealthHandler(svc), http.MethodGet, "/api/llm/health", "")

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["request_id"] == "" {
		t.Fatal("expected request_id in llm health response")
	}
	if result["ok"] != false {
		t.Fatalf("expected ok=false, got %#v", result["ok"])
	}
	if result["status"] != "error" {
		t.Fatalf("expected status error, got %#v", result["status"])
	}
	if !strings.Contains(result["message"].(string), "unsupported provider") {
		t.Fatalf("expected unsupported provider message, got %#v", result["message"])
	}
}

func TestLLMStreamHandler(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		body       string
		wantStatus int
		wantError  string
	}{
		{
			name:       "invalid method",
			method:     http.MethodGet,
			wantStatus: http.StatusMethodNotAllowed,
		},
		{
			name:       "invalid json",
			method:     http.MethodPost,
			body:       `invalid`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "unsupported provider",
			method:     http.MethodPost,
			body:       `{"messages":[{"role":"user","content":"hi"}]}`,
			wantStatus: http.StatusInternalServerError,
			wantError:  "unsupported provider",
		},
	}

	cfg := settings.DefaultConfig()
	cfg.LLM.Provider = "unsupported"
	svc := service.New("../pets", "test-settings.json", cfg)
	handler := llmStreamHandler(svc)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := invokeHandler(t, handler, tt.method, "/api/llm/stream", tt.body)

			if rr.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, rr.Code)
			}
			if tt.wantError != "" {
				body, err := io.ReadAll(rr.Body)
				if err != nil {
					t.Fatalf("read body: %v", err)
				}
				if !strings.Contains(string(body), tt.wantError) {
					t.Fatalf("expected body to contain %q, got %q", tt.wantError, string(body))
				}
			}
		})
	}
}
