package llm

import (
	"context"
	"testing"
)

func TestNewClientOpenAI(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "openai",
		APIKey:   "test-key",
		Model:    "gpt-4",
		BaseURL:  "https://api.openai.com/v1",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}
	if client.ProviderName() != "openai" {
		t.Errorf("expected provider name 'openai', got %s", client.ProviderName())
	}
	if err := client.Close(); err != nil {
		t.Errorf("Close failed: %v", err)
	}
}

func TestNewClientOpenAINoKey(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "openai",
	}
	_, err := NewClient(cfg)
	if err == nil {
		t.Error("expected error for missing API key")
	}
}

func TestNewClientAnthropic(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "anthropic",
		APIKey:   "test-key",
		Model:    "claude-sonnet-4-20250514",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Skipf("anthropic client creation failed (may need valid API): %v", err)
	}
	if client.ProviderName() != "anthropic" {
		t.Errorf("expected provider name 'anthropic', got %s", client.ProviderName())
	}
}

func TestNewClientGemini(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "gemini",
		APIKey:   "test-key",
		Model:    "gemini-2.5-flash",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Skipf("gemini client creation failed (may need valid API): %v", err)
	}
	if client.ProviderName() != "gemini" {
		t.Errorf("expected provider name 'gemini', got %s", client.ProviderName())
	}
}

func TestNewClientOllama(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "ollama",
		Model:    "llama2",
		BaseURL:  "http://localhost:11434",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}
	if client.ProviderName() != "ollama" {
		t.Errorf("expected provider name 'ollama', got %s", client.ProviderName())
	}
	if err := client.Close(); err != nil {
		t.Errorf("Close failed: %v", err)
	}
}

func TestNewClientOllamaDefaultURL(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "ollama",
		Model:    "llama2",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}
	_ = client
}

func TestNewClientUnsupported(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "unsupported",
	}
	_, err := NewClient(cfg)
	if err == nil {
		t.Error("expected error for unsupported provider")
	}
}

func TestMergeMessages(t *testing.T) {
	req := &ChatRequest{
		Messages: []Message{
			{Role: "user", Content: "Hello"},
			{Role: "assistant", Content: "Hi there"},
			{Role: "user", Content: "How are you?"},
		},
	}
	result := mergeMessages(req)
	expected := "user: Hello\nassistant: Hi there\nuser: How are you?\n"
	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestMergeMessagesEmpty(t *testing.T) {
	req := &ChatRequest{
		Messages: []Message{},
	}
	result := mergeMessages(req)
	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}

func TestPassthroughContext(t *testing.T) {
	ctx := context.Background()
	result := passthroughContext(ctx)
	if result != ctx {
		t.Error("passthroughContext should return the same context")
	}
}

func TestMessage(t *testing.T) {
	msg := Message{Role: "user", Content: "test"}
	if msg.Role != "user" {
		t.Error("Message role not set correctly")
	}
}

func TestChatRequest(t *testing.T) {
	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "test"}},
		Stream:   true,
	}
	if !req.Stream {
		t.Error("Stream field not set correctly")
	}
}

func TestChatResponse(t *testing.T) {
	resp := &ChatResponse{
		Content: "test response",
		Model:   "gpt-4",
	}
	if resp.Content != "test response" {
		t.Error("ChatResponse content not set correctly")
	}
}

func TestStreamEvent(t *testing.T) {
	event := StreamEvent{
		Content: "test",
		Done:    true,
		Error:   nil,
	}
	if !event.Done {
		t.Error("StreamEvent Done not set correctly")
	}
}

func TestProviderConfig(t *testing.T) {
	cfg := &ProviderConfig{
		Provider: "openai",
		APIKey:   "key",
		BaseURL:  "https://api.openai.com/v1",
		Model:    "gpt-4",
	}
	if cfg.Provider != "openai" {
		t.Error("ProviderConfig fields not set correctly")
	}
}
