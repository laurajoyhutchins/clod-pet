package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/expression"
	"clod-pet/backend/internal/ipc"
	"clod-pet/backend/internal/pet"
	"clod-pet/backend/internal/settings"

	"github.com/rs/cors"
)

var (
	handler  *ipc.Handler
	cfg      *settings.Config
	petsDir  string
	petStore = make(map[string]*pet.Pet)
	engines  = make(map[string]*engine.Engine)
	enginesMu sync.RWMutex
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	petsDir = os.Getenv("PETS_DIR")
	if petsDir == "" {
		petsDir = "../pets"
	}

	var err error
	cfg, err = settings.Load("clod-pet-settings.json")
	if err != nil {
		log.Printf("warning: could not load settings: %v", err)
		cfg = settings.DefaultConfig()
	}

	handler = ipc.NewHandler()

	mux := http.NewServeMux()

	mux.HandleFunc("/api", apiHandler)
	mux.HandleFunc("/api/pet/load", loadPetHandler)
	mux.HandleFunc("/api/health", healthHandler)

	c := cors.Default()
	httpHandler := c.Handler(mux)

	log.Printf("clod-pet backend starting on :%s", port)
	log.Printf("pets dir: %s", petsDir)
	if err := http.ListenAndServe(":"+port, httpHandler); err != nil {
		log.Fatal(err)
	}
}

func apiHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ipc.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request: "+err.Error())
		return
	}

	// Override handler for add_pet to include pet loading
	if req.Command == ipc.CmdAddPet {
		resp := handleAddPet(req.Payload)
		writeJSON(w, resp)
		return
	}

	// Override step_pet to include border detection context
	if req.Command == ipc.CmdStepPet {
		resp := handleStepPet(req.Payload)
		writeJSON(w, resp)
		return
	}

	resp := handler.Handle(&req)
	writeJSON(w, resp)
}

func handleAddPet(payload json.RawMessage) *ipc.Response {
	var p ipc.AddPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return &ipc.Response{OK: false, Error: "invalid payload: " + err.Error()}
	}

	enginesMu.Lock()
	defer enginesMu.Unlock()

	petPath := filepath.Clean(p.PetPath)
	petDef, exists := petStore[petPath]
	if !exists {
		var err error
		petDef, err = pet.LoadPet(petPath)
		if err != nil {
			return &ipc.Response{OK: false, Error: "load pet: " + err.Error()}
		}
		petStore[petPath] = petDef
	}

	petID := p.PetPath

	e := engine.NewEngine(petDef)
	if err := e.Start(p.SpawnID); err != nil {
		return &ipc.Response{OK: false, Error: "start: " + err.Error()}
	}
	engines[petID] = e

	data, _ := json.Marshal(map[string]string{"pet_id": petID})
	return &ipc.Response{OK: true, Payload: data}
}

func handleStepPet(payload json.RawMessage) *ipc.Response {
	var p ipc.StepPetPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return &ipc.Response{OK: false, Error: "invalid payload: " + err.Error()}
	}

	enginesMu.RLock()
	e, ok := engines[p.PetID]
	enginesMu.RUnlock()

	if !ok {
		return &ipc.Response{OK: false, Error: "pet not found: " + p.PetID}
	}

	step, err := e.Step(p.BorderCtx)
	if err != nil {
		return &ipc.Response{OK: false, Error: "step: " + err.Error()}
	}
	if step == nil {
		return &ipc.Response{OK: true}
	}

	if step.NextAnimID > 0 {
		e.TransitionTo(step.NextAnimID)
	}

	data, _ := json.Marshal(ipc.PetState{
		PetID:      p.PetID,
		FrameIndex: step.FrameIndex,
		X:          step.X,
		Y:          step.Y,
		OffsetY:    step.OffsetY,
		Opacity:    step.Opacity,
		IntervalMs: step.IntervalMs,
		FlipH:      step.ShouldFlip,
		NextAnimID: step.NextAnimID,
	})
	return &ipc.Response{OK: true, Payload: data}
}

func loadPetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		PetPath string `json:"pet_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, "invalid request: "+err.Error())
		return
	}

	p, err := pet.LoadPet(filepath.Clean(payload.PetPath))
	if err != nil {
		writeError(w, "load pet failed: "+err.Error())
		return
	}

	type spawnInfo struct {
		ID          int `json:"id"`
		Probability int `json:"probability"`
	}

	type petResponse struct {
		Title     string      `json:"title"`
		PetName   string      `json:"pet_name"`
		TilesX    int         `json:"tiles_x"`
		TilesY    int         `json:"tiles_y"`
		PngBase64 string      `json:"png_base64"`
		Spawns    []spawnInfo `json:"spawns"`
		AnimCount int         `json:"anim_count"`
	}

	spawns := make([]spawnInfo, len(p.Spawns))
	for i, s := range p.Spawns {
		spawns[i] = spawnInfo{ID: s.ID, Probability: s.Probability}
	}

	resp := petResponse{
		Title:     p.Header.Title,
		PetName:   p.Header.PetName,
		TilesX:    p.Image.TilesX,
		TilesY:    p.Image.TilesY,
		PngBase64: base64.StdEncoding.EncodeToString(p.Image.PngData),
		AnimCount: len(p.Animations),
		Spawns:    spawns,
	}

	writeJSON(w, map[string]interface{}{
		"ok":  true,
		"pet": resp,
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":    false,
		"error": msg,
	})
}

func init() {
	_ = expression.NewEnv()
}
