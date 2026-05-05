# Shared Code

Code in this directory is safe to import from multiple app layers.

## Contents

- `store/` - shared world state, types, and store implementation.

## Guidelines

- Keep this code free of Electron window APIs.
- Prefer plain data structures and small helpers that can run in Node and browser contexts.
