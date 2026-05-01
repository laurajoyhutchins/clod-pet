package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
	"clod-pet/backend/internal/llm"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/pet"
	"clod-pet/backend/internal/settings"
	"clod-pet/backend/internal/sound"
)

type Service struct {
	petsDir       string
	settings      *settings.Config
	settingsPath  string
	petStore      map[string]*pet.Pet
	engines       map[string]*engine.Engine
	petLocks      map[string]*sync.Mutex
	petPaths      map[string]string
	pendingSounds map[string]*ipc.SoundPayload
	mu            sync.RWMutex
	idCounter     int
}

func New(petsDir, settingsPath string, cfg *settings.Config) *Service {
	svc := &Service{
		petsDir:       petsDir,
		settings:      cfg,
		settingsPath:  settingsPath,
		petStore:      make(map[string]*pet.Pet),
		engines:       make(map[string]*engine.Engine),
		petLocks:      make(map[string]*sync.Mutex),
		petPaths:      make(map[string]string),
		pendingSounds: make(map[string]*ipc.SoundPayload),
	}

	return svc
}

func (s *Service) PetsDir() string {
	return s.petsDir
}

func (s *Service) LLMChat(payload json.RawMessage) (*ipc.Response, error) {
	client, err := llm.NewClient(&s.settings.LLM)
	if err != nil {
		return nil, fmt.Errorf("create llm client: %w", err)
	}
	defer client.Close()

	var req llm.ChatRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, fmt.Errorf("unmarshal chat request: %w", err)
	}

	resp, err := llm.WithRetry(context.Background(), 3, 1*time.Second, func() (*llm.ChatResponse, error) {
		return client.Chat(context.Background(), &req)
	})
	if err != nil {
		return nil, fmt.Errorf("llm chat: %w", err)
	}

	data, err := json.Marshal(resp)
	if err != nil {
		return nil, fmt.Errorf("marshal chat response: %w", err)
	}

	return &ipc.Response{OK: true, Payload: data}, nil
}

func (s *Service) LLMStream(ctx context.Context, payload json.RawMessage) (<-chan llm.StreamEvent, error) {
	client, err := llm.NewClient(&s.settings.LLM)
	if err != nil {
		return nil, fmt.Errorf("create llm client: %w", err)
	}

	var req llm.ChatRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("unmarshal chat request: %w", err)
	}

	src, err := client.StreamChat(ctx, &req)
	if err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("llm stream chat: %w", err)
	}

	out := make(chan llm.StreamEvent)
	go func() {
		defer close(out)
		defer client.Close()

		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-src:
				if !ok {
					return
				}

				select {
				case out <- event:
				case <-ctx.Done():
					return
				}

				if event.Done || event.Error != nil {
					return
				}
			}
		}
	}()

	return out, nil
}

func (s *Service) LLMHealth(ctx context.Context) error {
	client, err := llm.NewClient(&s.settings.LLM)
	if err != nil {
		return fmt.Errorf("create llm client: %w", err)
	}
	defer client.Close()

	return client.Health(ctx)
}

func (s *Service) LoadPet(petPath string) (*ipc.PetInfo, error) {
	cleanPath, err := s.cleanPetPath(petPath)
	if err != nil {
		return nil, err
	}
	p, err := pet.LoadPet(cleanPath)
	if err != nil {
		return nil, err
	}

	spawns := make([]ipc.SpawnInfo, len(p.Spawns))
	for i, sp := range p.Spawns {
		spawns[i] = ipc.SpawnInfo{ID: sp.ID, Probability: sp.Probability}
	}

	return &ipc.PetInfo{
		Title:     p.Header.Title,
		PetName:   p.Header.PetName,
		TilesX:    p.Image.TilesX,
		TilesY:    p.Image.TilesY,
		PngBase64: base64.StdEncoding.EncodeToString(p.Image.PngData),
		FrameW:    p.FrameW,
		FrameH:    p.FrameH,
		Spawns:    spawns,
		AnimCount: len(p.Animations),
	}, nil
}

func (s *Service) AddPet(petPath string, spawnID int, world ...engine.WorldContext) (*ipc.PetState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanPath, err := s.cleanPetPath(petPath)
	if err != nil {
		return nil, err
	}
	petDef, exists := s.petStore[cleanPath]
	if !exists {
		petDef, err = pet.LoadPet(cleanPath)
		if err != nil {
			return nil, err
		}
		s.petStore[cleanPath] = petDef
	}

	e := engine.NewEngine(petDef)
	if err := e.Start(spawnID, world...); err != nil {
		return nil, err
	}

	s.idCounter++
	petID := fmt.Sprintf("pet_%d", s.idCounter)
	s.engines[petID] = e
	s.petLocks[petID] = &sync.Mutex{}
	s.petPaths[petID] = cleanPath

	if soundPayload := s.soundForPet(petDef, e.CurrentAnim()); soundPayload != nil {
		s.pendingSounds[petID] = soundPayload
	}

	x, y := e.Position()
	animID := e.CurrentAnim()
	animName := ""
	if petDef != nil {
		if anim, ok := petDef.Animations[animID]; ok {
			animName = anim.Name
		}
	}
	return &ipc.PetState{
		PetID:           petID,
		FrameIndex:      0,
		X:               x,
		Y:               y,
		OffsetY:         0,
		Opacity:         1,
		IntervalMs:      0,
		FlipH:           false,
		CurrentAnimID:   animID,
		CurrentAnimName: animName,
		NextAnimID:      0,
	}, nil
}

func (s *Service) cleanPetPath(petPath string) (string, error) {
	if strings.TrimSpace(petPath) == "" {
		return "", fmt.Errorf("pet path is required")
	}

	base, err := filepath.Abs(filepath.Clean(s.petsDir))
	if err != nil {
		return "", fmt.Errorf("resolve pets dir: %w", err)
	}

	candidate := filepath.Clean(petPath)
	if !filepath.IsAbs(candidate) {
		absCandidate, err := filepath.Abs(candidate)
		if err != nil {
			return "", fmt.Errorf("resolve pet path: %w", err)
		}
		if !pathWithin(absCandidate, base) {
			candidate = filepath.Join(base, candidate)
		}
	}

	candidate, err = filepath.Abs(candidate)
	if err != nil {
		return "", fmt.Errorf("resolve pet path: %w", err)
	}
	if !pathWithin(candidate, base) {
		return "", fmt.Errorf("pet path must be inside pets directory")
	}
	return candidate, nil
}

func pathWithin(path, base string) bool {
	rel, err := filepath.Rel(base, path)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel))
}

func (s *Service) RemovePet(petID string) {
	s.mu.RLock()
	lock := s.petLocks[petID]
	s.mu.RUnlock()
	if lock != nil {
		lock.Lock()
		defer lock.Unlock()
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.engines, petID)
	delete(s.petLocks, petID)
	delete(s.petPaths, petID)
	delete(s.pendingSounds, petID)
}

func (s *Service) StepPet(petID string, world engine.WorldContext) (*ipc.PetState, error) {
	e, unlock, err := s.lockPet(petID)
	if err != nil {
		return nil, err
	}
	defer unlock.Unlock()

	step, err := e.Step(world)
	if err != nil {
		if errors.Is(err, engine.ErrStepIdle) || errors.Is(err, engine.ErrStepAnimationMissing) || errors.Is(err, engine.ErrStepAnimationEmpty) {
			return nil, nil
		}
		return nil, err
	}
	if step == nil {
		return nil, nil
	}

	var soundPayload *ipc.SoundPayload
	if step.NextAnimID > 0 {
		oldAnim := e.CurrentAnim()
		e.TransitionTo(step.NextAnimID)
		if oldAnim != step.NextAnimID {
			s.mu.RLock()
			petDef := e.PetDef()
			s.mu.RUnlock()
			if petDef != nil {
				soundPayload = s.soundForPet(petDef, step.NextAnimID)
			}
		}
	}
	if soundPayload == nil {
		s.mu.Lock()
		soundPayload = s.pendingSounds[petID]
		delete(s.pendingSounds, petID)
		s.mu.Unlock()
	}

	currentAnimID := e.CurrentAnim()
	currentAnimName := ""
	petDef := e.PetDef()
	if petDef != nil {
		if anim, ok := petDef.Animations[currentAnimID]; ok {
			currentAnimName = anim.Name
		}
	}

	return &ipc.PetState{
		PetID:           petID,
		FrameIndex:      step.FrameIndex,
		X:               step.X,
		Y:               step.Y,
		OffsetY:         step.OffsetY,
		Opacity:         step.Opacity,
		IntervalMs:      step.IntervalMs,
		FlipH:           step.ShouldFlip,
		CurrentAnimID:   currentAnimID,
		CurrentAnimName: currentAnimName,
		NextAnimID:      step.NextAnimID,
		Sound:           soundPayload,
	}, nil
}

func (s *Service) SetPosition(petID string, x, y float64) error {
	e, unlock, err := s.lockPet(petID)
	if err != nil {
		return err
	}
	defer unlock.Unlock()

	e.SetPosition(x, y)
	return nil
}

func (s *Service) DragPet(petID string, x, y float64) error {
	e, unlock, err := s.lockPet(petID)
	if err != nil {
		return err
	}
	defer unlock.Unlock()

	e.SetDrag()
	e.SetPosition(x, y)
	return nil
}

func (s *Service) DropPet(petID string) error {
	e, unlock, err := s.lockPet(petID)
	if err != nil {
		return err
	}
	defer unlock.Unlock()

	e.SetFall()
	return nil
}

func (s *Service) ValidatePetExists(petID string) error {
	s.mu.RLock()
	_, ok := s.engines[petID]
	s.mu.RUnlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	return nil
}

func (s *Service) Status() map[string]int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return map[string]int{"pet_count": len(s.engines)}
}

func (s *Service) lockPet(petID string) (*engine.Engine, *sync.Mutex, error) {
	s.mu.RLock()
	e, ok := s.engines[petID]
	lock := s.petLocks[petID]
	s.mu.RUnlock()
	if !ok || lock == nil {
		return nil, nil, engine.ErrPetNotFound
	}

	lock.Lock()

	s.mu.RLock()
	currentEngine, ok := s.engines[petID]
	currentLock := s.petLocks[petID]
	s.mu.RUnlock()
	if !ok || currentEngine != e || currentLock != lock {
		lock.Unlock()
		return nil, nil, engine.ErrPetNotFound
	}

	return e, lock, nil
}

func (s *Service) UpdateVolume(volume float64) error {
	s.settings.Volume = volume
	if err := s.settings.Save(s.settingsPath); err != nil {
		log.Warn("could not save settings", "path", s.settingsPath, "error", err)
	}
	return nil
}

func (s *Service) UpdateScale(scale float64) error {
	s.settings.Scale = scale
	if err := s.settings.Save(s.settingsPath); err != nil {
		log.Warn("could not save settings", "path", s.settingsPath, "error", err)
	}
	return nil
}

func (s *Service) Settings() map[string]interface{} {
	return map[string]interface{}{
		"Volume":               s.settings.Volume,
		"WinForeGround":        s.settings.WinForeGround,
		"StealTaskbarFocus":    s.settings.StealTaskbarFocus,
		"AutostartPets":        s.settings.AutostartPets,
		"Scale":                s.settings.Scale,
		"ShowAdvancedSettings": s.settings.ShowAdvancedSettings,
		"ShowDiagnostics":      s.settings.ShowDiagnostics,
		"MultiScreenEnabled":   s.settings.MultiScreenEnabled,
		"CurrentPet":           s.settings.CurrentPet,
	}
}

func (s *Service) SetSettings(settings map[string]interface{}) error {
	if v, ok := settings["Volume"]; ok {
		if vol, ok := v.(float64); ok {
			s.settings.Volume = vol
		}
	}
	if v, ok := settings["Scale"]; ok {
		if scale, ok := v.(float64); ok {
			s.settings.Scale = scale
		}
	}
	if v, ok := settings["ShowAdvancedSettings"]; ok {
		if show, ok := v.(bool); ok {
			s.settings.ShowAdvancedSettings = show
		}
	}
	if v, ok := settings["ShowDiagnostics"]; ok {
		if show, ok := v.(bool); ok {
			s.settings.ShowDiagnostics = show
		}
	}
	if v, ok := settings["WinForeGround"]; ok {
		if fg, ok := v.(bool); ok {
			s.settings.WinForeGround = fg
		}
	}
	if v, ok := settings["StealTaskbarFocus"]; ok {
		if st, ok := v.(bool); ok {
			s.settings.StealTaskbarFocus = st
		}
	}
	if v, ok := settings["AutostartPets"]; ok {
		if ap, ok := v.(float64); ok {
			s.settings.AutostartPets = int(ap)
		}
	}
	if v, ok := settings["MultiScreenEnabled"]; ok {
		if ms, ok := v.(bool); ok {
			s.settings.MultiScreenEnabled = ms
		}
	}
	if v, ok := settings["CurrentPet"]; ok {
		if pet, ok := v.(string); ok {
			s.settings.CurrentPet = pet
		}
	}
	return s.settings.Save(s.settingsPath)
}

func (s *Service) ListPets() ([]string, error) {
	entries, err := os.ReadDir(s.petsDir)
	if err != nil {
		return nil, err
	}
	var pets []string
	for _, entry := range entries {
		if entry.IsDir() {
			pets = append(pets, entry.Name())
		}
	}
	return pets, nil
}

func (s *Service) ListActive() ([]map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var active []map[string]interface{}
	for petID, petPath := range s.petPaths {
		info := map[string]interface{}{
			"pet_id":   petID,
			"pet_path": petPath,
		}
		if def, ok := s.petStore[petPath]; ok {
			info["title"] = def.Header.Title
			info["pet_name"] = def.Header.PetName
		}
		active = append(active, info)
	}
	return active, nil
}

func (s *Service) Pet(petID string) (json.RawMessage, error) {
	s.mu.RLock()
	e, ok := s.engines[petID]
	s.mu.RUnlock()
	if !ok {
		return nil, engine.ErrPetNotFound
	}

	petDef := e.PetDef()
	if petDef == nil {
		return nil, fmt.Errorf("pet definition not found")
	}

	spawns := make([]ipc.SpawnInfo, len(petDef.Spawns))
	for i, sp := range petDef.Spawns {
		spawns[i] = ipc.SpawnInfo{ID: sp.ID, Probability: sp.Probability}
	}

	petInfo := &ipc.PetInfo{
		Title:     petDef.Header.Title,
		PetName:   petDef.Header.PetName,
		TilesX:    petDef.Image.TilesX,
		TilesY:    petDef.Image.TilesY,
		AnimCount: len(petDef.Animations),
		Spawns:    spawns,
	}

	data, err := json.Marshal(petInfo)
	if err != nil {
		return nil, fmt.Errorf("marshal pet info: %w", err)
	}
	return data, nil
}

func (s *Service) soundForPet(petDef *pet.Pet, animID int) *ipc.SoundPayload {
	sounds, ok := petDef.Sounds[animID]
	if !ok || len(sounds) == 0 {
		return nil
	}

	var soundEntries []sound.SoundEntry
	for _, s := range sounds {
		soundEntries = append(soundEntries, sound.SoundEntry{
			AnimationID: s.AnimationID,
			Probability: s.Probability,
			Loop:        s.Loop,
			Data:        s.Data,
		})
	}

	soundEntry := sound.PickSound(soundEntries)
	if soundEntry == nil {
		return nil
	}
	payload := sound.PayloadFor(soundEntry)
	if payload == nil {
		return nil
	}
	return &ipc.SoundPayload{
		MIMEType:   payload.MIMEType,
		DataBase64: base64.StdEncoding.EncodeToString(payload.Data),
		Loop:       payload.Loop,
	}
}
