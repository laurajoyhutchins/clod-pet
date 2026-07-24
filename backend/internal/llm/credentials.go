package llm

import (
	"errors"
	"os"
	"strings"
)

var ErrCredentialNotFound = errors.New("provider credential not found")

type CredentialSource interface {
	APIKey(provider string) (string, error)
}

type EnvironmentCredentialSource struct {
	LookupEnv func(string) (string, bool)
}

func (s EnvironmentCredentialSource) APIKey(provider string) (string, error) {
	lookup := s.LookupEnv
	if lookup == nil {
		lookup = os.LookupEnv
	}

	for _, name := range credentialEnvironmentVariables(provider) {
		if value, ok := lookup(name); ok && strings.TrimSpace(value) != "" {
			return value, nil
		}
	}
	return "", ErrCredentialNotFound
}

func credentialEnvironmentVariables(provider string) []string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "openai":
		return []string{"OPENAI_API_KEY"}
	case "anthropic":
		return []string{"ANTHROPIC_API_KEY"}
	case "gemini":
		return []string{"GEMINI_API_KEY", "GOOGLE_API_KEY"}
	default:
		return nil
	}
}

func IsCredentialField(name string) bool {
	normalized := strings.ToLower(strings.NewReplacer("_", "", "-", "", " ", "").Replace(name))
	switch normalized {
	case "apikey", "token", "accesstoken", "bearertoken", "authorization", "authorizationheader":
		return true
	default:
		return false
	}
}
