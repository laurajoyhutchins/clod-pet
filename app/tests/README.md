# Tests

Test code is split by scope.

## Subdirectories

- `unit/` - Jest unit tests for app modules and helpers.
- `e2e/` - backend API end-to-end tests.

## Notes

- Unit tests should avoid starting the backend unless a test explicitly needs integration behavior.
- End-to-end tests may start the backend process and exercise real HTTP endpoints.
