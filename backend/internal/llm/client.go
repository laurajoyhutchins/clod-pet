package llm

import (
	"context"
	"fmt"
	"time"
)

func NewClient(cfg *ProviderConfig) (Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	switch cfg.Provider {
	case "openai":
		return newOpenAIClient(cfg)
	case "anthropic":
		return newAnthropicClient(cfg)
	case "gemini":
		return newGeminiClient(cfg)
	case "ollama":
		return newOllamaClient(cfg)
	default:
		return nil, fmt.Errorf("unsupported provider: %s", cfg.Provider)
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
