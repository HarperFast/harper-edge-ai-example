# Model Fetch System

Async model downloading system for Harper Edge AI. Fetches models from multiple sources without manual download/upload.

## Features

- **Multi-source support**: HuggingFace Hub, HTTP URLs, local filesystem
- **Async job queue**: Background worker with retry logic (3 attempts, exponential backoff)
- **Rate limiting**: Respects 429 responses with backoff
- **Transformers.js**: Multi-file support with variant selection (default/quantized)
- **Progress tracking**: Real-time progress updates via database
- **Token authentication**: Optional shared token for API access control
- **Security**: Filesystem restricted to `models/` directory, path traversal protection
- **Webhooks**: Optional completion/failure notifications

## Quick Start

### CLI (Recommended)

The `harper-ai` CLI provides the easiest way to interact with the Model Fetch System:

```bash
# Inspect a model before downloading
harper-ai model inspect filesystem test-fixtures/test-model.onnx

# Fetch a model
harper-ai model fetch filesystem test-fixtures/test-model.onnx \
  --name my-model --version v1

# Watch job progress (live updates)
harper-ai job watch <jobId>

# List all jobs
harper-ai job list
```

For full CLI documentation, run `harper-ai --help`.

### REST API

You can also use the REST API directly:

#### 1. Inspect a Model

Preview model information without downloading:

```bash
# Using REST API (with optional authentication)
curl "http://localhost:3000/InspectModel?source=filesystem&sourceReference=test-fixtures/test-model.onnx" \
  -H "Authorization: Bearer your-secret-token"

# Response:
{
  "source": "filesystem",
  "sourceReference": "test-fixtures/test-model.onnx",
  "framework": "onnx",
  "variants": [{
    "name": "default",
    "files": ["test-fixtures/test-model.onnx"],
    "totalSize": 1234,
    "precision": "unknown"
  }],
  "inferredMetadata": {
    "description": "Model imported from models/test-fixtures/test-model.onnx",
    "tags": ["local", "imported"]
  },
  "suggestedModelName": "test-model"
}
```

### 2. Fetch a Model

Create an async job to download and store the model:

```bash
curl -X POST http://localhost:3000/FetchModel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "source": "filesystem",
    "sourceReference": "test-fixtures/test-model.onnx",
    "modelName": "my-model",
    "modelVersion": "v1",
    "framework": "onnx",
    "stage": "development",
    "metadata": {
      "taskType": "text-embedding",
      "outputDimensions": [384]
    }
  }'

# Response:
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Job created successfully. Use GET /ModelFetchJob?id={jobId} to track progress.",
  "modelId": "my-model:v1"
}
```

### 3. Track Job Progress

```bash
curl "http://localhost:3000/ModelFetchJob?id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your-secret-token"

# Response:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "downloading",
  "progress": 45,
  "downloadedBytes": 5000000,
  "totalBytes": 11000000,
  "modelName": "my-model",
  "modelVersion": "v1"
}
```

### 4. List Jobs

```bash
# All jobs
curl "http://localhost:3000/ModelFetchJob" \
  -H "Authorization: Bearer your-secret-token"

# Filter by status
curl "http://localhost:3000/ModelFetchJob?status=completed" \
  -H "Authorization: Bearer your-secret-token"

# Filter by model name
curl "http://localhost:3000/ModelFetchJob?modelName=my-model" \
  -H "Authorization: Bearer your-secret-token"
```

### 5. Retry Failed Job

```bash
curl -X POST http://localhost:3000/ModelFetchJob \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "action": "retry"
  }'
```

## Authentication

The Model Fetch API supports optional token-based authentication using a shared secret.

### Setup

Set the `MODEL_FETCH_TOKEN` environment variable to enable authentication:

```bash
# In .env file
MODEL_FETCH_TOKEN=your-secret-token-here

# Or export directly
export MODEL_FETCH_TOKEN="your-secret-token-here"
```

**Note**: If `MODEL_FETCH_TOKEN` is not set, authentication is disabled and all requests are allowed.

### Usage

Include the token in the `Authorization` header of your requests:

```bash
# Bearer token format (recommended)
curl "http://localhost:3000/InspectModel?..." \
  -H "Authorization: Bearer your-secret-token-here"

# Plain token format (also supported)
curl "http://localhost:3000/InspectModel?..." \
  -H "Authorization: your-secret-token-here"
```

### Protected Endpoints

The following endpoints require authentication when `MODEL_FETCH_TOKEN` is set:

- `GET /InspectModel` - Inspect models before downloading
- `POST /FetchModel` - Create fetch jobs
- `GET /ModelFetchJob` - View job status and history
- `POST /ModelFetchJob` - Retry failed jobs

### Unauthorized Response

If authentication fails, the API returns a 401-like error:

```json
{
  "error": "Unauthorized: MODEL_FETCH_TOKEN required",
  "code": "UNAUTHORIZED"
}
```

or

```json
{
  "error": "Unauthorized: Invalid MODEL_FETCH_TOKEN",
  "code": "UNAUTHORIZED"
}
```

## Sources

### Filesystem

Load models from the `models/` directory:

```json
{
  "source": "filesystem",
  "sourceReference": "test-fixtures/test-model.onnx"
}
```

**Security**: Path traversal blocked, symlinks rejected, restricted to `models/` directory.

### HTTP URLs

Download from HTTP/HTTPS URLs:

```json
{
  "source": "url",
  "sourceReference": "https://example.com/models/model.onnx"
}
```

**Supported**: HTTP and HTTPS only (file://, ftp:// rejected)

### HuggingFace Hub

Download Transformers.js models from HuggingFace:

```json
{
  "source": "huggingface",
  "sourceReference": "Xenova/all-MiniLM-L6-v2",
  "variant": "quantized"
}
```

**Variants**:
- `default`: Full precision (fp32)
- `quantized`: Quantized (int8)

**Files downloaded**: `model.onnx` (or `model_quantized.onnx`), `tokenizer.json`, `tokenizer_config.json`, `config.json`

## Job Status Flow

```
queued → downloading → processing → completed
                ↓
              failed (with retry logic)
```

**Status values**:
- `queued`: Waiting for worker
- `downloading`: Actively downloading
- `processing`: Post-download processing
- `completed`: Successfully stored in Model table
- `failed`: Permanently failed (after retries or non-retryable error)

## Retry Logic

**Automatic retries**: 3 attempts with exponential backoff (5s, 10s, 20s)

**Retryable errors**:
- `NetworkError` (timeouts, connection failures, 500-599 errors)
- `RateLimitError` (429 responses)
- `StorageError` (temporary storage issues)

**Non-retryable errors**:
- `SecurityError` (path traversal, invalid URLs)
- `ModelNotFoundError` (404 errors)
- `UnsupportedFrameworkError` (unsupported model type)
- `FileTooLargeError` (exceeds max size)

## Configuration

Environment variables:

```bash
# Authentication
MODEL_FETCH_TOKEN=<your-secret-token>  # Optional shared token for API access control

# Worker settings
MODEL_FETCH_WORKER_ENABLED=true    # Enable/disable worker (default: true)
MODEL_FETCH_MAX_CONCURRENT=3       # Max concurrent jobs (default: 3)
MODEL_FETCH_POLL_INTERVAL=5000     # Poll interval in ms (default: 5000)

# Limits
MODEL_FETCH_MAX_FILE_SIZE=5368709120  # Max file size in bytes (default: 5GB)
MODEL_FETCH_MAX_RETRIES=3             # Max retry attempts (default: 3)
MODEL_FETCH_INITIAL_RETRY_DELAY=5000  # Initial retry delay in ms (default: 5000)
```

## Architecture

### Components

1. **Source Adapters** (`src/core/fetchers/`)
   - `BaseSourceAdapter.js` - Abstract interface
   - `LocalFilesystemAdapter.js` - Local file loading
   - `HttpUrlAdapter.js` - HTTP/HTTPS downloads
   - `HuggingFaceAdapter.js` - HuggingFace Hub integration

2. **ModelFetchWorker** (`src/core/ModelFetchWorker.js`)
   - Background polling worker (5s interval)
   - Concurrent job limit enforcement
   - Retry logic with exponential backoff
   - Crash recovery (resets stuck jobs on startup)

3. **API Resources** (`src/resources.js`)
   - `InspectModel` - Preview models without downloading
   - `FetchModel` - Create fetch jobs
   - `ModelFetchJobResource` - Track and manage jobs

4. **Database** (`schema.graphql`)
   - `ModelFetchJob` table - Job queue with status tracking
   - `Model` table - Stored models with metadata

### Flow Diagram

```
User → POST /FetchModel
         ↓
    Create ModelFetchJob (status: queued)
         ↓
    ModelFetchWorker polls queue (every 5s)
         ↓
    Download from source (with progress updates)
         ↓
    Store in Model table
         ↓
    Update job (status: completed)
         ↓
    Optional webhook notification
```

## Error Handling

All errors include:
- `error`: Human-readable message
- `code`: Machine-readable error code
- `retryable`: Boolean indicating if retry is possible

Example error response:

```json
{
  "error": "Model not found: File not found in models directory: nonexistent.onnx",
  "code": "MODEL_NOT_FOUND"
}
```

## Testing

### Unit Tests

```bash
# Run all unit tests
npm test

# Run specific adapter tests
npm test tests/unit/fetchers/LocalFilesystemAdapter.test.js
npm test tests/unit/fetchers/HttpUrlAdapter.test.js
npm test tests/unit/fetchers/HuggingFaceAdapter.test.js

# Run worker tests
npm test tests/unit/ModelFetchWorker.test.js
```

### Integration Tests

```bash
# End-to-end workflow test
npm test tests/integration/model-fetch-system.test.js
```

**Test Coverage**: 52 unit tests + 2 integration tests, all passing

## Examples

### Example 1: Fetch Local Model

```javascript
// Optional authentication token (set MODEL_FETCH_TOKEN in environment)
const TOKEN = process.env.MODEL_FETCH_TOKEN;
const headers = TOKEN ? {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`
} : { 'Content-Type': 'application/json' };

// 1. Inspect first
const inspectResponse = await fetch(
  'http://localhost:3000/InspectModel?source=filesystem&sourceReference=embeddings/use-model.onnx',
  TOKEN ? { headers: { 'Authorization': `Bearer ${TOKEN}` } } : {}
);
const info = await inspectResponse.json();
console.log('Framework:', info.framework);
console.log('Size:', info.variants[0].totalSize);

// 2. Fetch model
const fetchResponse = await fetch('http://localhost:3000/FetchModel', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: 'filesystem',
    sourceReference: 'embeddings/use-model.onnx',
    modelName: 'universal-sentence-encoder',
    modelVersion: 'v1',
    metadata: {
      taskType: 'text-embedding',
      outputDimensions: [512]
    }
  })
});
const job = await fetchResponse.json();
console.log('Job ID:', job.jobId);

// 3. Poll for completion
const pollJob = async (jobId) => {
  while (true) {
    const response = await fetch(
      `http://localhost:3000/ModelFetchJob?id=${jobId}`,
      TOKEN ? { headers: { 'Authorization': `Bearer ${TOKEN}` } } : {}
    );
    const job = await response.json();

    console.log(`Status: ${job.status}, Progress: ${job.progress}%`);

    if (job.status === 'completed') {
      console.log('Model ready:', job.resultModelId);
      break;
    }
    if (job.status === 'failed') {
      console.error('Job failed:', job.lastError);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

await pollJob(job.jobId);
```

### Example 2: Fetch HuggingFace Model

```javascript
// Optional authentication
const TOKEN = process.env.MODEL_FETCH_TOKEN;
const headers = TOKEN ? {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`
} : { 'Content-Type': 'application/json' };

const response = await fetch('http://localhost:3000/FetchModel', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: 'huggingface',
    sourceReference: 'Xenova/all-MiniLM-L6-v2',
    variant: 'quantized',  // Use quantized version (smaller, faster)
    modelName: 'minilm-l6',
    modelVersion: 'v1',
    webhookUrl: 'https://my-app.com/model-ready'  // Optional webhook
  })
});

const job = await response.json();
console.log('Job created:', job.jobId);
```

### Example 3: Fetch from HTTP URL

```javascript
// Optional authentication
const TOKEN = process.env.MODEL_FETCH_TOKEN;
const headers = TOKEN ? {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`
} : { 'Content-Type': 'application/json' };

const response = await fetch('http://localhost:3000/FetchModel', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: 'url',
    sourceReference: 'https://cdn.example.com/models/sentiment-v2.onnx',
    modelName: 'sentiment-analyzer',
    modelVersion: 'v2',
    framework: 'onnx',  // Specify framework explicitly
    metadata: {
      taskType: 'text-classification',
      outputDimensions: [3]  // 3 classes: positive, negative, neutral
    }
  })
});
```

## CLI Commands

The `harper-ai` CLI provides a user-friendly interface for all Model Fetch operations.

### Installation

The CLI is automatically available after `npm install`:

```bash
# Global access (after npm install)
harper-ai --help

# Or run directly
node scripts/cli/harper-ai.js --help
```

### Model Commands

#### inspect

Preview a model before downloading:

```bash
harper-ai model inspect <source> <sourceReference> [--variant <variant>]

# Examples
harper-ai model inspect filesystem test-fixtures/test-model.onnx
harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2 --variant quantized
harper-ai model inspect url https://example.com/model.onnx
```

Output includes framework, variants, sizes, and inferred metadata.

#### fetch

Create an async fetch job:

```bash
harper-ai model fetch <source> <sourceReference> --name <name> [options]

Options:
  --name <name>         Model name (required)
  --version <version>   Model version (default: v1)
  --variant <variant>   Variant (for HuggingFace)
  --framework <framework>  Override framework detection
  --stage <stage>       Stage (development|staging|production)
  --webhook <url>       Webhook for notifications

# Examples
harper-ai model fetch filesystem test-fixtures/test-model.onnx --name test-model
harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
  --name minilm --variant quantized --stage production
harper-ai model fetch url https://cdn.example.com/model.onnx \
  --name remote-model --framework onnx
```

#### list

List models in database:

```bash
harper-ai model list [--stage <stage>] [--framework <framework>]

# Examples
harper-ai model list
harper-ai model list --stage production
harper-ai model list --framework onnx
```

### Job Commands

#### list

List fetch jobs with filters:

```bash
harper-ai job list [--status <status>] [--modelName <name>]

# Examples
harper-ai job list
harper-ai job list --status downloading
harper-ai job list --status completed
harper-ai job list --modelName my-model
```

#### get

Get detailed job information:

```bash
harper-ai job get <jobId>

# Example
harper-ai job get 550e8400-e29b-41d4-a716-446655440000
```

Shows full job details including progress, errors, retry info, and suggested next actions.

#### watch

Watch job progress with live updates:

```bash
harper-ai job watch <jobId>

# Example
harper-ai job watch 550e8400-e29b-41d4-a716-446655440000
```

Displays real-time progress bar, status updates, and download progress. Press Ctrl+C to stop.

Features:
- Live progress bar with percentage
- Download speed tracking (bytes downloaded / total)
- Status indicators with emoji icons
- Automatic completion detection

#### retry

Retry a failed job:

```bash
harper-ai job retry <jobId>

# Example
harper-ai job retry 550e8400-e29b-41d4-a716-446655440000
```

### Global Options

All commands support:

```bash
--url <url>       Harper instance URL (default: http://localhost:9926)
--token <token>   Authentication token (or set MODEL_FETCH_TOKEN env var)
--help            Show help for command
```

### Configuration

The CLI can be configured via command-line flags, environment variables, or `.env` file:

#### Harper Instance URL

```bash
# Default (localhost)
harper-ai model list

# Via --url flag
harper-ai model list --url https://my-harper.cloud.harperdb.io

# Via environment variable
export HARPER_URL=https://my-harper.cloud.harperdb.io
harper-ai model list

# Via .env file
echo "HARPER_URL=https://my-harper.cloud.harperdb.io" >> .env
harper-ai model list
```

**Priority:** CLI flag > Environment variable > .env file > default

**Supported environment variables:**
- `HARPER_URL` - Harper instance URL
- `CLI_TARGET_URL` - Alternative name for Harper URL

#### Authentication

```bash
# Via --token flag
harper-ai model inspect filesystem test.onnx --token your-secret-token

# Via environment variable
export MODEL_FETCH_TOKEN="your-secret-token"
harper-ai model inspect filesystem test.onnx

# Via .env file
echo "MODEL_FETCH_TOKEN=your-secret-token" >> .env
harper-ai model inspect filesystem test.onnx
```

#### Complete Example with Remote Instance

```bash
# Set configuration
export HARPER_URL=https://production.harperdb.io
export MODEL_FETCH_TOKEN=prod-secret-token-123

# Fetch a model on remote instance
harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
  --name minilm-prod --variant quantized --stage production

# Watch job progress
harper-ai job watch <jobId>

# List production models
harper-ai model list --stage production
```

## Troubleshooting

### Worker not starting

Check environment variable:
```bash
MODEL_FETCH_WORKER_ENABLED=true
```

Check logs for:
```
[resources] ModelFetchWorker started
[ModelFetchWorker] Started (polling every 5000ms, max 3 concurrent jobs)
```

### Job stuck in "queued"

- Check if worker is running
- Check concurrent job limit (max 3 by default)
- Check for rate limiting: `GET /ModelFetchJob?id={jobId}` and look at job details

### Job failed with "MODEL_NOT_FOUND"

- For filesystem: Verify file exists in `models/` directory
- For HTTP: Check URL is accessible
- For HuggingFace: Verify model ID is correct and model has ONNX files

### Security errors

- Filesystem: Ensure path is relative and within `models/` directory
- No `../` or absolute paths allowed
- No symlinks allowed

## Roadmap

Future enhancements:

- [ ] Authentication for private HuggingFace models
- [ ] Container registries support (Docker, GitHub Packages)
- [ ] S3/cloud storage support
- [ ] CLI tool for model management
- [ ] Real-time progress via WebSockets
- [ ] Job scheduling (fetch at specific time)
- [ ] Model version auto-updates

## Implementation Details

Built with **Test-Driven Development (TDD)**:
- ✅ 52 unit tests (100% pass rate)
- ✅ 2 integration tests (100% pass rate)
- ✅ Tests written before implementation
- ✅ All tests verified to fail before passing

**Test Coverage**:
- LocalFilesystemAdapter: 22 tests
- RateLimiter: 10 tests
- ModelFetchWorker: 16 tests
- HuggingFaceAdapter: 4 tests
- Integration: 2 end-to-end tests
