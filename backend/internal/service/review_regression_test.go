package service

import (
	"path/filepath"
	"reflect"
	"testing"

	"clod-pet/backend/internal/settings"
)

func TestSetSettingsRejectsInvalidMixedPatchAtomically(t *testing.T) {
	cfg := settings.DefaultConfig()
	settingsPath := filepath.Join(t.TempDir(), "settings.json")
	svc := New("../../../pets", settingsPath, cfg)

	state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
	if err != nil {
		t.Fatalf("AddPet failed: %v", err)
	}
	activeEngine := svc.engines[state.PetID]
	beforeEngineGravity := reflect.ValueOf(activeEngine).Elem().FieldByName("gravityFactor").Float()
	beforeSettingsGravity := svc.settings.GravityFactor

	err = svc.SetSettings(map[string]interface{}{
		"GravityFactor": 9.0,
		"LLM": map[string]interface{}{
			"provider": "unsupported-provider",
		},
	})
	if err == nil {
		t.Fatal("expected invalid mixed settings patch to fail")
	}
	if svc.settings.GravityFactor != beforeSettingsGravity {
		t.Fatalf("live settings gravity changed after rejected patch: got %v, want %v", svc.settings.GravityFactor, beforeSettingsGravity)
	}
	afterEngineGravity := reflect.ValueOf(activeEngine).Elem().FieldByName("gravityFactor").Float()
	if afterEngineGravity != beforeEngineGravity {
		t.Fatalf("active engine gravity changed after rejected patch: got %v, want %v", afterEngineGravity, beforeEngineGravity)
	}
}
