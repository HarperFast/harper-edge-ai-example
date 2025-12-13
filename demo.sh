#!/bin/bash

set -o pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color


function output_errors(){
   # I'd use LINENO, but it seems to references weird when hitting pipefail
   local exit_status=$?
   local failing_command=$BASH_COMMAND

   echo "** ERROR ** " >&2
   echo -e "${RED}Exit Status: $exit_status" >&2
   echo -e "Command:     '$failing_command'${NC}" >&2

   exit $exit_status
}

trap 'output_errors' ERR

echo "🧠 Harper Edge AI Example - Demo"
echo "=================================="
echo

# Check if server is running
echo "Checking server status..."
if ! curl -s http://localhost:9926/Status > /dev/null 2>&1; then
  echo -e "${RED}❌ Server not running!${NC}"
  echo "Start it with: npm run dev"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo

# Health Check
echo -e "${BLUE}1. Health Check:${NC}"
echo "-------------------"
curl -s http://localhost:9926/Status | jq
echo

# Check models loaded
echo -e "${BLUE}2. Checking Loaded Models:${NC}"
echo "---------------------------"
MODEL_COUNT=$(curl -s "http://localhost:9926/Model/" | jq '. | length')
if [ "$MODEL_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No models loaded. Run: npm run preload-models${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Found $MODEL_COUNT models${NC}"
echo
curl -s "http://localhost:9926/Model/?select(modelId,version,framework)" | jq
echo

# Predict - Text Embedding with ONNX
echo -e "${BLUE}3. Text Embedding Prediction (ONNX):${NC}"
echo "-------------------------------------"
curl -s -X POST http://localhost:9926/Predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "all-MiniLM-L6-v2",
    "version": "v1",
    "features": {
      "texts": ["lightweight running shoes for trail running"]
    },
    "userId": "demo-user",
    "sessionId": "demo-session-1"
  }' | jq
echo

# Predict - Text Embedding with TensorFlow.js
echo -e "${BLUE}4. Text Embedding Prediction (TensorFlow.js):${NC}"
echo "-----------------------------------------------"
curl -s -X POST http://localhost:9926/Predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "universal-sentence-encoder",
    "version": "v1",
    "features": {
      "texts": ["waterproof hiking boots for winter camping"]
    },
    "userId": "demo-user",
    "sessionId": "demo-session-2"
  }' | jq
echo

# Predict - Text Embedding with Ollama
echo -e "${BLUE}5. Text Embedding Prediction (Ollama):${NC}"
echo "---------------------------------------"
curl -s -X POST http://localhost:9926/Predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "nomic-embed-text",
    "version": "v1",
    "features": {
      "texts": ["camping tent 4 person family weatherproof"]
    },
    "userId": "demo-user",
    "sessionId": "demo-session-3"
  }' | jq
echo

# Get metrics for a model
echo -e "${BLUE}6. Model Inference Metrics:${NC}"
echo "----------------------------"
curl -s "http://localhost:9926/Monitoring?modelId=all-MiniLM-L6-v2" | jq
echo

echo -e "${GREEN}✅ Demo completed!${NC}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "  • Run benchmarks: npm run benchmark:all"
echo "  • View all models: curl http://localhost:9926/Model/ | jq"
echo "  • View inference events: curl http://localhost:9926/InferenceEvent/ | jq"
echo "  • Make predictions: curl -X POST http://localhost:9926/Predict -H 'Content-Type: application/json' -d '{...}'"
echo
