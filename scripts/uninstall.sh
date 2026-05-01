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
settings_dir="${XDG_CONFIG_HOME:-$HOME/.config}/clod-pet"
settings_path="$settings_dir/clod-pet-settings.json"
launcher_path="$repo_root/clod-pet"
backend_binary="$backend_dir/$backend_output"
app_dist_dir="$app_dir/dist"
log_file="${TMPDIR:-/tmp}/clodpet-uninstall.log"

log() {
  local timestamp line
  timestamp="$(date -Iseconds)"
  line="$timestamp $*"
  printf '%s\n' "$line" >>"$log_file"
}

remove_path() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    rm -rf "$path"
    success "Removed: $path"
    log "Removed: $path"
  else
    warn "Not found: $path"
    log "Not found: $path"
  fi
}

header "Uninstalling ClodPet"
info "Log file: $log_file"
log "=== Starting ClodPet uninstall ==="
log "Repo root: $repo_root"

info "Removing launcher and generated files..."
remove_path "$launcher_path"
remove_path "$backend_binary"
remove_path "$app_dist_dir"

info "Removing settings..."
remove_path "$settings_path"

# Remove empty config directory if we created it.
if [[ -d "$settings_dir" ]] && rmdir "$settings_dir" 2>/dev/null; then
  success "Removed empty config directory: $settings_dir"
  log "Removed empty config directory: $settings_dir"
fi

log "=== Uninstall complete ==="
log "Log saved to: $log_file"

echo ""
printf "${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${GREEN}║  ClodPet uninstall complete!            ║${RESET}\n"
printf "${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}\n"
echo ""
printf "${BOLD}Summary:${RESET}\n"
warn "Launcher: $launcher_path"
warn "Backend:  $backend_binary"
warn "Dist:     $app_dist_dir"
warn "Settings: $settings_path"
warn "Log:      $log_file"
