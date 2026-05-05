package pet

import (
	"os"
	"path/filepath"
	"testing"
)

const benchMinimalXML = `<?xml version="1.0"?>
<animations>
  <header>
    <author>test</author>
    <title>Bench Pet</title>
    <petname>bench</petname>
    <version>1.0</version>
    <info>Benchmark pet</info>
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
      <sequence repeat="10" repeatfrom="0">
        <frame>0</frame>
        <frame>1</frame>
        <next probability="50" only="none">2</next>
        <next probability="50" only="none">1</next>
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
      <sequence repeat="5" repeatfrom="0">
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
</animations>`

const benchModernJSON = `{
  "header": {
    "author": "test",
    "title": "Bench Modern Pet",
    "petname": "bench-modern",
    "version": "1.0",
    "info": "A modern benchmark pet",
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
          {"probability": 50, "only": "none", "value": 2},
          {"probability": 50, "only": "none", "value": 1}
        ],
        "repeat": "10",
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
          {"probability": 100, "only": "none", "value": 1}
        ],
        "repeat": "5",
        "repeat_from": 0
      },
      "border": [
        {"probability": 100, "only": "taskbar", "value": 3}
      ],
      "gravity": [
        {"probability": 100, "only": "none", "value": 1}
      ]
    }
  ],
  "sounds": [
    {
      "animation_id": 1,
      "probability": 50,
      "loop": 2,
      "base64": ""
    }
  ]
}`

func BenchmarkLoadPetXML(b *testing.B) {
	tmpDir := b.TempDir()
	xmlPath := filepath.Join(tmpDir, "animations.xml")
	os.WriteFile(xmlPath, []byte(benchMinimalXML), 0644)
	pngData := []byte("fake png data")
	os.WriteFile(filepath.Join(tmpDir, "spritesheet.png"), pngData, 0644)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = LoadPet(tmpDir)
	}
}

func BenchmarkLoadPetModernJSON(b *testing.B) {
	tmpDir := b.TempDir()
	jsonPath := filepath.Join(tmpDir, "animations.json")
	os.WriteFile(jsonPath, []byte(benchModernJSON), 0644)
	pngData := []byte("fake png data")
	os.WriteFile(filepath.Join(tmpDir, "spritesheet.png"), pngData, 0644)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = LoadPet(tmpDir)
	}
}

func BenchmarkLoadPetStartupLatency(b *testing.B) {
	b.StopTimer()
	tmpDir := b.TempDir()
	xmlPath := filepath.Join(tmpDir, "animations.xml")
	os.WriteFile(xmlPath, []byte(benchMinimalXML), 0644)
	pngData := []byte("fake png data")
	os.WriteFile(filepath.Join(tmpDir, "spritesheet.png"), pngData, 0644)
	b.StartTimer()

	for i := 0; i < b.N; i++ {
		p, err := LoadPet(tmpDir)
		if err != nil {
			b.Fatal(err)
		}
		_ = p.Header.Title
		_ = len(p.Animations)
		_ = len(p.Spawns)
	}
}

func BenchmarkExportModernPet(b *testing.B) {
	tmpDir := b.TempDir()
	pngData := []byte("fake png data")

	p := &Pet{
		Header: Header{
			Author:      "bench",
			Title:       "Bench Pet",
			PetName:     "bench",
			Version:     "1.0",
			Info:        "benchmark pet",
			Application: 1,
		},
		Image: Image{
			TilesX:       2,
			TilesY:       2,
			PngData:      pngData,
			Transparency: "#FF00FF",
		},
		Spawns: []Spawn{
			{ID: 1, Probability: 100, X: mustParseExpr("100"), Y: mustParseExpr("200"), NextAnimID: 1},
		},
		Animations: map[int]Animation{
			1: {
				ID:   1,
				Name: "walk",
				Start: Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				End:   Movement{X: mustParseExpr("-2"), Y: mustParseExpr("0"), Interval: mustParseExpr("200")},
				Frames: []int{0, 1},
				Repeat: mustParseExpr("10"),
			},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		dst := filepath.Join(tmpDir, "export")
		_ = ExportModernPet(dst, p, ModernExportOptions{
			Title:   "Exported Pet",
			PetName: "exported",
		})
	}
}
