import fs = require("fs");
import path = require("path");
import { buildGraphModel } from "../editor/graph";
import { makeDefaultLayout, normalizeDocument, rewriteAnimationReferences, serializeDocument } from "../editor/document";
import { validateDocumentStructure } from "../editor/validation";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const sheepsJsonPath = path.join(repoRoot, "pets", "eSheep-modern", "animations.json");

describe("editor document model", () => {
  test("parses the bundled modern pet document", () => {
    const raw = JSON.parse(fs.readFileSync(sheepsJsonPath, "utf8"));
    const doc = normalizeDocument(raw);

    expect(doc.header.petname).toBe("eSheep-modern");
    expect(doc.animations.length).toBeGreaterThan(0);
    expect(doc.spawns.length).toBeGreaterThan(0);
  });

  test("validation reports duplicate ids, missing targets, and frame overflow", () => {
    const doc = normalizeDocument({
      header: { title: "Test" },
      image: { tiles_x: 2, tiles_y: 2, spritesheet: "spritesheet.png" },
      spawns: [
        { id: 1, probability: 1, x: "0", y: "0", next: { probability: 1, value: 99 } },
      ],
      animations: [
        {
          id: 1,
          name: "walk",
          start: { x: "0", y: "0", interval: "100" },
          sequence: {
            frames: [0, 4],
            nexts: [{ probability: 0, value: 99 }],
            repeat: "0",
            repeat_from: 1,
          },
        },
        {
          id: 1,
          name: "dup",
          start: { x: "0", y: "0", interval: "100" },
          sequence: { frames: [0], nexts: [], repeat: "0", repeat_from: 0 },
        },
      ],
    });

    const result = validateDocumentStructure(doc, {
      spritesheetDataUrl: null,
      iconDataUrl: null,
      spritesheetError: "missing spritesheet",
      iconError: null,
    });

    expect(result.errors.some((issue) => issue.message.includes("duplicated"))).toBe(true);
    expect(result.errors.some((issue) => issue.message.includes("does not exist"))).toBe(true);
    expect(result.errors.some((issue) => issue.message.includes("exceeds the sprite grid"))).toBe(true);
    expect(result.warnings.some((issue) => issue.message.includes("all transition probabilities"))).toBe(true);
  });

  test("graph mapping preserves duplicate transitions", () => {
    const doc = normalizeDocument({
      header: { title: "Graph" },
      image: { tiles_x: 2, tiles_y: 2, spritesheet: "spritesheet.png" },
      spawns: [],
      animations: [
        {
          id: 1,
          name: "root",
          start: { x: "0", y: "0", interval: "100" },
          sequence: {
            frames: [0],
            nexts: [
              { probability: 20, only: "none", value: 2 },
              { probability: 80, only: "floor", value: 2 },
            ],
            repeat: "0",
            repeat_from: 0,
          },
        },
        {
          id: 2,
          name: "target",
          start: { x: "0", y: "0", interval: "100" },
          sequence: { frames: [1], nexts: [], repeat: "0", repeat_from: 0 },
        },
      ],
    });

    const model = buildGraphModel(doc, makeDefaultLayout(doc));
    const duplicateEdges = model.edges.filter((edge) => edge.sourceId === 1 && edge.targetId === 2 && edge.kind === "sequence");

    expect(duplicateEdges).toHaveLength(2);
    expect(new Set(duplicateEdges.map((edge) => edge.key)).size).toBe(2);
    expect(duplicateEdges[0].label).toContain("#2 target");
    expect(serializeDocument(doc)).toContain('"header"');
  });

  test("renaming an animation updates sound references too", () => {
    const doc = normalizeDocument({
      header: { title: "Sound refs" },
      image: { tiles_x: 2, tiles_y: 2, spritesheet: "spritesheet.png" },
      spawns: [],
      animations: [
        {
          id: 1,
          name: "from",
          start: { x: "0", y: "0", interval: "100" },
          sequence: { frames: [0], nexts: [], repeat: "0", repeat_from: 0 },
        },
        {
          id: 2,
          name: "to",
          start: { x: "0", y: "0", interval: "100" },
          sequence: { frames: [1], nexts: [], repeat: "0", repeat_from: 0 },
        },
      ],
      sounds: [
        { animation_id: 1, probability: 10, base64: "AAAA" },
      ],
    });

    rewriteAnimationReferences(doc, 1, 2);

    expect(doc.sounds?.[0]?.animation_id).toBe(2);
  });
});
