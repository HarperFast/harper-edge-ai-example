# Harper Edge AI Example

A unified MLOps platform for Harper demonstrating multi-backend ML inference with ONNX Runtime, TensorFlow.js, Transformers.js, and Ollama. Features automatic backend routing, model caching, performance benchmarking, and real-time inference monitoring.

## Quick Start

```bash
git clone https://github.com/HarperDB/harper-edge-ai-example.git
cd harper-edge-ai-example
npm install
npm run dev              # Start Harper server
npm run preload          # Load test models (optional)
npm run benchmark        # Compare backends (optional)
```

## Multi-Backend ML Inference

This project supports multiple ML backends through a unified InferenceEngine architecture:

### Features

- **ONNX Runtime**: Native ONNX model support with automatic tokenization
- **TensorFlow.js**: Universal Sentence Encoder and TF.js models
- **Transformers.js**: Hugging Face models via WASM (embeddings, classification, etc.)
- **Ollama**: Local LLM inference (chat and embeddings modes)
- **Unified InferenceEngine**: Automatic backend routing based on model framework
- **LRU Caching**: Configurable model cache with automatic eviction
- **Benchmarking**: Cross-backend performance comparison with detailed metrics
- **Monitoring**: Track inference latency, confidence, and accuracy with feedback loop
- **Harper Native CRUD**: Uses Harper's @export directive for automatic REST APIs

### Quick Start with ONNX

```bash
# Start Harper
npm run dev

# Upload an ONNX model using Harper's native POST /Model endpoint
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-model:v1",
    "modelId": "my-model",
    "version": "v1",
    "framework": "onnx",
    "stage": "development",
    "modelBlob": "<base64-encoded-model>",
    "inputSchema": "{\"inputs\":[{\"name\":\"input\",\"shape\":[1,10]}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"output\",\"shape\":[1,2]}]}"
  }'

# Run prediction
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "my-model",
    "features": {"input": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]},
    "userId": "user-123"
  }'

# Record feedback using Harper's native PUT /InferenceEvent/:id endpoint
curl -X PUT http://localhost:9926/InferenceEvent/<inferenceId> \
  -H "Content-Type: application/json" \
  -d '{
    "actualOutcome": "{\"class\": 1}",
    "feedbackTimestamp": 1234567890,
    "correct": true
  }'

# Check metrics
curl http://localhost:9926/monitoring/metrics?modelId=my-model
```

### Quick Start with Ollama (Local LLMs)

```bash
# Install and start Ollama (if not already installed)
# Download from https://ollama.ai/
ollama pull llama2

# Configure environment (optional)
cp .env.example .env
# Edit .env to customize OLLAMA_HOST and OLLAMA_DEFAULT_MODEL if needed

# Start Harper
npm run dev

# Register an Ollama model for chat
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "llama2-chat:v1",
    "modelId": "llama2-chat",
    "version": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"modelName\": \"llama2\", \"mode\": \"chat\"}",
    "inputSchema": "{\"inputs\":[{\"name\":\"messages\",\"type\":\"array\"}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"response\",\"type\":\"string\"}]}"
  }'

# Chat with local LLM
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama2-chat",
    "features": {
      "prompt": "What is machine learning?"
    },
    "userId": "user-123"
  }'

# Generate embeddings
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "llama2-embed:v1",
    "modelId": "llama2-embed",
    "version": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"modelName\": \"llama2\", \"mode\": \"embeddings\"}",
    "inputSchema": "{\"inputs\":[{\"name\":\"prompt\",\"type\":\"string\"}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"embeddings\",\"type\":\"array\"}]}"
  }'

curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama2-embed",
    "features": {
      "prompt": "Hello world"
    }
  }'
```

### Testing

```bash
npm run test:unit         # Unit tests (requires Harper running)
npm run test:integration  # Integration tests (requires Harper running)
npm run test:all          # All tests including TensorFlow.js model test
```

### Cross-Backend Model Comparison

Benchmark equivalent models across ONNX, TensorFlow, and Ollama backends:

```bash
# Quick start
npm run preload-models
npm run benchmark
```

**See [docs/BENCHMARKING.md](docs/BENCHMARKING.md) for complete documentation including:**

- Detailed API reference
- Model metadata conventions
- Usage examples and best practices
- Integration patterns

### API Documentation

See [ONNX Runtime Guide](docs/ONNX_RUNTIME_GUIDE.md) for detailed API documentation.

Use the Postman collection in `postman/` for interactive API testing.

## Overview

This project showcases how to:

- Run TensorFlow.js models (Universal Sentence Encoder) directly in Harper
- Generate embeddings for text descriptions
- Calculate semantic similarity between user context and products
- Return personalized product rankings in real-time

## Features

- **Semantic Product Matching**: Match products to user preferences using vector embeddings
- **Real-time Inference**: Sub-50ms AI inference without external API calls
- **Simple Architecture**: ~300 lines of code across 2 files
- **Edge AI**: AI processing happens locally within Harper

## Project Structure

- `config.yaml`: Configuration file for Harper component
- `src/resources.js`: Main resource implementations (Personalize, Health)
- `src/PersonalizationEngine.js`: Universal Sentence Encoder wrapper
- `models/`: Model metadata and test script

## Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Harper**: v4.0.0 or higher
- **OS**: macOS or Linux (TensorFlow.js requires native bindings)

Check your versions:

```bash
node --version
npm --version
harper --version
```

## Configuration

This project uses environment variables for configuration. Harper automatically loads `.env` files at startup.

### Environment Variables

Copy `.env.example` to `.env` to customize configuration:

```bash
cp .env.example .env
```

Available variables:

- `OLLAMA_HOST`: Ollama server URL (default: `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL`: Default Ollama model name (default: `llama2`)

Example `.env` file:

```env
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
```

## Installation

### 1. Install Node.js (if needed)

**macOS (using Homebrew):**

```bash
brew install node@18
```

**Linux (using nvm):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### 2. Install Harper

Follow the [Harper installation guide](https://docs.harperdb.io/docs/getting-started/installation)

### 3. Clone and Install Dependencies

```bash
git clone https://github.com/HarperDB/harper-edge-ai-example.git
cd harper-edge-ai-example
npm install
```

> **Note:** You may see deprecation warnings from TensorFlow.js native bindings. These are from deep dependencies and don't affect functionality. The warnings are safe to ignore.

### 4. Verify Installation

```bash
npm run verify
npm test
```

Expected output:

```
🧪 Testing Universal Sentence Encoder

Loading model...
✅ Model loaded successfully

Computing embeddings for:
  1. "trail running shoes"
  2. "lightweight hiking boots"
  3. "waterproof rain jacket"
  4. "running footwear"

Similarity scores (compared to first sentence):
  "trail running shoes" ↔ "lightweight hiking boots": 0.742
  "trail running shoes" ↔ "waterproof rain jacket": 0.381
  "trail running shoes" ↔ "running footwear": 0.891

✅ Test completed successfully
```

### 5. Run with Harper

```bash
npm run dev
```

Or directly with Harper CLI:

```bash
harper dev .
```

Server starts at: `http://localhost:9926`

## Usage

This project provides a REST API for product personalization:

### Personalize Products

```bash
POST /personalize
{
  "products": [
    {
      "id": "trail-runner-pro",
      "name": "Trail Runner Pro Shoes",
      "description": "Lightweight running shoes for mountain trails",
      "category": "footwear"
    },
    {
      "id": "ultralight-backpack",
      "name": "Ultralight Backpack 40L",
      "description": "Minimalist pack for fast hiking",
      "category": "packs"
    }
  ],
  "userContext": {
    "activityType": "trail-running",
    "experienceLevel": "advanced",
    "season": "spring"
  }
}
```

### Health Check

```bash
GET /health
```

## Demo Script

Run the included demo script to see the API in action:

```bash
./demo.sh
```

The script will:

1. Check server health
2. Run personalization for trail running gear
3. Run personalization for winter camping gear
4. Show similarity scores for each scenario (personalizedScore)

## How It Works

1. **User Context Embedding**: The system converts user context (activity type, experience level, season, location) into a semantic query string
2. **Product Embeddings**: Each product's name, description, and category are concatenated and embedded using the Universal Sentence Encoder
3. **Similarity Calculation**: Cosine similarity is computed between the user context embedding and each product embedding
4. **Ranked Results**: Products are sorted by similarity score and returned to the client

The Universal Sentence Encoder generates 512-dimensional vectors that capture semantic meaning, allowing the system to match products based on conceptual similarity rather than just keyword matching.

## Performance

- **Model Load Time**: ~3-5 seconds (one-time, at startup)
- **Inference Time**: ~30-50ms per request
- **Memory Usage**: ~150MB for loaded model
- **Throughput**: Model is shared across concurrent requests

## Data Model

This example uses the Universal Sentence Encoder model to generate embeddings:

- **Input**: Text strings (product descriptions, user context)
- **Output**: 512-dimensional float vectors
- **Similarity Metric**: Cosine similarity

Each product receives a `personalizedScore` between 0 and 1, where higher scores indicate better matches to the user's context.

## Available Scripts

| Command                     | Description                                 |
| --------------------------- | ------------------------------------------- |
| `npm install`               | Install all dependencies                    |
| `npm test`                  | Run unit tests                              |
| `npm run test:unit`         | Run unit tests only                         |
| `npm run test:integration`  | Run integration tests only                  |
| `npm run test:all`          | Run all tests                               |
| `npm run dev`               | Run Harper in development mode              |
| `npm start`                 | Run Harper in production mode               |
| `npm run preload`           | Preload test models into Harper             |
| `npm run benchmark`         | Compare equivalent models across backends   |
| `npm run benchmark:all`     | Run comprehensive benchmark suite           |
| `npm run pull-ollama`       | Pull Ollama models (requires Ollama)        |
| `npm run generate-test-models` | Generate test ONNX models                |
| `npm run verify`            | Check Node.js environment                   |
| `npm run clean`             | Remove node_modules                         |

## Documentation

### Core Documentation
- [Model Metadata Convention](docs/MODEL_METADATA.md) - Model metadata schema and conventions
- [Benchmarking Guide](docs/BENCHMARKING.md) - Performance comparison and analysis
- [Scripts Documentation](scripts/README.md) - Utility scripts reference
- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute to the project

### API Documentation
All core classes have comprehensive JSDoc documentation:
- `InferenceEngine` - Framework-agnostic model orchestration with LRU caching
- `BenchmarkEngine` - Performance comparison across backends with detailed metrics
- `BaseBackend` - Abstract base class for implementing custom ML backends
- Backend implementations: `OnnxBackend`, `TensorFlowBackend`, `TransformersBackend`, `OllamaBackend`

View inline documentation in your IDE or generate API docs with JSDoc.

## Project Structure

```
harper-edge-ai-example/
├── src/
│   ├── core/
│   │   ├── backends/          # ML framework backends
│   │   │   ├── Base.js       # Abstract base class
│   │   │   ├── Onnx.js       # ONNX Runtime backend
│   │   │   ├── TensorFlow.js # TensorFlow.js backend
│   │   │   ├── Transformers.js # Transformers.js backend (Hugging Face)
│   │   │   └── Ollama.js     # Ollama local LLM backend
│   │   ├── InferenceEngine.js # Model orchestration and caching
│   │   ├── BenchmarkEngine.js # Cross-backend performance comparison
│   │   └── utils/            # Utility functions
│   ├── resources.js          # Harper REST API endpoints
│   └── PersonalizationEngine.js # Product personalization logic
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── verify-tensorflow-output.js # Format verification script
├── docs/                     # Documentation files
├── scripts/                  # Utility scripts (preload, benchmark, etc.)
├── examples/                 # Usage examples
└── models/                   # Model files and test models
```

## Future Enhancements

### Additional Backends
Consider adding more ML framework backends for complete edge AI coverage:

**Benefits:**
- Run transformers models directly in Node.js or browsers without Python
- WASM-based execution for cross-platform compatibility
- Native support for popular models from Hugging Face Hub
- Automatic model caching and quantization
- Smaller footprint than ONNX Runtime for certain models

**Use Cases:**
- Text embeddings (sentence-transformers, all-MiniLM-L6-v2)
- Text classification
- Named entity recognition
- Question answering
- Zero-shot classification

Would complement existing ONNX and TensorFlow.js backends for a complete edge AI solution.
