package settings

import (
	"clod-pet/backend/internal/llm"
	"encoding/json"
	"os"
	"path/filepath"
)

type LastUpdate struct {
	Name string `json:"Name"`
	Date string `json:"Date"`
}

type Config struct {
	Volume             float64            `json:"Volume"`
	WinForeGround     bool               `json:"WinForeGround"`
	StealTaskbarFocus bool               `json:"StealTaskbarFocus"`
	AutostartPets     int                `json:"AutostartPets"`
	Scale             float64            `json:"Scale"`
	MultiScreenEnabled bool              `json:"MultiScreenEnabled"`
	CurrentPet        string             `json:"CurrentPet"`
	LLM               llm.ProviderConfig `json:"LLM"`
	LastUpdate        []LastUpdate       `json:"LastUpdate"`
}

func DefaultConfig() *Config {
	return &Config{
		Volume:             0.3,
		Scale:              1.0,
		MultiScreenEnabled: true,
		AutostartPets:      1,
		CurrentPet:        "esheep64",
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

	return &cfg, nil
}

func (c *Config) Save(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}
