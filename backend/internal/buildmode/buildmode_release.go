//go:build !debug

package buildmode

const Mode = "release"
const Debug = false

const _ReleaseModeNameAssertion = uint(1) / uint(len(Mode)-6)
