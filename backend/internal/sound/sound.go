package sound

import (
	"bytes"
	"encoding/base64"
	"io"
	"math/rand"
	"sync"

	"github.com/ebitengine/oto/v3"
)

type Player struct {
	ctx    *oto.Context
	volume float64
	mu     sync.Mutex
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

	return &Player{
		ctx:    ctx,
		volume: volume,
	}, nil
}

func (p *Player) PlayMP3(base64Data string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err
	}

	// For now, treat as raw PCM since MP3 decoding needs an extra dep
	// When github.com/tosone/minimp3 is added, decode here
	p.playPCM(bytes.NewReader(data))
	return nil
}

func (p *Player) PlayRawPCM(data []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.playPCM(bytes.NewReader(data))
	return nil
}

func (p *Player) playPCM(r io.Reader) {
	player := p.ctx.NewPlayer(r)
	player.SetVolume(p.volume)
	player.Play()
}

func (p *Player) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.ctx.Close()
}

func (p *Player) SetVolume(v float64) {
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
