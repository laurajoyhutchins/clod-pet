#!/usr/bin/env bash
set -euo pipefail

# Color and style configuration
if [[ -t 1 ]]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  BOLD='' DIM='' RED='' GREEN='' YELLOW='' BLUE='' CYAN='' RESET=''
fi

# Visual elements
ARROW="→"
CHECK="✓"
CROSS="✗"
BULLET="•"

# Print functions
info()    { printf "${CYAN}${ARROW} %s${RESET}\n" "$*"; }
success() { printf "${GREEN}${CHECK} %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}  ${BULLET} %s${RESET}\n" "$*"; }
error()   { printf "${RED}${CROSS} %s${RESET}\n" "$*" >&2; }
header() {
  echo ""
  printf "${BOLD}${BLUE}══ $* ══${RESET}\n"
}

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

info "Installing app dependencies..."
if [[ -f "$app_dir/package-lock.json" ]]; then
  (cd "$app_dir" && npm ci --loglevel=error)
else
  (cd "$app_dir" && npm install --loglevel=error)
fi
success "Dependencies installed"

info "Building TypeScript app..."
(cd "$app_dir" && npm run build:ts)
success "TypeScript build complete"

echo ""
printf "${BOLD}${GREEN}╔══════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${GREEN}║  Build complete!                       ║${RESET}\n"
printf "${BOLD}${GREEN}╚══════════════════════════════════════╝${RESET}\n"
