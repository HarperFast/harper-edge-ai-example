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
- **OllamaBackend**: Loads and runs local LLMs via Ollama HTTP API (supports chat completions and embeddings)

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

## Ollama Local LLM Support

Harper now supports running local LLMs via Ollama, enabling fully local AI inference without external API calls.

### Prerequisites

1. **Install Ollama**: Download from [ollama.ai](https://ollama.ai/)
2. **Pull a model**:
   ```bash
   ollama pull llama2
   ollama pull mistral
   ollama pull codellama
   ```
3. **Start Ollama**: Should run automatically on `http://localhost:11434`

### Usage Examples

#### Chat Completions

```bash
# Register Ollama model for chat
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

# Run chat inference with messages
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama2-chat",
    "features": {
      "messages": [
        {"role": "user", "content": "What is machine learning?"}
      ]
    },
    "userId": "user-123"
  }'

# Or use simple prompt format
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama2-chat",
    "features": {
      "prompt": "Explain neural networks in simple terms"
    }
  }'
```

#### Text Embeddings

```bash
# Register Ollama model for embeddings
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

# Generate embeddings
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama2-embed",
    "features": {
      "prompt": "The quick brown fox jumps over the lazy dog"
    }
  }'
```

### JavaScript Client Example

```javascript
// Register Ollama chat model
async function registerOllamaModel() {
  const response = await fetch('http://localhost:9926/Model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'mistral:v1',
      modelId: 'mistral',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      modelBlob: JSON.stringify({
        modelName: 'mistral',
        mode: 'chat'
      }),
      inputSchema: JSON.stringify({
        inputs: [{ name: 'messages', type: 'array' }]
      }),
      outputSchema: JSON.stringify({
        outputs: [{ name: 'response', type: 'string' }]
      })
    })
  });
  return response.json();
}

// Chat with local LLM
async function chatWithLLM(prompt) {
  const response = await fetch('http://localhost:9926/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: 'mistral',
      features: {
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: prompt }
        ]
      },
      userId: 'user-123'
    })
  });

  const result = await response.json();
  return result.prediction.response;
}

// Generate embeddings
async function generateEmbeddings(text) {
  const response = await fetch('http://localhost:9926/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: 'llama2-embed',
      features: { prompt: text }
    })
  });

  const result = await response.json();
  return result.prediction.embeddings;
}

// Example usage
await registerOllamaModel();
const answer = await chatWithLLM('What is the capital of France?');
console.log(answer);

const embeddings = await generateEmbeddings('Hello world');
console.log('Embedding dimension:', embeddings.length);
```

### Ollama Backend Configuration

The `modelBlob` field accepts JSON configuration:

```json
{
  "modelName": "llama2",    // Required: Ollama model name
  "mode": "chat"            // Required: "chat" or "embeddings"
}
```

Or simply pass the model name as a string (defaults to chat mode):
```json
"modelBlob": "llama2"
```

### Supported Models

Any model available in Ollama can be used:
- **Chat Models**: llama2, mistral, codellama, vicuna, phi, neural-chat, etc.
- **Embedding Models**: Any model can generate embeddings via the `/api/embeddings` endpoint

Check available models: `ollama list`

### Environment Variable Configuration

The Ollama backend supports configuration via environment variables. Harper automatically loads `.env` files at startup.

Create a `.env` file in your project root:

```env
# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
```

Available environment variables:

- **`OLLAMA_HOST`**: Ollama server URL
  - Default: `http://localhost:11434`
  - Example: `http://custom-host:8080`
  - Used when creating `OllamaBackend` instances without explicit host

- **`OLLAMA_DEFAULT_MODEL`**: Default model name when not specified in modelBlob
  - Default: `llama2`
  - Example: `mistral`, `codellama`, `phi`
  - Used when model name is not provided in configuration

#### Configuration Precedence

The Ollama backend follows this configuration hierarchy (highest to lowest priority):

1. **Model Configuration**: modelBlob specifies exact model name
   ```json
   "modelBlob": "{\"modelName\": \"mistral\", \"mode\": \"chat\"}"
   ```

2. **Environment Variable**: `OLLAMA_DEFAULT_MODEL` from `.env` file
   ```env
   OLLAMA_DEFAULT_MODEL=mistral
   ```

3. **Hardcoded Default**: Falls back to `llama2`

Example with different configuration levels:

```bash
# Using model config (highest priority)
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chat:v1",
    "modelId": "chat",
    "version": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"modelName\": \"mistral\", \"mode\": \"chat\"}"
  }'
# Uses: mistral (from modelBlob)

# Using environment variable (medium priority)
# Set OLLAMA_DEFAULT_MODEL=codellama in .env
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chat:v1",
    "modelId": "chat",
    "version": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"mode\": \"chat\"}"
  }'
# Uses: codellama (from OLLAMA_DEFAULT_MODEL)

# Using hardcoded default (lowest priority)
# No .env file, no modelName in modelBlob
curl -X POST http://localhost:9926/Model \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chat:v1",
    "modelId": "chat",
    "version": "v1",
    "framework": "ollama",
    "stage": "development",
    "modelBlob": "{\"mode\": \"chat\"}"
  }'
# Uses: llama2 (hardcoded default)
```

### Custom Ollama Host

You can configure a custom Ollama host in three ways:

**1. Via Environment Variable (Recommended):**
```env
OLLAMA_HOST=http://custom-host:8080
```

**2. Via Constructor (Programmatic):**
```javascript
import { OllamaBackend } from './backends/OllamaBackend.js';

const backend = new OllamaBackend('http://custom-host:8080');
```

**3. Using Default:**
```javascript
// Uses process.env.OLLAMA_HOST or defaults to http://localhost:11434
const backend = new OllamaBackend();
```

### Performance Considerations

- **First Request**: May be slow if model needs to load into memory
- **Subsequent Requests**: Much faster as model stays in memory
- **Memory Usage**: Large models (7B+) require significant RAM
- **Concurrency**: Ollama handles concurrent requests automatically

### Benefits of Ollama Integration

- **Privacy**: All inference happens locally, no data leaves your machine
- **No API Costs**: Free local inference
- **Offline Capable**: Works without internet connection
- **Model Variety**: Access to dozens of open-source models
- **Unified API**: Same Harper API for ONNX, TensorFlow, and Ollama models

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
