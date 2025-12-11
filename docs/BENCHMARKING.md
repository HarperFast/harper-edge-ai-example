# Benchmarking Guide

This guide explains how to compare equivalent models across different backends (ONNX, TensorFlow.js, Ollama) to make data-driven deployment decisions.

## Overview

The benchmarking system allows you to:
- Compare performance of equivalent models across backends
- Measure latency metrics (avg, p50, p95, p99, min, max)
- Track error rates and success counts
- Identify the fastest model for production use
- Store historical benchmark results for analysis

## Quick Start

### 1. Upload Models with Metadata

First, upload equivalent models with matching `taskType`, `equivalenceGroup`, and `outputDimensions`:

```bash
# Upload ONNX model
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=use-onnx" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@universal-sentence-encoder.onnx" \
  -F 'metadata={"taskType":"text-embedding","equivalenceGroup":"universal-sentence-encoder","outputDimensions":[512]}'

# Upload TensorFlow model
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=use-tfjs" \
  -F "version=v1" \
  -F "framework=tensorflowjs" \
  -F "file=@use-tfjs.zip" \
  -F 'metadata={"taskType":"text-embedding","equivalenceGroup":"universal-sentence-encoder","outputDimensions":[512]}'
```

### 2. Run Benchmark

Compare models by running a benchmark:

```bash
curl -X POST http://localhost:9926/benchmark/compare \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "text-embedding",
    "equivalenceGroup": "universal-sentence-encoder",
    "testData": [
      {"texts": ["Hello world"]},
      {"texts": ["Machine learning is amazing"]},
      {"texts": ["Benchmarking models for production"]}
    ],
    "iterations": 100,
    "runBy": "performance-team",
    "notes": "Comparing USE implementations"
  }'
```

### 3. Review Results

The response includes detailed metrics:

```json
{
  "comparisonId": "uuid-here",
  "taskType": "text-embedding",
  "equivalenceGroup": "universal-sentence-encoder",
  "modelIds": ["use-onnx:v1", "use-tfjs:v1"],
  "winner": {
    "modelId": "use-onnx:v1",
    "framework": "onnx",
    "avgLatency": 12.5
  },
  "results": {
    "use-onnx:v1": {
      "avgLatency": 12.5,
      "p50Latency": 11.0,
      "p95Latency": 18.2,
      "p99Latency": 22.1,
      "minLatency": 9.5,
      "maxLatency": 25.0,
      "errorRate": 0.0,
      "successCount": 100,
      "errorCount": 0
    },
    "use-tfjs:v1": {
      "avgLatency": 35.8,
      "p50Latency": 33.0,
      "p95Latency": 52.1,
      "p99Latency": 65.3,
      "minLatency": 28.0,
      "maxLatency": 70.0,
      "errorRate": 0.0,
      "successCount": 100,
      "errorCount": 0
    }
  },
  "timestamp": 1702512000000,
  "completedAt": 1702512060000
}
```

## Model Metadata Convention

See [MODEL_METADATA.md](./MODEL_METADATA.md) for detailed documentation on metadata requirements.

### Required Fields

- **taskType**: ML task category (e.g., "text-embedding")
- **equivalenceGroup**: Identifies functionally equivalent models
- **outputDimensions**: Output tensor shape (must match exactly)

### Example Metadata

```json
{
  "taskType": "text-embedding",
  "equivalenceGroup": "universal-sentence-encoder",
  "outputDimensions": [512],
  "description": "USE optimized for ONNX Runtime",
  "tags": ["nlp", "semantic-similarity"]
}
```

## Benchmark Metrics

### Latency Metrics

- **avgLatency**: Mean latency across all successful predictions
- **p50Latency**: Median latency (50th percentile)
- **p95Latency**: 95th percentile latency
- **p99Latency**: 99th percentile latency
- **minLatency**: Fastest prediction
- **maxLatency**: Slowest prediction

### Error Metrics

- **errorRate**: Ratio of failed predictions (0.0 - 1.0)
- **successCount**: Number of successful predictions
- **errorCount**: Number of failed predictions

### Winner Selection

The winner is determined by:
1. Filter out models with 100% error rate
2. Select model with **lowest avgLatency** among remaining models

## API Reference

### POST /benchmark/compare

Run a benchmark comparison between equivalent models.

**Request:**

```json
{
  "taskType": "text-embedding",
  "equivalenceGroup": "universal-sentence-encoder",
  "testData": [
    {"texts": ["sample 1"]},
    {"texts": ["sample 2"]}
  ],
  "iterations": 100,
  "runBy": "optional-identifier",
  "notes": "optional-description"
}
```

**Parameters:**

- `taskType` (required): Task type to filter models
- `equivalenceGroup` (required): Equivalence group to filter models
- `testData` (required): Array of test samples (cycled during iterations)
- `iterations` (optional): Number of iterations per sample (default: 10)
- `runBy` (optional): User/system identifier
- `notes` (optional): Description or notes

**Response:** Benchmark results (see example above)

**Error Responses:**

- `400`: Invalid request (missing parameters, empty testData, etc.)
- `400`: Not enough models found (need at least 2)
- `500`: Benchmark execution failed

### GET /benchmark/history

Retrieve historical benchmark results.

**Query Parameters:**

- `taskType` (optional): Filter by task type
- `equivalenceGroup` (optional): Filter by equivalence group

**Example:**

```bash
curl "http://localhost:9926/benchmark/history?taskType=text-embedding&equivalenceGroup=universal-sentence-encoder"
```

**Response:**

```json
{
  "count": 5,
  "results": [
    {
      "id": "uuid-1",
      "taskType": "text-embedding",
      "equivalenceGroup": "universal-sentence-encoder",
      "iterations": 100,
      "timestamp": 1702512000000,
      "...": "..."
    }
  ]
}
```

## Using Winning Models

After benchmarking, use the winning model with PersonalizationEngine:

### Option 1: Query Parameters

```bash
curl -X POST "http://localhost:9926/personalize?modelId=use-onnx&version=v1" \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {"name": "Tent", "description": "Camping tent"},
      {"name": "Backpack", "description": "Hiking backpack"}
    ],
    "userContext": {
      "activityType": "camping",
      "experienceLevel": "beginner"
    }
  }'
```

### Option 2: Programmatic

```javascript
import { PersonalizationEngine, InferenceEngine } from './src/core/index.js';

const inferenceEngine = new InferenceEngine();
await inferenceEngine.initialize();

// Use winning model
const engine = new PersonalizationEngine({
  inferenceEngine,
  modelId: 'use-onnx',
  version: 'v1'
});

await engine.initialize();

const enhanced = await engine.enhanceProducts(products, userContext);
```

## Best Practices

### 1. Use Representative Test Data

Choose test data that reflects production workloads:

```javascript
// Good: Real-world product descriptions
const testData = [
  {"texts": ["Waterproof camping tent for 4 people"]},
  {"texts": ["Lightweight hiking boots with ankle support"]},
  {"texts": ["Insulated sleeping bag rated for -10°C"]}
];

// Bad: Trivial test data
const testData = [
  {"texts": ["test"]},
  {"texts": ["abc"]}
];
```

### 2. Run Sufficient Iterations

Use at least 50-100 iterations for stable metrics:

```json
{
  "iterations": 100
}
```

### 3. Benchmark Multiple Times

Run benchmarks at different times to account for system load variations.

### 4. Consider p95/p99 Latencies

While avgLatency determines the winner, also review p95/p99 for tail latencies:

```javascript
// Model A: avgLatency=10ms, p99=15ms (consistent)
// Model B: avgLatency=12ms, p99=50ms (has spikes)
// Choose Model A for better user experience
```

### 5. Monitor Error Rates

Models with >0% error rate may have issues:

```javascript
if (results['model:v1'].errorRate > 0.05) {
  console.warn('Model has >5% error rate, investigate');
}
```

### 6. Document Benchmark Context

Use `runBy` and `notes` fields:

```json
{
  "runBy": "mlops-team",
  "notes": "Comparing ONNX vs TF.js after optimization, load: medium, temp: 60°C"
}
```

## Troubleshooting

### Error: "Not enough models found"

**Cause:** Less than 2 models with matching `taskType` and `equivalenceGroup`.

**Solution:**
1. Verify metadata of uploaded models
2. Ensure at least 2 models exist with matching metadata
3. Check model IDs returned in error message

```bash
# Check models in database
curl http://localhost:9926/Model
```

### Error: "Output dimensions do not match"

**Cause:** Models have different `outputDimensions` in metadata.

**Solution:**
1. Verify `outputDimensions` match exactly: `[512]` != `[512, 1]`
2. Update model metadata if incorrect
3. Only compare models with identical output shapes

### High Error Rates

**Cause:** Model loading issues, invalid input format, or backend errors.

**Solution:**
1. Check model files are valid
2. Verify test data matches model input schema
3. Review server logs for detailed error messages

### Inconsistent Results

**Cause:** System load, background processes, or thermal throttling.

**Solution:**
1. Run benchmarks multiple times
2. Benchmark during consistent load conditions
3. Monitor system resources (CPU, memory, temperature)

## Examples

### Example 1: Compare ONNX vs TensorFlow.js

See [examples/benchmark-comparison.js](../examples/benchmark-comparison.js) for a complete example.

### Example 2: Automated Model Selection

```javascript
async function selectBestModel(taskType, equivalenceGroup) {
  const response = await fetch('/benchmark/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType,
      equivalenceGroup,
      testData: generateTestData(),
      iterations: 100
    })
  });

  const result = await response.json();

  // Auto-deploy winner
  const { modelId, framework, avgLatency } = result.winner;
  console.log(`Deploying ${modelId} (${framework}): ${avgLatency}ms`);

  return result.winner;
}
```

### Example 3: Historical Analysis

```javascript
async function analyzePerformanceTrends(equivalenceGroup) {
  const response = await fetch(
    `/benchmark/history?equivalenceGroup=${equivalenceGroup}`
  );

  const { results } = await response.json();

  // Analyze trends over time
  const trends = results.map(r => ({
    timestamp: r.timestamp,
    winner: JSON.parse(r.results)[r.winner.modelId].avgLatency
  }));

  console.log('Performance trends:', trends);
}
```

## Related Documentation

- [MODEL_METADATA.md](./MODEL_METADATA.md) - Model metadata convention
- [README.md](../README.md) - Project overview
- [schema.graphql](../schema.graphql) - Database schema
