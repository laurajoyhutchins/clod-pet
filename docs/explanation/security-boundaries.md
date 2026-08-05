# Security and authority boundaries

Clod Pet is a local-first Windows desktop application. Local does not mean trusted: renderer input, pet files, provider output, local HTTP callers, and filesystem links are all treated as potentially malformed or hostile.

This document describes implemented authority. It does not grant release, signing, or asset-redistribution authority.

## Process topology

```text
Windows user session
    -> Electron main process
        -> sandboxed local renderer windows
        -> fixed context-isolated preload bridge
        -> exact owned Go backend child process
            -> 127.0.0.1 loopback HTTP API
            -> animation and physics engine
            -> validated pet loader rooted in PETS_DIR
            -> explicitly selected provider adapter
```

The Electron main process is the only application component allowed to create windows, launch the backend, show native file dialogs, or reveal files in Explorer. The renderer cannot access Node.js, the raw filesystem, arbitrary IPC channels, environment variables, or process controls.

## Source-of-truth matrix

| Concern | Authority | Not authoritative |
|---|---|---|
| Pet identity, frames, transitions, timing, metadata | Validated modern pet document | Renderer graph layout, runtime pet instance |
| Runtime animation and physics | Go engine and pet instance | Pet JSON, React component state |
| Pet filesystem root | Go service `PETS_DIR` and canonical path check | HTTP request path, renderer path |
| Editor project | Ephemeral Electron main-process project grant | Renderer text field, ReactFlow state |
| Editor graph content | Normalized pet domain document | ReactFlow node and edge objects |
| Windows and process lifecycle | Electron main process | Renderer, backend provider output |
| Renderer capabilities | Fixed preload bridge | Arbitrary IPC channel names |
| Non-secret preferences | Validated settings file | Provider environment, renderer cache |
| Hosted-provider credentials | Backend process environment | Settings, IPC, command line, logs |
| Release signing identity | Owner-controlled external certificate store | Repository scripts, development certificate |
| Asset redistribution permission | Explicit provenance and license evidence | Credits alone, file presence in the repository |

## Electron windows

All application windows use one shared policy:

- `sandbox: true`;
- `contextIsolation: true`;
- `nodeIntegration: false`;
- `webSecurity: true`;
- `allowRunningInsecureContent: false`;
- one fixed preload path when the window requires a bridge;
- new-window creation denied;
- renderer navigation denied;
- webview attachment denied.

The application also enables Electron sandboxing before app readiness. A renderer cannot select a preload path or request a general editor launch path.

The current local HTML still contains inline style, so a strict Content Security Policy migration remains unresolved. Navigation and popup denial do not substitute for CSP.

## Editor project grants

Opening a pet directory or `animations.json` through a native dialog creates one ephemeral project grant in the Electron main process. A validated recent-document entry may also recreate a grant. Renderer-provided paths never create authority.

The grant contains:

- the canonical project root;
- the canonical or approved-to-be-created document path.

Reads, previews, ordinary saves, layout sidecars, asset copies, show-in-folder requests, and Save As source access must remain inside that grant. Existing symlinks or Windows reparse points are resolved before containment is accepted. Absolute asset references and parent traversal are rejected by both the domain validator and the main-process filesystem boundary.

Save As prepares a target selected by the native save dialog but does not activate it until the write succeeds. Closing the editor clears the grant.

## Loopback backend

The Go backend binds explicitly to `127.0.0.1`. It does not use permissive CORS. Pet paths are resolved canonically under canonical `PETS_DIR`, including symbolic-link or reparse-point resolution. Error responses do not need to expose the rejected absolute path.

Loopback restricts network reachability but does not authenticate another process running as the same user. A per-launch capability token remains an owner decision because it would affect backend startup, health checks, renderer clients, CLI tooling, and crash recovery.

## Startup and shutdown

Electron resolves the intended backend command, chooses a loopback port, spawns one child process, retains the returned child identity, and waits for health readiness rather than treating spawn as ready.

Shutdown targets only the owned child identity. The Windows fallback uses the exact PID and process tree, not a process name. The backend does not yet expose a graceful authenticated shutdown operation, so graceful request, bounded wait, and forced exact-child termination remain incomplete as one lifecycle contract.

## Settings and providers

Settings may contain provider name, model, optional base URL, UI preferences, and pet preferences. Credential-shaped fields are rejected and legacy plaintext credential fields are removed through a fail-closed migration.

Hosted-provider credentials are read only from provider-specific environment variables when the backend client is created. They are not accepted through settings or IPC and are not placed in child-process command-line arguments. Provider fallback is not automatic.

Provider base URL, model support, streaming, cancellation, and error mapping are provider-specific. Documentation must not imply false parity.

## Logging, diagnostics, and privacy

Console and file log sinks use the same recursive sanitizer. Credential-shaped keys, bearer values, common API-key forms, conversation-shaped fields, and absolute Windows paths are redacted. Backend stdout and stderr are suppressed by default; explicit verbose mode permits sanitized backend diagnostic text.

Do not share a diagnostic bundle without reviewing it. Safe-to-share evidence should prefer:

- app and backend versions;
- exact source revision;
- operation or request identifiers;
- bounded error categories;
- test command and exit status;
- redacted logs.

Do not include API keys, authorization headers, prompts, chat messages, model output, absolute user paths, certificate material, or settings files that have not been reviewed.

## Installation and release boundary

The source installer is per-user and non-privileged. It must not change Defender, firewall, SmartScreen, execution policy, trusted roots, or system-wide environment. Reinstallation must fail clearly on files in use rather than terminate processes by name.

Development signing is optional and separate from installation. A development certificate is not release trust.

Release packaging requires a pre-existing owner-selected signing identity. Repository code must not create or import a release certificate. Publishing, signing, timestamping, and release approval are owner-controlled actions and were not performed by the privileged-boundary hardening review.

## Platform boundary

Windows is the supported end-user platform. Linux and Wayland behavior is development or experimental behavior. `CLOD_PET_ALLOW_WAYLAND=1` is an explicit opt-in, not a portable release claim.
