package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"clod-pet/backend/internal/buildmode"
	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/service"
	"clod-pet/backend/internal/settings"

	"github.com/goccy/go-json"
	"github.com/rs/cors"
)

const (
	apiVersion      = "1.0.0"
	requestIDHeader = "X-Request-Id"
)

func main() {
	verbose := os.Getenv("VERBOSE") == "true"
	log.Init(verbose)

	port := envOr("PORT", "8080")
	petsDir := envOr("PETS_DIR", "../pets")
	settingsPath := envOr("SETTINGS_PATH", "clod-pet-settings.json")

	cfg := loadSettings(settingsPath)

	svc := service.New(petsDir, settingsPath, cfg)
	handler := ipc.NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(handler))
	mux.HandleFunc("/api/pet/load", loadPetHandler(handler))
	mux.HandleFunc("/api/health", healthHandler(svc))
	mux.HandleFunc("/api/describe", describeHandler())
	mux.HandleFunc("/api/version", versionHandler(petsDir, settingsPath))
	mux.HandleFunc("/api/llm/stream", llmStreamHandler(svc))
	mux.HandleFunc("/api/llm/health", llmHealthHandler(svc))

	fmt.Printf("Backend starting on port %s\n", port)
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           recoveryMiddleware(cors.Default().Handler(mux)),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	log.Info("clod-pet backend starting", "port", port, "pets_dir", petsDir, "build_mode", buildmode.Mode)
	if buildmode.Debug {
		log.Warn("debug backend build tag enabled")
	}
	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(shutdownCh)

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return
		}
		log.Error("http server error", "error", err)
		os.Exit(1)
	case sig := <-shutdownCh:
		log.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Error("http server shutdown error", "error", err)
			os.Exit(1)
		}
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type responseWriter struct {
	http.ResponseWriter
	wroteHeader bool
	status      int
}

func (w *responseWriter) WriteHeader(statusCode int) {
	if w.wroteHeader {
		return
	}

	w.wroteHeader = true
	w.status = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}

	return w.ResponseWriter.Write(b)
}

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		r.Header.Set(requestIDHeader, requestID)
		w.Header().Set(requestIDHeader, requestID)
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if rec := recover(); rec != nil {
				log.Error("recovered panic in http handler",
					"panic", rec,
					"request_id", requestID,
					"method", r.Method,
					"path", r.URL.Path,
					"stack", string(debug.Stack()),
				)
				if !rw.wroteHeader {
					writeErrorWithRequestID(rw, "internal server error", http.StatusInternalServerError, requestID)
				}
			}
		}()

		next.ServeHTTP(rw, r)
	})
}

func loadSettings(path string) *settings.Config {
	cfg, err := settings.Load(path)
	if err != nil {
		log.Warn("could not load settings, using defaults", "path", path, "error", err)
		return settings.DefaultConfig()
	}
	return cfg
}

func apiHandler(h *ipc.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if r.Method != http.MethodPost {
			writeErrorWithRequestID(w, "method not allowed", http.StatusMethodNotAllowed, requestID)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req ipc.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErrorWithRequestID(w, "invalid request: "+err.Error(), http.StatusBadRequest, requestID)
			return
		}

		log.Debug("api command", "command", req.Command, "request_id", requestID)
		resp := h.Handle(&req)
		if resp != nil {
			resp.RequestID = requestID
		}
		writeResponse(w, resp)
	}
}

func loadPetHandler(h *ipc.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if r.Method != http.MethodPost {
			writeErrorWithRequestID(w, "method not allowed", http.StatusMethodNotAllowed, requestID)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var payload struct {
			PetPath string `json:"pet_path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeErrorWithRequestID(w, "invalid request: "+err.Error(), http.StatusBadRequest, requestID)
			return
		}

		log.Debug("load pet request", "request_id", requestID, "pet_path", payload.PetPath)
		petInfo, err := h.Service().LoadPet(payload.PetPath)
		if err != nil {
			log.Warn("load pet failed", "request_id", requestID, "pet_path", payload.PetPath, "error", err)
			writeErrorWithRequestID(w, "load pet failed: "+err.Error(), http.StatusBadRequest, requestID)
			return
		}

		data, err := json.Marshal(petInfo)
		if err != nil {
			log.Error("marshal pet info failed", "request_id", requestID, "error", err)
			writeErrorWithRequestID(w, "internal server error", http.StatusInternalServerError, requestID)
			return
		}
		resp := &ipc.Response{OK: true, Payload: data, RequestID: requestID}
		writeResponse(w, resp)
	}
}

func llmStreamHandler(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if r.Method != http.MethodPost {
			writeErrorWithRequestID(w, "method not allowed", http.StatusMethodNotAllowed, requestID)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var payload json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeErrorWithRequestID(w, "invalid request: "+err.Error(), http.StatusBadRequest, requestID)
			return
		}

		ch, err := svc.LLMStream(r.Context(), payload)
		if err != nil {
			writeErrorWithRequestID(w, "stream failed: "+err.Error(), http.StatusInternalServerError, requestID)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		if !ok {
			writeErrorWithRequestID(w, "streaming not supported", http.StatusInternalServerError, requestID)
			return
		}

		for {
			select {
			case <-r.Context().Done():
				return
			case event, ok := <-ch:
				if !ok {
					return
				}
				if event.Error != nil {
					fmt.Fprintf(w, "event: error\ndata: stream error\n\n")
					flusher.Flush()
					return
				}
				if event.Done {
					fmt.Fprintf(w, "event: done\ndata: {}\n\n")
					flusher.Flush()
					return
				}
				if event.Content != "" {
					// Escape newlines for SSE data format
					content := strings.ReplaceAll(event.Content, "\n", "\\n")
					fmt.Fprintf(w, "data: %s\n\n", content)
					flusher.Flush()
				}
			}
		}
	}
}

func versionHandler(petsDir, settingsPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if r.Method != http.MethodGet {
			writeErrorWithRequestID(w, "method not allowed", http.StatusMethodNotAllowed, requestID)
			return
		}
		writeJSON(w, map[string]interface{}{
			"ok":            true,
			"version":       apiVersion,
			"build":         buildmode.Current(),
			"pid":           os.Getpid(),
			"pets_dir":      petsDir,
			"settings_path": settingsPath,
			"request_id":    requestID,
		})
	}
}

func healthHandler(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		status := svc.Status()
		if status["pet_count"] == 0 {
			writeJSON(w, map[string]interface{}{"ok": true, "status": "degraded", "message": "no pets loaded", "request_id": requestID})
			return
		}
		writeJSON(w, map[string]interface{}{"ok": true, "status": "ok", "request_id": requestID})
	}
}

func llmHealthHandler(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if err := svc.LLMHealth(r.Context()); err != nil {
			writeJSON(w, map[string]interface{}{"ok": false, "status": "error", "message": err.Error(), "request_id": requestID})
			return
		}
		writeJSON(w, map[string]interface{}{"ok": true, "status": "ok", "request_id": requestID})
	}
}

func describeHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := requestIDFromRequest(r)
		w.Header().Set(requestIDHeader, requestID)

		if r.Method != http.MethodGet {
			writeErrorWithRequestID(w, "method not allowed", http.StatusMethodNotAllowed, requestID)
			return
		}
		description := map[string]interface{}{
			"version": apiVersion,
			"build":   buildmode.Current(),
			"commands": []string{
				"add_pet", "remove_pet", "drag_pet", "drop_pet",
				"step_pet", "step_pets", "border_pet", "get_status", "get_pet",
				"set_volume", "set_scale", "get_settings", "set_settings",
				"list_pets", "list_active", "set_position", "llm_chat",
			},
			"endpoints": []map[string]interface{}{
				{"path": "/api", "method": "POST", "description": "Generic command endpoint"},
				{"path": "/api/pet/load", "method": "POST", "description": "Load pet definition"},
				{"path": "/api/health", "method": "GET", "description": "Health check"},
				{"path": "/api/describe", "method": "GET", "description": "API description"},
				{"path": "/api/version", "method": "GET", "description": "Backend version information"},
				{"path": "/api/llm/stream", "method": "POST", "description": "LLM streaming chat"},
				{"path": "/api/llm/health", "method": "GET", "description": "LLM provider health check"},
			},
			"request_id": requestID,
		}
		writeJSON(w, description)
	}
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Error("write json failed", "error", err)
	}
}

func writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": msg}); err != nil {
		log.Error("write error response failed", "error", err)
	}
}

func writeResponse(w http.ResponseWriter, resp *ipc.Response) {
	if resp == nil {
		writeErrorWithRequestID(w, "internal server error", http.StatusInternalServerError, "")
		return
	}
	if resp.RequestID != "" {
		w.Header().Set(requestIDHeader, resp.RequestID)
	}
	if !resp.OK {
		code := http.StatusBadRequest
		if resp.Error == engine.ErrPetNotFound.Error() {
			code = http.StatusNotFound
		}
		writeErrorWithRequestID(w, resp.Error, code, resp.RequestID)
		return
	}
	writeJSON(w, resp)
}

func writeErrorWithRequestID(w http.ResponseWriter, msg string, code int, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	if requestID != "" {
		w.Header().Set(requestIDHeader, requestID)
	}
	w.WriteHeader(code)
	body := map[string]interface{}{"ok": false, "error": msg}
	if requestID != "" {
		body["request_id"] = requestID
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Error("write error response failed", "error", err)
	}
}

func requestIDFromRequest(r *http.Request) string {
	if r != nil {
		if requestID := strings.TrimSpace(r.Header.Get(requestIDHeader)); requestID != "" {
			return requestID
		}
	}
	return newRequestID()
}

func newRequestID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err == nil {
		return hex.EncodeToString(buf)
	}
	return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
}
