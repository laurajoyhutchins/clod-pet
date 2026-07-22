package settings

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadMigratesLegacyProviderAPIKeyOutOfSettingsFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-settings.json")
	legacy := `{
  "Volume": 0.8,
  "CurrentPet": "eSheep-modern",
  "LLM": {
    "provider": "openai",
    "api_key": "sk-legacy-plaintext",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o"
  }
}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatalf("write legacy settings: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.LLM.Provider != "openai" || cfg.LLM.BaseURL != "https://api.openai.com/v1" || cfg.LLM.Model != "gpt-4o" {
		t.Fatalf("non-secret LLM preferences were not preserved: %+v", cfg.LLM)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migrated settings: %v", err)
	}
	lower := strings.ToLower(string(data))
	if strings.Contains(lower, "sk-legacy-plaintext") || strings.Contains(lower, "api_key") || strings.Contains(lower, "apikey") {
		t.Fatalf("migrated settings retained credential material: %s", data)
	}
}

func TestLoadRemovesCredentialShapedLegacyFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-token-settings.json")
	legacy := `{
  "LLM": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "token": "legacy-token-value",
    "authorization": "Bearer legacy-authorization-value"
  }
}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatalf("write legacy settings: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.LLM.Provider != "anthropic" || cfg.LLM.Model != "claude-sonnet-4-20250514" {
		t.Fatalf("non-secret LLM preferences were not preserved: %+v", cfg.LLM)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migrated settings: %v", err)
	}
	lower := strings.ToLower(string(data))
	for _, forbidden := range []string{"legacy-token-value", "legacy-authorization-value", "\"token\"", "\"authorization\""} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("migrated settings retained %q: %s", forbidden, data)
		}
	}
}

func TestLoadCredentialMigrationPreservesUnknownNonSecretSettings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-settings-with-extension.json")
	legacy := `{
  "Volume": 0.8,
  "ExtensionSettings": {
    "enabled": true,
    "theme": "custom"
  },
  "LLM": {
    "provider": "openai",
    "api_key": "sk-legacy-plaintext",
    "model": "gpt-4o"
  }
}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatalf("write legacy settings: %v", err)
	}

	if _, err := Load(path); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migrated settings: %v", err)
	}
	if strings.Contains(string(data), "sk-legacy-plaintext") {
		t.Fatalf("migrated settings retained credential material: %s", data)
	}
	if !strings.Contains(string(data), `"ExtensionSettings"`) || !strings.Contains(string(data), `"theme": "custom"`) {
		t.Fatalf("migration removed unrelated settings: %s", data)
	}
}
