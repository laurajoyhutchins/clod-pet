package sound

import (
	"encoding/base64"
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

func TestPlayBase64PCMInvalid(t *testing.T) {
	p, err := NewPlayer(44100, 0.5)
	if err != nil {
		t.Skip("oto context not available")
	}
	defer p.Release()

	err = p.PlayBase64PCM("invalid base64!")
	if err == nil {
		t.Error("expected error for invalid base64")
	}
}

func TestPlayBase64PCMValid(t *testing.T) {
	p, err := NewPlayer(44100, 0.5)
	if err != nil {
		t.Skip("oto context not available")
	}
	defer p.Release()

	// Silence as base64 (small buffer of zeros)
	silence := base64.StdEncoding.EncodeToString(make([]byte, 1024))
	err = p.PlayBase64PCM(silence)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestUpdateVolume(t *testing.T) {
	p, err := NewPlayer(44100, 0.5)
	if err != nil {
		t.Skip("oto context not available")
	}
	defer p.Release()

	p.UpdateVolume(0.8)
	// No easy way to verify, just ensure no panic
}

func TestPlayRawPCM(t *testing.T) {
	p, err := NewPlayer(44100, 0.5)
	if err != nil {
		t.Skip("oto context not available")
	}
	defer p.Release()

	err = p.PlayRawPCM(make([]byte, 1024))
	if err != nil {
		t.Errorf("unexpected error: %v", err)
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
