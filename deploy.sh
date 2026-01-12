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
# LOAD ENVIRONMENT
# ============================================

# Load .env file if it exists
if [[ -f .env ]]; then
    # Export variables from .env file
    set -a
    source .env
    set +a
fi

# ============================================
# CONFIGURATION
# ============================================

# Remote Harper instance (configurable via .env)
REMOTE_HOST="${DEPLOY_REMOTE_HOST:-ai-ops.irjudson-ai.harperfabric.com}"
REMOTE_PORT="${DEPLOY_REMOTE_PORT:-9925}"
REMOTE_URL="${DEPLOY_REMOTE_URL:-https://${REMOTE_HOST}:${REMOTE_PORT}}"

# Harper Admin Credentials (configurable via .env or environment)
REMOTE_USERNAME="${CLI_TARGET_USERNAME:-${DEPLOY_USERNAME:-HDB_ADMIN}}"
REMOTE_PASSWORD="${CLI_TARGET_PASSWORD:-${DEPLOY_PASSWORD:-}}"

# Model Fetch Token (for testing, configurable via .env)
MODEL_FETCH_TOKEN="${MODEL_FETCH_TOKEN:-}"

# Harper deploy options (configurable via .env)
DEPLOY_REPLICATED="${DEPLOY_REPLICATED:-true}"  # Replicate across cluster nodes
DEPLOY_RESTART="${DEPLOY_RESTART:-true}"        # Restart after deploy

# Backend selection (configurable via .env for automated deployments)
# Set to 'auto' to skip interactive prompt, or comma-separated: onnx,tensorflow,transformers
DEPLOY_BACKENDS="${DEPLOY_BACKENDS:-}"

# Script flow options (defaults to full deployment)
RESTART_HARPER=true
RUN_TESTS=true
CHECK_STATUS=false
DRY_RUN=false
LOCAL_MODE=false

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

    # Check if credentials are configured (skip for local mode)
    if [[ -z "$REMOTE_PASSWORD" ]] && [[ "$LOCAL_MODE" != "true" ]]; then
        log_error "REMOTE_PASSWORD not set"
        log_info "Set in .env file:"
        log_info "  DEPLOY_PASSWORD=your-password"
        log_info "Or use environment variable:"
        log_info "  export CLI_TARGET_PASSWORD=your-password"
        exit 1
    fi

    if [[ -z "$MODEL_FETCH_TOKEN" ]]; then
        log_warn "MODEL_FETCH_TOKEN not set - tests will fail if token is required"
        log_info "Set in .env file: MODEL_FETCH_TOKEN=your-token"
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

select_backends() {
    log_info "Selecting ML backends for deployment..."

    local backend_selection=""

    # Check if DEPLOY_BACKENDS is set (automated deployment)
    if [[ -n "$DEPLOY_BACKENDS" ]]; then
        log_info "Using backends from DEPLOY_BACKENDS: $DEPLOY_BACKENDS"
        backend_selection="$DEPLOY_BACKENDS"
    else
        # Interactive selection
        echo ""
        echo "Available ML backends and their sizes:"
        echo "  1. ONNX Runtime        - 183 MB"
        echo "  2. TensorFlow.js       - 683 MB"
        echo "  3. Transformers.js     -  45 MB"
        echo "  4. All backends        - 911 MB (WARNING: >800MB)"
        echo ""
        echo "Note: Ollama backend is always available (0 MB - external service)"
        echo ""
        echo "Select backends to deploy (comma-separated, e.g., 1,3 or 'all'):"
        read -r backend_selection

        # Default to all if empty
        if [[ -z "$backend_selection" ]]; then
            backend_selection="all"
        fi
    fi

    # Parse selection
    DEPLOY_ONNX=false
    DEPLOY_TENSORFLOW=false
    DEPLOY_TRANSFORMERS=false

    if [[ "$backend_selection" == "all" ]] || [[ "$backend_selection" == "4" ]]; then
        DEPLOY_ONNX=true
        DEPLOY_TENSORFLOW=true
        DEPLOY_TRANSFORMERS=true
    else
        IFS=',' read -ra SELECTIONS <<< "$backend_selection"
        for sel in "${SELECTIONS[@]}"; do
            # Trim whitespace
            sel=$(echo "$sel" | xargs)
            case $sel in
                1|onnx) DEPLOY_ONNX=true ;;
                2|tensorflow) DEPLOY_TENSORFLOW=true ;;
                3|transformers) DEPLOY_TRANSFORMERS=true ;;
                *) log_warn "Unknown selection: $sel" ;;
            esac
        done
    fi

    # Calculate total size
    local total_size=0
    local selected_backends=""

    if [[ "$DEPLOY_ONNX" == "true" ]]; then
        total_size=$((total_size + 183))
        selected_backends="${selected_backends}ONNX, "
    fi

    if [[ "$DEPLOY_TENSORFLOW" == "true" ]]; then
        total_size=$((total_size + 683))
        selected_backends="${selected_backends}TensorFlow, "
    fi

    if [[ "$DEPLOY_TRANSFORMERS" == "true" ]]; then
        total_size=$((total_size + 45))
        selected_backends="${selected_backends}Transformers.js, "
    fi

    # Remove trailing comma
    selected_backends="${selected_backends%, }"

    if [[ -z "$selected_backends" ]]; then
        log_error "No backends selected. At least one backend is required."
        exit 1
    fi

    log_info "Selected backends: ${selected_backends}"
    log_info "Estimated deployment size: ${total_size} MB"

    # Warn if >800MB
    if [[ $total_size -gt 800 ]]; then
        log_warn "⚠️  Deployment size (${total_size}MB) exceeds 800MB!"
        log_warn "This may cause slow deployments or storage issues."
        echo ""
        # Skip confirmation in dry-run mode
        if [[ "$DRY_RUN" != "true" ]]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Deployment cancelled."
                exit 0
            fi
        fi
    fi

    echo ""
}

create_deployment_package() {
    log_info "Creating deployment package with selected backends..."

    # Backup original package.json
    cp package.json package.json.backup

    # Use Node.js to modify package.json (cross-platform compatible)
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        // Build new dependencies based on selections
        const newDeps = { uuid: pkg.dependencies.uuid };

        if ('$DEPLOY_ONNX' === 'true') {
            newDeps['onnxruntime-node'] = pkg.dependencies['onnxruntime-node'];
        }

        if ('$DEPLOY_TENSORFLOW' === 'true') {
            newDeps['@tensorflow/tfjs-node'] = pkg.dependencies['@tensorflow/tfjs-node'];
            newDeps['@tensorflow-models/universal-sentence-encoder'] = pkg.dependencies['@tensorflow-models/universal-sentence-encoder'];
        }

        if ('$DEPLOY_TRANSFORMERS' === 'true') {
            newDeps['@xenova/transformers'] = pkg.dependencies['@xenova/transformers'];
        }

        // Replace dependencies
        pkg.dependencies = newDeps;

        // Write modified package.json
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
    "

    log_success "Deployment package configured"
}

restore_package_json() {
    log_info "Restoring original package.json..."

    if [[ -f package.json.backup ]]; then
        mv package.json.backup package.json
        rm -f package.json.tmp
        log_success "Original package.json restored"
    fi
}

deploy_code() {
    log_info "Deploying code to ${REMOTE_URL}..."

    local current_branch=$(git branch --show-current)
    log_info "Current branch: ${current_branch}"

    # Set up trap to restore package.json on error
    trap restore_package_json EXIT ERR INT TERM

    # Deploy using Harper CLI
    log_info "Deploying via Harper CLI..."
    log_info "  Replicated: ${DEPLOY_REPLICATED}"
    log_info "  Restart: ${DEPLOY_RESTART}"

    # Export credentials as environment variables (required by Harper CLI)
    export CLI_TARGET_USERNAME="$REMOTE_USERNAME"
    # Only export password if it's not empty (local instances may not need it)
    if [[ -n "$REMOTE_PASSWORD" ]]; then
        export CLI_TARGET_PASSWORD="$REMOTE_PASSWORD"
    fi

    harperdb deploy \
        target="${REMOTE_URL}" \
        replicated="${DEPLOY_REPLICATED}" \
        restart="${DEPLOY_RESTART}"

    # Unset credentials after use
    unset CLI_TARGET_USERNAME
    unset CLI_TARGET_PASSWORD

    if [[ "$DEPLOY_RESTART" == "true" ]] || [[ "$DEPLOY_RESTART" == "rolling" ]]; then
        log_info "Waiting for restart to complete..."
        sleep 5
    fi

    # Restore package.json
    restore_package_json

    # Clear trap
    trap - EXIT ERR INT TERM

    log_success "Code deployed successfully"
}

restart_harper() {
    log_info "Restarting Harper on remote instance..."

    # Export credentials as environment variables (required by Harper CLI)
    export CLI_TARGET_USERNAME="$REMOTE_USERNAME"
    # Only export password if it's not empty (local instances may not need it)
    if [[ -n "$REMOTE_PASSWORD" ]]; then
        export CLI_TARGET_PASSWORD="$REMOTE_PASSWORD"
    fi

    # Restart using Harper CLI
    harperdb restart target="${REMOTE_URL}"

    # Unset credentials after use
    unset CLI_TARGET_USERNAME
    unset CLI_TARGET_PASSWORD

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
    export CLI_TARGET_USERNAME="$REMOTE_USERNAME"
    # Only export password if it's not empty (local instances may not need it)
    if [[ -n "$REMOTE_PASSWORD" ]]; then
        export CLI_TARGET_PASSWORD="$REMOTE_PASSWORD"
    fi

    harperdb status target="${REMOTE_URL}" || true

    unset CLI_TARGET_USERNAME
    unset CLI_TARGET_PASSWORD

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

DEFAULT BEHAVIOR:
    Full deployment: deploy + replicate + restart + test
    To skip any step, use the --no-* flags below.

OPTIONS:
    --help              Show this help message
    --local             Deploy to local Harper instance (http://localhost:9926)
    --dry-run           Show what would be deployed without executing
    --no-restart        Skip Harper restart after deployment
    --no-tests          Skip post-deployment tests
    --no-replicate      Deploy to single node only (no cluster replication)
    --status            Check deployment status (no deploy)

EXAMPLES:
    # Full deployment (default: deploy + replicate + restart + test)
    ./deploy.sh

    # Deploy without restarting
    ./deploy.sh --no-restart

    # Deploy without tests
    ./deploy.sh --no-tests

    # Deploy to single node only (no cluster replication)
    ./deploy.sh --no-replicate

    # Deploy with no restart and no tests
    ./deploy.sh --no-restart --no-tests

    # Check current status only
    ./deploy.sh --status

    # Preview what would be deployed
    ./deploy.sh --dry-run

    # Deploy to local Harper instance (development)
    ./deploy.sh --local

    # Preview local deployment
    ./deploy.sh --local --dry-run

    # Local deployment with specific backends
    DEPLOY_BACKENDS=onnx,transformers ./deploy.sh --local

CONFIGURATION:
    Remote: ${REMOTE_URL}
    Username: ${REMOTE_USERNAME}

    Configuration priority (highest to lowest):
      1. Environment variables (CLI_TARGET_*, DEPLOY_*)
      2. .env file
      3. Script defaults

    .env file variables:
      DEPLOY_REMOTE_HOST=ai-ops.irjudson-ai.harperfabric.com
      DEPLOY_REMOTE_PORT=9925
      DEPLOY_REMOTE_URL=https://ai-ops.irjudson-ai.harperfabric.com:9925
      DEPLOY_USERNAME=HDB_ADMIN
      DEPLOY_PASSWORD=your-password
      DEPLOY_REPLICATED=true              # Replicate across cluster
      DEPLOY_RESTART=true                 # Restart after deploy (true/false/rolling)
      MODEL_FETCH_TOKEN=your-token

    Environment variable overrides:
      CLI_TARGET_USERNAME=HDB_ADMIN
      CLI_TARGET_PASSWORD=your-password
      MODEL_FETCH_TOKEN=your-token

PREREQUISITES:
    - Harper CLI installed: npm install -g harperdb
    - Remote Harper instance running
    - Valid admin credentials in .env or environment

EOF
}

show_dry_run_plan() {
    log_info "========================================="
    log_info "DRY RUN - Deployment Plan"
    log_info "========================================="
    echo ""

    log_info "Target Configuration:"
    if [[ "$LOCAL_MODE" == "true" ]]; then
        echo "  Mode:             Local Development"
    else
        echo "  Mode:             Remote"
    fi
    echo "  Target URL:       ${REMOTE_URL}"
    echo "  Username:         ${REMOTE_USERNAME}"
    echo "  Replicated:       ${DEPLOY_REPLICATED}"
    echo "  Restart Harper:   ${RESTART_HARPER}"
    echo "  Run Tests:        ${RUN_TESTS}"
    echo ""

    log_info "Selected Backends:"
    local backends_list=""
    local total_size=0

    if [[ "$DEPLOY_ONNX" == "true" ]]; then
        backends_list="${backends_list}  ✓ ONNX Runtime        - 183 MB\n"
        total_size=$((total_size + 183))
    fi

    if [[ "$DEPLOY_TENSORFLOW" == "true" ]]; then
        backends_list="${backends_list}  ✓ TensorFlow.js       - 683 MB\n"
        total_size=$((total_size + 683))
    fi

    if [[ "$DEPLOY_TRANSFORMERS" == "true" ]]; then
        backends_list="${backends_list}  ✓ Transformers.js     -  45 MB\n"
        total_size=$((total_size + 45))
    fi

    backends_list="${backends_list}  ✓ Ollama              -   0 MB (external service)"

    echo -e "$backends_list"
    echo ""
    log_info "Total Deployment Size: ${total_size} MB"

    if [[ $total_size -gt 800 ]]; then
        log_warn "⚠️  Deployment size exceeds 800MB!"
    fi
    echo ""

    log_info "Deployment Steps:"
    echo "  1. Package selected backends"
    echo "  2. Deploy to ${REMOTE_URL}"
    if [[ "$DEPLOY_REPLICATED" == "true" ]]; then
        echo "  3. Replicate across cluster nodes"
    else
        echo "  3. Deploy to single node only"
    fi
    if [[ "$RESTART_HARPER" == "true" ]]; then
        echo "  4. Restart Harper"
        echo "  5. Check deployment status"
    fi
    if [[ "$RUN_TESTS" == "true" ]]; then
        echo "  6. Run post-deployment tests"
    fi
    echo ""

    log_success "========================================="
    log_success "Dry Run Complete"
    log_success "========================================="
    echo ""
    log_info "To execute this deployment, run without --dry-run:"
    echo "  ./deploy.sh"
    echo ""
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
        --no-restart)
            RESTART_HARPER=false
            shift
            ;;
        --no-tests)
            RUN_TESTS=false
            shift
            ;;
        --no-replicate)
            DEPLOY_REPLICATED=false
            shift
            ;;
        --status)
            CHECK_STATUS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --local)
            LOCAL_MODE=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Override configuration for local mode
if [[ "$LOCAL_MODE" == "true" ]]; then
    REMOTE_URL="http://localhost:9926"
    REMOTE_HOST="localhost"
    REMOTE_PORT="9926"
    REMOTE_USERNAME="${DEPLOY_USERNAME:-admin}"
    # For local Harper instances, don't set password (uses local auth)
    # If you need a specific password for local, set DEPLOY_PASSWORD in .env
    if [[ -n "${DEPLOY_PASSWORD}" ]]; then
        REMOTE_PASSWORD="${DEPLOY_PASSWORD}"
    else
        REMOTE_PASSWORD=""
    fi
    # Local deployments typically don't need replication
    DEPLOY_REPLICATED=false
fi

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

# Skip prerequisite checks in dry-run mode
if [[ "$DRY_RUN" != "true" ]]; then
    check_prerequisites
    check_remote_connection
fi

# Select backends for deployment
select_backends

# Show dry-run plan and exit if requested
if [[ "$DRY_RUN" == "true" ]]; then
    show_dry_run_plan
    exit 0
fi

create_deployment_package

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
