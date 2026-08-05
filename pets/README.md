# Pets

Pet definitions and sprite assets used by the desktop pet engine.

## Layout

- `eSheep-modern/` - modern JSON-based pet definition and sprites.
- `eSheep-modern-debug/` - debug-oriented legacy animation and sprite assets.
- `eSheep-noir/` - modified modern eSheep variant.
- `esheep64/` - legacy XML-based pet definition and embedded assets.

## Runtime authority

Each pet directory is self-contained. Modern pets use `animations.json`; legacy pets use `animations.xml` as a compatibility format. Modern asset references must be relative to the pet directory and must not use absolute paths, parent traversal, symlinks, or Windows reparse points to escape it.

Pet definitions own pet identity, frames, timing, transitions, behavior metadata, and descriptive attribution. They do not own runtime process state, provider configuration, credentials, executable commands, or arbitrary host paths.

## Licensing and provenance

Repository presence and credit lines do not prove redistribution permission. Before adding or publishing a pet, update [`docs/reference/asset-licenses.md`](../docs/reference/asset-licenses.md) with:

- creator and copyright holder;
- stable original source;
- applicable license or explicit permission;
- modification status;
- attribution requirements;
- package inclusion decision.

The currently bundled pets remain unresolved for publisher-signed public release until that evidence is complete. Do not add third-party characters or fetch pet assets at runtime without explicit redistribution authority and an approved security design.

Keep generated previews or exports out of version control unless they are required source assets with recorded provenance.
