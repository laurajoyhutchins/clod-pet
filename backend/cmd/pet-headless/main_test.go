package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clod-pet/backend/internal/cliutil"
	"clod-pet/backend/internal/engine"
)

func TestPetListFlagSupportsRepeatedValues(t *testing.T) {
	var pets petListFlag

	if err := pets.Set("one"); err != nil {
		t.Fatalf("Set(one) returned error: %v", err)
	}
	if err := pets.Set("two"); err != nil {
		t.Fatalf("Set(two) returned error: %v", err)
	}

	if got, want := len(pets), 2; got != want {
		t.Fatalf("len(pets) = %d, want %d", got, want)
	}
	if pets[0] != "one" || pets[1] != "two" {
		t.Fatalf("pets = %#v, want [one two]", pets)
	}
}

func TestJSONLEventIncludesNullState(t *testing.T) {
	data, err := json.Marshal(jsonlEvent{
		Event: "step",
		Step:  3,
		World: cliutil.WorldMeta{},
	})
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}

	got := string(data)
	if !strings.Contains(got, `"event":"step"`) {
		t.Fatalf("missing event field in %s", got)
	}
	if !strings.Contains(got, `"state":null`) {
		t.Fatalf("missing null state in %s", got)
	}
}

func TestSpawnForPetUsesDefaultWhenNoOverrides(t *testing.T) {
	got, err := spawnForPet("a", 0, 7, nil)
	if err != nil {
		t.Fatalf("spawnForPet returned error: %v", err)
	}
	if got != 7 {
		t.Fatalf("spawnForPet = %d, want 7", got)
	}
}

func TestSpawnForPetUsesBroadcastOverride(t *testing.T) {
	got, err := spawnForPet("a", 1, 7, []int{3})
	if err != nil {
		t.Fatalf("spawnForPet returned error: %v", err)
	}
	if got != 3 {
		t.Fatalf("spawnForPet = %d, want 3", got)
	}
}

func TestSpawnForPetUsesPerPetOverride(t *testing.T) {
	got, err := spawnForPet("b", 1, 7, []int{3, 4})
	if err != nil {
		t.Fatalf("spawnForPet returned error: %v", err)
	}
	if got != 4 {
		t.Fatalf("spawnForPet = %d, want 4", got)
	}
}

func TestBuildWorldUsesCustomGeometry(t *testing.T) {
	world := buildWorld(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)

	if world.Screen != (engine.Rect{X: 1, Y: 2, W: 3, H: 4}) {
		t.Fatalf("screen = %#v", world.Screen)
	}
	if world.WorkArea != (engine.Rect{X: 5, Y: 6, W: 7, H: 8}) {
		t.Fatalf("work area = %#v", world.WorkArea)
	}
	if world.Desktop != (engine.Rect{X: 9, Y: 10, W: 11, H: 12}) {
		t.Fatalf("desktop = %#v", world.Desktop)
	}
}

func TestJSONLSinkWritesToFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "trace.jsonl")

	sink, err := newJSONLSink(path)
	if err != nil {
		t.Fatalf("newJSONLSink returned error: %v", err)
	}
	defer func() {
		if err := sink.Close(); err != nil {
			t.Fatalf("Close returned error: %v", err)
		}
	}()

	if err := sink.WriteEvent(jsonlEvent{Event: "run", Step: 0, PetCount: 1}); err != nil {
		t.Fatalf("WriteEvent returned error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}

	if !strings.Contains(string(data), `"event":"run"`) {
		t.Fatalf("jsonl output missing event: %s", string(data))
	}
}
