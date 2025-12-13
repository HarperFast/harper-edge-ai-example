# Model Metadata Convention

This document describes the metadata convention used for model comparison and benchmarking in the Harper Edge AI platform.

## Overview

Models store metadata in the `metadata` JSON field to declare their capabilities, equivalence, and compatibility with other models. This enables the BenchmarkEngine to find and compare equivalent models across different backends (ONNX, TensorFlow, Ollama).

## Metadata Schema

```json
{
	"taskType": "text-embedding",
	"equivalenceGroup": "universal-sentence-encoder",
	"outputDimensions": [512],
	"description": "Optional human-readable description",
	"tags": ["semantic-search", "sentence-similarity"]
}
```

### Required Fields

#### `taskType` (String)

Defines the category of ML task the model performs.

**Common values:**

- `"text-embedding"` - Converts text to dense vector representations
- `"image-classification"` - Classifies images into categories
- `"object-detection"` - Detects objects in images
- `"text-generation"` - Generates text (LLMs)
- `"sentiment-analysis"` - Classifies text sentiment
- `"named-entity-recognition"` - Extracts entities from text

#### `equivalenceGroup` (String)

Identifies models that are functionally equivalent (same architecture, training data, output format).

Models in the same equivalence group:

- Produce similar outputs for the same inputs
- Can be compared in benchmarks
- Are interchangeable in production

**Examples:**

- `"universal-sentence-encoder"` - USE variants (TensorFlow, ONNX versions)
- `"resnet-50"` - ResNet-50 variants
- `"bert-base-uncased"` - BERT base variants
- `"llama-2-7b"` - Llama 2 7B variants

#### `outputDimensions` (Array)

Specifies the shape of the model's output tensor.

**Examples:**

- `[512]` - 512-dimensional embedding vector
- `[768]` - 768-dimensional embedding vector
- `[1, 1000]` - 1000 class probabilities
- `[300, 300, 3]` - 300x300 RGB image

**Important:** All models in a comparison must have **identical** `outputDimensions` (deep equality check). No normalization or dimension matching is performed.

### Optional Fields

#### `description` (String)

Human-readable description of the model.

```json
{
	"description": "Universal Sentence Encoder optimized for ONNX Runtime"
}
```

#### `tags` (Array<String>)

Additional categorization tags for search and filtering.

```json
{
	"tags": ["semantic-search", "sentence-similarity", "nlp"]
}
```

## Usage Examples

### Example 1: Text Embedding Model (TensorFlow)

```json
{
	"taskType": "text-embedding",
	"equivalenceGroup": "universal-sentence-encoder",
	"outputDimensions": [512],
	"description": "Universal Sentence Encoder (TensorFlow.js)",
	"tags": ["nlp", "semantic-similarity"]
}
```

### Example 2: Text Embedding Model (ONNX)

```json
{
	"taskType": "text-embedding",
	"equivalenceGroup": "universal-sentence-encoder",
	"outputDimensions": [512],
	"description": "Universal Sentence Encoder (ONNX optimized)",
	"tags": ["nlp", "semantic-similarity", "optimized"]
}
```

### Example 3: Image Classification Model

```json
{
	"taskType": "image-classification",
	"equivalenceGroup": "resnet-50",
	"outputDimensions": [1000],
	"description": "ResNet-50 trained on ImageNet",
	"tags": ["computer-vision", "imagenet"]
}
```

## Validation Rules

The BenchmarkEngine validates models before comparison:

### 1. Minimum Model Count

At least **2 models** must exist with the same `taskType` and `equivalenceGroup`.

```javascript
// Valid: 2+ models with matching metadata
Model 1: { taskType: "text-embedding", equivalenceGroup: "use", outputDimensions: [512] }
Model 2: { taskType: "text-embedding", equivalenceGroup: "use", outputDimensions: [512] }

// Invalid: Only 1 model
Model 1: { taskType: "text-embedding", equivalenceGroup: "use", outputDimensions: [512] }
```

### 2. Output Dimension Matching

All models must have **identical** `outputDimensions` (deep equality).

```javascript
// Valid: All dimensions match exactly
Model 1: { outputDimensions: [512] }
Model 2: { outputDimensions: [512] }

// Invalid: Dimensions differ
Model 1: { outputDimensions: [512] }
Model 2: { outputDimensions: [768] }

// Invalid: Different shapes
Model 1: { outputDimensions: [512] }
Model 2: { outputDimensions: [512, 1] }
```

### 3. Framework Diversity (Recommended)

While not required, benchmarks are most useful when comparing models across different backends:

```javascript
// Recommended: Different frameworks
Model 1: { framework: "onnx", ... }
Model 2: { framework: "tensorflowjs", ... }

// Less useful: Same framework
Model 1: { framework: "onnx", ... }
Model 2: { framework: "onnx", ... }
```

## API Integration

### Uploading Models with Metadata

```bash
# Upload TensorFlow model
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=use-tensorflow" \
  -F "version=v1" \
  -F "framework=tensorflowjs" \
  -F "file=@use-tfjs.zip" \
  -F 'metadata={"taskType":"text-embedding","equivalenceGroup":"universal-sentence-encoder","outputDimensions":[512]}'

# Upload ONNX model
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=use-onnx" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@use.onnx" \
  -F 'metadata={"taskType":"text-embedding","equivalenceGroup":"universal-sentence-encoder","outputDimensions":[512]}'
```

### Running Benchmarks

```bash
curl -X POST http://localhost:9926/benchmark/compare \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "text-embedding",
    "equivalenceGroup": "universal-sentence-encoder",
    "testData": [
      {"texts": ["Hello world"]},
      {"texts": ["Machine learning is amazing"]}
    ],
    "iterations": 100
  }'
```

## Best Practices

### 1. Use Descriptive Equivalence Groups

Choose names that clearly identify the model architecture:

✅ **Good:**

- `"universal-sentence-encoder"`
- `"bert-base-uncased"`
- `"resnet-50-imagenet"`

❌ **Bad:**

- `"model1"`
- `"embedder"`
- `"v2"`

### 2. Document Output Dimensions Clearly

Ensure `outputDimensions` accurately reflects the tensor shape:

```javascript
// For embeddings
{
	outputDimensions: [512];
} // Not [1, 512] or [512, 1]

// For classification
{
	outputDimensions: [1000];
} // Class probabilities

// For images
{
	outputDimensions: [224, 224, 3];
} // Height, width, channels
```

### 3. Add Meaningful Tags

Use tags to help with discovery and filtering:

```json
{
	"tags": [
		"production-ready", // Deployment status
		"optimized", // Performance characteristic
		"quantized", // Model type
		"nlp" // Domain
	]
}
```

### 4. Keep Descriptions Concise

Focus on what makes this model variant unique:

```json
{
	"description": "USE with INT8 quantization for 3x faster inference"
}
```

## Querying Models by Metadata

### Find All Models for a Task

```javascript
const models = await Model.search().filter({ taskType: 'text-embedding' }).all();
```

### Find Equivalent Models

```javascript
const models = await Model.search()
	.filter({
		taskType: 'text-embedding',
		equivalenceGroup: 'universal-sentence-encoder',
	})
	.all();
```

### Find Models by Framework

```javascript
const onnxModels = await Model.search()
	.filter({
		framework: 'onnx',
		taskType: 'text-embedding',
	})
	.all();
```

## Troubleshooting

### Error: "Not enough models for comparison"

- **Cause:** Less than 2 models with matching `taskType` and `equivalenceGroup`
- **Solution:** Upload additional models with matching metadata

### Error: "Output dimensions do not match"

- **Cause:** Models have different `outputDimensions`
- **Solution:** Verify output shapes and ensure exact match

### Error: "Invalid metadata format"

- **Cause:** Malformed JSON or missing required fields
- **Solution:** Validate JSON and ensure `taskType`, `equivalenceGroup`, and `outputDimensions` are present

## Related Documentation

- [BENCHMARKING.md](./BENCHMARKING.md) - Comprehensive benchmarking guide
- [README.md](../README.md) - Project overview and quick start
- [schema.graphql](../schema.graphql) - Database schema definitions
