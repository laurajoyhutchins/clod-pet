package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"clod-pet/backend/internal/ipc"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/service"
	"clod-pet/backend/internal/settings"
	"clod-pet/backend/internal/sound"

	"github.com/rs/cors"
)

func main() {
	verbose := os.Getenv("VERBOSE") == "true"
	log.Init(verbose)

	port := envOr("PORT", "8080")
	petsDir := envOr("PETS_DIR", "../pets")
	settingsPath := envOr("SETTINGS_PATH", "clod-pet-settings.json")

	cfg := loadSettings(settingsPath)
	soundPlayer := newSoundPlayer(cfg.Volume)

	svc := service.New(petsDir, settingsPath, cfg, soundPlayer)
	handler := ipc.NewHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api", apiHandler(handler))
	mux.HandleFunc("/api/pet/load", loadPetHandler(handler))
	mux.HandleFunc("/api/health", healthHandler(svc))
	mux.HandleFunc("/api/describe", describeHandler())
	mux.HandleFunc("/api/version", versionHandler(petsDir, settingsPath))

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           cors.Default().Handler(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	log.Info("clod-pet backend starting", "port", port, "pets_dir", petsDir)
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

func loadSettings(path string) *settings.Config {
	cfg, err := settings.Load(path)
	if err != nil {
		log.Warn("could not load settings, using defaults", "path", path, "error", err)
		return settings.DefaultConfig()
	}
	return cfg
}

func newSoundPlayer(volume float64) *sound.Player {
	player, err := sound.NewPlayer(44100, volume)
	if err != nil {
		log.Warn("could not initialize sound", "error", err)
		return nil
	}
	return player
}

func apiHandler(h *ipc.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ipc.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, "invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		log.Debug("api command", "command", req.Command)
		resp := h.Handle(&req)
		writeResponse(w, resp)
	}
}

func loadPetHandler(h *ipc.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload struct {
			PetPath string `json:"pet_path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeError(w, "invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		log.Debug("load pet request", "pet_path", payload.PetPath)
		petInfo, err := h.Service().LoadPet(payload.PetPath)
		if err != nil {
			log.Warn("load pet failed", "pet_path", payload.PetPath, "error", err)
			writeError(w, "load pet failed: "+err.Error(), http.StatusBadRequest)
			return
		}

		data, err := json.Marshal(petInfo)
		if err != nil {
			log.Error("marshal pet info failed", "error", err)
			writeError(w, "internal server error", http.StatusInternalServerError)
			return
		}
		resp := &ipc.Response{OK: true, Payload: data}
		writeResponse(w, resp)
	}
}

func llmStreamHandler(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeError(w, "invalid request: "+err.Error(), http.StatusBadRequest)
			return
		}

		ch, err := svc.LLMStream(r.Context(), payload)
		if err != nil {
			writeError(w, "stream failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		if !ok {
			writeError(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		for event := range ch {
			if event.Error != nil {
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", event.Error.Error())
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

func versionHandler(petsDir, settingsPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, map[string]interface{}{
			"ok":            true,
			"version":       "1.0.0",
			"pid":           os.Getpid(),
			"pets_dir":      petsDir,
			"settings_path": settingsPath,
		})
	}
}

func healthHandler(svc *service.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := svc.Status()
		if status["pet_count"] == 0 {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]interface{}{"ok": true, "status": "degraded", "message": "no pets loaded"})
			return
		}
		writeJSON(w, map[string]interface{}{"ok": true, "status": "ok"})
	}
}

func describeHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		description := map[string]interface{}{
			"version": "1.0.0",
			"commands": []string{
				"add_pet", "remove_pet", "drag_pet", "drop_pet",
				"step_pet", "border_pet", "get_status", "get_pet",
				"set_volume", "set_scale", "get_settings", "set_settings",
				"list_pets", "list_active", "llm_chat",
			},
			"endpoints": []map[string]interface{}{
				{"path": "/api", "method": "POST", "description": "Generic command endpoint"},
				{"path": "/api/pet/load", "method": "POST", "description": "Load pet definition"},
				{"path": "/api/health", "method": "GET", "description": "Health check"},
				{"path": "/api/describe", "method": "GET", "description": "API description"},
				{"path": "/api/llm/stream", "method": "POST", "description": "LLM streaming chat"},
			},
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
	if !resp.OK {
		code := http.StatusBadRequest
		if resp.Error != "" && strings.Contains(resp.Error, "not found") {
			code = http.StatusNotFound
		}
		writeError(w, resp.Error, code)
		return
	}
	writeJSON(w, resp)
}
