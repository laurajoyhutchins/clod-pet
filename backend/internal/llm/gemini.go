package llm

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"google.golang.org/genai"
)

type geminiClient struct {
	client     *genai.Client
	httpClient *http.Client
	model      string
}

func newGeminiClient(cfg *ProviderConfig) (Client, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("gemini: API key required")
	}

	httpClient := &http.Client{
		Timeout: 60 * time.Second,
	}

	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:     cfg.APIKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: httpClient,
		HTTPOptions: genai.HTTPOptions{
			BaseURL: cfg.BaseURL,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: failed to create client: %w", err)
	}

	model := cfg.Model
	if model == "" {
		model = "gemini-1.5-flash"
	}

	return &geminiClient{
		client:     client,
		httpClient: httpClient,
		model:      model,
	}, nil
}

func (c *geminiClient) ProviderName() string { return "gemini" }

func (c *geminiClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	contents := buildGeminiContents(req.Messages)

	result, err := c.client.Models.GenerateContent(ctx, c.model, contents, nil)
	if err != nil {
		return nil, err
	}

	var content string
	if result.Text() != "" {
		content = result.Text()
	}

	return &ChatResponse{Content: content, Model: c.model}, nil
}

func (c *geminiClient) Health(ctx context.Context) error {
	_, err := c.client.Models.Get(ctx, c.model, nil)
	return err
}

func (c *geminiClient) StreamChat(ctx context.Context, req *ChatRequest) (<-chan StreamEvent, error) {
	ch := make(chan StreamEvent)

	go func() {
		defer close(ch)

		contents := buildGeminiContents(req.Messages)

		stream := c.client.Models.GenerateContentStream(ctx, c.model, contents, nil)

		for chunk, err := range stream {
			if err != nil {
				ch <- StreamEvent{Error: err}
				return
			}
			if chunk.Text() != "" {
				ch <- StreamEvent{Content: chunk.Text()}
			}
		}

		ch <- StreamEvent{Done: true}
	}()

	return ch, nil
}

func (c *geminiClient) Close() error {
	if c.httpClient != nil {
		c.httpClient.CloseIdleConnections()
	}
	return nil
}

func buildGeminiContents(messages []Message) []*genai.Content {
	var contents []*genai.Content

	for _, m := range messages {
		var role genai.Role
		switch m.Role {
		case "user":
			role = genai.RoleUser
		case "assistant", "model":
			role = genai.RoleModel
		default:
			role = genai.RoleUser
		}
		contents = append(contents, genai.NewContentFromText(m.Content, role))
	}

	return contents
}
