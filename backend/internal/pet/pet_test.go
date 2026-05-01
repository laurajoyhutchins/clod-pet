package pet

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const minimalXML = `<?xml version="1.0"?>
<animations>
  <header>
    <author>test</author>
    <title>Test Pet</title>
    <petname>test</petname>
    <version>1.0</version>
    <info>A test pet</info>
    <application>1</application>
    <icon></icon>
  </header>
  <image tilesx="2" tilesy="2">
    <png>iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M+AARiHKhgFBDYAAHjaE/9nYGBgAAAAAElFTkSuQmCC</png>
    <transparency>#FF00FF</transparency>
  </image>
  <spawns>
    <spawn id="1" probability="100">
      <x>screenW/2</x>
      <y>areaH-imageH</y>
      <next probability="100">1</next>
    </spawn>
  </spawns>
  <animations>
    <animation id="1">
      <name>walk</name>
      <start>
        <x>-2</x>
        <y>0</y>
        <interval>200</interval>
        <offsety>0</offsety>
        <opacity>1.0</opacity>
      </start>
      <end>
        <x>-2</x>
        <y>0</y>
        <interval>200</interval>
        <offsety>0</offsety>
        <opacity>1.0</opacity>
      </end>
      <sequence repeat="1" repeatfrom="0">
        <frame>0</frame>
        <frame>1</frame>
        <next probability="100" only="none">1</next>
      </sequence>
    </animation>
    <animation id="2">
      <name>sit</name>
      <start>
        <x>0</x>
        <y>0</y>
        <interval>300</interval>
        <opacity>1.0</opacity>
      </start>
      <sequence repeat="1" repeatfrom="0">
        <frame>2</frame>
        <frame>3</frame>
        <next probability="100" only="none">1</next>
      </sequence>
      <border>
        <next probability="100" only="taskbar">3</next>
      </border>
      <gravity>
        <next probability="100" only="none">1</next>
      </gravity>
    </animation>
  </animations>
  <childs>
    <child animationid="1">
      <x>imageX+10</x>
      <y>imageY</y>
      <next probability="100">1</next>
    </child>
  </childs>
  <sounds>
    <sound animationid="1" probability="50">
      <loop>0</loop>
      <base64></base64>
    </sound>
  </sounds>
</animations>
`

func writeTestXML(t *testing.T, dir, content string) {
	t.Helper()
	err := os.WriteFile(filepath.Join(dir, "animations.xml"), []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to write test XML: %v", err)
	}
}

func makeTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	return dir
}

func TestLoadPet(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	if p.Header.Title != "Test Pet" {
		t.Errorf("Title = %q, want %q", p.Header.Title, "Test Pet")
	}
	if p.Header.PetName != "test" {
		t.Errorf("PetName = %q, want %q", p.Header.PetName, "test")
	}
	if p.Image.TilesX != 2 {
		t.Errorf("TilesX = %d, want 2", p.Image.TilesX)
	}
	if p.Image.TilesY != 2 {
		t.Errorf("TilesY = %d, want 2", p.Image.TilesY)
	}
	if len(p.Image.PngData) == 0 {
		t.Error("PngData is empty")
	}
}

func TestLoadPetImageTilesFromChildElements(t *testing.T) {
	xml := strings.Replace(minimalXML, `<image tilesx="2" tilesy="2">`, `<image>
    <tilesx>2</tilesx>
    <tilesy>2</tilesy>`, 1)
	dir := makeTestDir(t)
	writeTestXML(t, dir, xml)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	if p.Image.TilesX != 2 {
		t.Errorf("TilesX = %d, want 2", p.Image.TilesX)
	}
	if p.Image.TilesY != 2 {
		t.Errorf("TilesY = %d, want 2", p.Image.TilesY)
	}
}

func TestLoadPetSpawns(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	if len(p.Spawns) != 1 {
		t.Fatalf("Spawns count = %d, want 1", len(p.Spawns))
	}

	s := p.Spawns[0]
	if s.ID != 1 {
		t.Errorf("Spawn ID = %d, want 1", s.ID)
	}
	if s.Probability != 100 {
		t.Errorf("Spawn Probability = %d, want 100", s.Probability)
	}
	if s.X != "screenW/2" {
		t.Errorf("Spawn X = %q, want %q", s.X, "screenW/2")
	}
	if s.NextAnimID != 1 {
		t.Errorf("Spawn NextAnimID = %d, want 1", s.NextAnimID)
	}
	if s.NextProbability != 100 {
		t.Errorf("Spawn NextProbability = %d, want 100", s.NextProbability)
	}
}

func TestLoadPetAnimations(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	if len(p.Animations) != 2 {
		t.Fatalf("Animations count = %d, want 2", len(p.Animations))
	}

	walk, ok := p.Animations[1]
	if !ok {
		t.Fatal("Animation 1 not found")
	}
	if walk.Name != "walk" {
		t.Errorf("Animation 1 Name = %q, want %q", walk.Name, "walk")
	}
	if walk.Start.X != "-2" {
		t.Errorf("Walk Start.X = %q, want %q", walk.Start.X, "-2")
	}
	if walk.End.X != "-2" {
		t.Errorf("Walk End.X = %q, want %q", walk.End.X, "-2")
	}
	if len(walk.Frames) != 2 {
		t.Errorf("Walk Frames count = %d, want 2", len(walk.Frames))
	}
	if walk.Frames[0] != 0 || walk.Frames[1] != 1 {
		t.Errorf("Walk Frames = %v, want [0 1]", walk.Frames)
	}
	if walk.Repeat != "1" {
		t.Errorf("Walk Repeat = %q, want %q", walk.Repeat, "1")
	}
	if walk.RepeatFrom != 0 {
		t.Errorf("Walk RepeatFrom = %d, want 0", walk.RepeatFrom)
	}

	sit, ok := p.Animations[2]
	if !ok {
		t.Fatal("Animation 2 not found")
	}
	if sit.Name != "sit" {
		t.Errorf("Animation 2 Name = %q, want %q", sit.Name, "sit")
	}
}

func TestLoadPetSequenceTransitions(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	walk := p.Animations[1]
	if len(walk.SequenceNext) != 1 {
		t.Fatalf("SequenceNext count = %d, want 1", len(walk.SequenceNext))
	}

	n := walk.SequenceNext[0]
	if n.ID != 1 {
		t.Errorf("SequenceNext ID = %d, want 1", n.ID)
	}
	if n.Probability != 100 {
		t.Errorf("SequenceNext Probability = %d, want 100", n.Probability)
	}
	if n.Only != "none" {
		t.Errorf("SequenceNext Only = %q, want %q", n.Only, "none")
	}
}

func TestLoadPetBorderTransitions(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	sit := p.Animations[2]
	if len(sit.BorderNext) != 1 {
		t.Fatalf("BorderNext count = %d, want 1", len(sit.BorderNext))
	}

	n := sit.BorderNext[0]
	if n.ID != 3 {
		t.Errorf("BorderNext ID = %d, want 3", n.ID)
	}
	if n.Only != "taskbar" {
		t.Errorf("BorderNext Only = %q, want %q", n.Only, "taskbar")
	}
}

func TestLoadPetGravityTransitions(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	sit := p.Animations[2]
	if len(sit.GravityNext) != 1 {
		t.Fatalf("GravityNext count = %d, want 1", len(sit.GravityNext))
	}

	n := sit.GravityNext[0]
	if n.ID != 1 {
		t.Errorf("GravityNext ID = %d, want 1", n.ID)
	}
}

func TestLoadPetChildren(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	if len(p.Children) != 1 {
		t.Fatalf("Children count = %d, want 1", len(p.Children))
	}

	c := p.Children[0]
	if c.AnimationID != 1 {
		t.Errorf("Child AnimationID = %d, want 1", c.AnimationID)
	}
	if c.X != "imageX+10" {
		t.Errorf("Child X = %q, want %q", c.X, "imageX+10")
	}
	if c.NextProbability != 100 {
		t.Errorf("Child NextProbability = %d, want 100", c.NextProbability)
	}
}

func TestLoadPetSounds(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, minimalXML)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	sounds, ok := p.Sounds[1]
	if !ok {
		t.Fatal("Sounds for animation 1 not found")
	}
	if len(sounds) != 1 {
		t.Fatalf("Sounds count = %d, want 1", len(sounds))
	}

	s := sounds[0]
	if s.AnimationID != 1 {
		t.Errorf("Sound AnimationID = %d, want 1", s.AnimationID)
	}
	if s.Probability != 50 {
		t.Errorf("Sound Probability = %d, want 50", s.Probability)
	}
	if s.Loop != 0 {
		t.Errorf("Sound Loop = %d, want 0", s.Loop)
	}
}

func TestLoadPetModernFormat(t *testing.T) {
	const modernJSON = `{
  "header": {
    "author": "test",
    "title": "Test Modern Pet",
    "petname": "test-modern",
    "version": "1.0",
    "info": "A modern test pet",
    "application": 1
  },
  "image": {
    "tiles_x": 2,
    "tiles_y": 2,
    "spritesheet": "spritesheet.png",
    "transparency": "#FF00FF"
  },
  "spawns": [
    {
      "id": 1,
      "probability": 100,
      "x": "screenW/2",
      "y": "areaH-imageH",
      "next": {
        "probability": 100,
        "value": 1
      }
    }
  ],
  "animations": [
    {
      "id": 1,
      "name": "walk",
      "start": {
        "x": "-2",
        "y": "0",
        "interval": "200",
        "offset_y": 0,
        "opacity": 1.0
      },
      "end": {
        "x": "-2",
        "y": "0",
        "interval": "200",
        "offset_y": 0,
        "opacity": 1.0
      },
      "sequence": {
        "frames": [0, 1],
        "nexts": [
          {
            "probability": 100,
            "only": "none",
            "value": 1
          }
        ],
        "repeat": "1",
        "repeat_from": 0
      }
    },
    {
      "id": 2,
      "name": "sit",
      "start": {
        "x": "0",
        "y": "0",
        "interval": "300",
        "opacity": 1.0
      },
      "sequence": {
        "frames": [2, 3],
        "nexts": [
          {
            "probability": 100,
            "only": "none",
            "value": 1
          }
        ],
        "repeat": "1",
        "repeat_from": 0
      },
      "gravity": [
        {
          "probability": 100,
          "only": "none",
          "value": 1
        }
      ]
    }
  ],
  "sounds": [
    {
      "animation_id": 1,
      "probability": 50,
      "loop": 2,
      "base64": "YWJj"
    }
  ]
}`

	dir := makeTestDir(t)
	pngData, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M+AARiHKhgFBDYAAHjaE/9nYGBgAAAAAElFTkSuQmCC")
	if err != nil {
		t.Fatalf("failed to decode png: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "spritesheet.png"), pngData, 0644); err != nil {
		t.Fatalf("failed to write spritesheet: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "animations.json"), []byte(modernJSON), 0644); err != nil {
		t.Fatalf("failed to write animations.json: %v", err)
	}

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet(modern) error: %v", err)
	}

	if p.Header.Title != "Test Modern Pet" {
		t.Errorf("Title = %q, want %q", p.Header.Title, "Test Modern Pet")
	}
	if p.Header.PetName != "test-modern" {
		t.Errorf("PetName = %q, want %q", p.Header.PetName, "test-modern")
	}
	if p.Image.TilesX != 2 {
		t.Errorf("TilesX = %d, want 2", p.Image.TilesX)
	}
	if p.Image.TilesY != 2 {
		t.Errorf("TilesY = %d, want 2", p.Image.TilesY)
	}
	if len(p.Image.PngData) == 0 {
		t.Error("PngData is empty")
	}
	if p.FrameW != 1 {
		t.Errorf("FrameW = %d, want 1", p.FrameW)
	}
	if p.FrameH != 1 {
		t.Errorf("FrameH = %d, want 1", p.FrameH)
	}
	if len(p.Spawns) != 1 {
		t.Fatalf("Spawns count = %d, want 1", len(p.Spawns))
	}
	if p.Spawns[0].NextProbability != 100 {
		t.Errorf("Spawn NextProbability = %d, want 100", p.Spawns[0].NextProbability)
	}
	if len(p.Animations) != 2 {
		t.Fatalf("Animations count = %d, want 2", len(p.Animations))
	}
	if walk, ok := p.Animations[1]; !ok {
		t.Fatal("Animation 1 not found")
	} else if walk.Name != "walk" {
		t.Errorf("Animation 1 Name = %q, want %q", walk.Name, "walk")
	}
	sounds, ok := p.Sounds[1]
	if !ok {
		t.Fatal("Sounds for animation 1 not found")
	}
	if len(sounds) != 1 {
		t.Fatalf("Sounds count = %d, want 1", len(sounds))
	}
	if got := string(sounds[0].Data); got != "abc" {
		t.Errorf("Sound data = %q, want %q", got, "abc")
	}
	if sounds[0].Loop != 2 {
		t.Errorf("Sound loop = %d, want 2", sounds[0].Loop)
	}
}

func TestExportModernPet(t *testing.T) {
	dir := makeTestDir(t)
	dst := filepath.Join(dir, "modern")
	pngData, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M+AARiHKhgFBDYAAHjaE/9nYGBgAAAAAElFTkSuQmCC")
	if err != nil {
		t.Fatalf("failed to decode png: %v", err)
	}

	p := &Pet{
		Header: Header{
			Author:      "exporter",
			Title:       "Original Title",
			PetName:     "original-name",
			Version:     "1.0",
			Info:        "exported pet",
			Application: 1,
			Icon:        []byte("icon-data"),
		},
		Image: Image{
			TilesX:       2,
			TilesY:       2,
			PngData:      pngData,
			Transparency: "Magenta",
		},
		Spawns: []Spawn{
			{ID: 2, Probability: 25, X: "x2", Y: "y2", NextProbability: 80, NextAnimID: 2},
			{ID: 1, Probability: 75, X: "x1", Y: "y1", NextProbability: 20, NextAnimID: 1},
		},
		Animations: map[int]Animation{
			2: {
				ID:   2,
				Name: "second",
				Start: Movement{
					X:        "10",
					Y:        "20",
					OffsetY:  3,
					Opacity:  0.5,
					Interval: "150",
				},
				End: Movement{
					X:        "30",
					Y:        "40",
					OffsetY:  4,
					Opacity:  0.75,
					Interval: "250",
				},
				Frames:       []int{3, 4},
				SequenceNext: []NextAnimation{{ID: 1, Probability: 100, Only: "none"}},
				BorderNext:   []NextAnimation{{ID: 3, Probability: 10, Only: "window"}},
				GravityNext:  []NextAnimation{{ID: 4, Probability: 20, Only: "none"}},
				Repeat:       "2",
				RepeatFrom:   1,
			},
			1: {
				ID:   1,
				Name: "first",
				Start: Movement{
					X:        "1",
					Y:        "2",
					Interval: "100",
				},
				End:        Movement{X: "1", Y: "2", Interval: "100"},
				Frames:     []int{0, 1},
				Repeat:     "1",
				RepeatFrom: 0,
			},
		},
		Children: []Child{
			{AnimationID: 2, X: "childX", Y: "childY", NextProbability: 42, NextAnimID: 1},
		},
		Sounds: map[int][]Sound{
			1: []Sound{
				{AnimationID: 1, Probability: 60, Loop: 2, Data: []byte("sound-data")},
			},
		},
	}

	if err := ExportModernPet(dst, p, ModernExportOptions{
		Title:   "Modern Title",
		PetName: "modern-name",
	}); err != nil {
		t.Fatalf("ExportModernPet error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dst, "spritesheet.png")); err != nil {
		t.Fatalf("spritesheet.png missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "icon.png")); err != nil {
		t.Fatalf("icon.png missing: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dst, "animations.json"))
	if err != nil {
		t.Fatalf("read animations.json: %v", err)
	}

	var root modernRoot
	if err := json.Unmarshal(data, &root); err != nil {
		t.Fatalf("unmarshal exported json: %v", err)
	}

	if root.Header.Title != "Modern Title" {
		t.Errorf("Title = %q, want %q", root.Header.Title, "Modern Title")
	}
	if root.Header.PetName != "modern-name" {
		t.Errorf("PetName = %q, want %q", root.Header.PetName, "modern-name")
	}
	if root.Header.Icon != "icon.png" {
		t.Errorf("Icon = %q, want %q", root.Header.Icon, "icon.png")
	}
	if root.Image.Spritesheet != "spritesheet.png" {
		t.Errorf("Spritesheet = %q, want %q", root.Image.Spritesheet, "spritesheet.png")
	}
	if len(root.Animations) != 2 {
		t.Fatalf("Animations count = %d, want 2", len(root.Animations))
	}
	if root.Animations[0].ID != 1 || root.Animations[1].ID != 2 {
		t.Errorf("Animations not sorted by ID: got %d then %d", root.Animations[0].ID, root.Animations[1].ID)
	}
	if len(root.Spawns) != 2 {
		t.Fatalf("Spawns count = %d, want 2", len(root.Spawns))
	}
	if root.Spawns[0].Next.Probability != 80 || root.Spawns[1].Next.Probability != 20 {
		t.Errorf("Spawn next probabilities = %d, %d; want 80, 20", root.Spawns[0].Next.Probability, root.Spawns[1].Next.Probability)
	}
	if len(root.Children) != 1 {
		t.Fatalf("Children count = %d, want 1", len(root.Children))
	}
	if root.Children[0].Next.Probability != 42 {
		t.Errorf("Child next probability = %d, want 42", root.Children[0].Next.Probability)
	}
	if len(root.Sounds) != 1 {
		t.Fatalf("Sounds count = %d, want 1", len(root.Sounds))
	}
	if root.Sounds[0].AnimationID != 1 {
		t.Errorf("Sound AnimationID = %d, want 1", root.Sounds[0].AnimationID)
	}
	if got, err := base64.StdEncoding.DecodeString(root.Sounds[0].Base64); err != nil {
		t.Fatalf("decode exported sound: %v", err)
	} else if string(got) != "sound-data" {
		t.Errorf("Sound bytes = %q, want %q", string(got), "sound-data")
	}
}

func TestLoadPetFileNotFound(t *testing.T) {
	_, err := LoadPet("/nonexistent/path")
	if err == nil {
		t.Error("LoadPet(/nonexistent) expected error, got nil")
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("Error = %v, want os.ErrNotExist or wrapped version", err)
	}
}

func TestLoadPetInvalidXML(t *testing.T) {
	dir := makeTestDir(t)
	writeTestXML(t, dir, "not valid xml {{{")

	_, err := LoadPet(dir)
	if err == nil {
		t.Error("LoadPet(invalid XML) expected error, got nil")
	}
	if err != nil && !strings.Contains(err.Error(), "parse xml") {
		t.Errorf("Error = %v, want to contain %q", err, "parse xml")
	}
}

func TestLoadPetMissingEndUsesClone(t *testing.T) {
	xml := `<?xml version="1.0"?>
<animations>
  <header><author>t</author><title>T</title><petname>t</petname><version>1</version><info>i</info><application>1</application><icon></icon></header>
  <image tilesx="1" tilesy="1">
    <png>iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M+AARiHKhgFBDYAAHjaE/9nYGBgAAAAAElFTkSuQmCC</png>
  </image>
  <spawns>
    <spawn id="1" probability="100"><x>0</x><y>0</y><next>1</next></spawn>
  </spawns>
  <animations>
    <animation id="1">
      <name>stand</name>
      <start><x>0</x><y>0</y><interval>100</interval><opacity>0.5</opacity></start>
      <sequence repeat="1" repeatfrom="0"><frame>0</frame><next probability="100">1</next></sequence>
    </animation>
  </animations>
  <childs></childs>
  <sounds></sounds>
</animations>`

	dir := makeTestDir(t)
	writeTestXML(t, dir, xml)

	p, err := LoadPet(dir)
	if err != nil {
		t.Fatalf("LoadPet error: %v", err)
	}

	anim := p.Animations[1]
	if anim.End.X != anim.Start.X {
		t.Errorf("End.X = %q, want %q (cloned from Start)", anim.End.X, anim.Start.X)
	}
	if anim.End.Opacity != anim.Start.Opacity {
		t.Errorf("End.Opacity = %v, want %v (cloned from Start)", anim.End.Opacity, anim.Start.Opacity)
	}
}

func TestLoadPetInvalidBase64(t *testing.T) {
	xml := strings.Replace(minimalXML, `<png>iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M+AARiHKhgFBDYAAHjaE/9nYGBgAAAAAElFTkSuQmCC</png>`, `<png>invalid base64</png>`, 1)
	dir := makeTestDir(t)
	writeTestXML(t, dir, xml)

	_, err := LoadPet(dir)
	if err == nil {
		t.Error("LoadPet(invalid base64) expected error, got nil")
	}
	if err != nil && !strings.Contains(err.Error(), "decode sprite png") {
		t.Errorf("Error = %v, want to contain %q", err, "decode sprite png")
	}
}

func TestLoadPetInvalidIconBase64(t *testing.T) {
	xml := strings.Replace(minimalXML, `<icon></icon>`, `<icon>invalid base64</icon>`, 1)
	dir := makeTestDir(t)
	writeTestXML(t, dir, xml)

	_, err := LoadPet(dir)
	if err == nil {
		t.Error("LoadPet(invalid icon base64) expected error, got nil")
	}
	if err != nil && !strings.Contains(err.Error(), "decode icon") {
		t.Errorf("Error = %v, want to contain %q", err, "decode icon")
	}
}

func TestLoadPetInvalidSoundBase64(t *testing.T) {
	xml := strings.Replace(minimalXML, `<base64></base64>`, `<base64>invalid base64</base64>`, 1)
	dir := makeTestDir(t)
	writeTestXML(t, dir, xml)

	_, err := LoadPet(dir)
	if err == nil {
		t.Error("LoadPet(invalid sound base64) expected error, got nil")
	}
	if err != nil && !strings.Contains(err.Error(), "decode sound base64") {
		t.Errorf("Error = %v, want to contain %q", err, "decode sound base64")
	}
}

func TestMovementClone(t *testing.T) {
	m := Movement{
		X:        "-2",
		Y:        "0",
		OffsetY:  5,
		Opacity:  0.8,
		Interval: "200",
	}

	c := m.Copy()
	if c != m {
		t.Errorf("Copy = %+v, want %+v", c, m)
	}
}
