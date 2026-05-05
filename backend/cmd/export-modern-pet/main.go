package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"clod-pet/backend/internal/pet"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		if exitCode, ok := err.(ErrExit); ok {
			os.Exit(int(exitCode))
		}
		os.Exit(1)
	}
}

type ErrExit int

func (e ErrExit) Error() string {
	return fmt.Sprintf("exit code %d", int(e))
}

func run(args []string) error {
	fs := flag.NewFlagSet("export-modern-pet", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	var (
		srcDir  = fs.String("src", "", "source legacy pet directory containing animations.xml")
		dstDir  = fs.String("dst", "", "destination directory for the modern pet")
		title   = fs.String("title", "", "override the exported pet title")
		petName = fs.String("petname", "", "override the exported pet name")
	)

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return ErrExit(2)
	}

	if *srcDir == "" || *dstDir == "" {
		fmt.Fprintf(os.Stderr, "usage: %s -src <legacy-pet-dir> -dst <output-dir> [-title <title>] [-petname <name>]\n", os.Args[0])
		return ErrExit(2)
	}

	srcAbs, err := filepath.Abs(*srcDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve src dir: %v\n", err)
		return ErrExit(1)
	}
	dstAbs, err := filepath.Abs(*dstDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve dst dir: %v\n", err)
		return ErrExit(1)
	}

	p, err := pet.LoadPet(srcAbs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load pet: %v\n", err)
		return ErrExit(1)
	}

	if err := pet.ExportModernPet(dstAbs, p, pet.ModernExportOptions{
		Title:   *title,
		PetName: *petName,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "export modern pet: %v\n", err)
		return ErrExit(1)
	}

	fmt.Printf("exported modern pet to %s\n", dstAbs)
	return nil
}
