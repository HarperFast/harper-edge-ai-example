#!/usr/bin/env bash
#
# Deploy script for Harper Edge AI Ops
#
# Uses Harper CLI for deployment to remote Harper instances.
# See docs/DEPLOYMENT.md for complete documentation.
#
# Usage:
#   ./deploy.sh                  # Deploy current directory
#   ./deploy.sh --restart        # Deploy and restart Harper
#   ./deploy.sh --status         # Check deployment status
#   ./deploy.sh --test           # Run post-deployment tests
#   ./deploy.sh --full           # Full deploy: push, restart, and test

set -e  # Exit on error

# ============================================
# CONFIGURATION
# ============================================

# Remote Harper instance
REMOTE_HOST="ai-ops.irjudson-ai.harperfabric.com"
REMOTE_PORT="9925"
REMOTE_URL="https://${REMOTE_HOST}:${REMOTE_PORT}"

# Harper Admin Credentials (update these with your credentials)
REMOTE_USERNAME="${CLI_TARGET_USERNAME:-HDB_ADMIN}"  # TODO: Update with your username
REMOTE_PASSWORD="${CLI_TARGET_PASSWORD:-your-password}"  # TODO: Update with your password

# Model Fetch Token (for testing)
MODEL_FETCH_TOKEN="${MODEL_FETCH_TOKEN:-your-secret-token}"  # TODO: Update with your token

# Deployment options
RESTART_HARPER=false
CHECK_STATUS=false
RUN_TESTS=false
FULL_DEPLOY=false

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

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if Harper CLI is installed
    if ! command -v harperdb &> /dev/null; then
        log_error "Harper CLI not found. Install with: npm install -g harperdb"
        exit 1
    fi

    # Check if git is clean
    if [[ -n $(git status --porcelain) ]]; then
        log_warn "Working directory has uncommitted changes"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check if TODO items are updated
    if grep -q "TODO:" "$0"; then
        log_warn "Configuration contains TODO items - please update credentials"
        log_info "Edit deploy.sh and update REMOTE_USERNAME, REMOTE_PASSWORD, and MODEL_FETCH_TOKEN"
        read -p "Continue with current values? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    log_success "Prerequisites check passed"
}

check_remote_connection() {
    log_info "Testing connection to remote Harper instance..."

    if curl -k -s --max-time 5 "${REMOTE_URL}/Status" > /dev/null; then
        log_success "Remote Harper instance is accessible"
        return 0
    else
        log_error "Cannot connect to ${REMOTE_URL}"
        log_info "Check if Harper is running and firewall allows connections"
        return 1
    fi
}

deploy_code() {
    log_info "Deploying code to ${REMOTE_URL}..."

    local current_branch=$(git branch --show-current)
    log_info "Current branch: ${current_branch}"

    # Deploy using Harper CLI
    log_info "Deploying via Harper CLI..."

    CLI_TARGET_USERNAME="$REMOTE_USERNAME" \
    CLI_TARGET_PASSWORD="$REMOTE_PASSWORD" \
    harperdb deploy target="${REMOTE_URL}"

    log_success "Code deployed successfully"
}

restart_harper() {
    log_info "Restarting Harper on remote instance..."

    # Restart using Harper CLI
    CLI_TARGET_USERNAME="$REMOTE_USERNAME" \
    CLI_TARGET_PASSWORD="$REMOTE_PASSWORD" \
    harperdb restart target="${REMOTE_URL}"

    log_info "Waiting for Harper to restart..."
    sleep 5

    log_success "Harper restarted"
}

check_deployment_status() {
    log_info "Checking deployment status..."

    # Check Harper is responding
    if check_remote_connection; then
        log_success "Harper is running"
    else
        log_error "Harper is not responding"
        return 1
    fi

    # Check using Harper CLI
    log_info "Getting Harper status..."
    CLI_TARGET_USERNAME="$REMOTE_USERNAME" \
    CLI_TARGET_PASSWORD="$REMOTE_PASSWORD" \
    harperdb status target="${REMOTE_URL}" || true

    log_success "Status check complete"
}

run_deployment_tests() {
    log_info "Running post-deployment tests..."

    export HARPER_URL="${REMOTE_URL}"
    export MODEL_FETCH_TOKEN="${MODEL_FETCH_TOKEN}"

    # Test 1: Inspect a HuggingFace model
    log_info "Test 1: Inspect model..."
    if node scripts/cli/harper-ai.js model inspect huggingface Xenova/all-MiniLM-L6-v2 --variant quantized; then
        log_success "✓ Model inspection works"
    else
        log_error "✗ Model inspection failed"
        return 1
    fi

    # Test 2: List jobs
    log_info "Test 2: List jobs..."
    if node scripts/cli/harper-ai.js job list; then
        log_success "✓ Job listing works"
    else
        log_error "✗ Job listing failed"
        return 1
    fi

    # Test 3: List models
    log_info "Test 3: List models..."
    if node scripts/cli/harper-ai.js model list; then
        log_success "✓ Model listing works"
    else
        log_error "✗ Model listing failed"
        return 1
    fi

    log_success "All deployment tests passed"
}

show_help() {
    cat << EOF
Harper Edge AI Ops - Deployment Script

Uses Harper CLI for deployment to remote Harper instances.
See docs/DEPLOYMENT.md for complete documentation.

USAGE:
    ./deploy.sh [OPTIONS]

OPTIONS:
    --help              Show this help message
    --restart           Deploy and restart Harper
    --status            Check deployment status
    --test              Run post-deployment tests
    --full              Full deployment (deploy + restart + test)

EXAMPLES:
    # Deploy code only
    ./deploy.sh

    # Deploy and restart Harper
    ./deploy.sh --restart

    # Full deployment with tests
    ./deploy.sh --full

    # Check current status
    ./deploy.sh --status

CONFIGURATION:
    Remote: ${REMOTE_URL}
    Username: ${REMOTE_USERNAME}

    Set environment variables or edit deploy.sh:
      CLI_TARGET_USERNAME=HDB_ADMIN
      CLI_TARGET_PASSWORD=your-password
      MODEL_FETCH_TOKEN=your-token

PREREQUISITES:
    - Harper CLI installed: npm install -g harperdb
    - Remote Harper instance running
    - Valid admin credentials

EOF
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
        --restart)
            RESTART_HARPER=true
            shift
            ;;
        --status)
            CHECK_STATUS=true
            shift
            ;;
        --test)
            RUN_TESTS=true
            shift
            ;;
        --full)
            FULL_DEPLOY=true
            RESTART_HARPER=true
            RUN_TESTS=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Execute based on flags
if [[ "$CHECK_STATUS" == "true" ]]; then
    check_deployment_status
    exit 0
fi

# Main deployment flow
echo ""
log_info "========================================="
log_info "Harper Edge AI Ops - Deployment"
log_info "========================================="
echo ""

check_prerequisites
check_remote_connection

deploy_code

if [[ "$RESTART_HARPER" == "true" ]]; then
    restart_harper
    check_deployment_status
fi

if [[ "$RUN_TESTS" == "true" ]]; then
    run_deployment_tests
fi

echo ""
log_success "========================================="
log_success "Deployment Complete!"
log_success "========================================="
echo ""

log_info "Next steps:"
log_info "  1. Check status: ./deploy.sh --status"
log_info "  2. Test CLI: harper-ai model list --url ${REMOTE_URL}"
log_info "  3. View docs: docs/DEPLOYMENT.md"
echo ""
