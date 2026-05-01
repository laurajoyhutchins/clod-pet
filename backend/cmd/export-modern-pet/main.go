package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"clod-pet/backend/internal/pet"
)

func main() {
	var (
		srcDir  = flag.String("src", "", "source legacy pet directory containing animations.xml")
		dstDir  = flag.String("dst", "", "destination directory for the modern pet")
		title   = flag.String("title", "", "override the exported pet title")
		petName = flag.String("petname", "", "override the exported pet name")
	)
	flag.Parse()

	if *srcDir == "" || *dstDir == "" {
		fmt.Fprintf(os.Stderr, "usage: %s -src <legacy-pet-dir> -dst <output-dir> [-title <title>] [-petname <name>]\n", filepath.Base(os.Args[0]))
		os.Exit(2)
	}

	srcAbs, err := filepath.Abs(*srcDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve src dir: %v\n", err)
		os.Exit(1)
	}
	dstAbs, err := filepath.Abs(*dstDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve dst dir: %v\n", err)
		os.Exit(1)
	}

	p, err := pet.LoadPet(srcAbs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load pet: %v\n", err)
		os.Exit(1)
	}

	if err := pet.ExportModernPet(dstAbs, p, pet.ModernExportOptions{
		Title:   *title,
		PetName: *petName,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "export modern pet: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("exported modern pet to %s\n", dstAbs)
}
