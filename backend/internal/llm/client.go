package llm

import (
	"context"
	"fmt"
)

func NewClient(cfg *ProviderConfig) (Client, error) {
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
