#!/usr/bin/env bash
#
# Demo Harper Edge AI system
#
# Run interactive demonstrations of model inference across different backends.
#
# Usage:
#   ./demo.sh                # Run all demos on local instance
#   ./demo.sh --remote       # Run demos on remote instance from .env
#   ./demo.sh --profile minimal  # Use specific profile for demo

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

# ============================================
# CONFIGURATION
# ============================================

# Default to local instance
HARPER_URL="${HARPER_URL:-http://localhost:9926}"
DEPLOY_REMOTE_URL="${DEPLOY_REMOTE_URL:-}"
DEMO_PROFILE="${DEMO_PROFILE:-development}"
REMOTE_MODE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# FUNCTIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
Harper Edge AI Demo Script

Run interactive demonstrations of model inference.

USAGE:
    ./demo.sh [OPTIONS]

OPTIONS:
    --help              Show this help message
    --remote            Demo remote instance from .env
    --profile <name>    Use specific profile (default: development)

CONFIGURATION (.env):
    # Local instance (default)
    HARPER_URL=http://localhost:9926

    # Remote instance
    DEPLOY_REMOTE_URL=https://your-instance.com:9926

    # Demo settings
    DEMO_PROFILE=development  # Profile to use for demo

EXAMPLES:
    # Run all demos locally
    ./demo.sh

    # Demo remote instance
    ./demo.sh --remote

    # Use specific profile
    ./demo.sh --profile minimal

EOF
}

demo_header() {
    local title=$1
    echo ""
    echo -e "${BLUE}${title}${NC}"
    echo "$(printf '=%.0s' {1..50})"
}

# ============================================
# MAIN
# ============================================

# Parse arguments
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
            DEMO_PROFILE="$2"
            shift 2
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
    if [[ -z "$DEPLOY_REMOTE_URL" ]]; then
        log_error "DEPLOY_REMOTE_URL not set in .env"
        exit 1
    fi
    # Convert deployment port (9925) to application port (9926)
    if [[ "$DEPLOY_REMOTE_URL" =~ :9925$ ]]; then
        HARPER_URL="${DEPLOY_REMOTE_URL%:9925}:9926"
    else
        HARPER_URL="${DEPLOY_REMOTE_URL}"
    fi
fi

# Header
echo ""
log_info "========================================="
log_info "🧠 Harper Edge AI - Interactive Demo"
log_info "========================================="
echo ""
log_info "Target: ${HARPER_URL}"
log_info "Profile: ${DEMO_PROFILE}"
echo ""

# Check if server is running
log_info "Checking server status..."
if ! curl -s --max-time 5 "${HARPER_URL}/Status" > /dev/null 2>&1; then
    log_error "Server not running at ${HARPER_URL}"
    if [[ "$REMOTE_MODE" == "true" ]]; then
        log_info "Check if remote Harper instance is accessible"
    else
        log_info "Start local server with: npm run dev"
    fi
    exit 1
fi
log_success "Server is running"

# Health Check
demo_header "1. Health Check"
curl -s "${HARPER_URL}/Status" | jq '.' 2>/dev/null || curl -s "${HARPER_URL}/Status"
echo ""

# Check models loaded
demo_header "2. Checking Loaded Models"
MODEL_COUNT=$(curl -s "${HARPER_URL}/Model/" | jq 'length' 2>/dev/null || echo "0")
if [ "$MODEL_COUNT" -eq 0 ]; then
    log_warn "No models loaded"
    log_info "Deploy models with: npm run preload:${DEMO_PROFILE}"
    exit 1
fi
log_success "Found ${MODEL_COUNT} model(s)"
echo ""
curl -s "${HARPER_URL}/Model/" | jq -r '.[] | "  - \(.modelName):\(.modelVersion) (\(.framework))"' 2>/dev/null
echo ""

# Get first available model for demo
FIRST_MODEL=$(curl -s "${HARPER_URL}/Model/" | jq -r '.[0] | "\(.modelName):\(.modelVersion)"' 2>/dev/null)
MODEL_NAME=$(echo "$FIRST_MODEL" | cut -d: -f1)
MODEL_VERSION=$(echo "$FIRST_MODEL" | cut -d: -f2)

# Demo inference with first available model
demo_header "3. Text Embedding Prediction (${MODEL_NAME})"
curl -s -X POST "${HARPER_URL}/Predict" \
    -H "Content-Type: application/json" \
    -d "{
        \"modelName\": \"${MODEL_NAME}\",
        \"modelVersion\": \"${MODEL_VERSION}\",
        \"inputs\": {
            \"text\": \"lightweight running shoes for trail running\"
        }
    }" | jq '.' 2>/dev/null || echo "Inference failed"
echo ""

# Try to demo Transformers.js if available
TRANSFORMERS_MODEL=$(curl -s "${HARPER_URL}/Model/" | jq -r '.[] | select(.framework == "transformers") | "\(.modelName):\(.modelVersion)"' 2>/dev/null | head -1)
if [[ -n "$TRANSFORMERS_MODEL" ]] && [[ "$TRANSFORMERS_MODEL" != ":" ]]; then
    TRANS_NAME=$(echo "$TRANSFORMERS_MODEL" | cut -d: -f1)
    TRANS_VERSION=$(echo "$TRANSFORMERS_MODEL" | cut -d: -f2)

    demo_header "4. Transformers.js Inference (${TRANS_NAME})"
    curl -s -X POST "${HARPER_URL}/Predict" \
        -H "Content-Type: application/json" \
        -d "{
            \"modelName\": \"${TRANS_NAME}\",
            \"modelVersion\": \"${TRANS_VERSION}\",
            \"inputs\": {
                \"text\": \"waterproof hiking boots for winter camping\"
            }
        }" | jq '.' 2>/dev/null || echo "Inference failed"
    echo ""
fi

# Show monitoring if available
if [[ -n "$MODEL_NAME" ]]; then
    demo_header "5. Model Inference Metrics"
    curl -s "${HARPER_URL}/Monitoring?modelName=${MODEL_NAME}" | jq '.' 2>/dev/null || echo "Monitoring data not available"
    echo ""
fi

# Summary
echo ""
log_success "========================================="
log_success "Demo Complete!"
log_success "========================================="
echo ""

log_info "Next steps:"
echo "  • Run benchmarks:   ./benchmark.sh"
echo "  • Verify system:    ./verify.sh --full"
echo "  • View all models:  curl ${HARPER_URL}/Model/ | jq"
echo "  • View API docs:    docs/API.md"
echo ""

exit 0
