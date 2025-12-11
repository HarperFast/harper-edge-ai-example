# ONNX Runtime Integration Guide

## Overview

Harper Edge AI now supports ONNX Runtime alongside TensorFlow.js through a unified MLOps architecture. This enables:

- Framework-agnostic model inference
- Model versioning and registry
- Complete observability with feedback loop
- Performance comparison between frameworks

## Architecture

### Core Components

1. **ModelRegistry**: Stores model blobs and metadata in Harper tables
2. **InferenceEngine**: Routes inference to correct backend (ONNX or TensorFlow)
3. **MonitoringBackend**: Records inference events and tracks metrics
4. **FeatureStore**: Stores entity features (in-memory for MVP)

### Backends

- **OnnxRuntimeBackend**: Loads and runs ONNX models using `onnxruntime-node`
- **TensorFlowBackend**: Loads and runs TensorFlow.js models (stub implementation for MVP)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        REST API                             │
├─────────────────────────────────────────────────────────────┤
│ POST /model/upload  POST /predict  POST /feedback          │
│ GET  /model/:id     GET  /monitoring/events                │
│ GET  /model/versions GET /monitoring/metrics               │
└────────┬──────────────────────────────┬─────────────────────┘
         │                              │
         v                              v
    ┌─────────────────┐      ┌──────────────────────┐
    │ ModelRegistry   │      │ InferenceEngine      │
    │                 │      │                      │
    │ - Store models  │      │ - Load models        │
    │ - Version mgmt  │      │ - Route to backend   │
    │ - Metadata      │      │ - Cache              │
    └────────┬────────┘      │ - LRU eviction       │
             │                └──────────┬───────────┘
             │                           │
             v                           v
      ┌──────────────┐        ┌─────────────────────┐
      │ Harper       │        │ Backends            │
      │              │        │                     │
      │ Model Table  │        │ OnnxRuntimeBackend │
      │              │        │ TensorFlowBackend  │
      └──────────────┘        └────────┬────────────┘
                                       │
                                       v
                              ┌───────────────────┐
                              │ ONNX Runtime or   │
                              │ TensorFlow.js     │
                              └───────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                         │
├─────────────────────────────────────────────────────────────┤
│                 MonitoringBackend                           │
│                                                             │
│ - Record inference events (request, latency, confidence)   │
│ - Record feedback (ground truth labels)                     │
│ - Query inference history by model/user/time               │
│ - Calculate aggregate metrics (accuracy, latency)           │
└────────────────┬──────────────────────────────────────────┘
                 │
                 v
          ┌──────────────┐
          │ Harper       │
          │              │
          │ InferenceEvent
          │ Table        │
          └──────────────┘
```

## REST API

### Model Management (Harper Native @export)

Harper automatically generates REST endpoints for the Model table via the @export directive.

#### Create Model

```bash
POST /Model
Content-Type: application/json

Body:
{
  "id": "my-model:v1",
  "modelId": "my-model",
  "version": "v1",
  "framework": "onnx",
  "stage": "development",
  "modelBlob": "<base64-encoded-blob>",
  "inputSchema": "{...}",
  "outputSchema": "{...}",
  "metadata": "{...}"
}

Response:
{
  "id": "my-model:v1",
  "modelId": "my-model",
  "version": "v1",
  "uploadedAt": 1234567890,
  ...
}
```

#### Get Model Info

```bash
GET /Model/my-model:v1

Response:
{
  "id": "my-model:v1",
  "modelId": "my-model",
  "version": "v1",
  "framework": "onnx",
  "stage": "development",
  "inputSchema": "{...}",
  "outputSchema": "{...}",
  "uploadedAt": 1234567890
}
```

#### List Models by ID

```bash
GET /Model?modelId=my-model

Response:
[
  {"id": "my-model:v1", "version": "v1", "framework": "onnx", "stage": "development"},
  {"id": "my-model:v2", "version": "v2", "framework": "onnx", "stage": "production"}
]
```

### Inference

#### Predict

```bash
POST /predict
Content-Type: application/json

Body:
{
  "modelId": "my-model",
  "version": "v1",  // optional, defaults to latest
  "features": {
    "input": [0.1, 0.2, 0.3, ...]
  },
  "userId": "user-123",  // optional
  "sessionId": "session-456"  // optional
}

Response:
{
  "inferenceId": "uuid",
  "prediction": {
    "output": [0.8, 0.2]
  },
  "confidence": 0.8,
  "modelVersion": "v1",
  "latencyMs": 42
}
```

### Observability

#### Record Feedback (Harper Native @export)

Use Harper's native PUT endpoint to update inference events with feedback:

```bash
PUT /InferenceEvent/:inferenceId
Content-Type: application/json

Body:
{
  "actualOutcome": "{\"class\": 1}",
  "feedbackTimestamp": 1234567890,
  "correct": true
}

Response:
{
  "id": "uuid",
  "actualOutcome": "{\"class\": 1}",
  "feedbackTimestamp": 1234567890,
  "correct": true,
  ...
}
```

#### Query Inference Events (Harper Native @export)

Use Harper's native GET endpoint with query parameters:

```bash
GET /InferenceEvent?modelId=my-model&limit=10

Query Parameters:
- modelId: Filter by model
- userId: Filter by user
- limit: Max results
- Any indexed field from schema

Response:
[
  {
    "id": "uuid",
    "timestamp": 1234567890,
    "modelId": "my-model",
    "modelVersion": "v1",
    "framework": "onnx",
    "featuresIn": "{...}",
    "prediction": "{...}",
    "confidence": 0.8,
    "latencyMs": 42,
    "correct": true
  }
]
```

#### Get Model Metrics (Custom Endpoint)

Compute aggregate metrics for a model:

```bash
GET /monitoring/metrics?modelId=my-model&startTime=1234567890

Response:
{
  "modelId": "my-model",
  "count": 100,
  "avgLatency": 45.2,
  "avgConfidence": 0.87,
  "accuracy": 0.92  // null if no feedback recorded
}
```

## Usage Examples

### Python: Train and Export ONNX Model

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Train model
X_train = np.random.rand(100, 10)
y_train = np.random.randint(0, 2, 100)

model = LogisticRegression()
model.fit(X_train, y_train)

# Export to ONNX
initial_type = [('float_input', FloatTensorType([None, 10]))]
onnx_model = convert_sklearn(model, initial_types=initial_type)

# Save
with open("model.onnx", "wb") as f:
    f.write(onnx_model.SerializeToString())
```

### Upload to Harper (Native API)

```bash
# First, encode the model as base64
MODEL_BASE64=$(base64 -i model.onnx)

# Then POST to Harper's native endpoint
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"sklearn-classifier:v1\",
    \"modelId\": \"sklearn-classifier\",
    \"version\": \"v1\",
    \"framework\": \"onnx\",
    \"stage\": \"development\",
    \"modelBlob\": \"$MODEL_BASE64\",
    \"inputSchema\": \"{\\\"inputs\\\":[{\\\"name\\\":\\\"float_input\\\",\\\"shape\\\":[1,10]}]}\",
    \"outputSchema\": \"{\\\"outputs\\\":[{\\\"name\\\":\\\"output_label\\\",\\\"shape\\\":[1]},{\\\"name\\\":\\\"output_probability\\\",\\\"shape\\\":[1,2]}]}\"
  }"
```

### Run Inference

```bash
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "sklearn-classifier",
    "features": {
      "float_input": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    },
    "userId": "user-123"
  }'
```

### JavaScript: Using the API

```javascript
// Upload a model using Harper's native endpoint
async function uploadModel(modelId, version, framework, modelBlobBase64) {
  const response = await fetch('http://localhost:9926/Model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `${modelId}:${version}`,
      modelId,
      version,
      framework,
      stage: 'development',
      modelBlob: modelBlobBase64,
      inputSchema: JSON.stringify({
        inputs: [{ name: 'input', shape: [1, 10] }]
      }),
      outputSchema: JSON.stringify({
        outputs: [{ name: 'output', shape: [1, 2] }]
      })
    })
  });

  return response.json();
}

// Run prediction
async function predict(modelId, features) {
  const response = await fetch('http://localhost:9926/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId,
      features,
      userId: 'user-123'
    })
  });

  return response.json();
}

// Record feedback using Harper's native endpoint
async function recordFeedback(inferenceId, correct) {
  const response = await fetch(`http://localhost:9926/InferenceEvent/${inferenceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actualOutcome: JSON.stringify({ class: 1 }),
      feedbackTimestamp: Date.now(),
      correct
    })
  });

  return response.json();
}

// Get metrics
async function getMetrics(modelId) {
  const response = await fetch(
    `http://localhost:9926/monitoring/metrics?modelId=${modelId}`
  );
  return response.json();
}
```

## Performance Comparison

To compare TensorFlow.js vs ONNX Runtime:

1. Train same model in both frameworks
2. Upload both versions to ModelRegistry
3. Run predictions with both
4. Query metrics to compare latency and resource usage

```bash
# Check ONNX metrics
curl "http://localhost:9926/monitoring/metrics?modelId=model-onnx"

# Check TensorFlow metrics
curl "http://localhost:9926/monitoring/metrics?modelId=model-tf"
```

## Architecture Benefits

- **50% Code Reduction**: Removed ~410 lines by leveraging Harper's @export directive
- **Native CRUD**: Harper auto-generates POST/GET/PUT/DELETE endpoints for tables
- **Simplified Codebase**: ModelRegistry and MonitoringBackend are now minimal helpers
- **Direct Table Access**: InferenceEngine uses Harper tables directly

## Limitations (MVP)

- TensorFlow backend is stub implementation (only ONNX fully functional)
- FeatureStore is in-memory (not persisted)
- No automated drift detection (data collection only)
- No batch inference
- No authentication

## Future Enhancements

- Complete TensorFlow backend implementation
- Migrate FeatureStore to Harper tables
- Add drift detection algorithms
- Automated retraining triggers
- A/B testing infrastructure
- Batch inference endpoints
- Model explainability/SHAP integration
- Automated data drift detection
- Cost optimization and resource monitoring
