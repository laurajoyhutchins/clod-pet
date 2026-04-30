package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
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
	model := cfg.Model
	if model == "" {
		model = "llama3"
	}
	return &ollamaClient{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 60 * time.Second},
	}, nil
}

func (c *ollamaClient) ProviderName() string { return "ollama" }

func (c *ollamaClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body := map[string]interface{}{
		"model":    c.model,
		"messages": req.Messages,
		"stream":   false,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal ollama request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ollama: HTTP %s", resp.Status)
	}

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
		data, err := json.Marshal(body)
		if err != nil {
			ch <- StreamEvent{Error: fmt.Errorf("marshal ollama request: %w", err)}
			return
		}
		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(data))
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := c.client.Do(httpReq)
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			ch <- StreamEvent{Error: fmt.Errorf("ollama: HTTP %s", resp.Status)}
			return
		}

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

func (c *ollamaClient) Close() error {
	c.client.CloseIdleConnections()
	return nil
}
