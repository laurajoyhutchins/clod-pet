# How-to: Add a custom pet

Create a new pet directory under `pets/` with an `animations.xml` file and a sprite sheet.

## Step 1: Create the pet directory

```
pets/
└── my-pet/
    └── animations.xml
```

## Step 2: Define the sprite sheet

`animations.xml` must contain an `<image>` element with:
- `tilesX` — columns in the sprite sheet
- `tilesY` — rows in the sprite sheet
- `<png>` — base64-encoded PNG data

```xml
<animations>
  <image tilesx="16" tilesy="8">
    <png>iVBORw0KGgo...</png>
  </image>
</animations>
```

## Step 3: Define at least one spawn

A spawn determines where the pet appears:

```xml
<spawns>
  <spawn id="1" probability="100">
    <x>screenW/2</x>
    <y>areaH-imageH</y>
    <next probability="100">1</next>
  </spawn>
</spawns>
```

- `x`, `y` — [expressions](../reference/expressions.md) for spawn position
- `<next>` — animation ID to transition into after spawning

## Step 4: Define at least one animation

```xml
<animations>
  <animation id="1">
    <name>stand</name>
    <start>
      <x>0</x><y>0</y><interval>200</interval><opacity>1.0</opacity>
    </start>
    <end>
      <x>0</x><y>0</y><interval>200</interval><opacity>1.0</opacity>
    </end>
    <sequence repeat="1" repeatfrom="0">
      <frame>0</frame>
      <next probability="100" only="none">1</next>
    </sequence>
  </animation>
</animations>
```

## Step 5: Load the pet

Edit `app/main.ts`, change the default pet path passed to `createPet()`:

```ts
async function createPet(petPath = "../pets/my-pet", opts = {}) {
```

Then start the app:

```bash
cd app && npm start
```

`npm start` rebuilds the generated JavaScript before launching Electron.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "read animations.xml: no such file" | Wrong pet path | Path is relative to the Go backend working dir (`backend/`) |
| "parse xml: ..." | Malformed XML | Validate with an XML linter |
| "decode sprite png: ..." | Invalid base64 | Ensure `<png>` content is valid base64 |
