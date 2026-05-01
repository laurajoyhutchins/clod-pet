package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg == nil {
		t.Fatal("DefaultConfig returned nil")
	}
	if cfg.Volume != 0.3 {
		t.Errorf("expected Volume 0.3, got %v", cfg.Volume)
	}
	if cfg.Scale != 1.0 {
		t.Errorf("expected Scale 1.0, got %v", cfg.Scale)
	}
	if !cfg.MultiScreenEnabled {
		t.Error("expected MultiScreenEnabled to be true")
	}
	if cfg.AutostartPets != 1 {
		t.Errorf("expected AutostartPets 1, got %v", cfg.AutostartPets)
	}
	if cfg.CurrentPet != "eSheep-modern" {
		t.Errorf("expected CurrentPet eSheep-modern, got %v", cfg.CurrentPet)
	}
}

func TestLoadNewFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test-settings.json")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Volume != 0.3 {
		t.Errorf("expected default Volume 0.3, got %v", cfg.Volume)
	}

	// Verify file was created
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("settings file was not created")
	}
}

func TestLoadExistingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test-settings.json")

	// Create a settings file
	original := &Config{
		Volume:             0.8,
		Scale:              2.0,
		CurrentPet:         "test-pet",
		AutostartPets:      3,
		MultiScreenEnabled: false,
	}
	if err := original.Save(path); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Load it back
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.Volume != 0.8 {
		t.Errorf("expected Volume 0.8, got %v", cfg.Volume)
	}
	if cfg.Scale != 2.0 {
		t.Errorf("expected Scale 2.0, got %v", cfg.Scale)
	}
	if cfg.CurrentPet != "test-pet" {
		t.Errorf("expected CurrentPet test-pet, got %v", cfg.CurrentPet)
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "invalid.json")

	if err := os.WriteFile(path, []byte("invalid json"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	_, err := Load(path)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestLoadReadError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "unread")
	if err := os.MkdirAll(path, 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	// Loading a directory as a file should fail
	_, err := Load(path)
	if err == nil {
		t.Error("Load(directory) expected error, got nil")
	}
}

func TestSaveMkdirError(t *testing.T) {
	// Hard to trigger MkdirAll error without weird permissions
	// But we can try to use a file where a directory should be
	dir := t.TempDir()
	path := filepath.Join(dir, "file")
	if err := os.WriteFile(path, []byte("test"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	cfg := DefaultConfig()
	// Trying to save into subdir of a file
	err := cfg.Save(filepath.Join(path, "settings.json"))
	if err == nil {
		t.Error("Save into file subdir expected error, got nil")
	}
}

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "settings.json")

	cfg := &Config{
		Volume:             0.5,
		Scale:              1.5,
		CurrentPet:         "custom-pet",
		AutostartPets:      2,
		MultiScreenEnabled: true,
	}

	if err := cfg.Save(path); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded.Volume != cfg.Volume {
		t.Errorf("Volume mismatch: %v vs %v", loaded.Volume, cfg.Volume)
	}
}
