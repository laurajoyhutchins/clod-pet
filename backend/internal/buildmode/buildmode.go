package buildmode

type Info struct {
	Mode  string `json:"mode"`
	Debug bool   `json:"debug"`
}

// Current exposes build-tag-selected backend build metadata.
func Current() Info {
	return Info{
		Mode:  Mode,
		Debug: Debug,
	}
}

const _BuildModeNameIsNonEmpty = uint(1) / uint(len(Mode))
