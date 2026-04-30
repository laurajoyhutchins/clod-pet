package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type openaiClient struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

func newOpenAIClient(cfg *ProviderConfig) (Client, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("openai: API key required")
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	return &openaiClient{
		apiKey:  cfg.APIKey,
		baseURL: baseURL,
		model:   cfg.Model,
		client:  &http.Client{},
	}, nil
}

func (c *openaiClient) ProviderName() string { return "openai" }

func (c *openaiClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body := map[string]interface{}{
		"model":    c.model,
		"messages": req.Messages,
		"stream":   false,
	}
	data, _ := json.Marshal(body)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(data))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no response from OpenAI")
	}
	return &ChatResponse{Content: result.Choices[0].Message.Content, Model: c.model}, nil
}

func (c *openaiClient) StreamChat(ctx context.Context, req *ChatRequest) (<-chan StreamEvent, error) {
	ch := make(chan StreamEvent)
	go func() {
		defer close(ch)
		body := map[string]interface{}{
			"model":    c.model,
			"messages": req.Messages,
			"stream":   true,
		}
		data, _ := json.Marshal(body)
		httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(data))
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := c.client.Do(httpReq)
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		defer resp.Body.Close()

		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				ch <- StreamEvent{Content: string(buf[:n])}
			}
			if err != nil {
				ch <- StreamEvent{Done: true}
				return
			}
		}
	}()
	return ch, nil
}

func (c *openaiClient) Close() error { return nil }
