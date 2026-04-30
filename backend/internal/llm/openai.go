package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
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
	model := cfg.Model
	if model == "" {
		model = "gpt-4o"
	}
	return &openaiClient{
		apiKey:  cfg.APIKey,
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 60 * time.Second},
	}, nil
}

func (c *openaiClient) ProviderName() string { return "openai" }

func (c *openaiClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body := map[string]interface{}{
		"model":    c.model,
		"messages": req.Messages,
		"stream":   false,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal openai request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("openai: HTTP %s", resp.Status)
	}

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
		data, err := json.Marshal(body)
		if err != nil {
			ch <- StreamEvent{Error: fmt.Errorf("marshal openai request: %w", err)}
			return
		}
		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(data))
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := c.client.Do(httpReq)
		if err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			ch <- StreamEvent{Error: fmt.Errorf("openai: HTTP %s", resp.Status)}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") || !strings.HasPrefix(line, "data:") {
				continue
			}
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				ch <- StreamEvent{Done: true}
				return
			}
			var event struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				ch <- StreamEvent{Error: err}
				return
			}
			for _, choice := range event.Choices {
				if choice.Delta.Content != "" {
					ch <- StreamEvent{Content: choice.Delta.Content}
				}
			}
		}
		if err := scanner.Err(); err != nil {
			ch <- StreamEvent{Error: err}
			return
		}
		ch <- StreamEvent{Done: true}
	}()
	return ch, nil
}

func (c *openaiClient) Close() error {
	c.client.CloseIdleConnections()
	return nil
}
