# Renderer

Renderer entrypoints and browser-side helpers live here.

## Files

- `chat.ts` - chat window UI behavior.
- `control-panel.ts` - settings window behavior.
- `pet-renderer.ts` - pet window rendering logic.
- `control-panel-themes.ts` - control-panel theme helpers.

## Notes

- These files run in a browser context.
- Any privileged operation should go through `window.clodPet` from preload.
- Shared visual helpers that are renderer-only belong under `renderer/ui/`.
