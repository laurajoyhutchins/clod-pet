package llm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/goccy/go-json"
)

// BenchmarkChatRequestSerialization measures request serialization throughput.
func BenchmarkChatRequestSerialization(b *testing.B) {
	req := &ChatRequest{
		Messages: []Message{
			{Role: "system", Content: "You are a helpful assistant."},
			{Role: "user", Content: "Hello, how are you?"},
			{Role: "assistant", Content: "I'm doing well, thank you!"},
			{Role: "user", Content: "Can you help me with Go benchmarks?"},
		},
		Stream: false,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(req)
	}
}

// BenchmarkChatRequestDeserialization measures request deserialization throughput.
func BenchmarkChatRequestDeserialization(b *testing.B) {
	data := []byte(`{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false
}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var req ChatRequest
		_ = json.Unmarshal(data, &req)
	}
}

// BenchmarkChatResponseDeserialization measures response deserialization throughput.
func BenchmarkChatResponseDeserialization(b *testing.B) {
	data := []byte(`{
  "content": "Hello! How can I help you today?",
  "model": "gpt-4"
}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var resp ChatResponse
		_ = json.Unmarshal(data, &resp)
	}
}

// BenchmarkMessageSerialization measures Message slice serialization.
func BenchmarkMessageSerialization(b *testing.B) {
	messages := []Message{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "What is 2+2?"},
		{Role: "assistant", Content: "2+2 equals 4."},
		{Role: "user", Content: "Thanks!"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(messages)
	}
}

// BenchmarkStreamEventSerialization measures StreamEvent serialization.
func BenchmarkStreamEventSerialization(b *testing.B) {
	event := StreamEvent{
		Content: "Hello world",
		Done:    false,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(event)
	}
}

// BenchmarkOpenAIChatNonNetwork measures OpenAI request/response serialization without network.
func BenchmarkOpenAIChatNonNetwork(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req ChatRequest
		json.NewDecoder(r.Body).Decode(&req)

		resp := ChatResponse{
			Content: "Hello world",
			Model:   "gpt-4",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := newOpenAIClient(&ProviderConfig{
		Provider: "openai",
		APIKey:   "test-key",
		BaseURL:  server.URL,
	})

	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "Hi"}},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = client.Chat(context.Background(), req)
	}
}

// BenchmarkOllamaChatNonNetwork measures Ollama request/response serialization without network.
func BenchmarkOllamaChatNonNetwork(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req ChatRequest
		json.NewDecoder(r.Body).Decode(&req)

		resp := ChatResponse{
			Content: "Hello world",
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := newOllamaClient(&ProviderConfig{
		Provider: "ollama",
		BaseURL:  server.URL,
	})

	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "Hi"}},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = client.Chat(context.Background(), req)
	}
}

// BenchmarkAnthropicChatNonNetwork measures Anthropic request/response serialization without network.
func BenchmarkAnthropicChatNonNetwork(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"content": [{"text": "Hello world"}], "model": "claude-3", "role": "assistant"}`)
	}))
	defer server.Close()

	client, _ := newAnthropicClient(&ProviderConfig{
		Provider: "anthropic",
		APIKey:   "test-key",
		BaseURL:  server.URL,
	})

	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "Hi"}},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = client.Chat(context.Background(), req)
	}
}

// BenchmarkGeminiChatNonNetwork measures Gemini request/response serialization without network.
func BenchmarkGeminiChatNonNetwork(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"candidates": [{"content": {"parts": [{"text": "Hello world"}]}}]}`)
	}))
	defer server.Close()

	client, _ := newGeminiClient(&ProviderConfig{
		Provider: "gemini",
		APIKey:   "test-key",
		BaseURL:  server.URL,
	})

	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "Hi"}},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = client.Chat(context.Background(), req)
	}
}

// BenchmarkStreamChatOpenAI measures streaming response serialization for OpenAI.
func BenchmarkStreamChatOpenAI(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}}]}\n\n")
		fmt.Fprintf(w, "data: {\"choices\": [{\"delta\": {\"content\": \" world\"}}]}\n\n")
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client, _ := newOpenAIClient(&ProviderConfig{
		Provider: "openai",
		APIKey:   "test-key",
		BaseURL:  server.URL,
	})

	req := &ChatRequest{
		Messages: []Message{{Role: "user", Content: "Hi"}},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ch, _ := client.StreamChat(context.Background(), req)
		for range ch {
			// Consume the stream
		}
	}
}

// BenchmarkLargeMessageSerialization measures serialization with large content.
func BenchmarkLargeMessageSerialization(b *testing.B) {
	// Create a large message (simulating long conversation)
	content := strings.Repeat("This is a test message. ", 100)
	messages := []Message{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: content},
	}

	req := &ChatRequest{
		Messages: messages,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(req)
	}
}

// BenchmarkMultipleProviderSerialization compares serialization across providers.
func BenchmarkMultipleProviderSerialization(b *testing.B) {
	req := &ChatRequest{
		Messages: []Message{
			{Role: "user", Content: "Hello"},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// OpenAI format
		_, _ = json.Marshal(req)
		// Ollama format (same struct)
		_, _ = json.Marshal(req)
		// Anthropic format (same struct)
		_, _ = json.Marshal(req)
	}
}
