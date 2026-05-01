#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
frontend_dir="$repo_root/frontend"

backend_output="${CLOD_PET_BACKEND_OUTPUT:-clod-pet-backend}"

command -v go >/dev/null || { echo "Go is not installed or not in PATH" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is not installed or not in PATH" >&2; exit 1; }

echo "Building backend..."
(cd "$backend_dir" && go build -o "$backend_output" .)

echo "Installing frontend dependencies..."
if [[ -f "$frontend_dir/package-lock.json" ]]; then
  (cd "$frontend_dir" && npm ci --loglevel=error)
else
  (cd "$frontend_dir" && npm install --loglevel=error)
fi

echo "Building frontend..."
(cd "$frontend_dir" && npm run build:ts)

echo "Build complete."
