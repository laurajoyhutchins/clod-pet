package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"clod-pet/backend/internal/cliutil"
	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/pet"
)

func main() {
	fs := flag.NewFlagSet("pet-simulate", flag.ExitOnError)
	petDir := fs.String("pet", "", "pet directory")
	steps := fs.Int("n", 1, "number of steps")
	spawnID := fs.Int("spawn", 0, "spawn id")
	verbose := fs.Bool("v", false, "print raw JSON")
	_ = fs.Parse(os.Args[1:])

	if *petDir == "" {
		fmt.Fprintln(os.Stderr, "-pet is required")
		os.Exit(2)
	}
	if *steps <= 0 {
		fmt.Fprintln(os.Stderr, "-n must be greater than zero")
		os.Exit(2)
	}

	absDir, err := filepath.Abs(*petDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "resolve pet dir:", err)
		os.Exit(1)
	}

	def, err := pet.LoadPet(absDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "load pet:", err)
		os.Exit(1)
	}

	eng := engine.NewEngine(def)
	if err := eng.Start(*spawnID, cliutil.DefaultWorld()); err != nil {
		fmt.Fprintln(os.Stderr, "start engine:", err)
		os.Exit(1)
	}

	world := cliutil.DefaultWorld()
	printStep("start", eng, nil, *verbose, 0)
	for i := 0; i < *steps; i++ {
		state, err := eng.Step(world)
		if err != nil {
			fmt.Fprintln(os.Stderr, "step:", err)
			os.Exit(1)
		}
		printStep("step", eng, state, *verbose, i+1)
	}
}

func printStep(prefix string, eng *engine.Engine, state *engine.StepResult, verbose bool, step int) {
	anim := eng.CurrentAnim()
	animName := ""
	if def := eng.PetDef(); def != nil {
		if entry, ok := def.Animations[anim]; ok {
			animName = entry.Name
		}
	}

	if state == nil {
		fmt.Printf("%s anim=%s(%d)\n", prefix, animName, anim)
		return
	}

	fmt.Printf(
		"%s=%d anim=%s(%d) frame=%d pos=(%.0f,%.0f) border=%s interval=%dms flip=%t opacity=%.2f next=%d\n",
		prefix,
		step,
		animName,
		anim,
		state.FrameIndex,
		state.X,
		state.Y,
		cliutil.BorderLabel(state.BorderCtx),
		state.IntervalMs,
		state.ShouldFlip,
		state.Opacity,
		state.NextAnimID,
	)
	if verbose {
		data, _ := json.MarshalIndent(state, "", "  ")
		fmt.Println(string(data))
	}
}
