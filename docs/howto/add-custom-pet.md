# How-to: Add a custom pet

Create a new pet directory under `pets/` with an `animations.json` file and a sprite sheet.

## Step 1: Create the pet directory

```
pets/
└── my-pet/
    ├── animations.json
    └── spritesheet.png
```

## Step 2: Define the sprite sheet

`animations.json` must contain an `image` object with:
- `tiles_x` - columns in the sprite sheet
- `tiles_y` - rows in the sprite sheet
- `spritesheet` - the sprite sheet filename

```json
{
  "image": {
    "tiles_x": 16,
    "tiles_y": 8,
    "spritesheet": "spritesheet.png"
  }
}
```

## Step 3: Define at least one spawn

A spawn determines where the pet appears:

```json
{
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
  ]
}
```

- `x`, `y` — [expressions](../reference/expressions.md) for spawn position
- `next.value` — animation ID to transition into after spawning

## Step 4: Define at least one animation

```json
{
  "animations": [
    {
      "id": 1,
      "name": "stand",
      "start": {
        "x": "0",
        "y": "0",
        "interval": "200",
        "opacity": 1.0
      },
      "end": {
        "x": "0",
        "y": "0",
        "interval": "200",
        "opacity": 1.0
      },
      "sequence": {
        "frames": [0],
        "repeat": "1",
        "repeat_from": 0,
        "nexts": [
          {
            "probability": 100,
            "only": "none",
            "value": 1
          }
        ]
      }
    }
  ]
}
```

## Step 5: Load the pet

Edit `app/main.ts`, change the default pet path passed to `createPet()`:

```ts
async function createPet(petPath = "../pets/eSheep-modern", opts = {}) {
```

Then start the app:

```bash
cd app && npm start
```

`npm start` rebuilds the generated JavaScript before launching Electron.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "read animations.json: no such file" | Wrong pet path | Path is relative to the Go backend working dir (`backend/`) |
| "parse json: ..." | Malformed JSON | Validate with a JSON linter |
| "read spritesheet ...: ..." | Missing sprite sheet | Ensure `spritesheet.png` exists next to `animations.json` |
