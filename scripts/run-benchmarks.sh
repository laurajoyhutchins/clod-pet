#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

trap 'status=$?; if [[ $status -ne 0 ]]; then show_failure_sheep "benchmarks failed!"; fi' EXIT

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
backend_dir="$repo_root/backend"
bench_results_dir="$repo_root/bench-results"

header "Running all backend benchmarks"

mkdir -p "$bench_results_dir"

run_benchmark() {
  local title="$1"
  local name="$2"
  local path="$3"
  local output_path="$bench_results_dir/$name.txt"

  printf '\n=== %s Benchmarks ===\n' "$title"
  (cd "$backend_dir" && go test -bench=. -benchtime=3s -count=3 "$path" > "$output_path" 2>&1)
  grep -E "^(Benchmark|ns/op)" "$output_path" || true
}

run_benchmark "Engine" "engine" "./internal/engine/..."
run_benchmark "Expression" "expression" "./internal/expression/..."
run_benchmark "Pet" "pet" "./internal/pet/..."
run_benchmark "IPC" "ipc" "./internal/ipc/..."
run_benchmark "Service" "service" "./internal/service/..."
run_benchmark "LLM" "llm" "./internal/llm/..."

echo -e "\n=========================================="
info "Benchmark results saved to $bench_results_dir/"
show_success_sheep "benchmarks completed!"
