# Privileged Boundary Hardening Implementation Plan

**Goal:** Close the editor filesystem, Electron window, and backend pet-root containment gaps without adding new product scope or weakening existing workflows.

**Architecture:** Introduce one ephemeral editor-project grant in Electron main, one shared local-window security policy, and canonical path enforcement inside the existing Go pet-loading authority.

**Constraints:** Preserve fixed preload operations, loopback-only binding, environment-only credentials, non-privileged install behavior, existing pet formats, and owner-controlled release authority.

**Verification:** Use test-first commits, pull-request CI on Ubuntu and Windows, and exact-head review. Do not claim Windows host behavior before the Windows workflow passes at the final head.

## Task 1: Establish failing boundary tests

**Outcome:** The intended editor, Electron, pet-schema, and backend path contracts are executable and fail against the current implementation.

**Files:**

- Create `app/tests/unit/editor-project-access.test.ts`.
- Create `app/tests/unit/window-security.test.ts`.
- Update `app/tests/unit/electron-launch-security.test.ts`.
- Update `app/tests/unit/editor-model.test.ts`.
- Update `backend/internal/service/service_test.go`.

**Interfaces:** Tests target `EditorProjectAccess`, `localWindowWebPreferences`, `hardenLocalWindow`, `validateDocumentStructure`, and `Service.cleanPetPath`.

**Dependencies:** Approved specification and exact base revision.

**Test cycle:** Commit tests before implementation. Open a draft pull request and record the expected compile/test failures caused by missing modules and behavior.

**Completion evidence:** Exact-head CI fails for the intended missing symbols or assertions, not infrastructure or unrelated defects.

## Task 2: Add one editor filesystem authority

**Outcome:** Renderer paths cannot select or escape an editor project.

**Files:**

- Create `app/src/main/editor-project-access.ts`.
- Update `app/src/main/editor-window.ts`.
- Update `app/src/preload/preload.ts`.
- Update `app/src/editor/ipc.ts`.
- Update `app/src/editor/globals.d.ts`.

**Interfaces:**

- `approveSelection(path)` activates a native-dialog or trusted selection.
- `approveRecent(path, allowedPaths)` activates only an exact recent-document record.
- `requireDocument(path)` verifies the current document.
- `prepareSaveTarget(path)` validates but does not activate a native save-as target.
- `activate(grant)` switches authority only after a successful save.
- `resolveAsset(reference)` permits only relative, canonical in-project files.
- `requireVisiblePath(path)` bounds show-in-folder.
- `clear()` expires authority.

**Dependencies:** Task 1 tests.

**Test cycle:** Make path-grant tests pass first, then integrate IPC handlers and run neighboring editor tests.

**Implementation notes:** Renderer requests must come from the active editor webContents. Remove the unused renderer-facing `editor.show` route. Avoid absolute paths in thrown errors and logs.

**Completion evidence:** Focused Jest tests pass; TypeScript build and no-emit type-check pass.

## Task 3: Make unsafe asset references invalid domain data

**Outcome:** Pet documents fail validation before a host read is attempted when sprite or icon references are absolute or contain parent traversal.

**Files:**

- Update `app/src/editor/validation.ts`.
- Optionally update `app/src/editor/schema.ts` only if an equivalent portable schema constraint remains readable.
- Update `docs/reference/animations-json.md`.

**Interfaces:** `validateDocumentStructure` returns path-specific validation errors without host paths.

**Dependencies:** Task 1 editor-model tests.

**Test cycle:** Run focused editor-model tests, then the full frontend suite.

**Completion evidence:** Valid relative assets still pass; absolute and traversal references fail.

## Task 4: Centralize Electron local-window security

**Outcome:** Every application window receives the same explicit renderer isolation and navigation policy.

**Files:**

- Create `app/src/main/window-security.ts`.
- Update `app/src/main/main.ts`.
- Update `app/src/main/window-manager.ts`.
- Update `app/src/main/chat-manager.ts`.
- Update `app/src/main/editor-window.ts`.
- Update affected mocks in `app/tests/unit/window-manager.test.ts` and neighboring tests.

**Interfaces:**

- `localWindowWebPreferences(preloadPath)` returns the fixed safe preferences.
- `hardenLocalWindow(window)` denies popups, navigation, and webview attachment.

**Dependencies:** Task 1 window tests.

**Test cycle:** Make helper tests pass, then verify every BrowserWindow call and the production build.

**Completion evidence:** Security tests prove explicit sandboxing and fixed policy application; Electron Windows smoke remains required for final confidence.

## Task 5: Canonicalize the backend pet root

**Outcome:** A path that is lexically inside `PETS_DIR` but canonically outside it cannot be loaded.

**Files:**

- Update `backend/internal/service/service.go`.
- Update `backend/internal/service/service_test.go`.

**Interfaces:** `cleanPetPath` returns a canonical in-root path or a path-free containment error.

**Dependencies:** Task 1 Go regression test.

**Test cycle:** Run the focused service package, then `go test ./...`, `go vet ./...`, and `go build ./...`.

**Completion evidence:** Ordinary relative and absolute in-root pets pass; traversal, absolute outside, and symlink escape fail.

## Task 6: Encode architecture, risks, and decisions durably

**Outcome:** Maintainers can distinguish implemented authority, tested behavior, unresolved risks, and owner decisions.

**Files:**

- Update `docs/explanation/architecture.md`.
- Create `docs/explanation/security-boundaries.md`.
- Create `docs/reference/asset-licenses.md`.
- Create `docs/reference/review-registers.md`.
- Update `mkdocs.yml`, `README.md`, and issue references where appropriate.

**Interfaces:** Documentation records the source-of-truth matrix, process topology, privacy/logging rules, asset attribution status, risk register, owner decisions, and cross-repository follow-ups.

**Dependencies:** Implemented behavior from Tasks 2 through 5.

**Test cycle:** Build MkDocs and check links/commands where supported.

**Completion evidence:** Documentation describes actual commands and behavior and clearly marks unverified Windows, release, provider, and licensing claims.

## Task 7: Exact-head verification and review handoff

**Outcome:** A draft pull request contains reviewable code and evidence without release authority being exercised.

**Files:** Pull-request description and exact-head comment only.

**Interfaces:** PR body records base/head SHAs, skill ownership, findings, changes, deletions, commands, CI, smoke evidence, deliberate omissions, owner decisions, limitations, and the exact-head invalidation rule.

**Dependencies:** All implementation and documentation commits.

**Test cycle:** Inspect exact-head CI, unresolved comments, changed files, and mergeability. Request independent review. Do not merge or self-approve.

**Completion evidence:** Draft PR remains open and unmerged; a factual exact-head comment states only what the final CI and inspections prove.
