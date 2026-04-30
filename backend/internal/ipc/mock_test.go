package ipc

import (
	"encoding/json"
	"sync"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/pet"
)

// testPetDef returns a standard test pet definition
func testPetDef() *pet.Pet {
	return &pet.Pet{
		Header: pet.Header{Title: "Test", PetName: "test"},
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
	}
}

// commonMockService is a shared mock implementation for IPC testing
type commonMockService struct {
	mu      sync.Mutex
	engines map[string]*engine.Engine
	petDef  *pet.Pet
	petName string
	title   string
}

func newCommonMockService(petName, title string) *commonMockService {
	return &commonMockService{
		engines: make(map[string]*engine.Engine),
		petDef:  testPetDef(),
		petName: petName,
		title:   title,
	}
}

func (m *commonMockService) AddPet(petPath string, spawnID int) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e := engine.NewEngine(m.petDef)
	e.Start(spawnID)
	m.engines[petPath] = e
	return petPath, nil
}

func (m *commonMockService) RemovePet(petID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.engines, petID)
}

func (m *commonMockService) StepPet(petID string, borderCtx engine.BorderContext, gravity bool) (*PetState, error) {
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

func (m *commonMockService) DragPet(petID string, x, y float64) error {
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

func (m *commonMockService) DropPet(petID string) error {
	m.mu.Lock()
	e, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	e.SetFall()
	return nil
}

func (m *commonMockService) ValidatePetExists(petID string) error {
	m.mu.Lock()
	_, ok := m.engines[petID]
	m.mu.Unlock()
	if !ok {
		return engine.ErrPetNotFound
	}
	return nil
}

func (m *commonMockService) Status() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return map[string]int{"pet_count": len(m.engines)}
}

func (m *commonMockService) UpdateVolume(volume float64) error {
	return nil
}

func (m *commonMockService) UpdateScale(scale float64) error {
	return nil
}

func (m *commonMockService) Settings() map[string]interface{} {
	return map[string]interface{}{"Volume": 0.3, "Scale": 1.0, "CurrentPet": m.petName}
}

func (m *commonMockService) SetSettings(settings map[string]interface{}) error {
	return nil
}

func (m *commonMockService) ListPets() ([]string, error) {
	return []string{m.petName}, nil
}

func (m *commonMockService) ListActive() ([]map[string]interface{}, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	active := make([]map[string]interface{}, 0, len(m.engines))
	for petID := range m.engines {
		active = append(active, map[string]interface{}{"pet_id": petID})
	}
	return active, nil
}

func (m *commonMockService) Pet(petID string) (json.RawMessage, error) {
	return json.Marshal(map[string]string{"pet_id": petID})
}

func (m *commonMockService) PetsDir() string {
	return "../pets"
}

func (m *commonMockService) LoadPet(petPath string) (*PetInfo, error) {
	return &PetInfo{
		Title:     m.title,
		PetName:   m.petName,
		TilesX:    4,
		TilesY:    4,
		AnimCount: 1,
	}, nil
}
