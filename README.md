# Harper AI Ops Framework

**A production-grade AI operations platform built on HarperDB for deploying, monitoring, training, and managing machine learning models at scale.**

---

## Vision

Harper AI Ops Framework is a complete MLOps solution that brings production AI capabilities to HarperDB. It provides end-to-end lifecycle management for machine learning models—from initial deployment through continuous monitoring, drift detection, automated retraining, and validation.

### What This Framework Provides

✅ **Multi-Backend Inference** - Run ONNX, TensorFlow.js, Transformers.js, and Ollama models through a unified API
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

- **Multi-Backend Inference** - ONNX, TensorFlow.js, Transformers.js, Ollama support
- **Basic Telemetry** - InferenceEvent tracking for all predictions
- **Performance Benchmarking** - Cross-backend model comparison

See [Quick Start](#quick-start) for current capabilities.

---

### 🎯 Milestone A: Monitoring & Observability (DESIGNED)

**Complete production monitoring with performance tracking, drift detection, alerting, and automated retraining triggers.**

**Key Features:**
- **Real-Time Metrics** - Sliding windows with 5min/hourly/daily aggregation
- **Drift Detection** - Input, prediction, and concept drift with statistical tests
- **Alerting System** - Configurable rules with severity levels and notifications
- **Retraining Triggers** - Automated detection with manual approval workflow
- **Data Quality Tracking** - Schema violations, null rates, outliers

**Deliverables:**
- 9 new database tables (ModelMetrics, DriftMetrics, AlertEvent, etc.)
- Extended MonitoringBackend with real-time windows
- DriftDetector with KS test, chi-square, PSI
- AlertEvaluator with retraining trigger logic
- Scheduled aggregation jobs with duration strings
- REST API endpoints for metrics, drift, alerts

**Documentation:** [Complete Design Document](docs/plans/2025-01-aiops-framework-design.md#milestone-a-monitoring--observability)

---

### 🎯 Milestone C: Training & Validation (DESIGNED)

**Model training orchestration with experiment tracking, validation, and lifecycle management.**

**Key Features:**
- **Dual Version System** - Source version + internal deployment version
- **Training Orchestration** - Queue-based job processing with status tracking
- **In-Process Training** - Dynamic script loading for simple models
- **Experiment Tracking** - Full training history with per-epoch metrics
- **Validation Workflow** - Configurable success criteria with approval gates
- **Model Lifecycle** - candidate → staging → production → archived stages
- **External Worker API** - REST interface for GPU/Python training (stubbed)

**Deliverables:**
- TrainingRun table and extended Model table
- TrainingOrchestrator with queue processing
- In-process training execution
- Validation and promotion workflows
- REST API for training job management
- Integration with retraining triggers from Milestone A

**Documentation:** [Complete Design Document](docs/plans/2025-01-aiops-framework-design.md#milestone-c-training--validation)

---

### 🔄 Milestone B: Core Data & Services (PLANNED)

**Feature engineering, data processing pipelines, and feature store integration.**

**Planned Capabilities:**
- Feature store with time-travel queries
- Data preprocessing pipelines
- Feature engineering transformations
- Data source connectors (BigQuery, S3, Harper tables)
- Feature serving for real-time inference
- Feature drift detection (integrated with Monitoring)

---

### 🔄 Milestone D: Deployment & Orchestration (PLANNED)

**CI/CD pipelines for model deployment with canary releases and A/B testing.**

**Planned Capabilities:**
- Model deployment automation
- Canary release strategies (gradual rollout)
- A/B testing framework (traffic splitting)
- Rollback mechanisms (instant revert)
- Deployment health checks (automated validation)
- CI/CD pipeline integration

---

## Quick Start

### Prerequisites

```bash
# Install Node.js 18+
node --version

# Install Harper
# Follow: https://docs.harperdb.io/docs/getting-started/installation
harper --version

# Install Ollama (optional, for local LLM inference)
# Download from: https://ollama.ai/
ollama --version
```

### Installation

```bash
git clone https://github.com/HarperDB/harper-edge-ai-example.git
cd harper-edge-ai-example
npm install

# Start Harper server
npm run dev              # Server at http://localhost:9926

# Optional: Load test models
npm run preload

# Optional: Run benchmarks
npm run benchmark
```

### Run Tests

```bash
npm run test:unit         # Unit tests (requires Harper running)
npm run test:integration  # Integration tests (requires Harper running)
npm run test:all          # All tests
```

---

## Current Capabilities

### Multi-Backend ML Inference

The InferenceEngine provides unified access to multiple ML frameworks:

| Backend           | Use Cases                              | Status |
|-------------------|----------------------------------------|--------|
| **ONNX Runtime**  | Optimized production models            | ✅     |
| **TensorFlow.js** | Universal Sentence Encoder, Keras models | ✅   |
| **Transformers.js** | Hugging Face models (WASM)           | ✅     |
| **Ollama**        | Local LLMs (chat, embeddings)          | ✅     |

**Features:**
- Automatic backend routing based on model framework
- LRU model caching with configurable size
- Unified prediction API across all backends
- Native Harper CRUD operations
- File-backed blob storage for large models (86MB+ ONNX files)

---

### Model Benchmarking System

Compare equivalent models across different backends to find optimal performance:

**Capabilities:**
- Cross-backend model comparison (ONNX vs TensorFlow vs Ollama)
- Equivalence group validation (ensures compatible output dimensions)
- Statistical metrics (avg, p50, p95, p99 latency, error rates)
- Historical benchmark tracking
- Automated test data generation

**Example Benchmark Results:**

```bash
$ npm run preload  # Load test models
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

**Key Features:**
- ✅ Dimension compatibility validation
- ✅ Large model support (86MB ONNX files via file-backed blobs)
- ✅ Automatic blob fetching for search results
- ✅ Per-model performance metrics
- ✅ Winner determination and comparison

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
      "input": [/* 512-dimensional input vector */]
    },
    "userId": "user-123"
  }'

# Record feedback (for model monitoring)
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

# Configure (optional)
cp .env.example .env
# Edit OLLAMA_HOST and OLLAMA_DEFAULT_MODEL if needed

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

# Register embeddings model
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "nomic-embed",
    "modelVersion": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"modelName\": \"nomic-embed-text\", \"mode\": \"embeddings\"}",
    "inputSchema": "{\"inputs\":[{\"name\":\"prompt\",\"type\":\"string\"}]}",
    "outputSchema": "{\"outputs\":[{\"name\":\"embeddings\",\"type\":\"array\"}]}"
  }'

# Generate embeddings
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelName": "nomic-embed",
    "features": {
      "prompt": "semantic search query"
    }
  }'
```

---

### Performance Benchmarking

Compare equivalent models across backends to find the optimal deployment:

```bash
# Preload test models
npm run preload-models

# Run benchmark comparison
npm run benchmark

# Or use the API
curl -X POST http://localhost:9926/benchmark/compare \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "text-embedding",
    "equivalenceGroup": "embeddings-384",
    "iterations": 100
  }'
```

**Output includes:**
- Average latency (avg, p50, p95, p99)
- Error rates and success counts
- Winner identification (fastest model)
- Historical trend analysis

See [docs/BENCHMARKING.md](docs/BENCHMARKING.md) for complete documentation.

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` to customize:

```env
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
```

### Model Metadata

Models require metadata for monitoring and benchmarking. Example:

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

See [docs/MODEL_METADATA.md](docs/MODEL_METADATA.md) for the complete schema.

---

## Project Structure

```
harper-edge-ai-example/
├── src/
│   ├── core/
│   │   ├── backends/              # ML framework backends
│   │   │   ├── Base.js           # Abstract base class
│   │   │   ├── Onnx.js           # ONNX Runtime backend
│   │   │   ├── TensorFlow.js     # TensorFlow.js backend
│   │   │   ├── Transformers.js   # Transformers.js backend
│   │   │   └── Ollama.js         # Ollama backend
│   │   ├── InferenceEngine.js    # Model orchestration and caching
│   │   ├── BenchmarkEngine.js    # Cross-backend performance comparison
│   │   ├── MonitoringBackend.js  # Inference telemetry
│   │   └── utils/                # Utility functions
│   ├── resources.js              # Harper REST API endpoints
│   └── PersonalizationEngine.js  # Product personalization example
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── helpers/                  # Test utilities
│   └── fixtures/                 # Test data and models
├── docs/
│   ├── plans/                    # Design documents
│   │   └── 2025-01-aiops-framework-design.md
│   ├── MODEL_METADATA.md         # Model metadata schema
│   ├── BENCHMARKING.md           # Benchmarking guide
│   └── ONNX_RUNTIME_GUIDE.md     # ONNX backend documentation
├── scripts/                      # Utility scripts
├── examples/                     # Usage examples
└── models/                       # Model files
```

---

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

---

## Documentation

### Design & Architecture
- **[Complete Design Document](docs/plans/2025-01-aiops-framework-design.md)** - Full framework architecture and implementation plan
- [Model Metadata Convention](docs/MODEL_METADATA.md) - Model metadata schema and conventions
- [Benchmarking Guide](docs/BENCHMARKING.md) - Performance comparison and analysis
- [ONNX Runtime Guide](docs/ONNX_RUNTIME_GUIDE.md) - ONNX backend documentation

### Development
- [Scripts Documentation](scripts/README.md) - Utility scripts reference
- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute to the project

### API Documentation
All core classes have comprehensive JSDoc documentation:
- `InferenceEngine` - Framework-agnostic model orchestration with LRU caching
- `BenchmarkEngine` - Performance comparison across backends with detailed metrics
- `MonitoringBackend` - Inference telemetry and event tracking
- `BaseBackend` - Abstract base class for implementing custom ML backends
- Backend implementations: `OnnxBackend`, `TensorFlowBackend`, `TransformersBackend`, `OllamaBackend`

View inline documentation in your IDE or generate API docs with JSDoc.

---

## Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Harper**: v4.0.0 or higher
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

**Current Capabilities:**

- **Model Load Time**: 3-5 seconds (one-time per model)
- **Inference Latency**:
  - ONNX: 10-50ms (optimized)
  - TensorFlow.js: 30-50ms
  - Transformers.js: 50-200ms (WASM)
  - Ollama: 100-500ms (LLMs)
- **Memory Usage**: 150-500MB per loaded model
- **Throughput**: Shared models across concurrent requests
- **Caching**: LRU with configurable size

**Monitoring Capabilities (Milestone A):**
- Real-time metrics with 5-minute sliding windows
- Hourly/daily aggregation for historical analysis
- Drift detection every 6 hours (configurable)
- Alert evaluation on schedule or real-time triggers

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
- Rollback support with parent version tracking
- Training history and metrics

### 4. Multi-Backend Optimization
Find the best backend for your models:
- Benchmark equivalent models across frameworks
- Compare latency, error rates, and resource usage
- Historical trend analysis for regression detection

---

## Future Roadmap

### Near-Term (Milestones A & C)
- ✅ Monitoring & Observability implementation
- ✅ Training & Validation implementation
- Real-time dashboard (post-data-capture)
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

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

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

Built on [HarperDB](https://harperdb.io/) - The distributed database built for the edge.
