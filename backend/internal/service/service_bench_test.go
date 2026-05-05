package service

import (
	"testing"

	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/settings"
)

// BenchmarkAddPet measures AddPet() orchestration cost.
func BenchmarkAddPet(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		state, err := svc.AddPet("../../../pets/eSheep-modern", 0)
		if err != nil {
			b.Fatalf("AddPet failed: %v", err)
		}
		svc.RemovePet(state.PetID)
	}
}

// BenchmarkStepPet measures StepPet() orchestration cost.
func BenchmarkStepPet(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)
	state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.StepPet(state.PetID, engine.WorldContext{})
		if err != nil {
			b.Fatalf("StepPet failed: %v", err)
		}
	}
}

// BenchmarkStepPetMultiPet measures StepPet() cost with 5 concurrent pets.
func BenchmarkStepPetMultiPet5(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	petIDs := make([]string, 5)
	for i := 0; i < 5; i++ {
		state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)
		petIDs[i] = state.PetID
	}

	world := engine.WorldContext{
		Screen: engine.Rect{W: 1920, H: 1080},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		states, err := svc.StepPets(petIDs, world)
		if err != nil {
			b.Fatalf("StepPets failed: %v", err)
		}
		_ = len(states)
	}
}

// BenchmarkStepPetMultiPet10 measures StepPet() cost with 10 concurrent pets.
func BenchmarkStepPetMultiPet10(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	petIDs := make([]string, 10)
	for i := 0; i < 10; i++ {
		state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)
		petIDs[i] = state.PetID
	}

	world := engine.WorldContext{
		Screen: engine.Rect{W: 1920, H: 1080},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		states, err := svc.StepPets(petIDs, world)
		if err != nil {
			b.Fatalf("StepPets failed: %v", err)
		}
		_ = len(states)
	}
}

// BenchmarkStepPetConcurrent measures StepPet() under concurrent access.
func BenchmarkStepPetConcurrent(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)
	state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)

	const workers = 8
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = svc.StepPet(state.PetID, engine.WorldContext{})
		}
	})
}

// BenchmarkStatus measures Status() call overhead.
func BenchmarkStatus(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)
	svc.AddPet("../../../pets/eSheep-modern", 0)
	svc.AddPet("../../../pets/eSheep-modern", 0)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = svc.Status()
	}
}

// BenchmarkListActive measures ListActive() call overhead.
func BenchmarkListActive(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)
	svc.AddPet("../../../pets/eSheep-modern", 0)
	svc.AddPet("../../../pets/eSheep-modern", 0)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.ListActive()
	}
}

// BenchmarkRemovePet measures RemovePet() overhead.
func BenchmarkRemovePet(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)
		svc.RemovePet(state.PetID)
	}
}

// BenchmarkStepPetsEmpty measures StepPets with empty list.
func BenchmarkStepPetsEmpty(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = svc.StepPets([]string{}, engine.WorldContext{})
	}
}

// BenchmarkResourceUsage5Pets measures resource usage patterns with 5 pets.
func BenchmarkResourceUsage5Pets(b *testing.B) {
	cfg := settings.DefaultConfig()
	svc := New("../../../pets", "bench-settings.json", cfg)

	// Add 5 pets
	for i := 0; i < 5; i++ {
		svc.AddPet("../../../pets/eSheep-modern", 0)
	}

	active, _ := svc.ListActive()
	petIDs := make([]string, len(active))
	for i, a := range active {
		petIDs[i] = a["pet_id"].(string)
	}

	world := engine.WorldContext{
		Screen: engine.Rect{W: 1920, H: 1080},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		states, err := svc.StepPets(petIDs, world)
		if err != nil {
			b.Fatalf("StepPets failed: %v", err)
		}
		// Simulate some processing on results
		for _, s := range states {
			_ = s.PetID
			_ = s.CurrentAnimID
		}
	}
}

// BenchmarkConcurrentMultiPetAdd measures concurrent AddPet calls.
func BenchmarkConcurrentMultiPetAdd(b *testing.B) {
	cfg := settings.DefaultConfig()

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			svc := New("../../../pets", "bench-settings.json", cfg)
			state, _ := svc.AddPet("../../../pets/eSheep-modern", 0)
			_, _ = svc.StepPet(state.PetID, engine.WorldContext{})
		}
	})
}
