package log

import (
	"log/slog"
	"os"
)

var (
	logger *slog.Logger
	level  = new(slog.Level)
)

func Init(verbose bool) {
	handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: level,
	})
	logger = slog.New(handler)
	slog.SetDefault(logger)

	if verbose {
		*level = slog.LevelDebug
	} else {
		*level = slog.LevelInfo
	}
}

func Debug(msg string, args ...any) {
	logger.Debug(msg, args...)
}

func Info(msg string, args ...any) {
	logger.Info(msg, args...)
}

func Warn(msg string, args ...any) {
	logger.Warn(msg, args...)
}

func Error(msg string, args ...any) {
	logger.Error(msg, args...)
}

func Default() *slog.Logger {
	return logger
}
