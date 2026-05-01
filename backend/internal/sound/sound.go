package sound

import (
	"bytes"
	"encoding/binary"
	"math/rand"
)

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

type Payload struct {
	MIMEType string
	Data     []byte
	Loop     int
}

func PayloadFor(entry *SoundEntry) *Payload {
	if entry == nil || len(entry.Data) == 0 {
		return nil
	}
	mimeType, data := playableAudio(entry.Data)
	return &Payload{
		MIMEType: mimeType,
		Data:     data,
		Loop:     entry.Loop,
	}
}

func playableAudio(data []byte) (string, []byte) {
	switch {
	case isWAV(data):
		return "audio/wav", data
	case isMP3(data):
		return "audio/mpeg", data
	default:
		return "audio/wav", rawPCMToWAV(data, 44100, 2, 16)
	}
}

func isWAV(data []byte) bool {
	return len(data) >= 12 && bytes.Equal(data[0:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WAVE"))
}

func isMP3(data []byte) bool {
	if len(data) >= 3 && bytes.Equal(data[0:3], []byte("ID3")) {
		return true
	}
	return len(data) >= 2 && data[0] == 0xff && data[1]&0xe0 == 0xe0
}

func rawPCMToWAV(data []byte, sampleRate, channels, bitsPerSample int) []byte {
	byteRate := sampleRate * channels * bitsPerSample / 8
	blockAlign := channels * bitsPerSample / 8
	size := 44 + len(data)

	buf := bytes.NewBuffer(make([]byte, 0, size))
	buf.WriteString("RIFF")
	writeUint32(buf, uint32(size-8))
	buf.WriteString("WAVE")
	buf.WriteString("fmt ")
	writeUint32(buf, 16)
	writeUint16(buf, 1)
	writeUint16(buf, uint16(channels))
	writeUint32(buf, uint32(sampleRate))
	writeUint32(buf, uint32(byteRate))
	writeUint16(buf, uint16(blockAlign))
	writeUint16(buf, uint16(bitsPerSample))
	buf.WriteString("data")
	writeUint32(buf, uint32(len(data)))
	buf.Write(data)
	return buf.Bytes()
}

func writeUint16(buf *bytes.Buffer, v uint16) {
	_ = binary.Write(buf, binary.LittleEndian, v)
}

func writeUint32(buf *bytes.Buffer, v uint32) {
	_ = binary.Write(buf, binary.LittleEndian, v)
}
