# Privileged Boundary Hardening Specification

**Status:** Approved implementation contract

**Source revision:** `a152adae7c1dc0cece8d845da440fb2df39efa23`

## Goal

Keep Clod Pet's renderer and loopback interfaces bounded even when renderer data, pet definitions, local files, or directory links are malformed or hostile.

## Scope

This change covers four related authority boundaries:

1. The animation editor may read, preview, save, create sidecars for, or reveal only one explicitly approved pet project at a time.
2. Sprite and icon references must be relative project-local asset references. Absolute paths, parent traversal, and canonical-path escapes are rejected.
3. Every Electron window uses one explicit sandboxed local-window policy and rejects renderer-driven navigation, popups, and webview attachment.
4. Backend pet loading remains rooted in `PETS_DIR` after canonical path resolution, including symbolic links and Windows reparse points.

## Non-goals

- Adding a loopback capability token or a second local protocol.
- Redesigning animation playback, physics, chat providers, or settings.
- Replacing exact child-process ownership or changing release signing.
- Publishing, signing, or installing a release.
- Broad CSP migration. Local navigation and popup denial are enforced directly in this pass; CSP remains separately reviewable because current HTML contains inline style.

## Authority model

### Editor project grant

The Electron main process owns an ephemeral grant containing:

- the canonical pet-project root;
- the canonical or approved-to-be-created document path;
- the source of approval: trusted main-process bootstrap, native open dialog, validated recent-document selection, or native save-as dialog.

The grant is replaced when another project is selected and cleared when the editor window closes. Renderer-provided paths never create a grant.

### Asset references

Pet documents own relative asset names. The main process resolves those names against the current grant, verifies lexical containment, and verifies canonical containment for existing files. The editor never reads an absolute asset path.

### Electron windows

A repository-owned helper is the single authority for local-window `webPreferences` and renderer navigation restrictions. Renderers receive only the existing fixed preload bridge.

### Backend pet root

The Go service owns `PETS_DIR`. Pet load requests may name an entry under that root, but the service resolves both root and candidate canonically before loading.

## Required behavior

- Opening a file or directory through a native dialog activates that project and returns its normalized document path.
- A recent document can activate a project only when it exactly matches a main-process recent-document record.
- Reads, preview refreshes, ordinary saves, sidecar access, asset copies, and show-in-folder requests outside the active grant fail with path-free diagnostics.
- Save As validates the current source grant, prepares a target from the native save dialog, performs the write, then activates the new target. A failed write does not silently switch authority.
- Existing symlinks or reparse points that resolve outside the approved project are rejected.
- The renderer cannot invoke a general `editor.show(path)` operation.
- All local windows explicitly use `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, and `allowRunningInsecureContent: false`.
- Local windows deny new-window creation, renderer navigation, and webview attachment.
- Backend pet loading rejects a canonical path outside canonical `PETS_DIR`.

## Error and privacy behavior

Boundary errors use stable, user-actionable messages without echoing absolute paths. Logs may include operation identifiers and error categories, but not absolute user paths, pet document contents, chat content, or credentials.

## Compatibility

- Existing bundled pets and normal custom pets under `PETS_DIR` continue to load.
- Existing native open, recent-document, save, save-as, preview, and show-in-folder editor journeys remain available.
- Legacy pet conversion is unchanged.
- No settings or pet-schema version migration is introduced.

## Acceptance criteria

- Automated tests prove traversal rejection, absolute asset rejection, symlink escape rejection, stale-grant rejection, project replacement, save-as transition, recent-document gating, and safe error text.
- Automated tests prove the shared Electron policy and its application to pet, chat, control-panel, and editor windows.
- Go tests prove canonical pet-root containment, including a symlink escape where supported.
- The modern pet validator rejects absolute and parent-traversing sprite or icon references.
- Frontend type-check, build, and tests pass.
- Go formatting, vet, build, and tests pass.
- Windows installer and Electron smoke checks pass on the exact pull-request head before exact-head clearance is claimed.
