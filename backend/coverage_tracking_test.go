package main

import (
	"errors"
	"os/exec"
	"testing"
)

func TestGeneratedCoverageProfilesAreNotTracked(t *testing.T) {
	for _, path := range []string{"coverage", "ipc_coverage", "llm_coverage"} {
		cmd := exec.Command("git", "ls-files", "--error-unmatch", "--", path)
		err := cmd.Run()
		if err == nil {
			t.Errorf("generated coverage profile %q is tracked by Git", path)
			continue
		}

		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) || exitErr.ExitCode() != 1 {
			t.Fatalf("git ls-files check for %q failed unexpectedly: %v", path, err)
		}
	}
}
