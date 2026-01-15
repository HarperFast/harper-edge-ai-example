#!/usr/bin/env bash
#
# Benchmark deployed Harper Edge AI system
#
# Run performance benchmarks on deployed models to compare backends.
#
# Usage:
#   ./benchmark.sh                       # Run all benchmarks
#   ./benchmark.sh --group embeddings-384  # Benchmark specific equivalence group
#   ./benchmark.sh --iterations 1000     # Custom iteration count
#   ./benchmark.sh --remote              # Benchmark remote instance

set -e  # Exit on error

# ============================================
# LOAD ENVIRONMENT
# ============================================

# Load .env file if it exists
if [[ -f .env ]]; then
    set -a
    source .env
    set +a
fi

# Load shared utilities
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${SCRIPT_DIR}/scripts/lib/shell-utils.sh"

# ============================================
# CONFIGURATION
# ============================================

# Default to local instance
HARPER_URL="${HARPER_URL:-http://localhost:9926}"
DEPLOY_REMOTE_URL="${DEPLOY_REMOTE_URL:-}"
REMOTE_USERNAME="${CLI_TARGET_USERNAME:-${DEPLOY_USERNAME:-HDB_ADMIN}}"
REMOTE_PASSWORD="${CLI_TARGET_PASSWORD:-${DEPLOY_PASSWORD:-}}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

# Benchmark configuration
ITERATIONS="${BENCHMARK_ITERATIONS:-100}"
EQUIVALENCE_GROUP="${BENCHMARK_GROUP:-}"
BENCHMARK_PROFILE="${BENCHMARK_PROFILE:-benchmarking}"
REMOTE_MODE=false

# ============================================
# FUNCTIONS
# ============================================

show_help() {
    cat << EOF
Harper Edge AI Benchmarking Script

Run performance benchmarks on deployed models.

USAGE:
    ./benchmark.sh [OPTIONS]

OPTIONS:
    --help                  Show this help message
    --remote                Benchmark remote instance from .env
    --profile <name>        Use specific profile (default: benchmarking)
    --group <name>          Benchmark specific equivalence group only
    --iterations <num>      Number of iterations (default: 100)
    --deploy                Deploy models before benchmarking

CONFIGURATION (.env):
    # Target instance
    HARPER_URL=http://localhost:9926                           # Local
    DEPLOY_REMOTE_URL=https://your-instance.com:9926          # Remote

    # Benchmark settings
    BENCHMARK_ITERATIONS=100        # Default iteration count
    BENCHMARK_GROUP=embeddings-384  # Specific group to benchmark
    BENCHMARK_PROFILE=benchmarking  # Profile to use

    # Backend availability
    OLLAMA_HOST=http://localhost:11434

EXAMPLES:
    # Run all benchmarks locally
    ./benchmark.sh

    # Benchmark specific equivalence group
    ./benchmark.sh --group embeddings-384

    # Benchmark with custom iterations
    ./benchmark.sh --iterations 1000

    # Deploy benchmarking profile and run benchmarks
    ./benchmark.sh --deploy

    # Benchmark remote instance
    ./benchmark.sh --remote --iterations 500

EQUIVALENCE GROUPS:
    Use the benchmarking profile for fair comparisons:
    - embeddings-384: ONNX vs Transformers.js
    - embeddings-768: Ollama vs Transformers.js

    Deploy with: npm run preload:benchmarking

EOF
}

check_harper() {
    log_info "Checking Harper connection..."

    local response
    response=$(curl -s --max-time 5 "${HARPER_URL}/Status" 2>/dev/null || echo "")

    if [[ -z "$response" ]]; then
        log_error "Cannot connect to Harper at ${HARPER_URL}"
        log_info "Make sure Harper is running"
        return 1
    fi

    log_success "Connected to Harper at ${HARPER_URL}"
    return 0
}

check_models() {
    log_info "Checking for deployed models..."

    local models
    models=$(curl -s "${HARPER_URL}/Model/" 2>/dev/null || echo "[]")

    local count
    count=$(echo "$models" | jq 'length' 2>/dev/null || echo "0")

    if [[ "$count" -eq 0 ]]; then
        log_error "No models deployed"
        log_info "Deploy benchmarking models with: npm run preload:benchmarking"
        return 1
    fi

    log_success "Found ${count} deployed model(s)"
    return 0
}

list_equivalence_groups() {
    log_info "Available equivalence groups:"

    local models
    models=$(curl -s "${HARPER_URL}/Model/" 2>/dev/null || echo "[]")

    # Extract and display equivalence groups
    echo "$models" | jq -r '
        [.[] |
         select(.metadata != null) |
         .metadata |
         fromjson |
         .equivalenceGroup
        ] |
        unique |
        .[] |
        "  - \(.)"
    ' 2>/dev/null || echo "  (none found)"

    echo ""
}

run_benchmarks() {
    log_info "Running benchmarks..."

    export HARPER_URL="${HARPER_URL}"
    export OLLAMA_HOST="${OLLAMA_HOST}"

    local bench_args=""

    if [[ -n "$EQUIVALENCE_GROUP" ]]; then
        log_info "Benchmarking equivalence group: ${EQUIVALENCE_GROUP}"
        # The benchmark script will be run in interactive mode and we'll select the group
        # For now, run all benchmarks
    fi

    log_info "Iterations per model: ${ITERATIONS}"
    echo ""

    # Run benchmark script
    if npm run benchmark:all 2>&1; then
        log_success "Benchmarks completed successfully"
        return 0
    else
        log_error "Benchmarks failed"
        return 1
    fi
}

deploy_benchmark_models() {
    log_info "Deploying benchmarking profile models..."

    if npm run preload:benchmarking 2>&1; then
        log_success "Benchmarking models deployed"
        return 0
    else
        log_error "Failed to deploy benchmarking models"
        return 1
    fi
}

# ============================================
# MAIN
# ============================================

# Parse arguments
DEPLOY_MODELS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --remote)
            REMOTE_MODE=true
            shift
            ;;
        --profile)
            BENCHMARK_PROFILE="$2"
            shift 2
            ;;
        --group)
            EQUIVALENCE_GROUP="$2"
            shift 2
            ;;
        --iterations)
            ITERATIONS="$2"
            shift 2
            ;;
        --deploy)
            DEPLOY_MODELS=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Use remote URL if remote mode
if [[ "$REMOTE_MODE" == "true" ]]; then
    if ! setup_remote_url "$DEPLOY_REMOTE_URL"; then
        exit 1
    fi
fi

# Header
echo ""
log_info "========================================="
log_info "Harper Edge AI - Performance Benchmarks"
log_info "========================================="
echo ""
log_info "Target: ${HARPER_URL}"
log_info "Profile: ${BENCHMARK_PROFILE}"
log_info "Iterations: ${ITERATIONS}"
if [[ -n "$EQUIVALENCE_GROUP" ]]; then
    log_info "Group: ${EQUIVALENCE_GROUP}"
fi
echo ""

# Check connection
if ! check_harper; then
    exit 1
fi

# Deploy models if requested
if [[ "$DEPLOY_MODELS" == "true" ]]; then
    if ! deploy_benchmark_models; then
        exit 1
    fi
    echo ""
fi

# Check models
if ! check_models; then
    exit 1
fi

# Show available groups
list_equivalence_groups

# Run benchmarks
if ! run_benchmarks; then
    echo ""
    log_error "========================================="
    log_error "Benchmarks Failed"
    log_error "========================================="
    echo ""
    exit 1
fi

# Success
echo ""
log_success "========================================="
log_success "Benchmarks Complete"
log_success "========================================="
echo ""

log_info "Results saved to benchmark-*.json"
log_info "Review results to compare backend performance"
echo ""

exit 0
