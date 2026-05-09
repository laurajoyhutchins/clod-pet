#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

trap 'status=$?; if [[ $status -ne 0 ]]; then show_failure_sheep "build failed!"; fi' EXIT

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
app_dir="$repo_root/app"

backend_output="${CLOD_PET_BACKEND_OUTPUT:-clod-pet-backend}"
build_mode="${CLOD_PET_BUILD_MODE:-release}"

usage() {
  echo "Usage: $0 [--debug|--release]"
  echo ""
  echo "Options:"
  echo "  --debug      Build backend with debug tag and -gcflags='all=-N -l'"
  echo "  --release    Build backend with release flags (default)"
  echo "  -h, --help   Show this help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      build_mode="debug"
      shift
      ;;
    --release)
      build_mode="release"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown build option: $1"
      usage >&2
      exit 1
      ;;
  esac
done

if ! build_mode="$(normalize_build_mode "$build_mode")"; then
  error "Invalid CLOD_PET_BUILD_MODE: ${CLOD_PET_BUILD_MODE:-$build_mode}"
  exit 1
fi

header "Building ClodPet"

if ! command -v go >/dev/null 2>&1; then
  error "Go is not installed or not in PATH"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  error "npm is not installed or not in PATH"
  exit 1
fi

info "Building Go backend ($build_mode)..."
go_build_args=(-o "$backend_output")
if [[ "$build_mode" == "debug" ]]; then
  go_build_args+=(-tags debug -gcflags "all=-N -l")
else
  go_build_args+=(-trimpath -ldflags "-s -w")
fi
(cd "$backend_dir" && go build "${go_build_args[@]}" .)
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
