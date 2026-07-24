package llm

import (
	"context"
	"fmt"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream,omitempty"`
}

type ChatResponse struct {
	Content string `json:"content"`
	Model   string `json:"model,omitempty"`
}

type StreamEvent struct {
	Content string
	Done    bool
	Error   error
}

type Client interface {
	Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
	StreamChat(ctx context.Context, req *ChatRequest) (<-chan StreamEvent, error)
	ProviderName() string
	Health(ctx context.Context) error
	Close() error
}

type ProviderConfig struct {
	Provider string `json:"provider"`
	apiKey   string
	BaseURL  string `json:"base_url,omitempty"`
	Model    string `json:"model,omitempty"`
}

func (c *ProviderConfig) Validate() error {
	switch c.Provider {
	case "openai", "anthropic", "gemini", "ollama":
		// OK
	case "":
		return fmt.Errorf("provider is required")
	default:
		return fmt.Errorf("unsupported provider: %s", c.Provider)
	}

	return nil
}
