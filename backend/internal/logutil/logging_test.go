package log

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestInitVerbose(t *testing.T) {
	Init(true)
	if level.String() != "DEBUG" {
		t.Errorf("expected DEBUG level, got %s", level.String())
	}
}

func TestInitNotVerbose(t *testing.T) {
	Init(false)
	if level.String() != "INFO" {
		t.Errorf("expected INFO level, got %s", level.String())
	}
}

func TestDebug(t *testing.T) {
	var buf bytes.Buffer
	handler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})
	logger = slog.New(handler)
	slog.SetDefault(logger)

	Debug("test debug message", "key", "value")
	if !strings.Contains(buf.String(), "test debug message") {
		t.Error("debug message not logged")
	}
}

func TestInfo(t *testing.T) {
	var buf bytes.Buffer
	handler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	logger = slog.New(handler)
	slog.SetDefault(logger)

	Info("test info message", "key", "value")
	if !strings.Contains(buf.String(), "test info message") {
		t.Error("info message not logged")
	}
}

func TestWarn(t *testing.T) {
	var buf bytes.Buffer
	handler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelWarn,
	})
	logger = slog.New(handler)
	slog.SetDefault(logger)

	Warn("test warn message")
	if !strings.Contains(buf.String(), "test warn message") {
		t.Error("warn message not logged")
	}
}

func TestError(t *testing.T) {
	var buf bytes.Buffer
	handler := slog.NewJSONHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelError,
	})
	logger = slog.New(handler)
	slog.SetDefault(logger)

	Error("test error message")
	if !strings.Contains(buf.String(), "test error message") {
		t.Error("error message not logged")
	}
}

func TestDefault(t *testing.T) {
	Init(false)
	l := Default()
	if l == nil {
		t.Error("Default returned nil")
	}
}
