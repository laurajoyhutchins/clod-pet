#!/usr/bin/env bash
set -euo pipefail

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
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$log_file"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

log "=== Starting ClodPet install ==="
log "Repo root: $repo_root"

log "Checking required tools..."
if ! command_exists go; then
  log "ERROR: Go is not installed or not in PATH. Please install Go from https://go.dev/dl/"
  exit 1
fi

if ! command_exists npm; then
  log "ERROR: npm is not installed or not in PATH. Please install Node.js from https://nodejs.org/"
  exit 1
fi

log "Building Go backend..."
(cd "$backend_dir" && go build -o "$backend_output" .)
log "Backend built: $backend_dir/$backend_output"

log "Installing app dependencies..."
if [[ -f "$app_dir/package-lock.json" ]]; then
  (cd "$app_dir" && npm ci --loglevel=error)
else
  (cd "$app_dir" && npm install --loglevel=error)
fi
log "App dependencies installed"

log "Building app TypeScript..."
(cd "$app_dir" && npm run build:ts)
log "App TypeScript build complete"

log "Ensuring default settings path exists..."
mkdir -p "$settings_dir"
if [[ ! -f "$settings_path" ]]; then
  cat >"$settings_path" <<EOF
{
  "PETS_DIR": "$repo_root/pets",
  "PORT": 8080,
  "SETTINGS_PATH": "$settings_path"
}
EOF
  log "Default settings written: $settings_path"
else
  log "Settings already exist: $settings_path"
fi

log "Creating launcher script..."
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
log "Launcher created: $launcher_path"

log "=== Install complete ==="
log "Log saved to: $log_file"
printf '\nClodPet installation complete.\n'
printf '  Backend: %s/%s\n' "$backend_dir" "$backend_output"
printf '  Settings: %s\n' "$settings_path"
printf '  Launcher: %s\n' "$launcher_path"
