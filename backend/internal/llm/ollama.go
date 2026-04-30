package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

type ollamaClient struct {
	baseURL string
	model   string
	client  *http.Client
}

func newOllamaClient(cfg *ProviderConfig) (Client, error) {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	return &ollamaClient{
		baseURL: baseURL,
		model:   cfg.Model,
		client:  &http.Client{},
	}, nil
}

func (c *ollamaClient) ProviderName() string { return "ollama" }

func (c *ollamaClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body := map[string]interface{}{
		"model":    c.model,
		"messages": req.Messages,
		"stream":   false,
	}
	data, _ := json.Marshal(body)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(data))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &ChatResponse{Content: result.Message.Content, Model: c.model}, nil
}

func (c *ollamaClient) StreamChat(ctx context.Context, req *ChatRequest) (<-chan StreamEvent, error) {
	ch := make(chan StreamEvent)
	go func() {
		defer close(ch)
		body := map[string]interface{}{
			"model":    c.model,
			"messages": req.Messages,
			"stream":   true,
		}
		data, _ := json.Marshal(body)
		httpReq, _ := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(data))
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := c.client.Do(httpReq)
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		defer resp.Body.Close()

		decoder := json.NewDecoder(resp.Body)
		for {
			var chunk struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
				Done bool `json:"done"`
			}
			if err := decoder.Decode(&chunk); err != nil {
				if err == io.EOF {
					ch <- StreamEvent{Done: true}
					return
				}
				ch <- StreamEvent{Error: err}
				return
			}
			if chunk.Message.Content != "" {
				ch <- StreamEvent{Content: chunk.Message.Content}
			}
			if chunk.Done {
				ch <- StreamEvent{Done: true}
				return
			}
		}
	}()
	return ch, nil
}

func (c *ollamaClient) Close() error { return nil }
