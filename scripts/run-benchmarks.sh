#!/usr/bin/env bash
# Run all backend benchmarks and generate a summary report

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

header "Running all backend benchmarks"


# Create output directory
mkdir -p bench-results

# Run benchmarks for each package
echo -e "\n=== Engine Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/engine/... > ../bench-results/engine.txt 2>&1
cat ../bench-results/engine.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=== Expression Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/expression/... > ../bench-results/expression.txt 2>&1
cat ../bench-results/expression.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=== Pet Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/pet/... > ../bench-results/pet.txt 2>&1
cat ../bench-results/pet.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=== IPC Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/ipc/... > ../bench-results/ipc.txt 2>&1
cat ../bench-results/ipc.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=== Service Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/service/... > ../bench-results/service.txt 2>&1
cat ../bench-results/service.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=== LLM Benchmarks ==="
cd backend; go test -bench=. -benchtime=3s -count=3 ./internal/llm/... > ../bench-results/llm.txt 2>&1
cat ../bench-results/llm.txt | grep -E "^(Benchmark|ns/op)"

echo -e "\n=========================================="
info "Benchmark results saved to bench-results/"
show_success_sheep "benchmarks completed!"
