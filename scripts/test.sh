#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
frontend_dir="$repo_root/frontend"

run_backend=1
run_frontend=1
run_e2e=0

if [[ $# -gt 0 ]]; then
  run_backend=0
  run_frontend=0
  run_e2e=0
  specified_target=0

  for arg in "$@"; do
    case "$arg" in
      backend) run_backend=1; specified_target=1 ;;
      frontend) run_frontend=1; specified_target=1 ;;
      e2e) run_e2e=1; specified_target=1 ;;
      all) run_backend=1; run_frontend=1; run_e2e=1; specified_target=1 ;;
      *) echo "Unknown test target: $arg" >&2; exit 1 ;;
    esac
  done

  if [[ "$specified_target" == "0" ]]; then
    run_backend=1
    run_frontend=1
  fi
fi

if [[ "$run_backend" == "1" ]]; then
  echo "Running backend tests..."
  (cd "$backend_dir" && go test -v -cover ./...)
fi

if [[ "$run_frontend" == "1" ]]; then
  echo "Running frontend tests..."
  (cd "$frontend_dir" && npm test)
fi

if [[ "$run_e2e" == "1" ]]; then
  echo "Running frontend e2e tests..."
  (cd "$frontend_dir" && npm run test:e2e)
fi
