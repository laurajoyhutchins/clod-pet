#!/usr/bin/env bash
set -euo pipefail

if [[ -t 1 ]]; then
  BOLD='\033[1m'
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  BOLD='' RED='' GREEN='' YELLOW='' CYAN='' RESET=''
fi

info()    { printf "${CYAN}-> %s${RESET}\n" "$*"; }
success() { printf "${GREEN}OK %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}!! %s${RESET}\n" "$*"; }
error()   { printf "${RED}ERROR %s${RESET}\n" "$*" >&2; }
header() {
  echo ""
  printf "${BOLD}== %s ==${RESET}\n" "$*"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
app_dir="$repo_root/app"
settings_path="${XDG_CONFIG_HOME:-$HOME/.config}/clod-pet/clod-pet-settings.json"

header "Running ClodPet"

if ! command_exists go; then
  error "Go is not installed or not in PATH"
  exit 1
fi

if ! command_exists npm; then
  error "npm is not installed or not in PATH"
  exit 1
fi

if [[ ! -d "$app_dir" ]]; then
  error "App directory not found: $app_dir"
  exit 1
fi

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

export PETS_DIR="${PETS_DIR:-$repo_root/pets}"
export SETTINGS_PATH="${SETTINGS_PATH:-$settings_path}"

info "Starting Electron app..."
(cd "$app_dir" && exec npm start "$@")
