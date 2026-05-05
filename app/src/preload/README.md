# Preload

The preload script exposes the narrow, safe API used by renderer pages.

## Responsibilities

- Attach the `clodPet` bridge to `window`.
- Surface state access and backend operations to browser code.
- Keep privileged Electron and Node APIs out of renderer pages.

## Entry Point

- `preload.ts` - preload bridge initialization.
