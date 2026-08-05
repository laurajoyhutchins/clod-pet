# Repository review registers

Review date: 2026-08-05

Exact review base: `a152adae7c1dc0cece8d845da440fb2df39efa23`

Primary skill: `architecture-review`. Supporting skills own the language, API, logging, governance, documentation, testing, and delivery boundaries named in the pull request.

Status meanings:

- **Implemented**: changed in the privileged-boundary hardening branch and covered by focused tests.
- **Existing evidence**: implemented before this review and confirmed through source or CI.
- **Deferred defect**: evidence supports a defect, but it is outside the smallest coherent correction.
- **Owner decision**: a product, threat-model, release-authority, or compatibility choice is required before implementation.
- **Unverified**: this review did not obtain evidence strong enough for a claim.

## Current architecture assessment

Clod Pet is coherent as a Windows-oriented Electron shell over a Go runtime. The split is useful: Electron owns windows and host integration; Go owns pet state, animation, physics, validated pet loading, settings, and provider invocation. The principal weakness at the review base was that editor renderer paths crossed the privileged filesystem boundary without a main-process authority object.

The implementation pass adds one editor project grant, one shared Electron local-window policy, and canonical containment inside the existing Go pet-root authority. It removes the unused renderer-facing editor launch operation rather than expanding validation around a redundant capability.

## Implemented findings

| ID | Area | Review-base finding | Correction and evidence |
|---|---|---|---|
| CP-01 | Editor filesystem | Renderer values could select arbitrary read, preview, save, reveal, and asset paths. | Main-process ephemeral project grant; native-dialog or exact recent-document approval; canonical containment; sender check; grant cleared on close. |
| CP-02 | Asset paths | Modern documents accepted absolute and parent-traversing sprite or icon references. | Domain validation rejects portable absolute paths and `..`; host boundary independently resolves canonical files inside the active grant. |
| CP-03 | Electron | Local windows did not share an explicit sandbox and navigation policy. | One policy sets sandbox, isolation, disabled Node, web security, and deny handlers for popups, navigation, and webviews. |
| CP-04 | Preload | The renderer bridge exposed an unnecessary `editor.show(initialPath)` route. | Route and types deleted; editor launch remains main-process owned. |
| CP-05 | Backend pet root | Lexical `PETS_DIR` containment permitted symlink or reparse-point escape. | Canonical root and candidate resolution, including missing-tail handling for approved not-yet-created paths. |
| CP-06 | Diagnostics | File logs were sanitized, but console logs received original objects and strings. | Console and file sinks now consume the same sanitizer; verbose backend diagnostics remain opt-in and sanitized. |
| CP-07 | Save As lifecycle | Authority could have become ambiguous around a failed target write. | Save target is prepared first and activated only after successful document, asset, and sidecar writes. |

## Existing evidence retained

| Area | Evidence-backed status |
|---|---|
| Backend network | Explicit loopback binding and non-permissive cross-origin behavior are covered by backend tests and CI. |
| Credential storage | Settings reject credential-shaped fields; hosted-provider credentials come from environment variables; legacy plaintext migration fails closed. |
| Process ownership | Electron retains the exact spawned child and uses exact PID tree termination on Windows; no process-name-wide termination path was found. |
| Source installation | Per-user installation, repeated-install simulation, uninstall simulation, loopback backend smoke, and ordinary Electron startup run on the Windows workflow. |
| Development signing | Separate script and explicit certificate-creation opt-in; no automatic trust. |
| Release signing | Release script requires an existing thumbprint and does not create or import a release identity. |
| Provider fallback | No silent cross-provider retry path was found. |
| Telemetry | No product telemetry was added by this review. |

## Prioritized risk and defect register

### Release blockers

| ID | Finding | Status | Next evidence required |
|---|---|---|---|
| REL-01 | Bundled pet and app icon assets have credits or descriptive metadata but no complete repository-local license and redistribution-permission record. | Owner decision | Provenance, license text or permission record, modification status, attribution requirement, and package inclusion decision for every asset. |
| REL-02 | The repository root does not contain a general project license file. | Owner decision | Owner-selected source-code licensing policy, coordinated with third-party asset treatment. |

### High priority

| ID | Finding | Status | Next step |
|---|---|---|---|
| SEC-01 | Loopback-only HTTP does not distinguish the owned Electron client from another process running as the same user. | Owner decision | Threat-model consequential endpoints and decide whether a per-launch capability token is proportionate. |
| SEC-02 | Local HTML lacks a strict CSP and contains inline style that complicates a direct policy. | Deferred defect | Remove or nonce/hash inline content, add CSP tests, and preserve local-only navigation controls. |
| PROC-01 | Shutdown uses exact-child termination but lacks a graceful backend shutdown request followed by bounded wait and forced fallback. | Deferred defect | Add one lifecycle contract, cancellation tests, crash-after-readiness tests, and Windows descendant verification. |
| REL-03 | Release packaging does not yet provide a complete clean-tree assertion, source-SHA manifest, deterministic artifact inventory, package checksum, signature verification receipt, and documented timestamp policy. | Deferred defect | Harden packaging without creating, importing, or using a release identity in ordinary CI. |
| GOV-01 | `npm audit` reports high-severity dependency findings during current CI. | Deferred defect | Capture exact advisories, determine runtime reachability, update narrowly, and rerun Electron smoke tests. |
| PET-01 | The modern pet format lacks an explicit schema-version and required asset-attribution contract. | Owner decision | Define migration and compatibility rules before changing existing bundled pets. |
| INST-01 | Uninstall does not expose PowerShell `SupportsShouldProcess` / `-WhatIf`; installation has limited transactional rollback after a late failure. | Deferred defect | Add Pester-first destructive-action tests and narrowly scoped rollback receipts. |

### Medium priority and unverified areas

| ID | Finding | Status | Evidence needed |
|---|---|---|---|
| ANI-01 | Existing animation and physics tests cover many transitions, but this pass did not independently prove fixed-step behavior under every large delta, sleep/resume, display-change, and negative-coordinate case. | Unverified | Deterministic clock tests plus Windows multi-monitor and resume integration evidence. |
| EDIT-01 | Editor graph validation exists, but concurrent external edits, conflict detection, complete undo/redo semantics, and runtime reload were not independently verified. | Unverified | File-version contract and focused React/editor integration tests. |
| CHAT-01 | Hosted provider fakes exercise configuration and streaming, but rendered Markdown, unsafe links/HTML, cancellation UI, and large-stream renderer behavior need a dedicated UI security pass. | Unverified | DOM sanitization and navigation tests without live credentials. |
| A11Y-01 | The app has quit and window controls, but reduced-motion behavior, complete keyboard traversal, screen-reader labeling, high-contrast behavior, and focus non-interference are not comprehensively evidenced. | Deferred defect | Accessibility acceptance criteria and Windows assistive-technology smoke tests. |
| DISP-01 | Windows multi-monitor, taskbar relocation, DPI transitions, display removal, and sleep/resume remain platform-sensitive. | Unverified | Disposable Windows test account with multiple virtual/physical display configurations. |
| LEG-01 | Legacy XML conversion exists, but the review did not independently re-prove external-entity rejection, lossy-conversion diagnostics, and source-preservation behavior at the final head. | Unverified | Focused converter security suite and fixture inventory. |

## Value-to-complexity assessment

The current Electron/Go split remains proportionate. The highest-value simplifications in this pass are authority consolidation rather than feature removal:

- one local-window security policy instead of four partial configurations;
- one editor project authority instead of trusting each IPC path independently;
- one canonical pet-root check instead of lexical and runtime assumptions;
- one sanitized logging sink instead of caller-specific redaction;
- deletion of the unused renderer editor-launch route.

Further abstraction is not warranted unless a second concrete use appears. In particular, the editor grant should not become a generic filesystem capability framework, and the backend should not become a general local agent service.

## Owner-decision register

1. Decide whether release packages may include each currently bundled asset after provenance review.
2. Select a source-code license for the repository, if public redistribution is intended.
3. Decide whether the loopback API requires a per-launch client capability.
4. Approve a modern pet schema-version and attribution migration before changing compatibility behavior.
5. Define the owner-controlled release environment, certificate selection policy, timestamp authority, artifact retention, and approval receipt.
6. Decide the accessibility baseline for reduced motion, keyboard operation, screen readers, and always-on-top behavior.
7. Decide whether experimental Linux/Wayland support should remain development-only or receive a supported packaging contract.

## Cross-repository follow-up register

No related repository was modified.

- If signing and artifact custody are implemented in an external release-infrastructure repository, record Clod Pet's exact source-SHA, manifest, checksum, signature-verification, and approval requirements there.
- Provider documentation should be rechecked when provider SDK/API behavior changes; Clod Pet must not inherit silent parity or fallback assumptions from another project.
- Asset permission evidence may be stored in an owner-controlled evidence system, but Clod Pet still needs a repository-local release decision and attribution record.

## Verification claim boundary

Compilation or mocked tests alone do not establish Windows compatibility, installer safety, provider compatibility, asset licensing, signing readiness, or exact-head clearance. Exact-head claims require the final GitHub Actions application and Windows jobs, review-thread inspection, and a clean final diff. Any new commit invalidates those claims.
