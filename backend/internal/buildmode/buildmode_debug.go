//go:build debug

package buildmode

const Mode = "debug"
const Debug = true

const _DebugModeNameAssertion = uint(1) / uint(len(Mode)-4)
