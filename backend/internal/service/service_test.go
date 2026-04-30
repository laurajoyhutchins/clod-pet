package service

import (
	"path/filepath"
	"testing"

	"clod-pet/backend/internal/settings"
)

func TestCleanPetPathAllowsPathsInsidePetsDir(t *testing.T) {
	petsDir := t.TempDir()
	svc := New(petsDir, "", settings.DefaultConfig(), nil)

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
	svc := New(petsDir, "", settings.DefaultConfig(), nil)

	if _, err := svc.cleanPetPath(filepath.Join("..", "outside")); err == nil {
		t.Fatal("cleanPetPath traversal expected error, got nil")
	}
}

func TestCleanPetPathRejectsAbsolutePathOutsidePetsDir(t *testing.T) {
	petsDir := t.TempDir()
	outsideDir := t.TempDir()
	svc := New(petsDir, "", settings.DefaultConfig(), nil)

	if _, err := svc.cleanPetPath(outsideDir); err == nil {
		t.Fatal("cleanPetPath absolute outside path expected error, got nil")
	}
}
