# Editor Subsystem

The editor is a standalone app subsystem with its own runtime, layout, and validation logic.

## Files

- `main.ts` - editor bootstrap.
- `EditorApp.ts` - editor application controller.
- `document.ts` - document model and persistence helpers.
- `graph.ts` - graph structures and relationships.
- `ipc.ts` - editor-to-main communication layer.
- `layout.ts` - layout computations.
- `sprite.ts` - sprite handling helpers.
- `theme.ts` - editor theme definitions.
- `types.ts` - editor-specific types.
- `validation.ts` - validation rules and checks.
- `globals.d.ts` - editor-specific ambient type declarations.
- `SPEC.md` - editor design/specification notes.

## Notes

- This tree stays isolated from the main renderer code.
- Keep editor-specific dependencies here instead of moving them into shared code unless they are genuinely reusable.
