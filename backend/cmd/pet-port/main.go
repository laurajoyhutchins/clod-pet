package main

import (
	"flag"
	"fmt"
	"os"

	"clod-pet/backend/internal/cliutil"
)

func main() {
	fs := flag.NewFlagSet("pet-port", flag.ExitOnError)
	export := fs.Bool("export", false, "print shell export syntax")
	_ = fs.Parse(os.Args[1:])

	port, err := cliutil.DetectPort()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if *export {
		fmt.Printf("export PORT=%d\n", port)
		return
	}

	fmt.Println(port)
}
