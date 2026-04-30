package llm

import (
	"context"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

type anthropicClient struct {
	client *anthropic.Client
	model  string
}

func newAnthropicClient(cfg *ProviderConfig) (Client, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("anthropic: API key required")
	}

	opts := []option.RequestOption{option.WithAPIKey(cfg.APIKey)}
	if cfg.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(cfg.BaseURL))
	}

	client := anthropic.NewClient(opts...)
	model := cfg.Model
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}

	return &anthropicClient{client: &client, model: model}, nil
}

func (c *anthropicClient) ProviderName() string { return "anthropic" }

func (c *anthropicClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	var systemText string
	var msgs []anthropic.MessageParam

	for _, m := range req.Messages {
		switch m.Role {
		case "system":
			systemText = m.Content
		case "user":
			msgs = append(msgs, anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content)))
		case "assistant":
			msgs = append(msgs, anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content)))
		}
	}

	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: int64(1024),
		Messages:  msgs,
	}
	if systemText != "" {
		params.System = []anthropic.TextBlockParam{{Text: systemText}}
	}

	msg, err := c.client.Messages.New(ctx, params)
	if err != nil {
		return nil, err
	}

	var content string
	for _, block := range msg.Content {
		if block.Type == "text" {
			content += block.Text
		}
	}

	return &ChatResponse{Content: content, Model: c.model}, nil
}

func (c *anthropicClient) StreamChat(ctx context.Context, req *ChatRequest) (<-chan StreamEvent, error) {
	ch := make(chan StreamEvent)

	go func() {
		defer close(ch)

		var systemText string
		var msgs []anthropic.MessageParam

		for _, m := range req.Messages {
			switch m.Role {
			case "system":
				systemText = m.Content
			case "user":
				msgs = append(msgs, anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content)))
			case "assistant":
				msgs = append(msgs, anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content)))
			}
		}

		params := anthropic.MessageNewParams{
			Model:     anthropic.Model(c.model),
			MaxTokens: int64(1024),
			Messages:  msgs,
		}
		if systemText != "" {
			params.System = []anthropic.TextBlockParam{{Text: systemText}}
		}

		stream := c.client.Messages.NewStreaming(ctx, params)

		for stream.Next() {
			event := stream.Current()
			switch event := event.AsAny().(type) {
			case anthropic.ContentBlockDeltaEvent:
				switch delta := event.Delta.AsAny().(type) {
				case anthropic.TextDelta:
					ch <- StreamEvent{Content: delta.Text}
				}
			}
		}
		if err := stream.Err(); err != nil {
			ch <- StreamEvent{Error: err}
		}
		ch <- StreamEvent{Done: true}
	}()

	return ch, nil
}

func (c *anthropicClient) Close() error { return nil }
