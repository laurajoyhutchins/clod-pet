package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
	log "clod-pet/backend/internal/logutil"
	"clod-pet/backend/internal/pet"
	"clod-pet/backend/internal/settings"
	"clod-pet/backend/internal/sound"
)

type Service struct {
	petsDir      string
	settings     *settings.Config
	settingsPath string
	petStore     map[string]*pet.Pet
	engines      map[string]*engine.Engine
	petPaths     map[string]string
	mu           sync.RWMutex
	soundPlayer  *sound.Player
	idCounter    int
}

func New(petsDir, settingsPath string, cfg *settings.Config, soundPlayer *sound.Player) *Service {
	svc := &Service{
		petsDir:      petsDir,
		settings:     cfg,
		settingsPath: settingsPath,
		petStore:     make(map[string]*pet.Pet),
		engines:      make(map[string]*engine.Engine),
		petPaths:     make(map[string]string),
		soundPlayer:  soundPlayer,
	}

	return svc
}

func (s *Service) PetsDir() string {
	return s.petsDir
}

func (s *Service) LoadPet(petPath string) (*ipc.PetInfo, error) {
	cleanPath := filepath.Clean(petPath)
	p, err := pet.LoadPet(cleanPath)
	if err != nil {
		return nil, err
	}

	frameW := 0
	frameH := 0
	if len(p.Animations) > 0 {
		for _, anim := range p.Animations {
			if len(anim.Frames) > 0 {
				frameW = p.Image.TilesX
				frameH = p.Image.TilesY
				break
			}
		}
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
		FrameW:    frameW,
		FrameH:    frameH,
		Spawns:    spawns,
		AnimCount: len(p.Animations),
	}, nil
}

func (s *Service) AddPet(petPath string, spawnID int) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanPath := filepath.Clean(petPath)
	petDef, exists := s.petStore[cleanPath]
	if !exists {
		var err error
		petDef, err = pet.LoadPet(cleanPath)
		if err != nil {
			return "", err
		}
		s.petStore[cleanPath] = petDef
	}

	e := engine.NewEngine(petDef)
	if err := e.Start(spawnID); err != nil {
		return "", err
	}

	s.idCounter++
	petID := fmt.Sprintf("pet_%d", s.idCounter)
	s.engines[petID] = e
	s.petPaths[petID] = cleanPath

	s.playSoundForPet(petDef, e.CurrentAnim())
	return petID, nil
}

func (s *Service) RemovePet(petID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.engines, petID)
	delete(s.petPaths, petID)
}

func (s *Service) StepPet(petID string, borderCtx engine.BorderContext, gravity bool) (*ipc.PetState, error) {
	s.mu.RLock()
	e, ok := s.engines[petID]
	s.mu.RUnlock()

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
		oldAnim := e.CurrentAnim()
		e.TransitionTo(step.NextAnimID)
		if oldAnim != step.NextAnimID {
			s.mu.RLock()
			petDef := e.PetDef()
			s.mu.RUnlock()
			if petDef != nil {
				s.playSoundForPet(petDef, step.NextAnimID)
			}
		}
	}

	return &ipc.PetState{
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

func (s *Service) DragPet(petID string, x, y float64) error {
	s.mu.RLock()
	e, ok := s.engines[petID]
	s.mu.RUnlock()
	if !ok {
		return engine.ErrPetNotFound
	}

	e.SetDrag()
	e.SetPosition(x, y)
	return nil
}

func (s *Service) DropPet(petID string) error {
	s.mu.RLock()
	e, ok := s.engines[petID]
	s.mu.RUnlock()
	if !ok {
		return engine.ErrPetNotFound
	}

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

func (s *Service) UpdateVolume(volume float64) error {
	if s.soundPlayer != nil {
		s.soundPlayer.UpdateVolume(volume)
	}
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
		"Volume":             s.settings.Volume,
		"WinForeGround":      s.settings.WinForeGround,
		"StealTaskbarFocus":  s.settings.StealTaskbarFocus,
		"AutostartPets":      s.settings.AutostartPets,
		"Scale":              s.settings.Scale,
		"MultiScreenEnabled": s.settings.MultiScreenEnabled,
		"CurrentPet":         s.settings.CurrentPet,
	}
}

func (s *Service) SetSettings(settings map[string]interface{}) error {
	if v, ok := settings["Volume"]; ok {
		if vol, ok := v.(float64); ok {
			s.settings.Volume = vol
			if s.soundPlayer != nil {
				s.soundPlayer.UpdateVolume(vol)
			}
		}
	}
	if v, ok := settings["Scale"]; ok {
		if scale, ok := v.(float64); ok {
			s.settings.Scale = scale
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

	data, _ := json.Marshal(petInfo)
	return data, nil
}

func (s *Service) playSoundForPet(petDef *pet.Pet, animID int) {
	if s.soundPlayer == nil {
		return
	}

	sounds, ok := petDef.Sounds[animID]
	if !ok || len(sounds) == 0 {
		return
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
		return
	}

	if err := s.soundPlayer.PlayRawPCM(soundEntry.Data); err != nil {
		log.Error("sound play failed", "error", err)
	}
}
