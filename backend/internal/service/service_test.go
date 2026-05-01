package service

import (
	"path/filepath"
	"sync"
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/settings"
)

func TestCleanPetPathAllowsPathsInsidePetsDir(t *testing.T) {
	petsDir := t.TempDir()
	svc := New(petsDir, "", settings.DefaultConfig())

	got, err := svc.cleanPetPath("sheep")
	if err != nil {
		t.Fatalf("cleanPetPath returned error: %v", err)
	}

	want := filepath.Join(petsDir, "sheep")
	if got != want {
		t.Errorf("cleanPetPath = %q, want %q", got, want)
	}
}

func TestCleanPetPathRejectsTraversalOutsidePetsDir(t *testing.T) {
	petsDir := t.TempDir()
	svc := New(petsDir, "", settings.DefaultConfig())

	if _, err := svc.cleanPetPath(filepath.Join("..", "outside")); err == nil {
		t.Fatal("cleanPetPath traversal expected error, got nil")
	}
}

func TestCleanPetPathRejectsAbsolutePathOutsidePetsDir(t *testing.T) {
	petsDir := t.TempDir()
	outsideDir := t.TempDir()
	svc := New(petsDir, "", settings.DefaultConfig())

	if _, err := svc.cleanPetPath(outsideDir); err == nil {
		t.Fatal("cleanPetPath absolute outside path expected error, got nil")
	}
}

func TestNewService(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)
	if svc == nil {
		t.Fatal("New returned nil")
	}
	if svc.PetsDir() != "../../../pets" {
		t.Errorf("expected PetsDir to be '../../../pets', got %s", svc.PetsDir())
	}
}

func TestPetsDir(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("/custom/pets", "settings.json", cfg)
	if svc.PetsDir() != "/custom/pets" {
		t.Errorf("expected '/custom/pets', got %s", svc.PetsDir())
	}
}

func TestLoadPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	info, err := svc.LoadPet("../../../pets/eSheep-modern")
	if err != nil {
		t.Fatalf("LoadPet failed: %v", err)
	}
	if info == nil {
		t.Fatal("LoadPet returned nil info")
	}
	if info.PetName == "" {
		t.Error("expected non-empty PetName")
	}
}

func TestLoadPetInvalidPath(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	_, err := svc.LoadPet("")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestLoadPetTraversal(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	_, err := svc.LoadPet("../outside")
	if err == nil {
		t.Error("expected error for path traversal")
	}
}

func TestAddPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}
	if state == nil || state.PetID == "" {
		t.Error("expected non-empty petID")
	}
}

func TestAddPetUsesWorldContext(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	world := engine.WorldContext{
		Screen:   engine.Rect{W: 1920, H: 1080},
		WorkArea: engine.Rect{W: 1920, H: 1040},
	}

	state, err := svc.AddPet("../../../pets/eSheep-modern", 1, world)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}
	if state == nil {
		t.Fatal("AddPet returned nil state")
	}

	state, err = svc.StepPet(state.PetID, world)
	if err != nil {
		t.Fatalf("StepPet failed: %v", err)
	}
	if state == nil {
		t.Fatal("StepPet returned nil state")
	}
	if state.X < 1000 {
		t.Errorf("state.X = %v, want world-based spawn near the right edge", state.X)
	}
}

func TestAddPetInvalidPath(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	_, err := svc.AddPet("", 0)
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestRemovePet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	svc.RemovePet(state.PetID)
	// Verify pet was removed by checking if we can step it
	err = svc.ValidatePetExists(state.PetID)
	if err == nil {
		t.Error("expected error after removing pet")
	}
}

func TestRemovePetNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	// Should not panic
	svc.RemovePet("non-existent-id")
}

func TestStepPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	state, err = svc.StepPet(state.PetID, engine.WorldContext{})
	if err != nil {
		t.Fatalf("StepPet failed: %v", err)
	}
	if state == nil {
		t.Fatal("StepPet returned nil state")
	}
	if state.PetID == "" {
		t.Error("expected non-empty PetID")
	}
	if state.CurrentAnimID == 0 {
		t.Error("expected current animation id")
	}
	if state.CurrentAnimName == "" {
		t.Error("expected current animation name")
	}
}

func TestStepPetConcurrentCalls(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	const workers = 8
	const stepsPerWorker = 25
	errCh := make(chan error, workers*stepsPerWorker)
	var wg sync.WaitGroup

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < stepsPerWorker; j++ {
				if _, err := svc.StepPet(state.PetID, engine.WorldContext{}); err != nil {
					errCh <- err
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			t.Fatalf("StepPet concurrent call failed: %v", err)
		}
	}
}

func TestStepPetNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	_, err := svc.StepPet("non-existent", engine.WorldContext{})
	if err == nil {
		t.Error("expected error for non-existent pet")
	}
}

func TestStepPetWithBorder(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	world := engine.WorldContext{
		Screen: engine.Rect{W: 1000, H: 1000},
	}

	state, err = svc.StepPet(state.PetID, world)
	if err != nil {
		t.Fatalf("StepPet failed: %v", err)
	}
	if state == nil {
		t.Fatal("StepPet returned nil state")
	}
}

func TestDragPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.DragPet(state.PetID, 100, 200)
	if err != nil {
		t.Fatalf("DragPet failed: %v", err)
	}
}

func TestDragPetNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.DragPet("non-existent", 100, 200)
	if err == nil {
		t.Error("expected error for non-existent pet")
	}
}

func TestDropPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.DropPet(state.PetID)
	if err != nil {
		t.Fatalf("DropPet failed: %v", err)
	}
}

func TestDropPetNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.DropPet("non-existent")
	if err == nil {
		t.Error("expected error for non-existent pet")
	}
}

func TestValidatePetExists(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.ValidatePetExists(state.PetID)
	if err != nil {
		t.Errorf("ValidatePetExists failed: %v", err)
	}
}

func TestValidatePetExistsNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.ValidatePetExists("non-existent")
	if err == nil {
		t.Error("expected error for non-existent pet")
	}
}

func TestStatus(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	status := svc.Status()
	if status == nil {
		t.Fatal("Status returned nil")
	}
	if _, ok := status["pet_count"]; !ok {
		t.Error("expected pet_count in status")
	}
}

func TestSettings(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	settings := svc.Settings()
	if settings == nil {
		t.Fatal("Settings returned nil")
	}
	if _, ok := settings["Volume"]; !ok {
		t.Error("expected Volume in settings")
	}
}

func TestSetSettings(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.SetSettings(map[string]interface{}{
		"Volume": 0.8,
		"Scale":  2.0,
	})
	if err != nil {
		t.Fatalf("SetSettings failed: %v", err)
	}

	settings := svc.Settings()
	if settings["Volume"] != 0.8 {
		t.Errorf("expected Volume 0.8, got %v", settings["Volume"])
	}
}

func TestListPets(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	pets, err := svc.ListPets()
	if err != nil {
		t.Fatalf("ListPets failed: %v", err)
	}
	if len(pets) == 0 {
		t.Error("expected at least one pet")
	}
}

func TestListActive(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	active, err := svc.ListActive()
	if err != nil {
		t.Fatalf("ListActive failed: %v", err)
	}
	if len(active) != 1 {
		t.Errorf("expected 1 active pet, got %d", len(active))
	}
	if active[0]["pet_id"] != state.PetID {
		t.Errorf("expected pet_id %s, got %v", state.PetID, active[0]["pet_id"])
	}
}

func TestPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	data, err := svc.Pet(state.PetID)
	if err != nil {
		t.Fatalf("Pet failed: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty data")
	}
}

func TestPetNonExistent(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	_, err := svc.Pet("non-existent")
	if err == nil {
		t.Error("expected error for non-existent pet")
	}
}

func TestSetSettingsInvalidTypes(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	// Should not panic and should ignore invalid types
	err := svc.SetSettings(map[string]interface{}{
		"Volume":        "invalid",
		"Scale":         "invalid",
		"WinForeGround": 123,
		"AutostartPets": "invalid",
		"CurrentPet":    123,
	})
	if err != nil {
		t.Fatalf("SetSettings failed: %v", err)
	}
}

func TestUpdateVolume(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.UpdateVolume(0.7)
	if err != nil {
		t.Fatalf("UpdateVolume failed: %v", err)
	}

	settings := svc.Settings()
	if settings["Volume"] != 0.7 {
		t.Errorf("expected Volume 0.7, got %v", settings["Volume"])
	}
}

func TestUpdateScale(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.UpdateScale(2.5)
	if err != nil {
		t.Fatalf("UpdateScale failed: %v", err)
	}

	settings := svc.Settings()
	if settings["Scale"] != 2.5 {
		t.Errorf("expected Scale 2.5, got %v", settings["Scale"])
	}
}

func TestPathWithin(t *testing.T) {
	base := "/pets"
	path := "/pets/sheep"
	result := pathWithin(path, base)
	if !result {
		t.Error("expected path to be within base")
	}
}

func TestPathWithinOutside(t *testing.T) {
	base := "/pets"
	path := "/other/sheep"
	result := pathWithin(path, base)
	if result {
		t.Error("expected path to be outside base")
	}
}

func TestSetSettingsAll(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	err := svc.SetSettings(map[string]interface{}{
		"Volume":             0.9,
		"Scale":              3.0,
		"WinForeGround":      true,
		"StealTaskbarFocus":  true,
		"AutostartPets":      5.0,
		"MultiScreenEnabled": false,
		"CurrentPet":         "other-pet",
	})
	if err != nil {
		t.Fatalf("SetSettings failed: %v", err)
	}

	s := svc.Settings()
	if s["Volume"] != 0.9 {
		t.Errorf("expected Volume 0.9, got %v", s["Volume"])
	}
	if s["Scale"] != 3.0 {
		t.Errorf("expected Scale 3.0, got %v", s["Scale"])
	}
	if s["WinForeGround"] != true {
		t.Error("expected WinForeGround true")
	}
	if s["StealTaskbarFocus"] != true {
		t.Error("expected StealTaskbarFocus true")
	}
	if s["AutostartPets"] != 5 {
		t.Errorf("expected AutostartPets 5, got %v", s["AutostartPets"])
	}
	if s["MultiScreenEnabled"] != false {
		t.Error("expected MultiScreenEnabled false")
	}
	if s["CurrentPet"] != "other-pet" {
		t.Errorf("expected CurrentPet other-pet, got %v", s["CurrentPet"])
	}
}

func TestAddPetDuplicate(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	state1, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	state2, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	if state1.PetID == state2.PetID {
		t.Error("expected different pet IDs")
	}
}
