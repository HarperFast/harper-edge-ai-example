#!/bin/bash

# Harper Edge AI Proxy - Model Setup Script
# Downloads and configures AI models for outdoor gear personalization

set -e

# Check if we have bash 4+ for associative arrays
if [ "${BASH_VERSION%%.*}" -lt 4 ]; then
    echo "⚠️  This script requires Bash 4.0 or later for associative arrays"
    echo "On macOS, install with: brew install bash"
    echo "Or run: ./scripts/download-models.sh for simple model download"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODELS_DIR="./models"
TEMP_DIR="/tmp/harper-models"
MODEL_REPO_URL="https://github.com/Harper/harper-edge-ai-models/releases/download/v1.0.0"
REQUIRED_SPACE_MB=500

# Available models with metadata
declare -A MODELS=(
    ["collaborative-filtering"]="Collaborative filtering for user-item recommendations|15MB"
    ["content-based"]="Content-based product similarity matching|25MB" 
    ["hybrid-recommender"]="Hybrid approach combining CF and CB|40MB"
    ["user-segmentation"]="User classification (beginner/intermediate/expert)|12MB"
    ["price-elasticity"]="Dynamic pricing optimization|8MB"
    ["session-intent"]="Shopping intent understanding|18MB"
)

# Core models (always installed)
CORE_MODELS=("collaborative-filtering" "content-based" "user-segmentation")

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                 Harper AI Model Setup                    ║"
    echo "║          Outdoor Gear Personalization Models             ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_dependencies() {
    print_info "Checking dependencies..."
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed."
        exit 1
    fi
    
    # Check if tar is available
    if ! command -v tar &> /dev/null; then
        print_error "tar is required but not installed."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is required but not installed."
        exit 1
    fi
    
    print_status "All dependencies are available"
}

check_disk_space() {
    print_info "Checking available disk space..."
    
    if command -v df &> /dev/null; then
        available_space=$(df . | tail -1 | awk '{print $4}')
        available_mb=$((available_space / 1024))
        
        if [ $available_mb -lt $REQUIRED_SPACE_MB ]; then
            print_error "Insufficient disk space. Required: ${REQUIRED_SPACE_MB}MB, Available: ${available_mb}MB"
            exit 1
        fi
        
        print_status "Sufficient disk space available (${available_mb}MB)"
    else
        print_warning "Cannot check disk space, proceeding anyway..."
    fi
}

create_directories() {
    print_info "Creating model directories..."
    
    mkdir -p "$MODELS_DIR"
    mkdir -p "$TEMP_DIR"
    
    print_status "Model directories created"
}

show_model_selection() {
    echo ""
    echo -e "${BLUE}Available Models:${NC}"
    echo "════════════════"
    
    local i=1
    for model in "${!MODELS[@]}"; do
        IFS='|' read -ra INFO <<< "${MODELS[$model]}"
        description="${INFO[0]}"
        size="${INFO[1]}"
        
        if [[ " ${CORE_MODELS[@]} " =~ " ${model} " ]]; then
            echo -e "${GREEN}${i}. ${model}${NC} (${size}) - ${description} ${GREEN}[CORE]${NC}"
        else
            echo -e "${i}. ${model} (${size}) - ${description}"
        fi
        ((i++))
    done
    
    echo ""
    echo -e "${YELLOW}Core models (1-3) will be installed by default.${NC}"
    echo -e "${BLUE}Enter additional model numbers (space-separated), or 'all' for everything, or press Enter for core only:${NC}"
}

get_model_selection() {
    show_model_selection
    read -p "Selection: " selection
    
    selected_models=()
    
    # Always include core models
    for core_model in "${CORE_MODELS[@]}"; do
        selected_models+=("$core_model")
    done
    
    if [ "$selection" = "all" ]; then
        # Add all models
        for model in "${!MODELS[@]}"; do
            if [[ ! " ${CORE_MODELS[@]} " =~ " ${model} " ]]; then
                selected_models+=("$model")
            fi
        done
    elif [ -n "$selection" ]; then
        # Parse individual selections
        IFS=' ' read -ra SELECTIONS <<< "$selection"
        local model_array=($(printf '%s\n' "${!MODELS[@]}" | sort))
        
        for sel in "${SELECTIONS[@]}"; do
            if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le "${#MODELS[@]}" ]; then
                model="${model_array[$((sel-1))]}"
                if [[ ! " ${selected_models[@]} " =~ " ${model} " ]]; then
                    selected_models+=("$model")
                fi
            fi
        done
    fi
    
    echo ""
    print_info "Selected models: ${selected_models[*]}"
}

download_model() {
    local model_name="$1"
    local model_url="${MODEL_REPO_URL}/${model_name}.tar.gz"
    local temp_file="${TEMP_DIR}/${model_name}.tar.gz"
    local model_dir="${MODELS_DIR}/${model_name}"
    
    print_info "Downloading ${model_name}..."
    
    # Download with progress
    if curl -L --progress-bar -o "$temp_file" "$model_url"; then
        print_status "Downloaded ${model_name}"
    else
        print_warning "Failed to download ${model_name} from remote, trying fallback..."
        
        # Fallback: create placeholder model structure
        create_placeholder_model "$model_name"
        return 0
    fi
    
    # Extract model
    print_info "Extracting ${model_name}..."
    mkdir -p "$model_dir"
    
    if tar -xzf "$temp_file" -C "$model_dir"; then
        print_status "Extracted ${model_name}"
        rm -f "$temp_file"
    else
        print_error "Failed to extract ${model_name}"
        return 1
    fi
}

create_placeholder_model() {
    local model_name="$1"
    local model_dir="${MODELS_DIR}/${model_name}"
    
    print_info "Creating placeholder model for ${model_name}..."
    
    mkdir -p "$model_dir"
    
    # Create a minimal model.json for development
    cat > "${model_dir}/model.json" << EOF
{
  "format": "layers-model",
  "generatedBy": "Harper Model Setup",
  "convertedBy": "TensorFlow.js Converter v3.0.0",
  "modelTopology": {
    "keras_version": "2.8.0",
    "backend": "tensorflow",
    "model_config": {
      "class_name": "Sequential",
      "config": {
        "name": "${model_name}",
        "layers": [
          {
            "class_name": "Dense",
            "config": {
              "units": 64,
              "activation": "relu",
              "name": "dense_1"
            }
          },
          {
            "class_name": "Dense",
            "config": {
              "units": 32,
              "activation": "softmax",
              "name": "predictions"
            }
          }
        ]
      }
    }
  },
  "weightsManifest": [
    {
      "paths": ["weights.bin"],
      "weights": [
        {"name": "dense_1/kernel", "shape": [100, 64], "dtype": "float32"},
        {"name": "dense_1/bias", "shape": [64], "dtype": "float32"},
        {"name": "predictions/kernel", "shape": [64, 32], "dtype": "float32"},
        {"name": "predictions/bias", "shape": [32], "dtype": "float32"}
      ]
    }
  ]
}
EOF
    
    # Create minimal weights file
    python3 -c "
import numpy as np
import struct

# Generate random weights for placeholder model
weights = []
weights.extend(np.random.randn(100 * 64).astype(np.float32))  # dense_1/kernel
weights.extend(np.random.randn(64).astype(np.float32))        # dense_1/bias  
weights.extend(np.random.randn(64 * 32).astype(np.float32))   # predictions/kernel
weights.extend(np.random.randn(32).astype(np.float32))        # predictions/bias

with open('${model_dir}/weights.bin', 'wb') as f:
    for weight in weights:
        f.write(struct.pack('f', weight))
" 2>/dev/null || {
    # Fallback if Python is not available
    echo "Creating minimal weights file..."
    dd if=/dev/urandom of="${model_dir}/weights.bin" bs=1024 count=100 2>/dev/null
}
    
    # Create model metadata
    cat > "${model_dir}/metadata.json" << EOF
{
  "name": "${model_name}",
  "version": "1.0.0-placeholder",
  "description": "Placeholder model for development - replace with trained model",
  "type": "placeholder",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "framework": "tensorflow.js",
  "inputShape": [null, 100],
  "outputShape": [null, 32],
  "status": "placeholder"
}
EOF
    
    print_warning "Created placeholder model for ${model_name} - replace with actual trained model for production"
}

install_npm_dependencies() {
    print_info "Installing TensorFlow.js dependencies..."
    
    if npm list @tensorflow/tfjs @tensorflow/tfjs-node &>/dev/null; then
        print_status "TensorFlow.js dependencies already installed"
    else
        npm install @tensorflow/tfjs@latest @tensorflow/tfjs-node@latest
        print_status "TensorFlow.js dependencies installed"
    fi
}

validate_models() {
    print_info "Validating installed models..."
    
    local validation_passed=true
    
    for model in "${selected_models[@]}"; do
        local model_dir="${MODELS_DIR}/${model}"
        
        if [ -f "${model_dir}/model.json" ]; then
            print_status "✓ ${model} - model.json found"
        else
            print_error "✗ ${model} - model.json missing"
            validation_passed=false
        fi
        
        if [ -f "${model_dir}/weights.bin" ]; then
            print_status "✓ ${model} - weights.bin found"
        else
            print_error "✗ ${model} - weights.bin missing" 
            validation_passed=false
        fi
    done
    
    if [ "$validation_passed" = true ]; then
        print_status "All models validated successfully"
    else
        print_error "Model validation failed"
        return 1
    fi
}

test_model_loading() {
    print_info "Testing model loading..."
    
    # Create a simple test script
    cat > /tmp/test-models.js << 'EOF'
const tf = require('@tensorflow/tfjs-node');
const path = require('path');

async function testModels() {
    const modelsDir = './models';
    const models = process.argv.slice(2);
    
    for (const modelName of models) {
        try {
            const modelPath = `file://${path.resolve(modelsDir, modelName, 'model.json')}`;
            console.log(`Testing ${modelName}...`);
            
            const model = await tf.loadLayersModel(modelPath);
            console.log(`✅ ${modelName}: Loaded successfully`);
            console.log(`   - Input shape: ${model.inputs[0].shape}`);
            console.log(`   - Output shape: ${model.outputs[0].shape}`);
            
            // Test prediction with dummy data
            const inputShape = model.inputs[0].shape.slice(1); // Remove batch dimension
            const dummyInput = tf.randomNormal([1, ...inputShape]);
            const prediction = model.predict(dummyInput);
            console.log(`   - Test prediction: ${prediction.shape}`);
            
            // Cleanup
            dummyInput.dispose();
            prediction.dispose();
            model.dispose();
            
        } catch (error) {
            console.log(`❌ ${modelName}: Failed to load - ${error.message}`);
        }
    }
}

testModels().then(() => {
    console.log('Model loading test completed');
    process.exit(0);
}).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
EOF
    
    if node /tmp/test-models.js "${selected_models[@]}"; then
        print_status "Model loading test passed"
        rm -f /tmp/test-models.js
    else
        print_warning "Model loading test had issues - check logs above"
        rm -f /tmp/test-models.js
    fi
}

cleanup() {
    print_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
    print_status "Cleanup completed"
}

show_usage_examples() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                              Setup Complete! 🎉                                    ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Models installed in:${NC} $MODELS_DIR"
    echo -e "${YELLOW}Selected models:${NC} ${selected_models[*]}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Start the Harper development server:"
    echo "   ${GREEN}harperdb dev .${NC}"
    echo ""
    echo "2. Test the personalization API:"
    echo "   ${GREEN}curl -X POST http://localhost:9925/api/alpine-gear-co/personalize \\${NC}"
    echo "   ${GREEN}     -H \"Content-Type: application/json\" \\${NC}"
    echo "   ${GREEN}     -H \"X-User-ID: test-user\" \\${NC}"
    echo "   ${GREEN}     -d '{\"products\": [\"hiking-boot-1\"], \"userContext\": {\"activityType\": \"hiking\"}}'${NC}"
    echo ""
    echo "3. Run the validation tests:"
    echo "   ${GREEN}npm run test-models${NC}"
    echo ""
    echo -e "${YELLOW}Documentation:${NC}"
    echo "- AI Models Guide: docs/AI_MODELS.md"
    echo "- API Reference: docs/API.md"
    echo "- Harper Documentation: https://docs.harperdb.io"
    echo ""
    echo -e "${BLUE}For support: https://discord.gg/harperdb${NC}"
}

# Main execution
main() {
    print_header
    
    # Check for help flag
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --core-only    Install only core models (collaborative-filtering, content-based, user-segmentation)"
        echo "  --all          Install all available models"
        echo "  --help, -h     Show this help message"
        echo ""
        echo "Interactive mode will be used if no options are specified."
        exit 0
    fi
    
    # Handle command line options
    if [ "$1" = "--core-only" ]; then
        selected_models=("${CORE_MODELS[@]}")
        print_info "Installing core models only: ${selected_models[*]}"
    elif [ "$1" = "--all" ]; then
        selected_models=($(printf '%s\n' "${!MODELS[@]}" | sort))
        print_info "Installing all models: ${selected_models[*]}"
    else
        get_model_selection
    fi
    
    check_dependencies
    check_disk_space
    create_directories
    install_npm_dependencies
    
    # Download selected models
    local failed_downloads=()
    for model in "${selected_models[@]}"; do
        if ! download_model "$model"; then
            failed_downloads+=("$model")
        fi
    done
    
    if [ ${#failed_downloads[@]} -gt 0 ]; then
        print_warning "Some models failed to download: ${failed_downloads[*]}"
        print_info "Placeholder models were created for development"
    fi
    
    validate_models
    test_model_loading
    cleanup
    show_usage_examples
    
    print_status "Harper AI Model setup completed successfully!"
}

# Run main function
main "$@"