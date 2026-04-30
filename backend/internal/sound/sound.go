package sound

import (
	"bytes"
	"encoding/base64"
	"io"
	"math/rand"
	"sync"

	"github.com/ebitengine/oto/v3"
	"github.com/hajimehoshi/go-mp3"
)

type Player struct {
	ctx     *oto.Context
	volume  float64
	mu      sync.Mutex
	players []*oto.Player
}

func NewPlayer(sampleRate int, volume float64) (*Player, error) {
	opts := &oto.NewContextOptions{
		SampleRate:   sampleRate,
		ChannelCount: 2,
		Format:       oto.FormatSignedInt16LE,
	}
	ctx, ready, err := oto.NewContext(opts)
	if err != nil {
		return nil, err
	}
	<-ready

	p := &Player{
		ctx:    ctx,
		volume: volume,
	}
	return p, nil
}

func (p *Player) PlayBase64PCM(base64Data string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err
	}

	p.playPCM(data)
	return nil
}

func (p *Player) PlayRawPCM(data []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.playPCM(data)
	return nil
}

func (p *Player) playPCM(data []byte) {
	p.cleanup()

	var r io.Reader = bytes.NewReader(data)

	// Try to decode as MP3 first
	if d, err := mp3.NewDecoder(bytes.NewReader(data)); err == nil {
		// If it's not a valid MP3, NewDecoder might return an error or a decoder that fails on first Read
		// For now, if no error, we assume it's MP3.
		r = d
	}

	player := p.ctx.NewPlayer(r)
	player.SetVolume(p.volume)
	player.Play()

	p.players = append(p.players, player)
}

func (p *Player) cleanup() {
	var active []*oto.Player
	for _, pl := range p.players {
		if pl.IsPlaying() {
			active = append(active, pl)
		} else {
			_ = pl.Close()
		}
	}
	p.players = active
}

func (p *Player) Release() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, pl := range p.players {
		_ = pl.Close()
	}
	p.players = nil
}

func (p *Player) UpdateVolume(v float64) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.volume = v
}

func PickSound(sounds []SoundEntry) *SoundEntry {
	if len(sounds) == 0 {
		return nil
	}

	total := 0
	for _, s := range sounds {
		total += s.Probability
	}
	if total == 0 {
		return nil
	}

	r := rand.Intn(total)
	cumulative := 0
	for i := range sounds {
		cumulative += sounds[i].Probability
		if r < cumulative {
			return &sounds[i]
		}
	}
	return &sounds[len(sounds)-1]
}

type SoundEntry struct {
	AnimationID int
	Probability int
	Loop        int
	Data        []byte
}
