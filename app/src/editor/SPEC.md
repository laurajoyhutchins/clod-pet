# Animation Editor Specification

## Goal

Create a TypeScript/Electron animation editor for modern pet definitions, starting with `pets/eSheep-modern/animations.json`. The editor must visualize animation states as a navigable graph, support editing transition/state metadata, and preserve the app's existing themed control-panel look.

## Non-Goals

- Do not replace the backend animation engine.
- Do not invent a custom graph canvas from scratch.
- Do not drop support for the current modern JSON format.
- Do not convert legacy XML in the first implementation. XML import can be a later feature.

## Recommended Package Stack

Use a renderer bundle for the editor instead of extending the current `module: "None"` browser build.

Core packages:

- `react`, `react-dom`: component model for a complex editor surface.
- `@xyflow/react`: graph workspace with pan/zoom, selection, draggable custom nodes, custom edges, edge labels, minimap, and controls.
- `elkjs`: automatic directed graph layout for dense transition maps.
- `ajv`: JSON Schema validation before save.
- `jsonc-parser`: tolerant JSON parsing/edit preservation if comments/trailing commas are later allowed; still save canonical JSON by default.

Build packages:

- `vite`: editor renderer bundling.
- `@vitejs/plugin-react`: React transform for the editor bundle.

Rationale:

- `@xyflow/react` directly supports custom nodes, custom edges, HTML edge labels, and viewport controls. This maps to the requested sprite nodes, condition/probability edge boxes, and workspace navigation.
- `elkjs` avoids hand-maintaining graph layout logic. Animation graphs include cycles, border transitions, gravity transitions, and high fan-out states, so a deterministic layout engine is useful.
- `ajv` catches malformed pet definitions before writing to disk and can report actionable errors in the inspector.
- Vite isolates the editor's modern module bundle from the app's existing plain TypeScript renderer files.

Alternative if React is rejected:

- `cytoscape` plus `cytoscape-dagre` can render graph nodes/edges in a vanilla TypeScript view, but rich form editing, custom node UI, and interactive edge label controls will require more custom code. Prefer React Flow unless minimizing dependencies is more important than editor capability.

## Existing Format Summary

Modern pet definitions live in a pet directory:

- `animations.json`: canonical definition.
- `spritesheet.png`: sprite grid.
- `icon.png`: optional pet icon.

Current `eSheep-modern` image metadata:

- `image.tiles_x`: `16`
- `image.tiles_y`: `11`
- `image.spritesheet`: `spritesheet.png`
- `image.transparency`: `Magenta`

Modern JSON top-level shape:

- `header`: author/title/petname/version/info/application/icon metadata.
- `image`: sprite grid metadata.
- `spawns`: weighted spawn definitions.
- `animations`: animation states.
- `children`: optional child animation spawns.
- `sounds`: optional base64 sound entries.

Animation state shape:

- `id`: numeric animation ID.
- `name`: state name.
- `start`: movement expression metadata.
- `end`: optional movement expression metadata; backend defaults to `start` if omitted.
- `sequence.frames`: sprite frame indices.
- `sequence.nexts`: end-of-sequence transitions.
- `sequence.action`: optional action, for example `flip`.
- `sequence.repeat`: expression string.
- `sequence.repeat_from`: frame index.
- `border`: optional border-triggered transitions.
- `gravity`: optional gravity-triggered transitions.

Transition shape:

- `probability`: integer weight.
- `only`: optional condition such as `none`, `floor`, `walls`, `obstacle`, `ceiling`, `horizontal`, `vertical`, `taskbar`, `window`, or `horizontal+`.
- `value`: target animation ID.

Transition semantics to show in the UI:

- Sequence transitions are evaluated after the animation repeat count completes.
- Border transitions are evaluated when the pet hits a matching boundary or obstacle.
- Gravity transitions are evaluated when falling/gravity is detected.
- Probabilities are weights among eligible candidates, not normalized percentages.
- A transition with `probability: 0` is effectively disabled in weighted selection.

## Editor User Experience

### Window

Add a dedicated editor window launched from the tray/control panel.

Initial target:

- Menu or button label: `Animation Editor`.
- Window size: `1280x820`.
- Minimum size: `900x600`.
- Frame style should match the control panel where practical. If native menus are needed for file operations, prefer an in-app menu bar to keep visual consistency.

### Layout

Use a three-pane workspace:

- Top menu/toolbar: file actions, undo/redo, layout, validation status, theme selector.
- Center graph canvas: animation states and transitions.
- Right inspector: selected pet, state, transition, spawn, sound, or validation issue details.
- Optional left sidebar: searchable state list and asset/spritesheet browser.

### Graph Canvas

Each animation is a node.

Node content:

- Primary sprite preview from the first frame in `sequence.frames`.
- Animation ID and name.
- Frame count and frame list summary.
- Movement metadata summary: `start.x`, `start.y`, `end.x`, `end.y`, `interval`.
- Repeat summary: `repeat`, `repeat_from`.
- Badges for `action`, `border`, `gravity`, `sounds`, and `children`.

Sprite rendering:

- Load the pet spritesheet from the selected pet directory.
- Compute sprite dimensions as `spritesheet.width / tiles_x` and `spritesheet.height / tiles_y`.
- Render frame index previews using CSS background-position or an offscreen canvas crop.
- Treat frame indices as zero-based, matching `app/src/renderer/pet-renderer.ts`, where `col = frameIndex % tilesX` and `row = Math.floor(frameIndex / tilesX)`.
- Display a warning if an index falls outside the sprite grid.
- Respect `image.transparency: "Magenta"` in previews by optionally masking magenta pixels on a canvas. Initial implementation can show raw sprites if masking is costly, but the node metadata must still display the transparency mode.

Edges:

- Create one graph edge for each transition entry.
- Edge source: owning animation ID.
- Edge target: `value`.
- Edge type badge: `sequence`, `border`, `gravity`, `spawn`, or `child`.
- Edge label box must show:
  - Type.
  - `only` condition, defaulting to `none`.
  - Weight from `probability`.
  - Target ID/name.
- Edge colors:
  - Sequence: normal/accent.
  - Border: warning/blue.
  - Gravity: danger/orange.
  - Spawn/child: muted/dashed.
- Multiple transitions between the same source and target should be preserved as separate editable edges or grouped with an expandable label. Do not collapse them into one saved transition.

Workspace navigation:

- Pointer drag pans the canvas.
- Mouse wheel/pinch zooms.
- Space + drag pans when selection mode is active.
- Fit view, zoom in/out, center selected, and minimap controls.
- Search by ID/name and jump to node.
- Keyboard shortcuts:
  - `Ctrl+O`: Open.
  - `Ctrl+S`: Save.
  - `Ctrl+Shift+S`: Save As.
  - `Ctrl+Z`: Undo.
  - `Ctrl+Y` / `Ctrl+Shift+Z`: Redo.
  - `Delete`: delete selected transition or state after confirmation.
  - `F`: fit graph.

## Editing Model

Use an in-memory document model that mirrors the JSON and keeps graph layout metadata separate.

Suggested files:

- `app/src/editor/types.ts`: TypeScript interfaces for modern pet JSON.
- `app/src/editor/document.ts`: load/normalize/serialize operations.
- `app/src/editor/schema.ts`: JSON Schema and AJV validation.
- `app/src/editor/sprite.ts`: spritesheet loading/cropping utilities.
- `app/src/editor/graph.ts`: document-to-graph and graph-to-document mapping.
- `app/src/editor/layout.ts`: ELK layout integration.
- `app/src/editor/theme.ts`: reusable theme adapter shared with control panel.
- `app/src/editor/ipc.ts`: typed renderer API for file operations.
- `app/src/editor/EditorApp.tsx`: editor shell.

State editing:

- Edit ID, name, action, frames, repeat, repeat_from, start movement, and end movement.
- ID edits must update all references or be blocked until references are resolved.
- Frame editor should support:
  - Text list edit, for example `2,3,4`.
  - Sprite picker from the spritesheet.
  - Preview animation playback at the selected interval.
- Expression fields remain strings. Validate syntax with backend-compatible expression checks if exposed later; initially validate presence/type and display "runtime expression" as plain text.

Transition editing:

- Add/edit/delete transition entries for `sequence.nexts`, `border`, and `gravity`.
- Target picker should show animation ID, name, and sprite preview.
- Probability field is an integer weight with minimum `0`.
- `only` condition should be a dropdown plus custom text fallback so existing unknown values are not destroyed.

Spawn editing:

- Edit spawn ID, probability, x/y expressions, and next transition.
- Show spawn entries as virtual source nodes or as a sidebar list with dashed edges to target animations.

Header/image editing:

- Header fields are editable in a pet-level inspector.
- Image fields are editable but guarded:
  - Changing `tiles_x`/`tiles_y` must revalidate all frame indices.
  - Changing `spritesheet` should prompt for a file in the same pet directory or copy the selected file on Save As.

Sound and child editing:

- First implementation should preserve unknown/optional `sounds` and `children`.
- Display badges/counts on related nodes.
- Editing can be read-only initially unless time permits.

## File Operations

Implement file access in Electron main/preload, not directly in the renderer.

Required operations:

- Open pet directory.
- Open `animations.json` directly and infer pet directory from its parent.
- Save.
- Save As to a new pet directory.
- Revert from disk.
- Recent files/directories list.

Save behavior:

- Validate before writing.
- Save canonical pretty JSON with two-space indentation.
- Preserve referenced assets:
  - Existing Save writes only `animations.json`.
  - Save As copies `animations.json`, spritesheet, icon, and any directly referenced local assets.
- Use atomic write:
  - Write `animations.json.tmp`.
  - Replace `animations.json`.
  - Keep an optional `.bak` backup for the last successful save.

Dirty-state behavior:

- Mark document dirty after any edit.
- Prompt before close/open/revert if dirty.
- Window title should show `*` when unsaved.

Main/preload IPC:

- `editor:open-pet-directory`
- `editor:open-animation-file`
- `editor:read-document`
- `editor:save-document`
- `editor:save-document-as`
- `editor:show-item-in-folder`
- `editor:get-recent-documents`

Expose these through `window.clodPet.editor` with typed declarations in `app/src/globals.d.ts`.

## Theming

Reuse the control panel theme definitions.

Current theme data:

- `control-panel-themes.ts` defines Windows styles, Mac styles, and rounded styles on `window.clodPetControlPanelThemes`.
- `control-panel.html` defines base CSS variables such as `--win98-face`, `--win98-title-start`, `--win98-text`, `--win98-input`, and border variables.
- `control-panel-windows.css` and `control-panel-mac.css` define concrete theme variants.

Refactor target:

- Move theme constants into `app/src/ui/themes.ts`.
- Generate or import the same constants from:
  - `control-panel-themes.ts` for existing non-module browser code.
  - `app/src/editor/theme.ts` for the editor bundle.
- Move shared base CSS variables/window chrome styles into `app/shared-theme.css` or `app/src/ui/theme.css`.
- Keep OS-specific styles in `control-panel-windows.css` and `control-panel-mac.css` until the editor has equivalent coverage.

Editor theme requirements:

- Settings menu includes the same `PanelStyle` choices as control panel.
- Theme changes call existing settings API with `{ PanelStyle }`.
- Body class application must match control panel:
  - `theme-${style}`
  - `theme-mac` for Mac styles.
  - `theme-rounded` for rounded styles.
- Graph colors must use CSS variables rather than hard-coded light/dark palettes.
- React Flow node/edge styles should map to theme variables:
  - Node background: `--win98-face`.
  - Node border highlights/shadows: existing 3D border variables.
  - Text: `--win98-text`.
  - Edge label background: `--win98-input`.
  - Accent: `--win98-accent`.

## Validation

Use two validation layers:

- Structural validation with AJV and a JSON Schema matching the modern format.
- Semantic validation in TypeScript for cross-reference rules.

Structural rules:

- Required top-level fields: `header`, `image`, `spawns`, `animations`.
- Required animation fields: `id`, `name`, `start`, `sequence`.
- Required movement fields: `x`, `y`, `interval`.
- Required sequence fields: `frames`, `repeat`, `repeat_from`.
- Required transition fields: `probability`, `value`.

Semantic rules:

- Animation IDs are unique positive integers.
- Transition targets exist.
- Spawn targets exist.
- Frame indices are within the spritesheet grid.
- `repeat_from` is within `sequence.frames`.
- Probabilities are non-negative integers.
- `tiles_x` and `tiles_y` are positive integers.
- Spritesheet path exists and is decodable.
- Icon path exists if set.
- Warn when all transition probabilities in a candidate group are `0`.

Validation UI:

- Show status in toolbar.
- Inspector lists errors/warnings with jump-to-field or jump-to-node actions.
- Block Save on errors.
- Allow Save on warnings after confirmation.

## Undo/Redo

Use command-based document mutations.

Each mutation records:

- Operation type.
- JSON path or document entity ID.
- Before value.
- After value.

Group text-field edits by debounce or blur so undo remains useful.

## Implementation Phases

### Phase 1: Read-Only Graph Viewer

- Add editor window and build pipeline.
- Load `eSheep-modern` by default.
- Parse modern JSON into typed model.
- Render nodes with sprite previews.
- Render labeled sequence/border/gravity edges.
- Add pan/zoom/minimap/fit/search.
- Apply current control-panel theme.

### Phase 2: Inspector Editing and Validation

- Add document dirty state.
- Add node and transition inspectors.
- Add AJV schema validation.
- Add semantic validation.
- Add undo/redo.

### Phase 3: File Operations

- Add Open, Save, Save As, Revert, Recent.
- Add IPC in main/preload.
- Add atomic write and Save As asset copy.

### Phase 4: Authoring Tools

- Add sprite picker.
- Add animation playback preview.
- Add automatic ELK relayout and manual layout persistence.
- Add spawn/child/sound editing.
- Add optional backend expression validation endpoint.

## Tests

Unit tests:

- Parse `eSheep-modern/animations.json`.
- Validate duplicate IDs.
- Validate missing transition target.
- Validate out-of-range frame.
- Convert document to graph elements without dropping duplicate transitions.
- Serialize edited document with stable ordering.
- Sprite crop coordinate calculation.

Renderer tests:

- Theme class application matches control panel.
- Inspector edits mutate the expected JSON path.
- Save is blocked with validation errors.

E2E tests:

- Open editor window.
- Open pet directory.
- Select a node.
- Edit a transition probability.
- Save As to a temporary directory.
- Reopen saved file and verify the edit.

## Open Questions

- Should editor layout positions be stored in a sidecar file such as `.clod-pet-editor.json`, or should the graph always auto-layout?
- Should Save preserve original JSON field ordering and whitespace, or is canonical two-space JSON acceptable?
- Should legacy `animations.xml` be view-only in a later phase or converted to modern JSON?
- Should theme refactoring happen before editor implementation, or as part of Phase 1?

## External References

- React Flow custom nodes, edges, labels, and viewport controls: https://reactflow.dev/
- ELK JavaScript layout package: https://github.com/kieler/elkjs
- AJV JSON Schema validator: https://ajv.js.org/
- Cytoscape.js alternative graph renderer: https://js.cytoscape.org/
