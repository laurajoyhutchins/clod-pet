package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"clod-pet/backend/internal/cliutil"
)

func main() {
	fs := flag.NewFlagSet("pet-watch", flag.ExitOnError)
	petID := fs.String("pet", "", "pet id")
	interval := fs.Duration("i", 200*time.Millisecond, "step interval")
	port := fs.Int("port", 0, "backend port")
	verbose := fs.Bool("v", false, "print raw JSON")
	_ = fs.Parse(os.Args[1:])

	if *petID == "" {
		fmt.Fprintln(os.Stderr, "-pet is required")
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	step := 0
	var prevY float64
	var havePrev bool
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			step++
			state, err := client.StepPet(*petID, world)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			if state == nil {
				fmt.Printf("%s step=%d no state returned\n", *petID, step)
				continue
			}
			dy := 0.0
			if havePrev {
				dy = state.Y - prevY
			}
			prevY = state.Y
			havePrev = true
			fmt.Printf(
				"%s step=%d anim=%s(%d) frame=%d pos=(%.0f,%.0f) dy=%+.0f border=%s interval=%dms\n",
				*petID,
				step,
				state.CurrentAnimName,
				state.CurrentAnimID,
				state.FrameIndex,
				state.X,
				state.Y,
				dy,
				cliutil.BorderLabel(state.BorderCtx),
				state.IntervalMs,
			)
			if *verbose {
				data, _ := json.MarshalIndent(state, "", "  ")
				fmt.Println(string(data))
			}
		}
	}
}
