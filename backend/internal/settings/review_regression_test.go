package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRejectsDuplicateCaseInsensitiveLLMSettings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "duplicate-llm-settings.json")
	legacy := `{
  "LLM": {
    "provider": "openai",
    "api_key": "first-legacy-secret"
  },
  "llm": {
    "provider": "anthropic",
    "token": "second-legacy-secret"
  }
}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatalf("write duplicate settings: %v", err)
	}

	if _, err := Load(path); err == nil {
		t.Fatal("Load succeeded with duplicate case-insensitive LLM settings")
	}
}
