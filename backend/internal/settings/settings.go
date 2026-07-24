package settings

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"clod-pet/backend/internal/llm"
	"github.com/goccy/go-json"
)

type LastUpdate struct {
	Name string `json:"Name"`
	Date string `json:"Date"`
}

type Config struct {
	Volume               float64            `json:"Volume"`
	WinForeGround        bool               `json:"WinForeGround"`
	StealTaskbarFocus    bool               `json:"StealTaskbarFocus"`
	AutostartPets        int                `json:"AutostartPets"`
	Scale                float64            `json:"Scale"`
	ShowAdvancedSettings bool               `json:"ShowAdvancedSettings"`
	ShowDiagnosticsPanel bool               `json:"ShowDiagnosticsPanel"`
	PanelStyle           string             `json:"PanelStyle"`
	MultiScreenEnabled   bool               `json:"MultiScreenEnabled"`
	GravityFactor        float64            `json:"GravityFactor"`
	CurrentPet           string             `json:"CurrentPet"`
	LLM                  llm.ProviderConfig `json:"LLM"`
	LastUpdate           []LastUpdate       `json:"LastUpdate"`
}

func DefaultConfig() *Config {
	return &Config{
		Volume:               0.3,
		Scale:                1.0,
		ShowAdvancedSettings: false,
		ShowDiagnosticsPanel: false,
		PanelStyle:           "windows-98",
		MultiScreenEnabled:   true,
		GravityFactor:        2.0,
		AutostartPets:        1,
		CurrentPet:           "eSheep-modern",
		LLM: llm.ProviderConfig{
			Provider: "ollama",
			BaseURL:  "http://localhost:11434",
			Model:    "llama3",
		},
	}
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := DefaultConfig()
			if err := cfg.Save(path); err != nil {
				return nil, err
			}
			return cfg, nil
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err == nil {
		if v, ok := raw["ShowDiagnosticsPanel"]; ok {
			if err := json.Unmarshal(v, &cfg.ShowDiagnosticsPanel); err != nil {
				return nil, err
			}
		} else if v, ok := raw["ShowDiagnostics"]; ok {
			if err := json.Unmarshal(v, &cfg.ShowDiagnosticsPanel); err != nil {
				return nil, err
			}
		}

		var llmName string
		var llmValue json.RawMessage
		for name, value := range raw {
			if !strings.EqualFold(name, "LLM") {
				continue
			}
			if llmName != "" {
				return nil, fmt.Errorf("settings contain multiple case-insensitive LLM sections")
			}
			llmName = name
			llmValue = value
		}

		if llmName != "" {
			sanitized, changed, err := removeCredentialFields(llmValue)
			if err != nil {
				return nil, fmt.Errorf("inspect legacy provider settings: %w", err)
			}
			if changed {
				raw[llmName] = sanitized
				migrated, err := json.MarshalIndent(raw, "", "  ")
				if err != nil {
					return nil, fmt.Errorf("serialize migrated provider settings: %w", err)
				}
				if err := writeSettingsFile(path, migrated); err != nil {
					return nil, fmt.Errorf("remove legacy provider credentials from settings: %w", err)
				}
			}
		}
	}
	if cfg.PanelStyle == "" {
		cfg.PanelStyle = "windows-98"
	}

	return &cfg, nil
}

func (c *Config) Save(path string) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return writeSettingsFile(path, data)
}

func writeSettingsFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	return os.Chmod(path, 0600)
}

func removeCredentialFields(raw json.RawMessage) (json.RawMessage, bool, error) {
	var value interface{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, false, err
	}
	changed := removeCredentialFieldsValue(value)
	if !changed {
		return raw, false, nil
	}
	sanitized, err := json.Marshal(value)
	if err != nil {
		return nil, false, err
	}
	return sanitized, true, nil
}

func removeCredentialFieldsValue(value interface{}) bool {
	changed := false
	switch typed := value.(type) {
	case map[string]interface{}:
		for name, child := range typed {
			if llm.IsCredentialField(name) {
				delete(typed, name)
				changed = true
				continue
			}
			if removeCredentialFieldsValue(child) {
				changed = true
			}
		}
	case []interface{}:
		for _, child := range typed {
			if removeCredentialFieldsValue(child) {
				changed = true
			}
		}
	}
	return changed
}
