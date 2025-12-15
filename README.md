# Harper AI Ops Framework

**Production AI operations platform built on Harper for deploying, monitoring, and managing ML models at scale.**

---

## Vision

Harper AI Ops Framework provides complete MLOps lifecycle management—from deployment through monitoring, drift detection, automated retraining, and validation.

### What This Framework Provides

✅ **Multi-Backend Inference** - Run ONNX, TensorFlow.js, Transformers.js, and Ollama models through unified API

✅ **Production Monitoring** - Real-time metrics, drift detection, alerting, and automated retraining triggers

✅ **Training Orchestration** - Experiment tracking, model validation, and lifecycle management

✅ **Performance Benchmarking** - Compare equivalent models across backends to optimize deployment

✅ **Feature Store** - Centralized feature management with time-travel queries (planned)

✅ **Deployment Automation** - CI/CD pipelines, canary releases, and A/B testing (planned)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Production Inferencing                     │
│              (Edge Devices, APIs, Services)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Inference Events, Metrics, Feedback
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                Harper AI Ops Cluster                         │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────────────────┐ │
│  │  Monitoring &      │  │  Training & Validation         │ │
│  │  Observability     │  │                                │ │
│  │  ✅ Metrics        │  │  ✅ Model Training             │ │
│  │  ✅ Drift Detect   │  │  ✅ Experiment Tracking        │ │
│  │  ✅ Alerting       │  │  ✅ Validation & Promotion     │ │
│  │  ✅ Auto Triggers  │  │  ✅ Model Registry             │ │
│  └────────────────────┘  └────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────────────────┐ │
│  │  Core Data &       │  │  Deployment & Orchestration    │ │
│  │  Services          │  │                                │ │
│  │  🔄 Feature Store  │  │  🔄 Model CI/CD                │ │
│  │  🔄 Data Pipeline  │  │  🔄 Automated Deploy           │ │
│  │  🔄 Feature Eng.   │  │  🔄 Canary Releases            │ │
│  └────────────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                     ↓                        ↑
            ┌────────────────┐      ┌────────────────┐
            │  BigQuery      │      │  Public Model  │
            │  Data Warehouse│      │  Repositories  │
            └────────────────┘      └────────────────┘
```

**Legend:** ✅ Designed | 🔄 Planned

---

## Implementation Roadmap

### ✅ Current State: Foundation Complete

The minimal viable foundation is operational:

- **Multi-Backend Inference** - ONNX, TensorFlow.js, Transformers.js, Ollama
- **Basic Telemetry** - InferenceEvent tracking for all predictions
- **Performance Benchmarking** - Cross-backend model comparison

### 🎯 Milestone A: Monitoring & Observability (DESIGNED)

**Production monitoring with drift detection, alerting, and automated retraining triggers.**

**Key Features:**
- Real-time metrics with 5min/hourly/daily aggregation
- Input, prediction, and concept drift detection (KS test, chi-square, PSI)
- Configurable alerting with severity levels
- Automated retraining triggers with approval workflow
- Data quality tracking (schema violations, null rates, outliers)

**Documentation:** [Complete Design](docs/plans/2025-01-aiops-framework-design.md#milestone-a-monitoring--observability)

### 🎯 Milestone C: Training & Validation (DESIGNED)

**Model training orchestration with experiment tracking and lifecycle management.**

**Key Features:**
- Dual version system (source version + deployment version)
- Queue-based training with status tracking
- In-process training for simple models
- Experiment tracking with per-epoch metrics
- Validation workflow with approval gates
- Model lifecycle: candidate → staging → production → archived

**Documentation:** [Complete Design](docs/plans/2025-01-aiops-framework-design.md#milestone-c-training--validation)

### 🔄 Milestone B: Core Data & Services (PLANNED)

Feature engineering, data pipelines, and feature store integration.

### 🔄 Milestone D: Deployment & Orchestration (PLANNED)

CI/CD pipelines with canary releases and A/B testing.

---

## Quick Start

### Prerequisites

```bash
# Node.js 18+
node --version

# Harper 4.0+
# Install: https://docs.harperdb.io/docs/getting-started/installation
harper --version

# Ollama (optional, for LLM inference)
# Download: https://ollama.ai/
ollama --version
```

### Installation

```bash
git clone https://github.com/HarperDB/harper-edge-ai-example.git
cd harper-edge-ai-example
npm install

# Start Harper server
npm run dev              # Server at http://localhost:9926

# Load test models
npm run preload

# Run benchmarks
npm run benchmark
```

### Run Tests

```bash
npm run test:unit         # Unit tests
npm run test:integration  # Integration tests
npm test                  # All tests
```

---

## Current Capabilities

### Multi-Backend ML Inference

Unified access to multiple ML frameworks:

| Backend           | Use Cases                              | Status |
|-------------------|----------------------------------------|--------|
| **ONNX Runtime**  | Optimized production models            | ✅     |
| **TensorFlow.js** | Universal Sentence Encoder, Keras models | ✅   |
| **Transformers.js** | Hugging Face models (WASM)           | ✅     |
| **Ollama**        | Local LLMs (chat, embeddings)          | ✅     |

**Features:**
- Automatic backend routing based on framework
- LRU model caching with configurable size
- Unified prediction API
- Native Harper CRUD operations
- File-backed blob storage for large models (86MB+)

---

### Model Benchmarking System

Compare equivalent models across backends to find optimal performance.

**Capabilities:**
- Cross-backend comparison (ONNX vs TensorFlow vs Ollama)
- Equivalence group validation (compatible output dimensions)
- Statistical metrics (avg, p50, p95, p99 latency, error rates)
- Historical benchmark tracking
- Automated test data generation

**Example Usage:**

```bash
$ npm run preload
✓ Successfully loaded 8 models
  • 4 embedding models (384, 512, 768, 1024 dimensions)
  • 2 classification models (Llama2, Mistral)
  • 2 vision models (LLaVA, BakLLaVA)

$ npm run benchmark

🧪 Testing price-classifier...
  ✅ Completed
  📊 Models: llama2-classifier:v1, mistral-classifier:v1

🧪 Testing image-tagger...
  ✅ Completed
  📊 Models: bakllava:v1, llava:v1
```

**Benchmark Groups:**
- `embeddings-384` - Sentence-BERT (ONNX)
- `embeddings-512` - Universal Sentence Encoder (TensorFlow)
- `embeddings-768` - Nomic Embed Text (Ollama)
- `embeddings-1024` - MxBai Embed Large (Ollama)
- `price-classifier` - LLM classification (Llama2 vs Mistral)
- `image-tagger` - Vision models (LLaVA vs BakLLaVA)

---

### Example: ONNX Model Inference

```bash
# Upload ONNX model
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "sentiment-analyzer",
    "modelVersion": "v1",
    "framework": "onnx",
    "stage": "development",
    "modelBlob": "<base64-encoded-onnx-model>",
    "inputSchema": "{\"inputs\":[{\"name\":\"input\",\"shape\":[1,512]}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"output\",\"shape\":[1,2]}]}"
  }'

# Run prediction
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "sentiment-analyzer",
    "features": {
      "input": [/* 512-dimensional vector */]
    },
    "userId": "user-123"
  }'

# Record feedback
curl -X PUT http://localhost:9926/InferenceEvent/<inferenceId> \
  -H "Content-Type: application/json" \
  -d '{
    "actualOutcome": "{\"label\": \"positive\"}",
    "feedbackTimestamp": 1234567890,
    "correct": true
  }'
```

---

### Example: Ollama Local LLM

```bash
# Install and start Ollama
ollama pull llama2

# Register chat model
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "llama2-chat",
    "modelVersion": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"modelName\": \"llama2\", \"mode\": \"chat\"}",
    "inputSchema": "{\"inputs\":[{\"name\":\"messages\",\"type\":\"array\"}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"response\",\"type\":\"string\"}]}"
  }'

# Chat with LLM
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "llama2-chat",
    "features": {
      "prompt": "Explain machine learning in simple terms."
    },
    "userId": "user-123"
  }'
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env`:

```env
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
```

### Model Metadata

Models require metadata for monitoring and benchmarking:

```json
{
  "modelName": "my-embedding-model",
  "modelVersion": "v1",
  "framework": "onnx",
  "metadata": {
    "taskType": "text-embedding",
    "equivalenceGroup": "embeddings-384",
    "outputDimensions": [384],
    "baselineDistributions": {
      "input": { /* statistical baseline */ },
      "output": { /* statistical baseline */ }
    },
    "trainingConfig": {
      "type": "in-process",
      "script": "./training-scripts/my-model-train.js",
      "hyperparameters": { "epochs": 10, "lr": 0.001 }
    }
  }
}
```

See [docs/MODEL_METADATA.md](docs/MODEL_METADATA.md) for complete schema.

---

## Project Structure

```
harper-edge-ai-example/
├── src/
│   ├── core/
│   │   ├── backends/              # ML framework backends
│   │   │   ├── Onnx.js           # ONNX Runtime
│   │   │   ├── TensorFlow.js     # TensorFlow.js
│   │   │   ├── Transformers.js   # Transformers.js
│   │   │   └── Ollama.js         # Ollama
│   │   ├── InferenceEngine.js    # Model orchestration
│   │   ├── BenchmarkEngine.js    # Performance comparison
│   │   └── MonitoringBackend.js  # Inference telemetry
│   ├── resources.js              # Harper REST API
│   └── PersonalizationEngine.js  # Example application
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── helpers/                  # Test utilities
├── docs/
│   ├── plans/                    # Design documents
│   ├── MODEL_METADATA.md         # Model metadata schema
│   ├── BENCHMARKING.md           # Benchmarking guide
│   └── ONNX_RUNTIME_GUIDE.md     # ONNX documentation
└── scripts/                      # Utility scripts
```

---

## Available Scripts

| Command                     | Description                                 |
| --------------------------- | ------------------------------------------- |
| `npm install`               | Install dependencies                        |
| `npm test`                  | Run all tests                               |
| `npm run test:unit`         | Run unit tests only                         |
| `npm run test:integration`  | Run integration tests only                  |
| `npm run dev`               | Run Harper in development mode              |
| `npm start`                 | Run Harper in production mode               |
| `npm run preload`           | Preload test models                         |
| `npm run benchmark`         | Interactive benchmark runner                |
| `npm run benchmark:all`     | Run all benchmark groups                    |
| `npm run pull-ollama`       | Pull Ollama models (requires Ollama)        |

---

## Documentation

### Design & Architecture
- **[Complete Design Document](docs/plans/2025-01-aiops-framework-design.md)** - Full framework architecture
- [Model Metadata Convention](docs/MODEL_METADATA.md) - Metadata schema
- [Benchmarking Guide](docs/BENCHMARKING.md) - Performance comparison
- [ONNX Runtime Guide](docs/ONNX_RUNTIME_GUIDE.md) - ONNX backend docs

### API Documentation
Core classes have comprehensive JSDoc documentation:
- `InferenceEngine` - Framework-agnostic orchestration with LRU caching
- `BenchmarkEngine` - Performance comparison with detailed metrics
- `MonitoringBackend` - Inference telemetry and event tracking
- `BaseBackend` - Abstract base for custom ML backends
- Backend implementations: `OnnxBackend`, `TensorFlowBackend`, `TransformersBackend`, `OllamaBackend`

---

## Requirements

- **Node.js**: v18.0.0+
- **npm**: v9.0.0+
- **Harper**: v4.0.0+
- **OS**: macOS or Linux (TensorFlow.js requires native bindings)
- **Ollama**: Optional, for local LLM inference

Check versions:
```bash
node --version
npm --version
harper --version
```

---

## Performance Characteristics

**Inference Latency:**
- ONNX: 10-50ms (optimized)
- TensorFlow.js: 30-50ms
- Transformers.js: 50-200ms (WASM)
- Ollama: 100-500ms (LLMs)

**System:**
- Model load time: 3-5 seconds (one-time)
- Memory per model: 150-500MB
- LRU caching with configurable size
- Shared models across concurrent requests

---

## Use Cases

### 1. Edge AI Inference
Deploy ML models directly in Harper for:
- Real-time product recommendations
- Semantic search and similarity matching
- Text embeddings for RAG systems
- Sentiment analysis and classification
- Local LLM chat and question answering

### 2. Production ML Monitoring
Track model performance with:
- Latency and error rate tracking
- Input/prediction/concept drift detection
- Data quality monitoring
- Automated retraining triggers

### 3. Model Lifecycle Management
Manage model versions with:
- Experiment tracking and validation
- Candidate → staging → production promotion
- Rollback support with version tracking
- Training history and metrics

### 4. Multi-Backend Optimization
Find the best backend for your models:
- Benchmark equivalent models across frameworks
- Compare latency, error rates, resource usage
- Historical trend analysis

---

## Future Roadmap

### Near-Term (Milestones A & C)
- Monitoring & Observability implementation
- Training & Validation implementation
- Real-time dashboard
- External training worker examples (Python/PyTorch)

### Mid-Term (Milestone B)
- Feature store with versioning
- Data preprocessing pipelines
- Feature engineering transformations
- Data source connectors (BigQuery, S3)

### Long-Term (Milestone D)
- Model deployment automation
- Canary release strategies
- A/B testing framework
- CI/CD pipeline integration

### Enhancements
- AutoML for hyperparameter tuning
- Federated learning support
- Web UI for monitoring dashboards
- Slack/email notification integrations
- Cost tracking and optimization

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[License TBD]

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/HarperDB/harper-edge-ai-example/issues)
- **Harper Docs**: https://docs.harperdb.io/

---

## Acknowledgments

Built on [Harper](https://harperdb.io/) - The distributed database built for the edge.
