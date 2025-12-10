# ONNX Runtime Integration Design

**Date:** 2025-12-10
**Status:** Approved for Implementation

## Overview

Extend Harper Edge AI Example to support both TensorFlow.js and ONNX Runtime in a unified MLOps architecture. This allows side-by-side comparison of the two frameworks while building production-ready model inference capabilities.

## Goals

1. **Unified Architecture:** Single infrastructure supporting both TensorFlow.js and ONNX Runtime
2. **Framework Comparison:** Run both frameworks in parallel to compare complexity and performance
3. **MLOps Foundation:** Build core MLOps components (model registry, inference engine, monitoring, feature store)
4. **Observability:** Track complete inference pipeline with feedback loop for model evaluation

## Non-Goals (Deferred)

- Model training (use pre-trained ONNX models only)
- Automated drift detection algorithms
- Automated retraining triggers
- A/B testing infrastructure
- Batch inference
- Model promotion workflows (dev → staging → production)
- Authentication & authorization
- Rate limiting & quotas

## Architecture

### Two Parallel ML Systems

**Existing (TensorFlow.js):**
- Universal Sentence Encoder for semantic similarity
- `/personalize` endpoint for product matching
- PersonalizationEngine.js (enhanced to use unified InferenceEngine)

**New (ONNX Runtime):**
- Generic model inference for uploaded custom models
- MLOps components (FeatureStore, ModelRegistry, InferenceEngine, MonitoringBackend)
- REST API: `/model/upload`, `/predict`, `/monitoring/*`, `/feedback`

**Future Decision:** Choose one framework based on performance/complexity data collected from parallel operation.

### Storage Strategy

- **Model blobs:** Stored in Harper tables as `Blob` type (both ONNX and TensorFlow models)
- **Model metadata:** Harper tables (ModelRegistry)
- **Inference events:** Harper tables (MonitoringBackend)
- **Features:** In-memory Map for MVP (migrate to Harper tables later)
- **No external filesystem dependencies**

## Core Components

### 1. InferenceEngine (Pluggable Backends)

**Purpose:** Single interface for all model inference, automatically routes to correct backend.

**Backends:**
- `OnnxRuntimeBackend`: Loads ONNX models using onnxruntime-node
- `TensorFlowBackend`: Loads TensorFlow.js models

**API:**
- `loadModel(modelId, version)`: Fetch from registry, load into appropriate backend, cache
- `predict(modelId, inputs)`: Run inference using cached model

**Caching:**
- In-memory Map with LRU eviction
- Same cache strategy for both backends

**Backend Selection:**
- Reads `framework` field from ModelRegistry
- Routes to OnnxRuntimeBackend or TensorFlowBackend automatically

### 2. ModelRegistry (Framework-Agnostic)

**Purpose:** Store all models (ONNX + TensorFlow) as blobs in Harper tables.

**Schema:**
- `id`: Primary key (format: `${modelId}:${version}`)
- `modelId`: User-provided identifier (indexed)
- `version`: Version tag (indexed)
- `framework`: "onnx" | "tensorflow" | "tfjs-graph" (indexed)
- `modelBlob`: Binary model file (Blob type)
- `inputSchema`: JSON describing expected input shape/types
- `outputSchema`: JSON describing expected output shape/types
- `metadata`: User-provided tags, description, etc.
- `uploadedAt`: Timestamp
- `stage`: "development" | "staging" | "production" (indexed)

**API:**
- `registerModel(registration)`: Store model blob + metadata
- `getModel(modelId, version)`: Retrieve model metadata + blob
- `listModels()`: List all registered models
- `listVersions(modelId)`: List all versions of a model

### 3. PersonalizationEngine (Backend-Agnostic)

**Purpose:** High-level API for personalization use cases.

**Key Change:** Now uses InferenceEngine internally instead of directly calling TensorFlow.js.

**Functionality:**
- Build query from user context
- Get embeddings via `inferenceEngine.predict('sentence-encoder', texts)`
- Calculate cosine similarity
- Rank products by similarity scores

**Flexibility:** Can use Universal Sentence Encoder (TensorFlow), ONNX sentence encoder, or any embedding model. Swap models without changing PersonalizationEngine code.

### 4. FeatureStore

**Purpose:** Store entity features for inference.

**MVP Implementation:**
- In-memory Map: `{ entityId: { featureName: value } }`
- Migrate to Harper tables in future iteration

**API:**
- `writeFeatures(entityId, features, timestamp?)`: Store features
- `getFeatures(entityId, featureNames)`: Retrieve specific features

### 5. MonitoringBackend

**Purpose:** Record complete inference pipeline with feedback loop.

**Schema (inference_events table):**
- `id`: Primary key (inferenceId UUID)
- `timestamp`: When inference happened (indexed)
- `modelId`, `modelVersion`, `framework`: Which model was used (indexed)
- `requestId`: For tracing across services (indexed)
- `userId`, `sessionId`: For user-level analysis (indexed)
- `featuresIn`: Raw features sent to model (JSON)
- `prediction`: Model output (JSON)
- `confidence`: Model confidence score
- `latencyMs`: Inference time
- `actualOutcome`: What actually happened - nullable until feedback received (JSON)
- `feedbackTimestamp`: When feedback was recorded - nullable
- `correct`: Did prediction match outcome? - nullable (boolean)

**API:**
- `recordInference(event)`: Capture prediction at inference time
- `recordFeedback(inferenceId, outcome)`: Add ground truth later
- `queryEvents(filters)`: Query events with/without feedback
- `getMetrics(modelId, timeRange?)`: Aggregate metrics (count, avgLatency, avgConfidence, accuracy)

**Use Cases:**
- Detect when model accuracy drops (drift detection foundation)
- Build retraining datasets from production data
- A/B test different models
- Debug specific predictions

## Data Flows

### Upload Flow
1. User uploads ONNX/TensorFlow model file via `POST /model/upload`
2. ModelRegistry stores blob + metadata in Harper table
3. Returns success with modelId/version

### Inference Flow
1. Request to `POST /predict` with modelId + features
2. InferenceEngine checks in-memory cache
   - Cache hit: use loaded model
   - Cache miss: fetch blob from ModelRegistry → load into backend → cache
3. Run prediction through backend (ONNX or TensorFlow)
4. MonitoringBackend records event (inferenceId, features, prediction, latency)
5. Return prediction + inferenceId to client

### Feedback Flow
1. Client sends `POST /feedback` with inferenceId + actualOutcome
2. MonitoringBackend updates inference event record
3. Marks `correct` flag based on outcome
4. Returns success
5. **No automated action for MVP** - just data collection for future drift detection

### Personalization Flow (Enhanced)
1. Request to `POST /personalize` with products + userContext
2. PersonalizationEngine → InferenceEngine.predict('sentence-encoder', texts)
3. InferenceEngine routes to TensorFlow backend (or ONNX if model swapped)
4. Calculate similarities, rank products
5. MonitoringBackend records event
6. Return ranked products

## REST API Endpoints

### Model Management

**POST /model/upload**
- Upload ONNX or TensorFlow model
- Body: multipart/form-data with `{ modelId, version, framework, file, inputSchema, outputSchema, metadata }`
- Returns: `{ modelId, version, uploadedAt }`

**GET /model/:modelId/:version**
- Get model metadata (not the blob)
- Returns: model registry record

**GET /model/:modelId/versions**
- List all versions of a model
- Returns: array of versions with metadata

### Inference

**POST /predict**
- Generic prediction endpoint
- Body: `{ modelId, version?, features, userId?, sessionId? }`
- Returns: `{ inferenceId, prediction, confidence, modelVersion, latencyMs }`

**POST /personalize** (existing, enhanced)
- Semantic product ranking
- Body: `{ products, userContext, modelId? }`
- Returns: products with `personalizedScore` added

### Observability

**POST /feedback**
- Record actual outcome for an inference
- Body: `{ inferenceId, outcome, correct? }`
- Returns: `{ success: true }`

**GET /monitoring/events?modelId=&startTime=&endTime=&limit=**
- Query inference events
- Returns: `{ events: [...] }`

**GET /monitoring/metrics?modelId=&timeRange=**
- Aggregate metrics
- Returns: `{ count, avgLatency, avgConfidence, accuracy }`

## Harper Schema Definition

**schema.graphql:**

```graphql
# Database for Harper Edge AI Example with MLOps
type Model @table(database: "harper-edge-ai-example") @export {
  # Composite key as single field: "${modelId}:${version}"
  id: ID @primaryKey

  # Model metadata
  modelId: String @indexed
  version: String @indexed
  framework: String @indexed  # "onnx" | "tensorflow" | "tfjs-graph"
  stage: String @indexed      # "development" | "staging" | "production"

  # Model binary data (use Blob for large ONNX/TF models)
  modelBlob: Blob

  # Schema definitions (JSON stringified)
  inputSchema: String
  outputSchema: String
  metadata: String

  # Timestamps
  uploadedAt: Long @createdTime
}

type InferenceEvent @table(database: "harper-edge-ai-example") @export {
  # Primary key - UUID for each inference
  id: ID @primaryKey  # This will be the inferenceId

  # Model information
  modelId: String @indexed
  modelVersion: String @indexed
  framework: String @indexed

  # Request tracking
  requestId: String @indexed
  userId: String @indexed
  sessionId: String @indexed

  # Inference data (JSON stringified)
  featuresIn: String
  prediction: String
  confidence: Float

  # Performance
  latencyMs: Int

  # Feedback loop (nullable until feedback received)
  actualOutcome: String
  feedbackTimestamp: Long
  correct: Boolean

  # Timestamps
  timestamp: Long @createdTime @indexed
}
```

## Dependencies

```json
{
  "dependencies": {
    "@tensorflow/tfjs-node": "^4.22.0",
    "@tensorflow-models/universal-sentence-encoder": "^1.3.3",
    "onnxruntime-node": "^1.20.0",
    "uuid": "^11.0.3"
  }
}
```

## Error Handling

- Model not found → 404
- Invalid input schema → 400 with validation details
- Backend loading failure → 500 with error logged
- Inference timeout (30s) → 503
- All errors logged to MonitoringBackend as failed inference events

## Testing Strategy

### Test Models
- Download small ONNX models from Hugging Face/ONNX Model Zoo
- Cache in `tests/fixtures/onnx-models/`
- Examples:
  - `mnist-12.onnx` (small binary classifier)
  - Small sentence transformer exported to ONNX
- Fallback: Generate minimal ONNX model programmatically

### Unit Tests
1. **ModelRegistry**: Store/retrieve model blob from Harper table, query by modelId/version/framework
2. **InferenceEngine**: Load ONNX/TensorFlow models, caching (LRU), backend selection
3. **MonitoringBackend**: Record events, query with filters, metrics aggregation, feedback
4. **FeatureStore**: Write/read features (in-memory)

### Integration Tests
1. End-to-end ONNX flow: upload → predict → feedback
2. End-to-end TensorFlow flow: upload → predict → feedback
3. Personalization with both backends: swap sentence encoder, verify same API

### Postman Collection
Create `postman/Harper-Edge-AI-MLOps.postman_collection.json`:
- **Model Management** folder: upload, get metadata, list versions
- **Inference** folder: predict, personalize
- **Observability** folder: feedback, query events, metrics
- Environment variables for localhost:9926
- Pre-populated example requests with test data

### Test Scripts
```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:all          # Both
```

## Implementation Notes

### Model Loading from Blobs
- ONNX Runtime Node.js: Can load models from `Buffer`
- TensorFlow.js: Can load models from `ArrayBuffer`
- Both backends read from ModelRegistry blob and instantiate in-memory

### Composite Keys
- Harper doesn't support multi-column primary keys
- Use format: `${modelId}:${version}` as single `id` field
- Helper functions: `buildModelKey(modelId, version)`, `parseModelKey(id)`

### JSON Storage
- Store complex objects (inputSchema, outputSchema, metadata, featuresIn, prediction, actualOutcome) as JSON-stringified strings
- Parse on read, stringify on write

### Cache Eviction
- LRU cache with configurable max size (default: 10 models)
- Evict least recently used when cache full

## Success Criteria

Walking skeleton is successful when:
1. ✅ Can upload ONNX model and store in Harper tables
2. ✅ Can upload TensorFlow model and store in Harper tables
3. ✅ `/predict` endpoint works with both ONNX and TensorFlow models
4. ✅ `/personalize` endpoint uses InferenceEngine (backend-agnostic)
5. ✅ All inference events recorded to MonitoringBackend
6. ✅ Feedback loop: can record actual outcomes and query accuracy metrics
7. ✅ Unit tests pass for all components
8. ✅ Integration tests pass for end-to-end flows
9. ✅ Postman collection successfully tests all endpoints
10. ✅ Can swap sentence encoder from TensorFlow to ONNX without code changes

## Future Iterations (Post-Walking Skeleton)

1. **Drift Detection:** Implement PSI-based input drift monitoring using collected data
2. **Automated Retraining:** Trigger retraining when drift/accuracy thresholds exceeded
3. **A/B Testing:** Serve multiple model versions, compare performance
4. **Batch Inference:** Support batch prediction endpoints
5. **Model Promotion:** Workflow for promoting models from dev → staging → production
6. **Feature Store → Harper Tables:** Migrate from in-memory to persistent storage
7. **Authentication:** Add API key or JWT-based auth
8. **Input Validation:** Schema-based validation for model inputs
9. **Model Rollback:** Revert to previous model version if issues detected
10. **Feature Transformations:** Preprocessing pipelines for feature engineering

## References

- [Harper Schema Definition Docs](https://docs.harperdb.io/docs/developers/applications/defining-schemas)
- [ONNX Runtime Node.js](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [TensorFlow.js](https://www.tensorflow.org/js)
