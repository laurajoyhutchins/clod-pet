#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
app_dir="$repo_root/app"
settings_path="${XDG_CONFIG_HOME:-$HOME/.config}/clod-pet/clod-pet-settings.json"

usage() {
  echo "Usage: $0 [options] [-- [npm-args]]"
  echo ""
  echo "Options:"
  echo "  -d, --debug    Enable debug logging (sets VERBOSE=true and NODE_ENV=development)"
  echo "  -h, --help     Show this help"
  echo ""
  echo "Example:"
  echo "  $0 --debug"
  echo ""
}

DEBUG=false
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--debug)
      DEBUG=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      PASSTHROUGH_ARGS+=("$@")
      break
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

header "Running ClodPet"

if [[ "$DEBUG" == "true" ]]; then
  info "Debug mode enabled"
  export VERBOSE=true
  export NODE_ENV=development
fi

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

export CLOD_PET_INSTALL_ROOT="${CLOD_PET_INSTALL_ROOT:-$app_dir/dist}"
export SETTINGS_PATH="${SETTINGS_PATH:-$settings_path}"

dist_main="$app_dir/dist/src/main/main.js"
electron_bin="$app_dir/node_modules/.bin/electron"
if [[ ! -f "$dist_main" ]]; then
  error "Built app not found at $dist_main. Run scripts/build.sh first."
  show_failure_sheep "run failed!"
  exit 1
fi

if [[ ! -x "$electron_bin" ]]; then
  error "Electron executable not found at $electron_bin. Reinstall app dependencies."
  show_failure_sheep "run failed!"
  exit 1
fi

cd "$app_dir"
info "Starting Electron app..."
if "$electron_bin" --no-sandbox . "${PASSTHROUGH_ARGS[@]}"; then
  exit 0
else
  status=$?
  show_failure_sheep "app exited with errors!"
  exit $status
fi
