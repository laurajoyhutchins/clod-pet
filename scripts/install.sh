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
log_file="${TMPDIR:-/tmp}/clodpet-install.log"

log() {
  local timestamp line
  timestamp="$(date -Iseconds)"
  line="$timestamp $*"
  printf '%s\n' "$line" >>"$log_file"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

header "Installing ClodPet"
info "Log file: $log_file"
log "=== Starting ClodPet install ==="
log "Repo root: $repo_root"

info "Checking required tools..."
if ! command_exists go; then
  error "Go is not installed or not in PATH"
  log "ERROR: Go is not installed or not in PATH. Please install Go from https://go.dev/dl/"
  exit 1
fi

if ! command_exists npm; then
  error "npm is not installed or not in PATH"
  log "ERROR: npm is not installed or not in PATH. Please install Node.js from https://nodejs.org/"
  exit 1
fi
success "Required tools found"

info "Building Go backend..."
(cd "$backend_dir" && go build -o "$backend_output" .)
success "Backend built: $backend_dir/$backend_output"
log "Backend built: $backend_dir/$backend_output"

info "Installing app dependencies..."
if [[ -f "$app_dir/package-lock.json" ]]; then
  (cd "$app_dir" && npm ci --loglevel=error)
else
  (cd "$app_dir" && npm install --loglevel=error)
fi
success "Dependencies installed"
log "App dependencies installed"

info "Building TypeScript..."
(cd "$app_dir" && npm run build:ts)
success "TypeScript build complete"
log "App TypeScript build complete"

info "Configuring settings..."
mkdir -p "$settings_dir"
if [[ ! -f "$settings_path" ]]; then
  cat >"$settings_path" <<EOF
{
  "PETS_DIR": "$repo_root/pets",
  "PORT": 8080,
  "SETTINGS_PATH": "$settings_path"
}
EOF
  success "Default settings written: $settings_path"
  log "Default settings written: $settings_path"
else
  warn "Settings already exist: $settings_path"
  log "Settings already exist: $settings_path"
fi

info "Creating launcher script..."
cat >"$launcher_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

repo_root="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
app_dir="\$repo_root/app"
settings_path="\${XDG_CONFIG_HOME:-\$HOME/.config}/clod-pet/clod-pet-settings.json"

export PETS_DIR="\${PETS_DIR:-\$repo_root/pets}"
export SETTINGS_PATH="\${SETTINGS_PATH:-\$settings_path}"

cd "\$app_dir"
exec npm start "\$@"
EOF
chmod +x "$launcher_path"
success "Launcher created: $launcher_path"
log "Launcher created: $launcher_path"

log "=== Install complete ==="
log "Log saved to: $log_file"

echo ""
printf "${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}${GREEN}║  ClodPet installation complete!           ║${RESET}\n"
printf "${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}\n"
echo ""
printf "${BOLD}Summary:${RESET}\n"
warn "Backend:  $backend_dir/$backend_output"
warn "Settings: $settings_path"
warn "Launcher: $launcher_path"
warn "Log:      $log_file"
