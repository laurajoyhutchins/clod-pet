package cliutil

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

type WorldMeta struct {
	Screen   engine.Rect `json:"screen"`
	WorkArea engine.Rect `json:"work_area"`
	Desktop  engine.Rect `json:"desktop"`
}

func NewClient(port int) *Client {
	return &Client{
		BaseURL: fmt.Sprintf("http://127.0.0.1:%d", port),
		HTTP: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *Client) post(command string, payload any) (*ipc.Response, error) {
	body := map[string]any{
		"command": command,
	}
	if payload != nil {
		body["payload"] = payload
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/api", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var out ipc.Response
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if !out.OK {
		if out.Error != "" {
			return nil, errors.New(out.Error)
		}
		return nil, fmt.Errorf("backend command failed")
	}
	return &out, nil
}

func (c *Client) StepPet(petID string, world engine.WorldContext) (*ipc.PetState, error) {
	resp, err := c.post(string(ipc.CmdStepPet), ipc.StepPetPayload{PetID: petID, World: world})
	if err != nil {
		return nil, err
	}
	if len(resp.Payload) == 0 {
		return nil, nil
	}
	var state ipc.PetState
	if err := json.Unmarshal(resp.Payload, &state); err != nil {
		return nil, fmt.Errorf("decode pet state: %w", err)
	}
	return &state, nil
}

func (c *Client) DragPet(petID string, x, y float64) error {
	_, err := c.post(string(ipc.CmdDragPet), ipc.DragPetPayload{PetID: petID, X: x, Y: y})
	return err
}

func (c *Client) DropPet(petID string) error {
	_, err := c.post(string(ipc.CmdDropPet), ipc.DropPetPayload{PetID: petID})
	return err
}

func (c *Client) ListActive() ([]map[string]any, error) {
	resp, err := c.post(string(ipc.CmdListActive), nil)
	if err != nil {
		return nil, err
	}
	var active []map[string]any
	if err := json.Unmarshal(resp.Payload, &active); err != nil {
		return nil, fmt.Errorf("decode active pets: %w", err)
	}
	return active, nil
}

func (c *Client) Version() (map[string]any, error) {
	req, err := http.NewRequest(http.MethodGet, c.BaseURL+"/api/version", nil)
	if err != nil {
		return nil, fmt.Errorf("create version request: %w", err)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read version response: %w", err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("decode version response: %w", err)
	}
	if ok, _ := out["ok"].(bool); !ok {
		return nil, fmt.Errorf("backend not ready")
	}
	return out, nil
}

func DetectPort() (int, error) {
	if raw := os.Getenv("PORT"); raw != "" {
		if port, err := strconv.Atoi(raw); err == nil && port > 0 {
			if _, err := NewClient(port).Version(); err == nil {
				return port, nil
			}
		}
	}

	for port := 8080; port <= 8099; port++ {
		if _, err := NewClient(port).Version(); err == nil {
			return port, nil
		}
	}

	return 0, fmt.Errorf("could not detect a running backend port")
}

func DefaultWorld() engine.WorldContext {
	return engine.WorldContext{
		Screen:   engine.Rect{X: 0, Y: 0, W: 1920, H: 1080},
		WorkArea: engine.Rect{X: 0, Y: 0, W: 1920, H: 1080},
		Desktop:  engine.Rect{X: 0, Y: 0, W: 1920, H: 1080},
	}
}

func BorderLabel(ctx engine.BorderContext) string {
	switch ctx {
	case engine.ContextFloor:
		return "floor"
	case engine.ContextCeiling:
		return "ceiling"
	case engine.ContextWalls:
		return "walls"
	case engine.ContextObstacle:
		return "obstacle"
	default:
		return ""
	}
}
