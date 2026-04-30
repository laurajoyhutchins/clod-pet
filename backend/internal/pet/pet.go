package pet

import (
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"os"
)

const xmlNamespace = "https://esheep.petrucci.ch/"

type xmlRoot struct {
	XMLName    xml.Name       `xml:"animations"`
	Header     xmlHeader      `xml:"header"`
	Image      xmlImage       `xml:"image"`
	Spawns     xmlSpawns      `xml:"spawns"`
	Animations xmlAnimations  `xml:"animations"`
	Children   xmlChildren    `xml:"childs"`
	Sounds     xmlSounds      `xml:"sounds"`
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
	TilesY       int    `xml:"tilesy"`
	PngBase64    string `xml:"png"`
	Transparency string `xml:"transparency"`
}

type xmlSpawns struct {
	Spawns []xmlSpawn `xml:"spawn"`
}

type xmlSpawn struct {
	ID          int    `xml:"id,attr"`
	Probability int    `xml:"probability,attr"`
	X           string `xml:"x"`
	Y           string `xml:"y"`
	Next        xmlNext `xml:"next"`
}

type xmlAnimations struct {
	Animations []xmlAnimation `xml:"animation"`
}

type xmlAnimation struct {
	ID       int          `xml:"id,attr"`
	Name     string       `xml:"name"`
	Start    xmlMovement  `xml:"start"`
	End      *xmlMovement `xml:"end"`
	Sequence xmlSequence  `xml:"sequence"`
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
	Frames       []int       `xml:"frame"`
	Nexts        []xmlNext   `xml:"next"`
	Repeat       string      `xml:"repeat,attr"`
	RepeatFrom   int         `xml:"repeatfrom,attr"`
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
	AnimationID int    `xml:"animationid,attr"`
	X           string `xml:"x"`
	Y           string `xml:"y"`
	Next        xmlNext `xml:"next"`
}

type xmlSounds struct {
	Sounds []xmlSound `xml:"sound"`
}

type xmlSound struct {
	AnimationID int    `xml:"animationid,attr"`
	Probability int    `xml:"probability"`
	Loop        *int   `xml:"loop"`
	Base64      string `xml:"base64"`
}

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
	ID          int
	Probability int
	X           string
	Y           string
	NextAnimID  int
}

type Movement struct {
	X        string
	Y        string
	OffsetY  int
	Opacity  float64
	Interval string
}

type Animation struct {
	ID          int
	Name        string
	Start       Movement
	End         Movement
	Frames      []int
	SequenceNext []NextAnimation
	BorderNext  []NextAnimation
	GravityNext []NextAnimation
	Repeat      string
	RepeatFrom  int
}

type NextAnimation struct {
	ID          int
	Probability int
	Only        string
}

type Child struct {
	AnimationID int
	X           string
	Y           string
	NextAnimID  int
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
}

func LoadPet(dir string) (*Pet, error) {
	data, err := os.ReadFile(dir + "/animations.xml")
	if err != nil {
		return nil, fmt.Errorf("read animations.xml: %w", err)
	}

	var root xmlRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
	}

	iconData, _ := base64.StdEncoding.DecodeString(root.Header.Icon)
	pngData, err := base64.StdEncoding.DecodeString(root.Image.PngBase64)
	if err != nil {
		return nil, fmt.Errorf("decode sprite png: %w", err)
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
			TilesX:       root.Image.TilesX,
			TilesY:       root.Image.TilesY,
			PngData:      pngData,
			Transparency: root.Image.Transparency,
		},
		Animations: make(map[int]Animation),
		Sounds:     make(map[int][]Sound),
	}

	for _, xs := range root.Spawns.Spawns {
		pet.Spawns = append(pet.Spawns, Spawn{
			ID:          xs.ID,
			Probability: xs.Probability,
			X:           xs.X,
			Y:           xs.Y,
			NextAnimID:  xs.Next.Value,
		})
	}

	for _, xa := range root.Animations.Animations {
		anim := Animation{
			ID:   xa.ID,
			Name: xa.Name,
			Start: parseMovement(xa.Start),
			Repeat: xa.Sequence.Repeat,
			RepeatFrom: xa.Sequence.RepeatFrom,
		}

		if xa.End != nil {
			anim.End = parseMovement(*xa.End)
		} else {
			anim.End = anim.Start.Clone()
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
			AnimationID: xc.AnimationID,
			X:           xc.X,
			Y:           xc.Y,
			NextAnimID:  xc.Next.Value,
		})
	}

	for _, xs := range root.Sounds.Sounds {
		audioData, _ := base64.StdEncoding.DecodeString(xs.Base64)
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

func (m Movement) Clone() Movement {
	return m
}
