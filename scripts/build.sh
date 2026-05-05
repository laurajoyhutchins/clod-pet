#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
app_dir="$repo_root/app"

backend_output="${CLOD_PET_BACKEND_OUTPUT:-clod-pet-backend}"

header "Building ClodPet"

if ! command -v go >/dev/null 2>&1; then
  error "Go is not installed or not in PATH"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  error "npm is not installed or not in PATH"
  exit 1
fi

info "Building Go backend..."
(cd "$backend_dir" && go build -o "$backend_output" .)
success "Backend built: $backend_output"

if [[ -d "$app_dir/node_modules" ]]; then
  warn "Skipping dependency install (node_modules exists)"
else
  info "Installing app dependencies..."
  if [[ -f "$app_dir/package-lock.json" ]]; then
    (cd "$app_dir" && npm ci --loglevel=error)
  else
    (cd "$app_dir" && npm install --loglevel=error)
  fi
  success "Dependencies installed"
fi

info "Building TypeScript app..."
(cd "$app_dir" && npm run build:ts)
success "TypeScript build complete"

echo ""
printf "${BOLD}${GREEN}╔══════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${GREEN}║  Build complete!                       ║${RESET}\n"
printf "${BOLD}${GREEN}╚══════════════════════════════════════╝${RESET}\n"

show_success_sheep "build completed successfully!"

