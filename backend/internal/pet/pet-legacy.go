package pet

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"
)

type xmlRoot struct {
	XMLName    xml.Name      `xml:"animations"`
	Header     xmlHeader     `xml:"header"`
	Image      xmlImage      `xml:"image"`
	Spawns     xmlSpawns     `xml:"spawns"`
	Animations xmlAnimations `xml:"animations"`
	Children   xmlChildren   `xml:"childs"`
	Sounds     xmlSounds     `xml:"sounds"`
}

type xmlHeader struct {
	Author      string `xml:"author"`
	Title       string `xml:"title"`
	PetName     string `xml:"petname"`
	Version     string `xml:"version"`
	Info        string `xml:"info"`
	Application int    `xml:"application"`
	Icon        string `xml:"icon"`
}

type xmlImage struct {
	TilesX       int    `xml:"tilesx"`
	TilesXAttr   int    `xml:"tilesx,attr"`
	TilesY       int    `xml:"tilesy"`
	TilesYAttr   int    `xml:"tilesy,attr"`
	PngBase64    string `xml:"png"`
	Transparency string `xml:"transparency"`
}

type xmlSpawns struct {
	Spawns []xmlSpawn `xml:"spawn"`
}

type xmlSpawn struct {
	ID          int     `xml:"id,attr"`
	Probability int     `xml:"probability,attr"`
	X           string  `xml:"x"`
	Y           string  `xml:"y"`
	Next        xmlNext `xml:"next"`
}

type xmlAnimations struct {
	Animations []xmlAnimation `xml:"animation"`
}

type xmlAnimation struct {
	ID       int             `xml:"id,attr"`
	Name     string          `xml:"name"`
	Start    xmlMovement     `xml:"start"`
	End      *xmlMovement    `xml:"end"`
	Sequence xmlSequence     `xml:"sequence"`
	Border   *xmlTransitions `xml:"border"`
	Gravity  *xmlTransitions `xml:"gravity"`
}

type xmlMovement struct {
	X        string   `xml:"x"`
	Y        string   `xml:"y"`
	OffsetY  *int     `xml:"offsety"`
	Opacity  *float64 `xml:"opacity"`
	Interval string   `xml:"interval"`
}

type xmlSequence struct {
	Frames     []int     `xml:"frame"`
	Nexts      []xmlNext `xml:"next"`
	Action     string    `xml:"action"`
	Repeat     string    `xml:"repeat,attr"`
	RepeatFrom int       `xml:"repeatfrom,attr"`
}

type xmlTransitions struct {
	Nexts []xmlNext `xml:"next"`
}

type xmlNext struct {
	Probability int    `xml:"probability,attr"`
	Only        string `xml:"only,attr"`
	Value       int    `xml:",chardata"`
}

type xmlChildren struct {
	Children []xmlChild `xml:"child"`
}

type xmlChild struct {
	AnimationID int     `xml:"animationid,attr"`
	X           string  `xml:"x"`
	Y           string  `xml:"y"`
	Next        xmlNext `xml:"next"`
}

type xmlSounds struct {
	Sounds []xmlSound `xml:"sound"`
}

type xmlSound struct {
	AnimationID int    `xml:"animationid,attr"`
	Probability int    `xml:"probability,attr"`
	Loop        *int   `xml:"loop"`
	Base64      string `xml:"base64"`
}

func loadXMLPet(dir string) (*Pet, error) {
	data, err := os.ReadFile(filepath.Join(dir, "animations.xml"))
	if err != nil {
		return nil, fmt.Errorf("read animations.xml: %w", err)
	}

	var root xmlRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
	}

	var iconData []byte
	if root.Header.Icon != "" {
		var err error
		iconData, err = base64.StdEncoding.DecodeString(root.Header.Icon)
		if err != nil {
			return nil, fmt.Errorf("decode icon: %w", err)
		}
	}
	if root.Image.PngBase64 == "" {
		return nil, fmt.Errorf("missing sprite PNG data")
	}
	pngData, err := base64.StdEncoding.DecodeString(root.Image.PngBase64)
	if err != nil {
		return nil, fmt.Errorf("decode sprite png: %w", err)
	}

	imgCfg, _, err := image.DecodeConfig(bytes.NewReader(pngData))
	if err != nil {
		return nil, fmt.Errorf("decode png config: %w", err)
	}

	tilesX := root.Image.TilesX
	if tilesX == 0 {
		tilesX = root.Image.TilesXAttr
	}
	tilesY := root.Image.TilesY
	if tilesY == 0 {
		tilesY = root.Image.TilesYAttr
	}

	if tilesX == 0 {
		tilesX = 1
	}
	if tilesY == 0 {
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

	for _, xs := range root.Spawns.Spawns {
		pet.Spawns = append(pet.Spawns, Spawn{
			ID:              xs.ID,
			Probability:     xs.Probability,
			X:               xs.X,
			Y:               xs.Y,
			NextProbability: xs.Next.Probability,
			NextAnimID:      xs.Next.Value,
		})
	}

	for _, xa := range root.Animations.Animations {
		anim := Animation{
			ID:         xa.ID,
			Name:       xa.Name,
			Action:     xa.Sequence.Action,
			Start:      parseMovement(xa.Start),
			Repeat:     xa.Sequence.Repeat,
			RepeatFrom: xa.Sequence.RepeatFrom,
		}

		if xa.End != nil {
			anim.End = parseMovement(*xa.End)
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

		if xa.Border != nil {
			for _, xn := range xa.Border.Nexts {
				anim.BorderNext = append(anim.BorderNext, NextAnimation{
					ID:          xn.Value,
					Probability: xn.Probability,
					Only:        xn.Only,
				})
			}
		}

		if xa.Gravity != nil {
			for _, xn := range xa.Gravity.Nexts {
				anim.GravityNext = append(anim.GravityNext, NextAnimation{
					ID:          xn.Value,
					Probability: xn.Probability,
					Only:        xn.Only,
				})
			}
		}

		pet.Animations[xa.ID] = anim
	}

	for _, xc := range root.Children.Children {
		pet.Children = append(pet.Children, Child{
			AnimationID:     xc.AnimationID,
			X:               xc.X,
			Y:               xc.Y,
			NextProbability: xc.Next.Probability,
			NextAnimID:      xc.Next.Value,
		})
	}

	for _, xs := range root.Sounds.Sounds {
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

func parseMovement(xm xmlMovement) Movement {
	offsetY := 0
	if xm.OffsetY != nil {
		offsetY = *xm.OffsetY
	}
	opacity := 1.0
	if xm.Opacity != nil {
		opacity = *xm.Opacity
	}
	return Movement{
		X:        xm.X,
		Y:        xm.Y,
		OffsetY:  offsetY,
		Opacity:  opacity,
		Interval: xm.Interval,
	}
}

func (m Movement) Copy() Movement {
	return m
}
