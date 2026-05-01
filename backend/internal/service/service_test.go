package service

import (
	"path/filepath"
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

	info, err := svc.LoadPet("../../../pets/esheep64")
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}
	if petID == "" {
		t.Error("expected non-empty petID")
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	svc.RemovePet(petID)
	// Verify pet was removed by checking if we can step it
	err = svc.ValidatePetExists(petID)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	state, err := svc.StepPet(petID, engine.WorldContext{})
	if err != nil {
		t.Fatalf("StepPet failed: %v", err)
	}
	if state == nil {
		t.Fatal("StepPet returned nil state")
	}
	if state.PetID != petID {
		t.Errorf("expected PetID %s, got %s", petID, state.PetID)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	world := engine.WorldContext{
		Screen: engine.Rect{W: 1000, H: 1000},
	}

	state, err := svc.StepPet(petID, world)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.DragPet(petID, 100, 200)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.DropPet(petID)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	err = svc.ValidatePetExists(petID)
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

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
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
	if active[0]["pet_id"] != petID {
		t.Errorf("expected pet_id %s, got %v", petID, active[0]["pet_id"])
	}
}

func TestPet(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "test-settings.json", cfg)

	petID, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	data, err := svc.Pet(petID)
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

	petID1, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	petID2, err := svc.AddPet("../../../pets/esheep64", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}

	if petID1 == petID2 {
		t.Error("expected different pet IDs")
	}
}
