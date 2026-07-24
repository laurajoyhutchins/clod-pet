package llm

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type staticCredentialSource map[string]string

func (s staticCredentialSource) APIKey(provider string) (string, error) {
	key := s[provider]
	if key == "" {
		return "", ErrCredentialNotFound
	}
	return key, nil
}

func TestEnvironmentCredentialSourceUsesProviderSpecificVariables(t *testing.T) {
	values := map[string]string{
		"OPENAI_API_KEY":    "openai-secret",
		"ANTHROPIC_API_KEY": "anthropic-secret",
		"GOOGLE_API_KEY":    "gemini-secret",
	}
	source := EnvironmentCredentialSource{
		LookupEnv: func(name string) (string, bool) {
			value, ok := values[name]
			return value, ok
		},
	}

	for provider, want := range map[string]string{
		"openai":    "openai-secret",
		"anthropic": "anthropic-secret",
		"gemini":    "gemini-secret",
	} {
		got, err := source.APIKey(provider)
		if err != nil {
			t.Fatalf("APIKey(%q) returned error: %v", provider, err)
		}
		if got != want {
			t.Fatalf("APIKey(%q) = %q, want %q", provider, got, want)
		}
	}
}

func TestNewClientWithCredentialsKeepsSecretOutOfProviderConfig(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "openai",
		BaseURL:  "https://api.openai.com/v1",
		Model:    "gpt-4o",
	}

	client, err := NewClientWithCredentials(cfg, staticCredentialSource{"openai": "runtime-only-secret"})
	if err != nil {
		t.Fatalf("NewClientWithCredentials failed: %v", err)
	}
	defer client.Close()

	openAI, ok := client.(*openaiClient)
	if !ok {
		t.Fatalf("client type = %T, want *openaiClient", client)
	}
	if openAI.apiKey != "runtime-only-secret" {
		t.Fatal("resolved credential was not supplied to the provider client")
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	serialized := strings.ToLower(string(data))
	if strings.Contains(serialized, "runtime-only-secret") || strings.Contains(serialized, "api_key") || strings.Contains(serialized, "apikey") {
		t.Fatalf("provider config serialized credential material: %s", data)
	}
}

func TestNewClientWithCredentialsFailsClosedWithoutHostedCredential(t *testing.T) {
	_, err := NewClientWithCredentials(
		&ProviderConfig{Provider: "openai"},
		staticCredentialSource{},
	)
	if err == nil {
		t.Fatal("expected missing credential error")
	}
	if !errors.Is(err, ErrCredentialNotFound) {
		t.Fatalf("error = %v, want ErrCredentialNotFound", err)
	}
	if strings.Contains(strings.ToLower(err.Error()), "api key value") {
		t.Fatalf("error exposed credential material: %v", err)
	}
}

func TestOllamaDoesNotRequestHostedCredential(t *testing.T) {
	client, err := NewClientWithCredentials(
		&ProviderConfig{Provider: "ollama", BaseURL: "http://localhost:11434", Model: "llama3"},
		staticCredentialSource{},
	)
	if err != nil {
		t.Fatalf("NewClientWithCredentials failed: %v", err)
	}
	defer client.Close()
}
