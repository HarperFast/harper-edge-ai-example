#!/usr/bin/env bash
#
# Shared Shell Utilities
#
# Common functions and variables used across deployment scripts.
# Source this file at the beginning of shell scripts:
#   source "$(dirname "$0")/scripts/lib/shell-utils.sh"

# ============================================
# COLORS
# ============================================

export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export NC='\033[0m' # No Color

# ============================================
# LOGGING FUNCTIONS
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

# ============================================
# URL CONVERSION
# ============================================

# Convert deployment URL (port 9925) to application URL (port 9926)
# Usage: HARPER_URL=$(convert_deploy_url_to_app_url "$DEPLOY_REMOTE_URL")
convert_deploy_url_to_app_url() {
    local deploy_url="$1"

    if [[ "$deploy_url" =~ :9925$ ]]; then
        echo "${deploy_url%:9925}:9926"
    else
        echo "$deploy_url"
    fi
}

# ============================================
# REMOTE URL SETUP
# ============================================

# Set up HARPER_URL for remote mode
# Usage: setup_remote_url DEPLOY_REMOTE_URL
# Sets global HARPER_URL variable
setup_remote_url() {
    local remote_url="$1"

    if [[ -z "$remote_url" ]]; then
        log_error "DEPLOY_REMOTE_URL not set in .env"
        return 1
    fi

    # Convert deployment port (9925) to application port (9926)
    HARPER_URL=$(convert_deploy_url_to_app_url "$remote_url")
    return 0
}
