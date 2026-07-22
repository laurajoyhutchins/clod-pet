package llm

import (
	"context"
	"fmt"
	"time"
)

func NewClient(cfg *ProviderConfig) (Client, error) {
	return NewClientWithCredentials(cfg, EnvironmentCredentialSource{})
}

func NewClientWithCredentials(cfg *ProviderConfig, credentials CredentialSource) (Client, error) {
	if cfg == nil {
		return nil, fmt.Errorf("provider config is required")
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	resolved := *cfg
	if resolved.Provider != "ollama" {
		if credentials == nil {
			return nil, fmt.Errorf("%s credential is not configured: %w", resolved.Provider, ErrCredentialNotFound)
		}
		apiKey, err := credentials.APIKey(resolved.Provider)
		if err != nil || apiKey == "" {
			return nil, fmt.Errorf("%s credential is not configured: %w", resolved.Provider, ErrCredentialNotFound)
		}
		resolved.apiKey = apiKey
	}

	switch resolved.Provider {
	case "openai":
		return newOpenAIClient(&resolved)
	case "anthropic":
		return newAnthropicClient(&resolved)
	case "gemini":
		return newGeminiClient(&resolved)
	case "ollama":
		return newOllamaClient(&resolved)
	default:
		return nil, fmt.Errorf("unsupported provider: %s", resolved.Provider)
	}
}

func mergeMessages(req *ChatRequest) string {
	var merged string
	for _, m := range req.Messages {
		merged += m.Role + ": " + m.Content + "\n"
	}
	return merged
}

func passthroughContext(ctx context.Context) context.Context {
	return ctx
}

// WithRetry attempts to execute a function with retries for non-streaming requests.
func WithRetry(ctx context.Context, attempts int, delay time.Duration, fn func() (*ChatResponse, error)) (*ChatResponse, error) {
	var lastErr error
	for i := 0; i < attempts; i++ {
		resp, err := fn()
		if err == nil {
			return resp, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
			delay *= 2
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
		}
	}
	return nil, fmt.Errorf("after %d attempts, last error: %w", attempts, lastErr)
}
