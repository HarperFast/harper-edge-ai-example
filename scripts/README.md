# Scripts Documentation

This directory contains utility scripts for managing models and running benchmarks in the Harper Edge AI Example project.

## Available Scripts

### 1. preload-models.js

Preloads test models into Harper for benchmarking across different backends (Ollama, TensorFlow, ONNX).

**Usage:**
```bash
# Load all models
npm run preload-models

# Or directly
node scripts/preload-models.js

# Clean existing models first
node scripts/preload-models.js --clean

# Load specific task type only
node scripts/preload-models.js --type embeddings
node scripts/preload-models.js --type classification
node scripts/preload-models.js --type vision
```

**Model Types:**

1. **Text Embeddings** (product-recommender)
   - `nomic-embed-text` (Ollama) - 768 dimensions
   - `mxbai-embed-large` (Ollama) - 1024 dimensions
   - `universal-sentence-encoder` (TensorFlow) - 512 dimensions
   - `all-MiniLM-L6-v2` (ONNX) - 384 dimensions

2. **Classification** (price-classifier)
   - `llama2-classifier` (Ollama)
   - `mistral-classifier` (Ollama)

3. **Vision** (image-tagger)
   - `llava` (Ollama)
   - `bakllava` (Ollama)

**Prerequisites:**
- Harper must be running (`npm run dev`)
- Ollama must be installed and running
- Ollama models must be pulled:
  ```bash
  ollama pull nomic-embed-text
  ollama pull mxbai-embed-large
  ollama pull llama2
  ollama pull mistral
  ollama pull llava
  ollama pull bakllava
  ```

**Output:**
```
============================================================
Harper Edge AI - Model Preload Script
============================================================

✓ Harper is running

Loading embeddings models:
  ✓ nomic-embed-text:v1 (ollama)
  ✓ mxbai-embed-large:v1 (ollama)
  ✓ universal-sentence-encoder:v1 (tensorflow)
  ✓ all-MiniLM-L6-v2:v1 (onnx)

...

✓ Successfully loaded 10 models
```

---

### 2. run-benchmark.js

Interactive CLI for running benchmarks comparing equivalent models across different backends.

**Usage:**
```bash
# Interactive mode
npm run benchmark

# Or directly
node scripts/run-benchmark.js
```

**Features:**
- Interactive menu for selecting task type and equivalence group
- Configurable iteration count
- Generates appropriate test data for each task type
- Displays results in formatted table
- Shows winner and performance comparison
- Option to save results to JSON file

**Workflow:**
1. Lists available benchmark groups from loaded models
2. User selects a group (e.g., "text-embedding - product-recommender")
3. User specifies number of iterations (default: 100)
4. Script generates test data and runs benchmark
5. Results displayed in formatted table with winner highlighted
6. Option to save detailed results to file

**Output Example:**
```
============================================================
BENCHMARK RESULTS
============================================================

Comparison ID: 550e8400-e29b-41d4-a716-446655440000
Task Type: text-embedding
Equivalence Group: product-recommender
Models Compared: 3

┌────────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────────┐
│ Model                          │ Avg Latency  │ P50 Latency  │ P95 Latency  │ P99 Latency  │ Error Rate │
├────────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ ★ nomic-embed-text:v1          │    45.23ms   │    42.10ms   │    67.80ms   │    89.45ms   │      0.0%  │
│   mxbai-embed-large:v1         │    78.45ms   │    75.30ms   │   105.20ms   │   132.15ms   │      0.0%  │
│   universal-sentence-encoder   │   125.67ms   │   120.45ms   │   178.90ms   │   201.23ms   │      0.0%  │
└────────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴────────────┘

★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
  WINNER: nomic-embed-text:v1 (ollama)
  Average Latency: 45.23ms
  Speedup: 177.8% faster than slowest
★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
```

---

### 3. generate-test-models.js

Generates scripts and documentation for creating minimal ONNX models for testing.

**Usage:**
```bash
npm run generate-test-models

# Or directly
node scripts/generate-test-models.js
```

**Generated Files:**
- `models/test/generate_test_models.py` - Python script to create ONNX models
- `models/test/README.md` - Documentation for test models

**Test Models:**
1. **identity.onnx** - Simple identity model for infrastructure testing
2. **random-embeddings.onnx** - Random embedding model for benchmarks
3. **simple-classifier.onnx** - Simple linear classifier for testing

**To Generate ONNX Models:**
```bash
# Install Python dependencies
pip install onnx numpy onnxruntime

# Generate models
cd models/test
python3 generate_test_models.py
```

---

## Workflow Examples

### Complete Setup and Benchmark

```bash
# 1. Install dependencies
npm install

# 2. Start Harper
npm run dev

# 3. In another terminal, install Ollama models
ollama pull nomic-embed-text
ollama pull mxbai-embed-large
ollama pull llama2

# 4. Preload models into Harper
npm run preload-models

# 5. Run interactive benchmark
npm run benchmark
```

### Running Example Benchmark

```bash
# Run the complete example script
npm run benchmark-example

# This will:
# - Use preloaded models
# - Run benchmark with product data
# - Show winner
# - Use winner for personalization
# - Query benchmark history
```

### Clean and Reload Models

```bash
# Clean existing models and reload
npm run preload-models -- --clean

# Load only specific type
node scripts/preload-models.js --clean --type embeddings
```

---

## Test Data

### Text Embeddings (Product Recommendations)
```javascript
const testData = [
  { prompt: 'trail running shoes lightweight breathable mesh upper' },
  { prompt: 'waterproof hiking boots winter insulated ankle support' },
  { prompt: 'camping tent 4 person family double wall weatherproof' },
  // ... more product descriptions
];
```

### Classification (Price Sensitivity)
```javascript
const testData = [
  { prompt: 'This product is too expensive for what it offers' },
  { prompt: 'Great value for money, would buy again' },
  { prompt: 'Quality is excellent, price is reasonable' },
  // ... more customer feedback
];
```

### Vision (Image Tagging)
```javascript
const testData = [
  {
    prompt: 'Describe this product image and provide tags',
    image: '/path/to/product.jpg',
  },
  // ... more image prompts
];
```

---

## Model Metadata Structure

When preloading models, the following metadata structure is used:

```javascript
{
  taskType: 'text-embedding',           // Task category
  equivalenceGroup: 'product-recommender', // Functional group
  outputDimensions: [512],              // Output shape
  description: 'Model description',     // Human-readable description
  useCase: 'Specific use case',         // Intended application
  backend: 'ollama',                    // Backend type
  // Optional fields:
  classes: ['class1', 'class2'],        // For classifiers
  capabilities: ['feature1', 'feature2'], // Model capabilities
}
```

This metadata enables:
- Automatic model grouping for benchmarks
- Output dimension validation
- Clear documentation of model purpose
- Historical tracking and comparison

---

## Environment Variables

```bash
# Harper URL (default: http://localhost:9926)
HARPER_URL=http://localhost:9926

# Ollama host (default: http://localhost:11434)
OLLAMA_HOST=http://localhost:11434

# Model cache size (default: 10)
MODEL_CACHE_SIZE=10
```

---

## Troubleshooting

### Harper Not Running
```
✗ Harper is not running. Please start Harper first.
  Run: npm run dev
```
**Solution:** Start Harper in a separate terminal with `npm run dev`

### No Models Found
```
✗ No models found in database
Run: node scripts/preload-models.js
```
**Solution:** Preload models first with `npm run preload-models`

### Ollama Models Not Available
```
Error: Model nomic-embed-text not found
```
**Solution:** Pull the required Ollama models:
```bash
ollama pull nomic-embed-text
ollama pull mxbai-embed-large
# etc.
```

### Benchmark Fails - Not Enough Models
```
Not enough models found. Found 1 models with taskType="text-embedding"
and equivalenceGroup="product-recommender". At least 2 models are required.
```
**Solution:** Ensure at least 2 models with matching metadata are loaded

### Output Dimensions Mismatch
```
Output dimensions do not match. Model model1 has [512] but model2 has [384]
```
**Solution:** This is expected for different model architectures. Models with different output dimensions cannot be directly compared. Update metadata or use models with matching dimensions.

---

## API Integration

All scripts interact with Harper's GraphQL API and REST endpoints:

### GraphQL Queries
```graphql
# Fetch all models
query {
  Model {
    id
    modelId
    version
    framework
    metadata
  }
}

# Delete model
mutation {
  deleteModel(id: "model-id:v1")
}

# Insert model
mutation($input: ModelInput!) {
  insertModel(values: $input) {
    id
    modelId
    version
  }
}
```

### REST Endpoints
```javascript
// Run benchmark
POST /benchmark/compare
{
  taskType: 'text-embedding',
  equivalenceGroup: 'product-recommender',
  testData: [...],
  iterations: 100
}

// Get benchmark history
GET /benchmark/history?taskType=text-embedding&equivalenceGroup=product-recommender

// Get status
GET /status
```

---

## Performance Tips

1. **Warm-up Runs**: First inference is slower due to model loading. Run warm-up iterations for accurate benchmarks.

2. **Iteration Count**:
   - Development: 10-50 iterations
   - Testing: 100-200 iterations
   - Production benchmarks: 500+ iterations

3. **Test Data Variety**: Use diverse test samples that represent real-world usage patterns.

4. **Parallel Benchmarks**: Don't run multiple benchmarks simultaneously as they compete for resources.

5. **Model Caching**: Harper caches loaded models. Monitor cache size with `MODEL_CACHE_SIZE` env var.

---

## References

- [Harper Documentation](https://docs.harperdb.io/)
- [Ollama Documentation](https://ollama.ai/docs)
- [ONNX Runtime](https://onnxruntime.ai/)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [Hugging Face Models](https://huggingface.co/models)

---

## Contributing

When adding new scripts:

1. Follow the existing naming convention
2. Include comprehensive help text and usage examples
3. Add colorized output for better UX
4. Handle errors gracefully with helpful messages
5. Update this README with documentation
6. Add corresponding npm script to package.json

---

## License

Apache-2.0 - See LICENSE file for details
