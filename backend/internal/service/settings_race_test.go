package service

import (
	"path/filepath"
	"sync"
	"testing"

	"clod-pet/backend/internal/settings"
)

func TestNewOwnsInitialSettingsSnapshot(t *testing.T) {
	cfg := settings.DefaultConfig()
	svc := New(t.TempDir(), filepath.Join(t.TempDir(), "settings.json"), cfg)
	cfg.Volume = 0.99
	cfg.LLM.Model = "outside mutation"
	got := svc.Settings()
	if got["Volume"] == cfg.Volume {
		t.Fatal("constructor retained shared mutable caller settings")
	}
	if svc.llmConfigSnapshot().Model == cfg.LLM.Model {
		t.Fatal("constructor retained shared mutable LLM settings")
	}
}

func TestSettingsReadersObserveCoherentConcurrentUpdates(t *testing.T) {
	svc := New(t.TempDir(), filepath.Join(t.TempDir(), "settings.json"), settings.DefaultConfig())
	var wg sync.WaitGroup
	start := make(chan struct{})
	errs := make(chan string, 128)

	// Each pair belongs to one transaction. A reader cannot observe a partially
	// published SetSettings update, even while volume and scale callers run.
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		for i := 1; i <= 160; i++ {
			value := float64(i)
			if err := svc.SetSettings(map[string]interface{}{
				"Scale": value, "GravityFactor": value,
			}); err != nil {
				errs <- err.Error()
				return
			}
		}
	}()
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		for i := 0; i < 160; i++ {
			if err := svc.UpdateVolume(float64(i) / 160.0); err != nil {
				errs <- err.Error()
				return
			}
		}
	}()
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		for i := 0; i < 160; i++ {
			_ = svc.llmConfigSnapshot()
			got := svc.Settings()
			_ = got["Volume"]
			_ = got["LLM"]
		}
	}()
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent settings action failed: %s", err)
	}
}

func TestSettingsSnapshotUsesOneTransaction(t *testing.T) {
	cfg := settings.DefaultConfig()
	cfg.GravityFactor = cfg.Scale
	svc := New(t.TempDir(), filepath.Join(t.TempDir(), "settings.json"), cfg)
	const iterations = 200
	var wg sync.WaitGroup
	start := make(chan struct{})
	var inconsistent bool
	var checkMu sync.Mutex

	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		for i := 1; i <= iterations; i++ {
			v := float64(i)
			if err := svc.SetSettings(map[string]interface{}{
				"Scale": v, "GravityFactor": v,
			}); err != nil {
				t.Errorf("write failed: %v", err)
				return
			}
		}
	}()
	go func() {
		defer wg.Done()
		<-start
		for i := 0; i < iterations; i++ {
			got := svc.Settings()
			if got["Scale"] != got["GravityFactor"] {
				checkMu.Lock()
				inconsistent = true
				checkMu.Unlock()
			}
		}
	}()
	close(start)
	wg.Wait()
	if inconsistent {
		t.Fatal("Settings returned a torn Scale/GravityFactor pair")
	}
}

func TestUpdateVolumeSaveFailureDoesNotModifyLiveSettings(t *testing.T) {
	invalidFilePath := t.TempDir() // The save target is a directory, not a file.
	cfg := settings.DefaultConfig()
	svc := New(t.TempDir(), invalidFilePath, cfg)
	before := svc.Settings()["Volume"]
	if err := svc.UpdateVolume(0.9); err == nil {
		t.Fatal("expected settings save failure")
	}
	if got := svc.Settings()["Volume"]; got != before {
		t.Fatalf("failed UpdateVolume changed live value: got %v, want %v", got, before)
	}
}

func TestUpdateScaleSaveFailureDoesNotModifyLiveSettings(t *testing.T) {
	invalidFilePath := t.TempDir()
	cfg := settings.DefaultConfig()
	svc := New(t.TempDir(), invalidFilePath, cfg)
	before := svc.Settings()["Scale"]
	if err := svc.UpdateScale(2.5); err == nil {
		t.Fatal("expected settings save failure")
	}
	if got := svc.Settings()["Scale"]; got != before {
		t.Fatalf("failed UpdateScale changed live value: got %v, want %v", got, before)
	}
}
