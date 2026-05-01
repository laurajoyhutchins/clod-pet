#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
app_dir="$repo_root/app"

run_backend=1
run_app=1
run_e2e=0

if [[ $# -gt 0 ]]; then
  run_backend=0
  run_app=0
  run_e2e=0
  specified_target=0

  for arg in "$@"; do
    case "$arg" in
      backend) run_backend=1; specified_target=1 ;;
      app) run_app=1; specified_target=1 ;;
      e2e) run_e2e=1; specified_target=1 ;;
      all) run_backend=1; run_app=1; run_e2e=1; specified_target=1 ;;
      *) echo "Unknown test target: $arg" >&2; exit 1 ;;
    esac
  done

  if [[ "$specified_target" == "0" ]]; then
    run_backend=1
    run_app=1
  fi
fi

if [[ "$run_backend" == "1" ]]; then
  echo "Running backend tests..."
  (cd "$backend_dir" && go test -v -cover ./...)
fi

if [[ "$run_app" == "1" ]]; then
  echo "Running app tests..."
  (cd "$app_dir" && npm test)
fi

if [[ "$run_e2e" == "1" ]]; then
  echo "Running app e2e tests..."
  (cd "$app_dir" && npm run test:e2e)
fi
