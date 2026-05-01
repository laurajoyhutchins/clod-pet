package pet

import (
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
