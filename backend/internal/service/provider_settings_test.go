package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clod-pet/backend/internal/settings"
)

func TestSettingsReturnsNonSecretLLMPreferences(t *testing.T) {
	cfg := settings.DefaultConfig()
	cfg.LLM.Provider = "openai"
	cfg.LLM.BaseURL = "https://api.openai.com/v1"
	cfg.LLM.Model = "gpt-4o"
	svc := New(t.TempDir(), filepath.Join(t.TempDir(), "settings.json"), cfg)

	got := svc.Settings()
	llmSettings, ok := got["LLM"].(map[string]interface{})
	if !ok {
		t.Fatalf("LLM settings type = %T, want map[string]interface{}", got["LLM"])
	}
	if llmSettings["provider"] != "openai" || llmSettings["base_url"] != "https://api.openai.com/v1" || llmSettings["model"] != "gpt-4o" {
		t.Fatalf("LLM settings = %#v", llmSettings)
	}
	for key := range llmSettings {
		lower := strings.ToLower(strings.ReplaceAll(key, "_", ""))
		if lower == "apikey" || lower == "token" || lower == "authorization" {
			t.Fatalf("renderer-visible settings exposed credential field %q", key)
		}
	}
}

func TestSetSettingsUpdatesOnlyNonSecretLLMPreferences(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	svc := New(t.TempDir(), path, settings.DefaultConfig())

	err := svc.SetSettings(map[string]interface{}{
		"LLM": map[string]interface{}{
			"provider": "openai",
			"base_url": "https://api.openai.com/v1",
			"model":    "gpt-4o",
		},
	})
	if err != nil {
		t.Fatalf("SetSettings failed: %v", err)
	}

	got := svc.Settings()["LLM"].(map[string]interface{})
	if got["provider"] != "openai" || got["base_url"] != "https://api.openai.com/v1" || got["model"] != "gpt-4o" {
		t.Fatalf("LLM settings = %#v", got)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	lower := strings.ToLower(string(data))
	if strings.Contains(lower, "api_key") || strings.Contains(lower, "authorization") || strings.Contains(lower, "\"token\"") {
		t.Fatalf("settings file contained a credential field: %s", data)
	}
}

func TestSetSettingsRejectsProviderCredentialFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	svc := New(t.TempDir(), path, settings.DefaultConfig())

	err := svc.SetSettings(map[string]interface{}{
		"LLM": map[string]interface{}{
			"provider": "openai",
			"api_key":  "must-not-be-accepted",
		},
	})
	if err == nil {
		t.Fatal("expected provider credential field to be rejected")
	}
	if strings.Contains(err.Error(), "must-not-be-accepted") {
		t.Fatalf("error exposed credential value: %v", err)
	}
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("rejected settings patch unexpectedly wrote %q", path)
	}
}
