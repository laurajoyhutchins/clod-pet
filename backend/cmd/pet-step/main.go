package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"clod-pet/backend/internal/cliutil"
	"clod-pet/backend/internal/ipc"
)

func main() {
	fs := flag.NewFlagSet("pet-step", flag.ExitOnError)
	petID := fs.String("pet", "", "pet id")
	steps := fs.Int("n", 1, "number of steps")
	port := fs.Int("port", 0, "backend port")
	verbose := fs.Bool("v", false, "print raw JSON")
	_ = fs.Parse(os.Args[1:])

	if *petID == "" {
		fmt.Fprintln(os.Stderr, "-pet is required")
		os.Exit(2)
	}
	if *steps <= 0 {
		fmt.Fprintln(os.Stderr, "-n must be greater than zero")
		os.Exit(2)
	}

	if *port == 0 {
		detected, err := cliutil.DetectPort()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		*port = detected
	}

	client := cliutil.NewClient(*port)
	world := cliutil.DefaultWorld()

	for i := 0; i < *steps; i++ {
		state, err := client.StepPet(*petID, world)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if state == nil {
			fmt.Printf("%s step=%d no state returned\n", *petID, i+1)
			continue
		}
		printState(*petID, i+1, state, *verbose)
	}
}

func printState(petID string, step int, state *ipc.PetState, verbose bool) {
	label := cliutil.BorderLabel(state.BorderCtx)
	fmt.Printf(
		"%s step=%d anim=%s(%d) frame=%d pos=(%.0f,%.0f) border=%s interval=%dms\n",
		petID,
		step,
		state.CurrentAnimName,
		state.CurrentAnimID,
		state.FrameIndex,
		state.X,
		state.Y,
		label,
		state.IntervalMs,
	)
	if verbose {
		data, _ := json.MarshalIndent(state, "", "  ")
		fmt.Println(string(data))
	}
}
