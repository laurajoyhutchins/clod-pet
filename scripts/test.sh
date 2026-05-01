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
log_file="${TMPDIR:-/tmp}/clodpet-test.log"

# Initialize log
: > "$log_file"
echo "$(date -Iseconds) === Starting ClodPet test suite ===" >> "$log_file"

run_backend=1
run_app=1
run_e2e=0

if [[ $# -gt 0 ]]; then
  run_backend=0
  run_app=0
  run_e2e=0
  specified_target=0

  for arg in "$@"; do
    case "$arg" in
      backend) run_backend=1; specified_target=1 ;;
      app) run_app=1; specified_target=1 ;;
      e2e) run_e2e=1; specified_target=1 ;;
      all) run_backend=1; run_app=1; run_e2e=1; specified_target=1 ;;
      *) error "Unknown test target: $arg"; exit 1 ;;
    esac
  done

  if [[ "$specified_target" == "0" ]]; then
    run_backend=1
    run_app=1
  fi
fi

header "Running ClodPet Tests"
info "Log file: $log_file"

# Track results
backend_exit=0
app_exit=0
e2e_exit=0

if [[ "$run_backend" == "1" ]]; then
  header "Backend Go Tests"
  info "Running Go tests..."
  
  if [[ ! -d "$backend_dir" ]]; then
    error "Backend directory not found: $backend_dir"
    echo "$(date -Iseconds) Backend tests: SKIPPED (directory not found)" >> "$log_file"
    backend_exit=1
  else
    # Run tests and filter output
    output=$(cd "$backend_dir" && go test -v -cover ./... 2>&1)
    backend_exit=$?
    
    # Display relevant test output
    echo "$output" | grep -E "^(=== RUN|--- PASS|--- FAIL|PASS|FAIL|ok|coverage:)" || true
    
    if [[ $backend_exit -eq 0 ]]; then
      success "All backend tests passed!"
      echo "$(date -Iseconds) Backend tests: ALL PASSED" >> "$log_file"
    else
      error "Some backend tests failed!"
      echo "$(date -Iseconds) Backend tests: FAILED" >> "$log_file"
    fi
  fi
fi

if [[ "$run_app" == "1" ]]; then
  header "App Jest Tests"
  info "Running Jest tests..."
  
  if [[ ! -d "$app_dir" ]]; then
    error "App directory not found: $app_dir"
    echo "$(date -Iseconds) App tests: SKIPPED (directory not found)" >> "$log_file"
    app_exit=1
  else
    # Run tests and capture last 50 lines
    output=$(cd "$app_dir" && npm test -- --verbose 2>&1)
    app_exit=$?
    
    # Display last 50 lines
    echo "$output" | tail -50
    
    if [[ $app_exit -eq 0 ]]; then
      success "All app tests passed!"
      echo "$(date -Iseconds) App tests: ALL PASSED" >> "$log_file"
    else
      error "Some app tests failed!"
      echo "$(date -Iseconds) App tests: FAILED" >> "$log_file"
    fi
  fi
fi

if [[ "$run_e2e" == "1" ]]; then
  header "App E2E Tests"
  info "Running E2E tests..."
  
  if [[ ! -d "$app_dir" ]]; then
    error "App directory not found: $app_dir"
    echo "$(date -Iseconds) E2E tests: SKIPPED (directory not found)" >> "$log_file"
    e2e_exit=1
  else
    # Run tests and capture last 50 lines
    output=$(cd "$app_dir" && npm run test:e2e 2>&1)
    e2e_exit=$?
    
    # Display last 50 lines
    echo "$output" | tail -50
    
    if [[ $e2e_exit -eq 0 ]]; then
      success "All E2E tests passed!"
      echo "$(date -Iseconds) E2E tests: ALL PASSED" >> "$log_file"
    else
      error "Some E2E tests failed!"
      echo "$(date -Iseconds) E2E tests: FAILED" >> "$log_file"
    fi
  fi
fi

# Summary
header "Test Summary"

if [[ "$run_backend" == "1" ]]; then
  if [[ $backend_exit -eq 0 ]]; then
    success "Backend Tests: PASSED"
  else
    error "Backend Tests: FAILED"
  fi
fi

if [[ "$run_app" == "1" ]]; then
  if [[ $app_exit -eq 0 ]]; then
    success "App Tests:     PASSED"
  else
    error "App Tests:     FAILED"
  fi
fi

if [[ "$run_e2e" == "1" ]]; then
  if [[ $e2e_exit -eq 0 ]]; then
    success "E2E Tests:     PASSED"
  else
    error "E2E Tests:     FAILED"
  fi
fi

echo ""
warn "Log saved to: $log_file"

# Exit with appropriate code
any_failed=0
[[ "$run_backend" == "1" && $backend_exit -ne 0 ]] && any_failed=1
[[ "$run_app" == "1" && $app_exit -ne 0 ]] && any_failed=1
[[ "$run_e2e" == "1" && $e2e_exit -ne 0 ]] && any_failed=1

exit $any_failed
