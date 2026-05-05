package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunMissingRequiredFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "no flags", args: nil},
		{name: "src only", args: []string{"-src", "dummy"}},
		{name: "dst only", args: []string{"-dst", "dummy"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := run(tt.args)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			exit, ok := err.(ErrExit)
			if !ok || exit != 2 {
				t.Fatalf("expected ErrExit(2), got %T: %v", err, err)
			}
		})
	}
}

func requireExitCode(t *testing.T, err error, want ErrExit) {
	t.Helper()

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	exit, ok := err.(ErrExit)
	if !ok || exit != want {
		t.Fatalf("expected ErrExit(%d), got %T: %v", want, err, err)
	}
}

func TestRunInvalidFlag(t *testing.T) {
	requireExitCode(t, run([]string{"-invalidflag", "value"}), 2)
}

func TestRunCustomExport(t *testing.T) {
	srcDir := createTestLegacyPet(t)
	dstDir := t.TempDir()

	if err := run([]string{"-src", srcDir, "-dst", dstDir, "-title", "Test Title", "-petname", "test_pet"}); err != nil {
		t.Fatalf("run failed: %v", err)
	}

	validateExportedPet(t, dstDir, "Test Title", "test_pet")
}

func TestRunDefaultExport(t *testing.T) {
	srcDir := createTestLegacyPet(t)
	dstDir := t.TempDir()

	if err := run([]string{"-src", srcDir, "-dst", dstDir}); err != nil {
		t.Fatalf("run failed: %v", err)
	}

	validateExportedPet(t, dstDir, "My Pet", "my_pet")
}

func TestRunRelativePaths(t *testing.T) {
	oldDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir tmp: %v", err)
	}
	defer func() {
		_ = os.Chdir(oldDir)
	}()

	srcDir := createTestLegacyPet(t)
	dstDir := filepath.Join(tmpDir, "output")
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		t.Fatalf("mkdir dst: %v", err)
	}

	srcRel, err := filepath.Rel(tmpDir, srcDir)
	if err != nil {
		t.Fatalf("rel src: %v", err)
	}
	dstRel, err := filepath.Rel(tmpDir, dstDir)
	if err != nil {
		t.Fatalf("rel dst: %v", err)
	}

	if err := run([]string{"-src", srcRel, "-dst", dstRel}); err != nil {
		t.Fatalf("run failed: %v", err)
	}

	validateExportedPet(t, dstDir, "My Pet", "my_pet")
}

func TestRunInvalidXML(t *testing.T) {
	srcDir := t.TempDir()
	dstDir := t.TempDir()

	if err := os.WriteFile(filepath.Join(srcDir, "animations.xml"), []byte("invalid xml"), 0644); err != nil {
		t.Fatalf("write invalid xml: %v", err)
	}

	if err := run([]string{"-src", srcDir, "-dst", dstDir}); err == nil {
		t.Fatal("expected error for invalid XML, got nil")
	}
}

func TestRunEmptyTitleAndPetNameUseSourceValues(t *testing.T) {
	srcDir := createTestLegacyPet(t)
	dstDir := t.TempDir()

	if err := run([]string{"-src", srcDir, "-dst", dstDir, "-title", "", "-petname", ""}); err != nil {
		t.Fatalf("run failed: %v", err)
	}

	validateExportedPet(t, dstDir, "My Pet", "my_pet")
}

func TestErrExit(t *testing.T) {
	if got := ErrExit(2).Error(); got != "exit code 2" {
		t.Fatalf("ErrExit.Error() = %q, want %q", got, "exit code 2")
	}
}

func createTestLegacyPet(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	xmlContent := `<?xml version="1.0"?>
<animations>
  <header>
    <title>My Pet</title>
    <petname>my_pet</petname>
  </header>
  <image>
    <png>iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==</png>
    <tilesx>4</tilesx>
    <tilesy>2</tilesy>
  </image>
  <spawns>
    <spawn id="0" probability="100">
      <x>100</x>
      <y>100</y>
    </spawn>
  </spawns>
  <animations>
    <animation id="0" name="idle">
      <start>
        <x>100</x>
        <y>100</y>
      </start>
      <sequence>
        <frame>0</frame>
      </sequence>
    </animation>
  </animations>
</animations>`

	if err := os.WriteFile(filepath.Join(dir, "animations.xml"), []byte(xmlContent), 0644); err != nil {
		t.Fatalf("write test pet: %v", err)
	}

	return dir
}

func validateExportedPet(t *testing.T, dstDir, expectedTitle, expectedPetName string) {
	t.Helper()

	jsonPath := filepath.Join(dstDir, "animations.json")
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatalf("animations.json not found: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, expectedTitle) {
		t.Errorf("expected title %q in output, got %q", expectedTitle, content)
	}
	if !strings.Contains(content, expectedPetName) {
		t.Errorf("expected pet_name %q in output, got %q", expectedPetName, content)
	}

	pngFiles, err := filepath.Glob(filepath.Join(dstDir, "*.png"))
	if err != nil {
		t.Fatalf("glob png files: %v", err)
	}
	if len(pngFiles) == 0 {
		t.Error("expected PNG file in output directory")
	}
}
