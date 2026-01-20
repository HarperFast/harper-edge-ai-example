# Profile-Based Testing and Benchmarking

Dynamic, configuration-driven testing system for validating model deployments across different backends and environments.

## Overview

The profile-based testing system enables:

- **Configuration-Driven**: Models defined in `profiles/` directory, not hardcoded
- **Environment-Aware**: Uses `.env` to detect available backends (Ollama, TensorFlow, etc.)
- **Dynamic Testing**: Tests only what's deployed and available
- **Equivalence Validation**: Ensures benchmarking groups have multiple backends
- **Zero Assumptions**: No hardcoded URLs, backends, or configurations

## Profiles

### Testing Profile (`testing`)

**Purpose**: Fast CI/CD integration tests covering all backends

**Models**:

- One model per backend type (Transformers.js, ONNX, Ollama, TensorFlow)
- Small/fast models for quick validation
- Tests each backend works end-to-end

**Use Case**: CI/CD pipelines, pre-deployment validation

### Benchmarking Profile (`benchmarking`)

**Purpose**: Performance comparison across backends

**Equivalence Groups**:

- `embeddings-384`: ONNX + Transformers.js
- `embeddings-768`: Ollama + Transformers.js

**Each group has 2+ backends for meaningful comparison**

**Use Case**: Performance analysis, backend selection decisions

### Development Profile (`development`)

Full suite with all models across all backends for comprehensive testing.

### Production Profile (`production`)

Production-ready models only (currently Transformers.js).

### Minimal Profile (`minimal`)

Single Transformers.js model for quick smoke tests.

## Quick Start

### 1. Deploy Testing Profile and Run Tests

```bash
# Deploy testing models and run integration tests
npm run test:profile:deploy

# Or separately:
npm run preload:testing
npm run test:profile:testing
```

### 2. Deploy Benchmarking Profile

```bash
# Deploy benchmarking models
npm run preload:benchmarking

# Run benchmarking tests
npm run test:profile:benchmarking

# Run actual benchmarks
npm run benchmark:all
```

### 3. Custom Profile

```bash
# Deploy custom profile
node scripts/preload-models.js --profile my-profile --clean

# Test custom profile
TEST_PROFILE=my-profile npm run test:profile
```

## Integration Tests

The integration test system (`tests/integration/profile-deployment.test.js`) automatically:

1. **Reads active profile** from `profiles/<profileName>.json`
2. **Checks .env configuration** for backend availability
3. **Queries Harper** to see what's deployed
4. **Tests each model** with real inference
5. **Validates equivalence groups** (for benchmarking profile)
6. **Reports backend coverage**

### Environment Variables

Tests respect these environment variables:

```bash
# Profile to test (default: testing)
TEST_PROFILE=benchmarking

# Harper URL (default: http://localhost:9926)
HARPER_URL=https://my-harper.cloud

# Ollama URL (default: http://localhost:11434)
OLLAMA_HOST=http://localhost:11434
```

### Test Output

```
📋 Testing profile: testing
🔗 Harper URL: http://localhost:9926
🦙 Ollama URL: http://localhost:11434

📦 Profile has 4 model(s) configured

🔍 Backend Availability:
  ✓ transformers: available
  ✓ onnx: available
  ✓ tensorflow: available
  ✗ ollama: not available

🚀 3 model(s) deployed in Harper

✓ should have Harper running
✓ should have at least one model deployed
✓ should have all expected models deployed
✓ should run inference on test-transformers-embedding:v1 (transformers)
✓ should run inference on test-onnx-embedding:v1 (onnx)
⚠️  Skipped test-ollama-embedding:v1 (ollama not available)
✓ should run inference on test-tensorflow-embedding:v1 (tensorflow)

📊 Backend Coverage:
    Available: transformers, onnx, tensorflow
    Tested: transformers, onnx, tensorflow
```

## Equivalence Groups

Equivalence groups enable fair performance comparisons across backends.

### Requirements

For benchmarking, each equivalence group must have:

- **2+ backends** (e.g., ONNX + Transformers.js)
- **Same output dimensions** (all 384-dim or all 768-dim)
- **Same task type** (all embeddings, all classification, etc.)

### Current Groups

**embeddings-384**:

- `bench-minilm-onnx` (ONNX)
- `bench-minilm-transformers` (Transformers.js)

**embeddings-768**:

- `bench-nomic-ollama` (Ollama) - requires Ollama running
- `bench-nomic-transformers` (Transformers.js)

### Validation

The test system automatically validates:

- All models in group have same output dimensions
- Group has multiple backends available
- Warns if backends are unavailable

## Adding New Models

### 1. Add to Profile Configuration

Edit `profiles/benchmarking.json`:

```json
{
	"name": "benchmarking",
	"description": "Benchmarking profile - equivalence groups for performance comparison",
	"models": [
		{
			"modelName": "my-new-model",
			"modelVersion": "v1",
			"framework": "transformers",
			"stage": "benchmarking",
			"metadata": {
				"taskType": "text-embedding",
				"equivalenceGroup": "embeddings-384",
				"outputDimensions": [384],
				"description": "My model for benchmarking",
				"backend": "transformers",
				"requiresExternal": false
			},
			"modelBlob": {
				"modelName": "Xenova/my-model",
				"taskType": "feature-extraction"
			}
		}
	]
}
```

### 2. Deploy and Test

```bash
# Deploy
npm run preload:benchmarking

# Test
npm run test:profile:benchmarking
```

### 3. Model Metadata

**Required Fields**:

- `taskType`: Type of task (text-embedding, classification, etc.)
- `equivalenceGroup`: Group name for benchmarking
- `outputDimensions`: Array of output dimensions
- `backend`: Backend type (transformers, onnx, ollama, tensorflow)

**Optional Fields**:

- `requiresExternal`: true if requires external service (Ollama)
- `description`: Human-readable description

## Backend Configuration

### Ollama

Requires Ollama service running:

```bash
# .env
OLLAMA_HOST=http://localhost:11434

# Start Ollama
ollama serve

# Pull required models
ollama pull nomic-embed-text
```

### TensorFlow.js

No external configuration needed (uses npm package).

### ONNX

Requires model files in `models/test/`:

```bash
# Local mode (direct upload)
models/test/all-MiniLM-L6-v2.onnx

# Remote mode (FetchModel worker)
node scripts/preload-models.js --remote --profile benchmarking
```

### Transformers.js

No external configuration needed (downloads from HuggingFace on first use).

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Profile Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Start Harper
        run: |
          npm run dev &
          sleep 10

      - name: Deploy and test profile
        run: npm run test:profile:deploy
        env:
          TEST_PROFILE: testing
          HARPER_URL: http://localhost:9926
```

### GitLab CI Example

```yaml
test:profile:
  script:
    - npm install
    - npm run dev &
    - sleep 10
    - npm run test:profile:deploy
  variables:
    TEST_PROFILE: testing
    HARPER_URL: http://localhost:9926
```

## Advanced Usage

### Custom Test Runner

```javascript
import { spawn } from 'child_process';

const result = await new Promise((resolve, reject) => {
	const test = spawn('node', ['--test', 'tests/integration/profile-deployment.test.js'], {
		env: {
			...process.env,
			TEST_PROFILE: 'benchmarking',
			HARPER_URL: 'http://my-harper:9926',
		},
	});

	test.on('close', (code) => {
		if (code === 0) resolve();
		else reject(new Error(`Tests failed with code ${code}`));
	});
});
```

### Programmatic Profile Loading

```javascript
import { readFileSync } from 'fs';

const profileName = 'testing';
const config = JSON.parse(readFileSync(`profiles/${profileName}.json`, 'utf-8'));

console.log(`Testing ${config.models.length} models`);
```

## Troubleshooting

### Tests Skip Ollama Models

**Issue**: Ollama models skipped with "backend not available"

**Solution**:

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Start if not running
ollama serve

# Verify in .env
echo $OLLAMA_HOST
```

### Model Not Deployed

**Issue**: "Model xxx not deployed in Harper"

**Solution**:

```bash
# Deploy the profile
npm run preload:testing

# Check what's deployed
curl http://localhost:9926/Model/
```

### Dimension Mismatch

**Issue**: "Embedding dimensions should match metadata"

**Solution**: Check model configuration in `profiles/<profileName>.json`:

- `outputDimensions` should match actual model output
- All models in equivalence group must have same dimensions

## Best Practices

1. **Always use profiles** instead of hardcoded models
2. **Set `requiresExternal: true`** for models needing external services
3. **Use equivalence groups** for benchmarking comparisons
4. **Test before deploying** to production
5. **Use `.env`** for environment-specific configuration
6. **Run tests in CI/CD** to catch regressions early

## Next Steps

- Add more equivalence groups for comprehensive benchmarking
- Add image/vision models when available
- Create profile for production deployment
- Add performance regression tests
- Integrate with monitoring/alerting systems
