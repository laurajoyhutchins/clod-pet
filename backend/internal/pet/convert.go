package pet

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

const (
	modernSpritesheetName = "spritesheet.png"
	modernIconName        = "icon.png"
	modernJSONName        = "animations.json"
)

// ModernExportOptions configures metadata overrides when exporting a Pet to the
// modern format.
type ModernExportOptions struct {
	Title   string
	PetName string
}

// ExportModernPet writes a normalized modern-format pet to dstDir.
func ExportModernPet(dstDir string, p *Pet, opts ModernExportOptions) error {
	if p == nil {
		return errors.New("pet is nil")
	}
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}
	if len(p.Image.PngData) == 0 {
		return errors.New("pet image is empty")
	}
	if err := os.WriteFile(filepath.Join(dstDir, modernSpritesheetName), p.Image.PngData, 0o644); err != nil {
		return fmt.Errorf("write spritesheet: %w", err)
	}

	iconName := ""
	if len(p.Header.Icon) > 0 {
		if err := os.WriteFile(filepath.Join(dstDir, modernIconName), p.Header.Icon, 0o644); err != nil {
			return fmt.Errorf("write icon: %w", err)
		}
		iconName = modernIconName
	}

	root := buildModernRoot(p, iconName, opts)
	data, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal animations.json: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(filepath.Join(dstDir, modernJSONName), data, 0o644); err != nil {
		return fmt.Errorf("write animations.json: %w", err)
	}

	return nil
}

func buildModernRoot(p *Pet, iconName string, opts ModernExportOptions) modernRoot {
	tilesX := p.Image.TilesX
	if tilesX <= 0 {
		tilesX = 1
	}
	tilesY := p.Image.TilesY
	if tilesY <= 0 {
		tilesY = 1
	}

	root := modernRoot{
		Header: modernHeader{
			Author:      p.Header.Author,
			Title:       p.Header.Title,
			PetName:     p.Header.PetName,
			Version:     p.Header.Version,
			Info:        p.Header.Info,
			Application: p.Header.Application,
			Icon:        iconName,
		},
		Image: modernImage{
			TilesX:       tilesX,
			TilesY:       tilesY,
			Spritesheet:  modernSpritesheetName,
			Transparency: p.Image.Transparency,
		},
		Spawns:     make([]modernSpawn, 0, len(p.Spawns)),
		Animations: make([]modernAnimation, 0, len(p.Animations)),
		Children:   make([]modernChild, 0, len(p.Children)),
		Sounds:     make([]modernSound, 0, len(p.Sounds)),
	}

	if opts.Title != "" {
		root.Header.Title = opts.Title
	}
	if opts.PetName != "" {
		root.Header.PetName = opts.PetName
	}

	for _, spawn := range p.Spawns {
		root.Spawns = append(root.Spawns, modernSpawn{
			ID:          spawn.ID,
			Probability: spawn.Probability,
			X:           spawn.X,
			Y:           spawn.Y,
			Next: modernNext{
				Probability: spawn.NextProbability,
				Value:       spawn.NextAnimID,
			},
		})
	}

	animIDs := make([]int, 0, len(p.Animations))
	for id := range p.Animations {
		animIDs = append(animIDs, id)
	}
	sort.Ints(animIDs)
	for _, id := range animIDs {
		anim := p.Animations[id]
		mm := modernAnimation{
			ID:   anim.ID,
			Name: anim.Name,
			Start: modernMovement{
				X:        anim.Start.X,
				Y:        anim.Start.Y,
				OffsetY:  intPtr(anim.Start.OffsetY),
				Opacity:  floatPtr(anim.Start.Opacity),
				Interval: anim.Start.Interval,
			},
			Sequence: modernSequence{
				Frames:     append([]int(nil), anim.Frames...),
				Action:     anim.Action,
				Repeat:     anim.Repeat,
				RepeatFrom: anim.RepeatFrom,
			},
		}
		end := anim.End
		mm.End = &modernMovement{
			X:        end.X,
			Y:        end.Y,
			OffsetY:  intPtr(end.OffsetY),
			Opacity:  floatPtr(end.Opacity),
			Interval: end.Interval,
		}
		for _, next := range anim.SequenceNext {
			mm.Sequence.Nexts = append(mm.Sequence.Nexts, modernNext{
				Probability: next.Probability,
				Only:        next.Only,
				Value:       next.ID,
			})
		}
		for _, next := range anim.BorderNext {
			mm.Border = append(mm.Border, modernNext{
				Probability: next.Probability,
				Only:        next.Only,
				Value:       next.ID,
			})
		}
		for _, next := range anim.GravityNext {
			mm.Gravity = append(mm.Gravity, modernNext{
				Probability: next.Probability,
				Only:        next.Only,
				Value:       next.ID,
			})
		}
		root.Animations = append(root.Animations, mm)
	}

	for _, child := range p.Children {
		root.Children = append(root.Children, modernChild{
			AnimationID: child.AnimationID,
			X:           child.X,
			Y:           child.Y,
			Next: modernNext{
				Probability: child.NextProbability,
				Value:       child.NextAnimID,
			},
		})
	}

	soundAnimIDs := make([]int, 0, len(p.Sounds))
	for id := range p.Sounds {
		soundAnimIDs = append(soundAnimIDs, id)
	}
	sort.Ints(soundAnimIDs)
	for _, animID := range soundAnimIDs {
		for _, sound := range p.Sounds[animID] {
			loop := sound.Loop
			root.Sounds = append(root.Sounds, modernSound{
				AnimationID: sound.AnimationID,
				Probability: sound.Probability,
				Loop:        &loop,
				Base64:      base64.StdEncoding.EncodeToString(sound.Data),
			})
		}
	}

	return root
}
