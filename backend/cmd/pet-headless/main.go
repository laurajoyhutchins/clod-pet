package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"clod-pet/backend/internal/cliutil"
	"clod-pet/backend/internal/engine"
	"clod-pet/backend/internal/ipc"
	"clod-pet/backend/internal/service"
	"clod-pet/backend/internal/settings"
)

type petListFlag []string

func (p *petListFlag) String() string {
	return strings.Join(*p, ",")
}

func (p *petListFlag) Set(value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("pet path cannot be empty")
	}
	*p = append(*p, value)
	return nil
}

type intListFlag []int

func (p *intListFlag) String() string {
	if len(*p) == 0 {
		return ""
	}
	parts := make([]string, 0, len(*p))
	for _, v := range *p {
		parts = append(parts, strconv.Itoa(v))
	}
	return strings.Join(parts, ",")
}

func (p *intListFlag) Set(value string) error {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fmt.Errorf("invalid spawn id %q: %w", value, err)
	}
	*p = append(*p, n)
	return nil
}

type jsonlEvent struct {
	Event      string            `json:"event"`
	Step       int               `json:"step"`
	PetID      string            `json:"pet_id,omitempty"`
	PetPath    string            `json:"pet_path,omitempty"`
	SpawnID    int               `json:"spawn_id,omitempty"`
	Seed       int64             `json:"seed,omitempty"`
	IntervalMs int               `json:"interval_ms,omitempty"`
	PetCount   int               `json:"pet_count,omitempty"`
	World      cliutil.WorldMeta `json:"world,omitempty"`
	State      *ipc.PetState     `json:"state"`
	Error      string            `json:"error,omitempty"`
}

type jsonlSink struct {
	w  io.Writer
	f  *os.File
	bw *bufio.Writer
}

func newJSONLSink(path string) (*jsonlSink, error) {
	if path == "" {
		return &jsonlSink{w: os.Stdout}, nil
	}

	file, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	return &jsonlSink{
		w:  file,
		f:  file,
		bw: bufio.NewWriter(file),
	}, nil
}

func (s *jsonlSink) WriteEvent(event jsonlEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal jsonl event: %w", err)
	}

	if s.bw != nil {
		if _, err := s.bw.Write(data); err != nil {
			return err
		}
		if err := s.bw.WriteByte('\n'); err != nil {
			return err
		}
		return s.bw.Flush()
	}

	_, err = fmt.Fprintln(s.w, string(data))
	return err
}

func (s *jsonlSink) Close() error {
	if s.bw != nil {
		if err := s.bw.Flush(); err != nil {
			return err
		}
	}
	if s.f != nil {
		return s.f.Close()
	}
	return nil
}

func main() {
	fs := flag.NewFlagSet("pet-headless", flag.ExitOnError)
	var petPaths petListFlag
	fs.Var(&petPaths, "pet", "pet directory (repeatable)")
	petsDir := fs.String("pets-dir", envOr("PETS_DIR", "../pets"), "pets directory")
	settingsPath := fs.String("settings", envOr("SETTINGS_PATH", "clod-pet-settings.json"), "settings path")
	spawnDefault := fs.Int("spawn-default", 0, "default spawn id when no per-pet spawn is supplied")
	var spawnIDs intListFlag
	fs.Var(&spawnIDs, "spawn", "spawn id for the corresponding -pet entry (repeatable)")
	steps := fs.Int("n", 0, "number of steps to run; 0 runs until interrupted")
	interval := fs.Duration("i", 200*time.Millisecond, "step interval")
	screenX := fs.Float64("screen-x", 0, "screen x coordinate")
	screenY := fs.Float64("screen-y", 0, "screen y coordinate")
	screenW := fs.Float64("screen-w", 1920, "screen width")
	screenH := fs.Float64("screen-h", 1080, "screen height")
	workAreaX := fs.Float64("work-area-x", 0, "work area x coordinate")
	workAreaY := fs.Float64("work-area-y", 0, "work area y coordinate")
	workAreaW := fs.Float64("work-area-w", 1920, "work area width")
	workAreaH := fs.Float64("work-area-h", 1080, "work area height")
	desktopX := fs.Float64("desktop-x", 0, "desktop x coordinate")
	desktopY := fs.Float64("desktop-y", 0, "desktop y coordinate")
	desktopW := fs.Float64("desktop-w", 1920, "desktop width")
	desktopH := fs.Float64("desktop-h", 1080, "desktop height")
	rawJSON := fs.Bool("json", false, "print raw JSON for each step")
	jsonl := fs.Bool("jsonl", false, "print JSONL records for replay and CI snapshots")
	jsonlFile := fs.String("jsonl-file", "", "write JSONL records to a file")
	seed := fs.Int64("seed", 1, "random seed for deterministic replay")
	verbose := fs.Bool("v", false, "print verbose JSON output")
	_ = fs.Parse(os.Args[1:])

	if len(petPaths) == 0 {
		fmt.Fprintln(os.Stderr, "-pet is required")
		os.Exit(2)
	}
	if *interval <= 0 {
		fmt.Fprintln(os.Stderr, "-i must be greater than zero")
		os.Exit(2)
	}
	if len(spawnIDs) > 0 && len(spawnIDs) != 1 && len(spawnIDs) != len(petPaths) {
		fmt.Fprintln(os.Stderr, "-spawn must be omitted, provided once, or provided once per -pet entry")
		os.Exit(2)
	}
	rand.Seed(*seed)

	cfg, err := settings.Load(*settingsPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "load settings:", err)
		os.Exit(1)
	}

	svc := service.New(*petsDir, *settingsPath, cfg)
	world := buildWorld(*screenX, *screenY, *screenW, *screenH, *workAreaX, *workAreaY, *workAreaW, *workAreaH, *desktopX, *desktopY, *desktopW, *desktopH)
	worldMeta := cliutil.WorldMeta{
		Screen:   world.Screen,
		WorkArea: world.WorkArea,
		Desktop:  world.Desktop,
	}

	jsonlEnabled := *jsonl || *jsonlFile != ""
	var jsonSink *jsonlSink
	if jsonlEnabled {
		jsonSink, err = newJSONLSink(*jsonlFile)
		if err != nil {
			fmt.Fprintln(os.Stderr, "open jsonl output:", err)
			os.Exit(1)
		}
		defer func() {
			if cerr := jsonSink.Close(); cerr != nil {
				fmt.Fprintln(os.Stderr, "close jsonl output:", cerr)
			}
		}()
	}

	runs := make([]petRun, 0, len(petPaths))
	for _, petPath := range petPaths {
		spawnID, err := spawnForPet(petPath, len(runs), *spawnDefault, spawnIDs)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		state, err := svc.AddPet(petPath, spawnID, world)
		if err != nil {
			fmt.Fprintln(os.Stderr, "add pet:", err)
			os.Exit(1)
		}
		runs = append(runs, petRun{path: petPath, spawnID: spawnID, state: state})
	}

	if jsonlEnabled {
		if err := jsonSink.WriteEvent(jsonlEvent{
			Event:      "run",
			Step:       0,
			Seed:       *seed,
			IntervalMs: int(interval.Milliseconds()),
			PetCount:   len(runs),
			World:      worldMeta,
		}); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}

	for _, run := range runs {
		if err := printStart(run.path, run.spawnID, run.state, *rawJSON, jsonlEnabled, *verbose, worldMeta, *seed, jsonSink); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	step := 0
	for {
		if *steps > 0 && step >= *steps {
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			step++
			for i := range runs {
				state, err := svc.StepPet(runs[i].state.PetID, world)
				if err != nil {
					fmt.Fprintln(os.Stderr, "step pet:", err)
					os.Exit(1)
				}
				runs[i].state = state
				if err := printStep(step, runs[i].path, runs[i].spawnID, runs[i].state, *rawJSON, jsonlEnabled, *verbose, worldMeta, *seed, jsonSink); err != nil {
					fmt.Fprintln(os.Stderr, err)
					os.Exit(1)
				}
			}
		}
	}
}

type petRun struct {
	path    string
	spawnID int
	state   *ipc.PetState
}

func printStart(petPath string, spawnID int, state *ipc.PetState, rawJSON, jsonl, verbose bool, world cliutil.WorldMeta, seed int64, sink *jsonlSink) error {
	if jsonl {
		return sink.WriteEvent(jsonlEvent{
			Event:   "start",
			Step:    0,
			PetID:   state.PetID,
			PetPath: petPath,
			SpawnID: spawnID,
			Seed:    seed,
			World:   world,
			State:   state,
		})
	}

	return printState(petPath, "start", 0, state, rawJSON, verbose)
}

func printStep(step int, petPath string, spawnID int, state *ipc.PetState, rawJSON, jsonl, verbose bool, world cliutil.WorldMeta, seed int64, sink *jsonlSink) error {
	if jsonl {
		if state == nil {
			return sink.WriteEvent(jsonlEvent{
				Event:   "step",
				Step:    step,
				PetPath: petPath,
				SpawnID: spawnID,
				Seed:    seed,
				World:   world,
				State:   nil,
			})
		}
		return sink.WriteEvent(jsonlEvent{
			Event:   "step",
			Step:    step,
			PetID:   state.PetID,
			PetPath: petPath,
			SpawnID: spawnID,
			Seed:    seed,
			World:   world,
			State:   state,
		})
	}

	if state == nil {
		fmt.Printf("%s step=%d no state returned\n", petPath, step)
		return nil
	}
	return printState(petPath, "step", step, state, rawJSON, verbose)
}

func printState(petPath, prefix string, step int, state *ipc.PetState, rawJSON, verbose bool) error {
	if rawJSON || verbose {
		data, err := json.MarshalIndent(state, "", "  ")
		if err != nil {
			return fmt.Errorf("marshal step output: %w", err)
		}
		fmt.Println(string(data))
		return nil
	}

	fmt.Printf(
		"%s %s=%d anim=%s(%d) frame=%d pos=(%.0f,%.0f) border=%s interval=%dms flip=%t opacity=%.2f next=%d\n",
		petPath,
		prefix,
		step,
		state.CurrentAnimName,
		state.CurrentAnimID,
		state.FrameIndex,
		state.X,
		state.Y,
		cliutil.BorderLabel(state.BorderCtx),
		state.IntervalMs,
		state.FlipH,
		state.Opacity,
		state.NextAnimID,
	)
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func buildWorld(
	screenX, screenY, screenW, screenH float64,
	workAreaX, workAreaY, workAreaW, workAreaH float64,
	desktopX, desktopY, desktopW, desktopH float64,
) engine.WorldContext {
	return engine.WorldContext{
		Screen:   engine.Rect{X: screenX, Y: screenY, W: screenW, H: screenH},
		WorkArea: engine.Rect{X: workAreaX, Y: workAreaY, W: workAreaW, H: workAreaH},
		Desktop:  engine.Rect{X: desktopX, Y: desktopY, W: desktopW, H: desktopH},
	}
}

func spawnForPet(petPath string, idx int, defaultSpawn int, spawnIDs []int) (int, error) {
	if len(spawnIDs) == 0 {
		return defaultSpawn, nil
	}
	if len(spawnIDs) == 1 {
		return spawnIDs[0], nil
	}
	if idx >= len(spawnIDs) {
		return 0, fmt.Errorf("missing spawn id for pet %q", petPath)
	}
	return spawnIDs[idx], nil
}
