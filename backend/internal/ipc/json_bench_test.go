package ipc

import (
	"bytes"
	"testing"

	"github.com/goccy/go-json"
)

type BenchmarkRequest struct {
	Command string                 `json:"command"`
	Args    map[string]interface{} `json:"args"`
}

type BenchmarkResponse struct {
	Status  string      `json:"status"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func BenchmarkJSONMarshal(b *testing.B) {
	req := BenchmarkRequest{
		Command: "add_pet",
		Args: map[string]interface{}{
			"pet_id":  "test-pet",
			"x":       100,
			"y":       200,
			"scale":   1.5,
			"visible": true,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(req)
	}
}

func BenchmarkJSONUnmarshal(b *testing.B) {
	data := []byte(`{"command":"add_pet","args":{"pet_id":"test-pet","x":100,"y":200,"scale":1.5,"visible":true}}`)

	var req BenchmarkRequest
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = json.Unmarshal(data, &req)
	}
}

func BenchmarkJSONRoundtrip(b *testing.B) {
	req := BenchmarkRequest{
		Command: "add_pet",
		Args: map[string]interface{}{
			"pet_id":  "test-pet",
			"x":       100,
			"y":       200,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		data, _ := json.Marshal(req)
		var decoded BenchmarkRequest
		_ = json.Unmarshal(data, &decoded)
	}
}

func BenchmarkJSONWriteToBuffer(b *testing.B) {
	resp := BenchmarkResponse{
		Status: "ok",
		Data: map[string]interface{}{
			"pet_id": "test-pet",
			"state":  "idle",
		},
	}

	buf := new(bytes.Buffer)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buf.Reset()
		_ = json.NewEncoder(buf).Encode(resp)
	}
}
