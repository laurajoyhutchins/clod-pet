package sound

import (
	"testing"
)

func TestPickSoundEmpty(t *testing.T) {
	result := PickSound(nil)
	if result != nil {
		t.Error("expected nil for empty slice")
	}

	result = PickSound([]SoundEntry{})
	if result != nil {
		t.Error("expected nil for empty slice")
	}
}

func TestPickSoundSingle(t *testing.T) {
	sounds := []SoundEntry{
		{AnimationID: 1, Probability: 100},
	}
	result := PickSound(sounds)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.AnimationID != 1 {
		t.Errorf("expected AnimationID 1, got %v", result.AnimationID)
	}
}

func TestPickSoundMultiple(t *testing.T) {
	sounds := []SoundEntry{
		{AnimationID: 1, Probability: 50},
		{AnimationID: 2, Probability: 50},
	}

	// Run multiple times to ensure it picks something
	found := make(map[int]bool)
	for i := 0; i < 100; i++ {
		result := PickSound(sounds)
		if result != nil {
			found[result.AnimationID] = true
		}
	}

	if len(found) == 0 {
		t.Error("no sounds were picked")
	}
}

func TestPickSoundZeroProbability(t *testing.T) {
	sounds := []SoundEntry{
		{AnimationID: 1, Probability: 0},
		{AnimationID: 2, Probability: 0},
	}
	result := PickSound(sounds)
	if result != nil {
		t.Error("expected nil when all probabilities are zero")
	}
}

func TestSoundEntry(t *testing.T) {
	entry := SoundEntry{
		AnimationID: 1,
		Probability: 100,
		Loop:        2,
		Data:        []byte("test"),
	}
	if entry.AnimationID != 1 {
		t.Error("SoundEntry fields not set correctly")
	}
}

func TestPayloadForWAV(t *testing.T) {
	data := append([]byte("RIFF\x24\x00\x00\x00WAVE"), make([]byte, 16)...)
	payload := PayloadFor(&SoundEntry{Data: data})
	if payload == nil {
		t.Fatal("expected payload")
	}
	if payload.MIMEType != "audio/wav" {
		t.Errorf("MIMEType = %q, want audio/wav", payload.MIMEType)
	}
	if string(payload.Data[:4]) != "RIFF" {
		t.Errorf("payload did not preserve WAV header")
	}
}

func TestPayloadForMP3(t *testing.T) {
	payload := PayloadFor(&SoundEntry{Data: []byte("ID3test")})
	if payload == nil {
		t.Fatal("expected payload")
	}
	if payload.MIMEType != "audio/mpeg" {
		t.Errorf("MIMEType = %q, want audio/mpeg", payload.MIMEType)
	}
}

func TestPayloadForRawPCMWrapsWAV(t *testing.T) {
	payload := PayloadFor(&SoundEntry{Data: make([]byte, 1024), Loop: 2})
	if payload == nil {
		t.Fatal("expected payload")
	}
	if payload.MIMEType != "audio/wav" {
		t.Errorf("MIMEType = %q, want audio/wav", payload.MIMEType)
	}
	if string(payload.Data[:4]) != "RIFF" || string(payload.Data[8:12]) != "WAVE" {
		t.Errorf("raw PCM was not wrapped as WAV")
	}
	if payload.Loop != 2 {
		t.Errorf("Loop = %d, want 2", payload.Loop)
	}
}

func TestPayloadForEmpty(t *testing.T) {
	if payload := PayloadFor(nil); payload != nil {
		t.Error("expected nil payload for nil entry")
	}
	if payload := PayloadFor(&SoundEntry{}); payload != nil {
		t.Error("expected nil payload for empty data")
	}
}
