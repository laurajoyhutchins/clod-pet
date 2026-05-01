package pet

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
)

type Header struct {
	Author      string
	Title       string
	PetName     string
	Version     string
	Info        string
	Application int
	Icon        []byte
}

type Image struct {
	TilesX       int
	TilesY       int
	PngData      []byte
	Transparency string
}

type Spawn struct {
	ID              int
	Probability     int
	X               string
	Y               string
	NextProbability int
	NextAnimID      int
}

type Movement struct {
	X        string
	Y        string
	OffsetY  int
	Opacity  float64
	Interval string
}

type Animation struct {
	ID           int
	Name         string
	Action       string
	Start        Movement
	End          Movement
	Frames       []int
	SequenceNext []NextAnimation
	BorderNext   []NextAnimation
	GravityNext  []NextAnimation
	Repeat       string
	RepeatFrom   int
}

type NextAnimation struct {
	ID          int
	Probability int
	Only        string
}

type Child struct {
	AnimationID     int
	X               string
	Y               string
	NextProbability int
	NextAnimID      int
}

type Sound struct {
	AnimationID int
	Probability int
	Loop        int
	Data        []byte
}

type Pet struct {
	Header     Header
	Image      Image
	Spawns     []Spawn
	Animations map[int]Animation
	Children   []Child
	Sounds     map[int][]Sound
	FrameW     int
	FrameH     int
}

type modernRoot struct {
	Header     modernHeader      `json:"header"`
	Image      modernImage       `json:"image"`
	Spawns     []modernSpawn     `json:"spawns"`
	Animations []modernAnimation `json:"animations"`
	Children   []modernChild     `json:"children,omitempty"`
	Sounds     []modernSound     `json:"sounds,omitempty"`
}

type modernHeader struct {
	Author      string `json:"author"`
	Title       string `json:"title"`
	PetName     string `json:"petname"`
	Version     string `json:"version"`
	Info        string `json:"info"`
	Application int    `json:"application"`
	Icon        string `json:"icon,omitempty"`
}

type modernImage struct {
	TilesX       int    `json:"tiles_x"`
	TilesY       int    `json:"tiles_y"`
	Spritesheet  string `json:"spritesheet"`
	Transparency string `json:"transparency,omitempty"`
}

type modernSpawn struct {
	ID          int        `json:"id"`
	Probability int        `json:"probability"`
	X           string     `json:"x"`
	Y           string     `json:"y"`
	Next        modernNext `json:"next"`
}

type modernAnimation struct {
	ID       int             `json:"id"`
	Name     string          `json:"name"`
	Start    modernMovement  `json:"start"`
	End      *modernMovement `json:"end,omitempty"`
	Sequence modernSequence  `json:"sequence"`
	Border   []modernNext    `json:"border,omitempty"`
	Gravity  []modernNext    `json:"gravity,omitempty"`
}

type modernMovement struct {
	X        string   `json:"x"`
	Y        string   `json:"y"`
	OffsetY  *int     `json:"offset_y,omitempty"`
	Opacity  *float64 `json:"opacity,omitempty"`
	Interval string   `json:"interval"`
}

type modernSequence struct {
	Frames     []int        `json:"frames"`
	Nexts      []modernNext `json:"nexts,omitempty"`
	Action     string       `json:"action,omitempty"`
	Repeat     string       `json:"repeat"`
	RepeatFrom int          `json:"repeat_from"`
}

type modernNext struct {
	Probability int    `json:"probability"`
	Only        string `json:"only,omitempty"`
	Value       int    `json:"value"`
}

type modernChild struct {
	AnimationID int        `json:"animation_id"`
	X           string     `json:"x"`
	Y           string     `json:"y"`
	Next        modernNext `json:"next"`
}

type modernSound struct {
	AnimationID int    `json:"animation_id"`
	Probability int    `json:"probability"`
	Loop        *int   `json:"loop,omitempty"`
	Base64      string `json:"base64"`
}

func LoadPet(dir string) (*Pet, error) {
	jsonPath := filepath.Join(dir, "animations.json")
	if _, err := os.Stat(jsonPath); err == nil {
		return loadModernPet(dir, jsonPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("stat animations.json: %w", err)
	}

	return loadXMLPet(dir)
}

func loadModernPet(dir, jsonPath string) (*Pet, error) {
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		return nil, fmt.Errorf("read animations.json: %w", err)
	}

	var root modernRoot
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse json: %w", err)
	}

	iconData := []byte(nil)
	if root.Header.Icon != "" {
		iconPath := filepath.Join(dir, root.Header.Icon)
		iconData, err = os.ReadFile(iconPath)
		if err != nil {
			return nil, fmt.Errorf("read icon %q: %w", root.Header.Icon, err)
		}
	}

	spritesheetPath := root.Image.Spritesheet
	if spritesheetPath == "" {
		spritesheetPath = "spritesheet.png"
	}
	pngData, err := os.ReadFile(filepath.Join(dir, spritesheetPath))
	if err != nil {
		return nil, fmt.Errorf("read spritesheet %q: %w", spritesheetPath, err)
	}

	imgCfg, _, err := image.DecodeConfig(bytes.NewReader(pngData))
	if err != nil {
		return nil, fmt.Errorf("decode png config: %w", err)
	}

	tilesX := root.Image.TilesX
	if tilesX <= 0 {
		tilesX = 1
	}
	tilesY := root.Image.TilesY
	if tilesY <= 0 {
		tilesY = 1
	}

	pet := &Pet{
		Header: Header{
			Author:      root.Header.Author,
			Title:       root.Header.Title,
			PetName:     root.Header.PetName,
			Version:     root.Header.Version,
			Info:        root.Header.Info,
			Application: root.Header.Application,
			Icon:        iconData,
		},
		Image: Image{
			TilesX:       tilesX,
			TilesY:       tilesY,
			PngData:      pngData,
			Transparency: root.Image.Transparency,
		},
		Animations: make(map[int]Animation),
		Sounds:     make(map[int][]Sound),
		FrameW:     imgCfg.Width / tilesX,
		FrameH:     imgCfg.Height / tilesY,
	}

	for _, xs := range root.Spawns {
		pet.Spawns = append(pet.Spawns, Spawn{
			ID:              xs.ID,
			Probability:     xs.Probability,
			X:               xs.X,
			Y:               xs.Y,
			NextProbability: xs.Next.Probability,
			NextAnimID:      xs.Next.Value,
		})
	}

	for _, xa := range root.Animations {
		anim := Animation{
			ID:         xa.ID,
			Name:       xa.Name,
			Action:     xa.Sequence.Action,
			Start:      parseModernMovement(xa.Start),
			Repeat:     xa.Sequence.Repeat,
			RepeatFrom: xa.Sequence.RepeatFrom,
		}

		if xa.End != nil {
			anim.End = parseModernMovement(*xa.End)
		} else {
			anim.End = anim.Start.Copy()
		}

		anim.Frames = xa.Sequence.Frames
		for _, xn := range xa.Sequence.Nexts {
			anim.SequenceNext = append(anim.SequenceNext, NextAnimation{
				ID:          xn.Value,
				Probability: xn.Probability,
				Only:        xn.Only,
			})
		}

		for _, xn := range xa.Border {
			anim.BorderNext = append(anim.BorderNext, NextAnimation{
				ID:          xn.Value,
				Probability: xn.Probability,
				Only:        xn.Only,
			})
		}

		for _, xn := range xa.Gravity {
			anim.GravityNext = append(anim.GravityNext, NextAnimation{
				ID:          xn.Value,
				Probability: xn.Probability,
				Only:        xn.Only,
			})
		}

		pet.Animations[xa.ID] = anim
	}

	for _, xc := range root.Children {
		pet.Children = append(pet.Children, Child{
			AnimationID:     xc.AnimationID,
			X:               xc.X,
			Y:               xc.Y,
			NextProbability: xc.Next.Probability,
			NextAnimID:      xc.Next.Value,
		})
	}

	for _, xs := range root.Sounds {
		audioData, err := base64.StdEncoding.DecodeString(xs.Base64)
		if err != nil {
			return nil, fmt.Errorf("decode sound base64 for animation %d: %w", xs.AnimationID, err)
		}
		loop := 0
		if xs.Loop != nil {
			loop = *xs.Loop
		}
		sound := Sound{
			AnimationID: xs.AnimationID,
			Probability: xs.Probability,
			Loop:        loop,
			Data:        audioData,
		}
		pet.Sounds[xs.AnimationID] = append(pet.Sounds[xs.AnimationID], sound)
	}

	return pet, nil
}

func parseModernMovement(mm modernMovement) Movement {
	offsetY := 0
	if mm.OffsetY != nil {
		offsetY = *mm.OffsetY
	}
	opacity := 1.0
	if mm.Opacity != nil {
		opacity = *mm.Opacity
	}
	return Movement{
		X:        mm.X,
		Y:        mm.Y,
		OffsetY:  offsetY,
		Opacity:  opacity,
		Interval: mm.Interval,
	}
}

func intPtr(v int) *int {
	return &v
}

func floatPtr(v float64) *float64 {
	return &v
}
