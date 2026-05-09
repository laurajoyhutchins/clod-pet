package buildmode

import "testing"

func TestCurrentBuildMode(t *testing.T) {
	info := Current()
	if info.Mode != "debug" && info.Mode != "release" {
		t.Fatalf("unexpected build mode %q", info.Mode)
	}
	if info.Debug != (info.Mode == "debug") {
		t.Fatalf("debug flag %v does not match mode %q", info.Debug, info.Mode)
	}
}
