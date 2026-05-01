#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
app_dir="$repo_root/app"

backend_output="${CLOD_PET_BACKEND_OUTPUT:-clod-pet-backend}"

command -v go >/dev/null || { echo "Go is not installed or not in PATH" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is not installed or not in PATH" >&2; exit 1; }

echo "Building backend..."
(cd "$backend_dir" && go build -o "$backend_output" .)

echo "Installing app dependencies..."
if [[ -f "$app_dir/package-lock.json" ]]; then
  (cd "$app_dir" && npm ci --loglevel=error)
else
  (cd "$app_dir" && npm install --loglevel=error)
fi

echo "Building app..."
(cd "$app_dir" && npm run build:ts)

echo "Build complete."
