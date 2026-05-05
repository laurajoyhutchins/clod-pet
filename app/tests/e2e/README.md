# End-to-End Tests

These tests exercise the Go backend through real HTTP requests.

## What They Cover

- Health and version endpoints.
- Pet loading and state mutation flows.
- Backend error handling for invalid commands.

## Notes

- The suite starts the backend process itself.
- Tests expect a working Go toolchain and access to the repo-level `backend/` and `pets/` directories.
