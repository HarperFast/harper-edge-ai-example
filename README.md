# Harper Edge AI Example

A demonstration project that implements product personalization using Harper and TensorFlow.js. This project uses the Universal Sentence Encoder to generate embeddings for product descriptions and user context, enabling semantic similarity-based recommendations.

## Quick Start

```bash
git clone https://github.com/HarperDB/harper-edge-ai-example.git
cd harper-edge-ai-example
npm install
npm test
npm run dev
```

## ONNX Runtime Integration (New)

This project now supports both TensorFlow.js and ONNX Runtime for model inference through a unified MLOps architecture.

### Features

- **Unified InferenceEngine**: Automatically routes to correct backend (ONNX or TensorFlow) based on model framework
- **Model Registry**: Store and version models in Harper database tables
- **Monitoring**: Track inference events, latency, confidence, and accuracy with feedback loop
- **REST API**: Upload models, run predictions, record feedback, query metrics

### Quick Start with ONNX

```bash
# Start Harper
npm run dev

# Upload an ONNX model (in another terminal)
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=my-model" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@path/to/model.onnx" \
  -F "inputSchema={\"inputs\":[{\"name\":\"input\",\"shape\":[1,10]}]}" \
  -F "outputSchema={\"outputs\":[{\"name\":\"output\",\"shape\":[1,2]}]}"

# Run prediction
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "my-model",
    "features": {"input": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]},
    "userId": "user-123"
  }'

# Record feedback (use inferenceId from prediction response)
curl -X POST http://localhost:9926/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "inferenceId": "<inferenceId>",
    "outcome": {"class": 1},
    "correct": true
  }'

# Check metrics
curl http://localhost:9926/monitoring/metrics?modelId=my-model
```

### Testing

```bash
npm run test:unit         # Unit tests (requires Harper running)
npm run test:integration  # Integration tests (requires Harper running)
npm run test:all          # All tests including TensorFlow.js model test
```

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

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm test` | Test the model standalone |
| `npm run dev` | Run Harper in development mode |
| `npm start` | Run Harper in production mode |
| `npm run verify` | Check Node.js environment |
| `npm run clean` | Remove node_modules |

