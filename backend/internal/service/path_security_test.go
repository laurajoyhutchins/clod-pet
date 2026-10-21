package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clod-pet/backend/internal/settings"
)

func TestCleanPetPathRejectsCanonicalEscape(t *testing.T) {
	petsDir := t.TempDir()
	outsideDir := t.TempDir()
	linkedPet := filepath.Join(petsDir, "linked-pet")
	if err := os.Symlink(outsideDir, linkedPet); err != nil {
		t.Skipf("symbolic links unavailable in test environment: %v", err)
	}
	svc := New(petsDir, "", settings.DefaultConfig())

	_, err := svc.cleanPetPath(linkedPet)
	if err == nil {
		t.Fatal("cleanPetPath canonical escape expected error, got nil")
	}
	if strings.Contains(err.Error(), outsideDir) || strings.Contains(err.Error(), petsDir) {
		t.Fatalf("containment error exposed an absolute path: %v", err)
	}
}

func TestCleanPetPathReturnsCanonicalInRootPath(t *testing.T) {
	petsDir := t.TempDir()
	realPet := filepath.Join(petsDir, "real-pet")
	if err := os.Mkdir(realPet, 0o755); err != nil {
		t.Fatalf("create pet directory: %v", err)
	}
	linkedPet := filepath.Join(petsDir, "linked-pet")
	if err := os.Symlink(realPet, linkedPet); err != nil {
		t.Skipf("symbolic links unavailable in test environment: %v", err)
	}
	svc := New(petsDir, "", settings.DefaultConfig())

	got, err := svc.cleanPetPath(linkedPet)
	if err != nil {
		t.Fatalf("cleanPetPath returned error: %v", err)
	}
	want, err := filepath.EvalSymlinks(realPet)
	if err != nil {
		t.Fatalf("resolve expected path: %v", err)
	}
	if got != want {
		t.Fatalf("cleanPetPath = %q, want canonical path %q", got, want)
	}
}
