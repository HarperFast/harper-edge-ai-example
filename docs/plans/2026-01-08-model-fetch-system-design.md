# Model Fetch System - Complete Design

**Status:** Design Phase - Ready for Implementation
**Created:** January 8, 2026
**Last Updated:** January 8, 2026

---

## Executive Summary

This document describes the design of the Model Fetch System - a production-grade feature that enables users to fetch ML models from external sources without manual download/upload cycles. The system provides async job management, automatic metadata inference, multi-source support, and comprehensive CLI tooling.

**Problem Statement:** Currently, users must manually download models to their local machine, then upload them to Harper. This is inefficient for large models and slows development workflows.

**Solution:** Enable Harper to fetch models directly from sources (HuggingFace Hub, HTTP URLs, local filesystem) with automatic metadata inference, variant selection, and async job tracking.

**Key Benefits:**
- Eliminates manual download/upload steps
- Supports large models (up to 5GB) with progress tracking
- Auto-retry with exponential backoff for reliability
- Preview model variants before downloading
- Unified CLI for all model operations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Client API / CLI                                        │
│  POST /InspectModel → Preview variants                  │
│  POST /FetchModel → { jobId, status: "queued" }         │
│  GET /ModelFetchJob/{id} → { status, progress }         │
│  npx harper-ai model inspect|fetch|test                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│  ModelFetchJob Table (Harper)                           │
│  - jobId, source, status, progress, metadata            │
│  - retryCount, error, createdAt, completedAt            │
│  - webhookUrl (optional)                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│  ModelFetchWorker (Background Process)                  │
│  - Polls job queue every 5s                             │
│  - Enforces global concurrent limit (3 downloads)       │
│  - Handles retries with exponential backoff             │
│  - Respects 429 rate limits                             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Source Adapters (Pluggable)                            │
│  - HuggingFaceAdapter (with Transformers.js support)    │
│  - HttpUrlAdapter                                       │
│  - LocalFilesystemAdapter (models/ directory only)      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Model Table (Existing)                                 │
│  - Stores downloaded model with inferred metadata       │
└─────────────────────────────────────────────────────────┘
```

### Key Components

1. **InspectModel Resource** - Preview model variants and metadata before fetching
2. **FetchModel Resource** - REST API endpoint for creating fetch jobs
3. **ModelFetchJob Table** - Persistent job queue with status tracking
4. **ModelFetchWorker** - Background worker that processes jobs
5. **Source Adapters** - Pluggable adapters for different sources (HF, URL, filesystem)
6. **MetadataInferrer** - Extracts metadata from model sources
7. **RateLimiter** - Enforces concurrent limits and handles 429 backoff
8. **harper-ai CLI** - Unified command-line tool for model operations

---

## Data Model

### ModelFetchJob Table Schema

```javascript
{
  id: "job-uuid",                    // Primary key
  jobId: "job-uuid",                 // Same as id, for consistency

  // Source information
  source: "huggingface",             // huggingface|url|filesystem
  sourceReference: "Xenova/all-MiniLM-L6-v2",
  variant: "quantized",              // For Transformers.js: default|quantized

  // Target model information
  modelName: "all-minilm-l6-v2",    // User-specified or inferred
  modelVersion: "v1",                // User-specified or auto-increment
  framework: "transformers",         // onnx|tensorflow|transformers|ollama
  stage: "development",              // development|staging|production

  // Status tracking
  status: "queued",                  // queued|downloading|processing|completed|failed
  progress: 0,                       // 0-100 percentage
  downloadedBytes: 0,
  totalBytes: 0,

  // Retry logic
  retryCount: 0,
  maxRetries: 3,
  lastError: null,                   // Error message if failed

  // Metadata
  inferredMetadata: {},              // Auto-detected metadata
  userMetadata: {},                  // User overrides

  // Webhook
  webhookUrl: null,                  // Optional callback URL

  // Timestamps
  createdAt: 1234567890,
  startedAt: null,
  completedAt: null,

  // Result
  resultModelId: null                // Reference to Model table once complete
}
```

### Job Status Lifecycle

```
queued → downloading → processing → completed
           ↓              ↓
         failed ←────────┘
           ↓ (auto-retry if retries remain)
         queued
```

### Model Metadata Extension

When models are fetched, add source tracking to metadata:

```javascript
{
  // ... existing Model fields ...
  metadata: {
    taskType: "text-embedding",
    equivalenceGroup: "minilm-embeddings",
    outputDimensions: [384],
    tags: ["semantic-search"],

    // NEW: Track fetch source for idempotency
    fetchSource: {
      type: "huggingface",
      reference: "Xenova/all-MiniLM-L6-v2",
      variant: "quantized",
      fetchedAt: 1234567890
    }
  }
}
```

---

## API Design

### 1. Inspect Model (Preview)

**Endpoint:** `GET /InspectModel?source={source}&sourceReference={ref}`

**Example Request:**
```bash
GET /InspectModel?source=huggingface&sourceReference=Xenova/all-MiniLM-L6-v2
```

**Response (200 OK):**
```javascript
{
  modelId: "Xenova/all-MiniLM-L6-v2",
  framework: "transformers",
  variants: [
    {
      name: "default",
      files: ["onnx/model.onnx", "tokenizer.json", "config.json"],
      totalSize: 22800000,
      precision: "fp32"
    },
    {
      name: "quantized",
      files: ["onnx/model_quantized.onnx", "tokenizer.json", "config.json"],
      totalSize: 6500000,
      precision: "int8"
    }
  ],
  inferredMetadata: {
    taskType: "text-embedding",
    framework: "transformers",
    outputDimensions: [384],
    description: "Sentence transformer model...",
    tags: ["sentence-similarity", "transformers"]
  },
  suggestedModelName: "all-minilm-l6-v2"
}
```

**Error Response (400 Bad Request):**
```javascript
{
  error: "Model not found on HuggingFace Hub",
  source: "huggingface",
  reference: "invalid/model-id"
}
```

---

### 2. Create Fetch Job

**Endpoint:** `POST /FetchModel`

**Request Body:**
```javascript
{
  // Source (required)
  source: "huggingface",
  sourceReference: "Xenova/all-MiniLM-L6-v2",
  variant: "quantized",                                     // For Transformers.js models

  // Target model info (optional, will be inferred if not provided)
  modelName: "all-minilm-l6-v2",
  modelVersion: "v1",
  framework: "transformers",                                // Optional (auto-detected)
  stage: "development",                                     // Optional (default: development)

  // Metadata overrides (optional)
  metadata: {
    taskType: "text-embedding",
    equivalenceGroup: "minilm-embeddings",
    outputDimensions: [384],
    tags: ["semantic-search"]
  },

  // Webhook (optional)
  webhookUrl: "https://myapp.com/webhook/model-ready",

  // Advanced options (optional)
  maxRetries: 3                                            // Optional (default: 3)
}
```

**Response (202 Accepted):**
```javascript
{
  jobId: "job-abc-123",
  status: "queued",
  message: "Model fetch job created successfully"
}
```

**Response (200 OK - Model Already Exists, Same Source):**
```javascript
{
  jobId: null,
  status: "completed",
  resultModelId: "all-minilm-l6-v2:v1",
  message: "Model already exists from same source"
}
```

**Error Response (400 Bad Request - Duplicate Name, Different Source):**
```javascript
{
  error: "Model 'all-minilm-l6-v2:v1' already exists from a different source. Please use a different modelName or modelVersion.",
  existingModelId: "all-minilm-l6-v2:v1",
  existingSource: {
    type: "url",
    reference: "https://example.com/model.onnx"
  }
}
```

**Error Response (400 Bad Request - Unsupported Framework):**
```javascript
{
  error: "Unsupported framework: pytorch. Supported: onnx, tensorflow, transformers, ollama",
  detectedFramework: "pytorch"
}
```

---

### 3. Get Job Status

**Endpoint:** `GET /ModelFetchJob/{jobId}`

**Response (200 OK - Downloading):**
```javascript
{
  jobId: "job-abc-123",
  status: "downloading",
  progress: 45,
  downloadedBytes: 45000000,
  totalBytes: 100000000,
  source: "huggingface",
  sourceReference: "Xenova/all-MiniLM-L6-v2",
  variant: "quantized",
  modelName: "all-minilm-l6-v2",
  modelVersion: "v1",
  createdAt: 1234567890,
  startedAt: 1234567895,
  inferredMetadata: {
    taskType: "text-embedding",
    framework: "transformers",
    outputDimensions: [384]
  }
}
```

**Response (200 OK - Completed):**
```javascript
{
  jobId: "job-abc-123",
  status: "completed",
  progress: 100,
  completedAt: 1234567990,
  resultModelId: "all-minilm-l6-v2:v1",
  message: "Model ready for inference"
}
```

**Response (200 OK - Failed):**
```javascript
{
  jobId: "job-abc-123",
  status: "failed",
  retryCount: 3,
  lastError: "HTTP 404: Model not found on HuggingFace Hub",
  errorCode: "MODEL_NOT_FOUND",
  retryable: false,
  createdAt: 1234567890,
  completedAt: 1234567990
}
```

---

### 4. Retry Failed Job

**Endpoint:** `POST /ModelFetchJob/{jobId}/retry`

**Response (200 OK):**
```javascript
{
  jobId: "job-abc-123",
  status: "queued",
  message: "Job requeued for retry",
  retryCount: 0
}
```

**Error Response (400 Bad Request):**
```javascript
{
  error: "Cannot retry job with status: completed"
}
```

---

### 5. List Jobs

**Endpoint:** `GET /ModelFetchJob?status={status}&limit={limit}&offset={offset}`

**Query Parameters:**
- `status` - Filter by status (queued|downloading|processing|completed|failed)
- `limit` - Max results (default: 50)
- `offset` - Pagination offset (default: 0)

**Response (200 OK):**
```javascript
{
  count: 10,
  total: 45,
  jobs: [
    {
      jobId: "job-abc-123",
      source: "huggingface",
      sourceReference: "Xenova/all-MiniLM-L6-v2",
      modelName: "all-minilm-l6-v2",
      status: "completed",
      createdAt: 1234567890,
      completedAt: 1234567990
    },
    // ... more jobs
  ]
}
```

---

## Implementation Details

### ModelFetchWorker

The background worker processes jobs asynchronously:

```javascript
class ModelFetchWorker {
  constructor() {
    this.maxConcurrent = 3;           // Global limit
    this.activeJobs = new Map();      // Track running downloads
    this.pollInterval = 5000;         // Poll every 5s
    this.rateLimiter = new RateLimiter();
    this.maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB
  }

  async start() {
    // On startup, reset any jobs stuck in 'downloading' status
    await this.recoverCrashedJobs();

    // Start polling loop
    setInterval(() => this.processQueue(), this.pollInterval);
  }

  async recoverCrashedJobs() {
    // Find jobs with status='downloading' (worker crashed mid-download)
    const stuckJobs = await tables.ModelFetchJob
      .search({ status: 'downloading' });

    for (const job of stuckJobs) {
      await tables.ModelFetchJob.put({
        ...job,
        status: 'queued',
        lastError: 'Worker restarted, job requeued'
      });
    }
  }

  async processQueue() {
    // Check if we have capacity
    if (this.activeJobs.size >= this.maxConcurrent) return;

    // Fetch queued jobs (oldest first, respecting retry delays)
    const availableSlots = this.maxConcurrent - this.activeJobs.size;
    const jobs = await this.fetchQueuedJobs(availableSlots);

    // Process each job asynchronously
    for (const job of jobs) {
      this.processJob(job); // Fire and forget
    }
  }

  async processJob(job) {
    try {
      this.activeJobs.set(job.jobId, job);

      // Update status to downloading
      await this.updateJobStatus(job.jobId, 'downloading', {
        startedAt: Date.now()
      });

      // 1. Get appropriate adapter
      const adapter = this.getAdapter(job.source);

      // 2. Validate framework before downloading (fail fast)
      const detectedFramework = await adapter.detectFramework(
        job.sourceReference,
        job.variant
      );

      if (!this.isSupportedFramework(detectedFramework)) {
        throw new UnsupportedFrameworkError(detectedFramework);
      }

      // 3. Wait if source is rate limited
      await this.rateLimiter.waitIfNeeded(job.source);

      // 4. Download with progress tracking
      const modelBlob = await adapter.download(
        job.sourceReference,
        job.variant,
        (downloadedBytes, totalBytes) => {
          this.updateProgress(job.jobId, downloadedBytes, totalBytes);
        }
      );

      // 5. Validate file size
      if (modelBlob.length > this.maxFileSize) {
        throw new Error(`Model exceeds max file size: ${this.maxFileSize} bytes`);
      }

      // 6. Infer metadata
      const inferredMetadata = await adapter.inferMetadata(
        job.sourceReference,
        job.variant
      );

      // 7. Merge with user overrides
      const finalMetadata = {
        ...inferredMetadata,
        ...job.userMetadata,
        fetchSource: {
          type: job.source,
          reference: job.sourceReference,
          variant: job.variant,
          fetchedAt: Date.now()
        }
      };

      // Update status to processing
      await this.updateJobStatus(job.jobId, 'processing');

      // 8. Store in Model table
      const modelId = await this.storeModel(job, modelBlob, finalMetadata);

      // 9. Mark job as completed
      await this.completeJob(job.jobId, modelId);

      // 10. Call webhook if provided
      if (job.webhookUrl) {
        await this.callWebhook(job.webhookUrl, {
          jobId: job.jobId,
          status: 'completed',
          modelId
        });
      }

    } catch (error) {
      await this.handleFailure(job, error);
    } finally {
      this.activeJobs.delete(job.jobId);
    }
  }

  async handleFailure(job, error) {
    // Check for rate limiting
    if (error.statusCode === 429) {
      this.rateLimiter.handle429Response(job.source, error.response);
    }

    // Determine if error is retryable
    const retryable = this.isRetryableError(error);

    // Check if we should retry
    if (retryable && job.retryCount < job.maxRetries) {
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, job.retryCount) * 1000;

      await tables.ModelFetchJob.put({
        ...job,
        status: 'queued',
        retryCount: job.retryCount + 1,
        lastError: error.message,
        // Schedule retry by updating createdAt
        createdAt: Date.now() + delayMs
      });
    } else {
      // Max retries exceeded or non-retryable error
      await tables.ModelFetchJob.put({
        ...job,
        status: 'failed',
        lastError: error.message,
        errorCode: error.code || 'UNKNOWN_ERROR',
        retryable,
        completedAt: Date.now()
      });

      // Call webhook with failure
      if (job.webhookUrl) {
        await this.callWebhook(job.webhookUrl, {
          jobId: job.jobId,
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  isRetryableError(error) {
    const retryableCodes = [
      'NETWORK_TIMEOUT',
      'CONNECTION_FAILED',
      'RATE_LIMITED',
      'SOURCE_SERVER_ERROR',
      'STORAGE_FAILED'
    ];
    return retryableCodes.includes(error.code);
  }

  isSupportedFramework(framework) {
    return ['onnx', 'tensorflow', 'transformers', 'ollama'].includes(framework);
  }
}
```

---

### Rate Limiter

Handles concurrent limits and 429 backoff:

```javascript
class RateLimiter {
  constructor() {
    this.backoffMap = new Map(); // source -> backoff expiry time
  }

  async waitIfNeeded(source) {
    const backoffUntil = this.backoffMap.get(source);
    if (backoffUntil && Date.now() < backoffUntil) {
      const waitMs = backoffUntil - Date.now();
      console.log(`Rate limited for ${source}, waiting ${waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  handle429Response(source, response) {
    // Parse Retry-After header if available
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter ? parseInt(retryAfter) : 60;

    const backoffUntil = Date.now() + (seconds * 1000);
    this.backoffMap.set(source, backoffUntil);

    console.log(`Rate limit hit for ${source}, backing off for ${seconds}s`);
  }
}
```

---

### Source Adapters

#### Base Adapter Interface

```javascript
class BaseSourceAdapter {
  /**
   * Detect the framework of a model without downloading
   * @param {string} sourceReference - Source identifier
   * @param {string} variant - Optional variant (for Transformers.js)
   * @returns {Promise<string>} - 'onnx'|'tensorflow'|'transformers'|'ollama'|'unsupported'
   */
  async detectFramework(sourceReference, variant = null) {
    throw new Error('Not implemented');
  }

  /**
   * Download model binary
   * @param {string} sourceReference - Source identifier
   * @param {string} variant - Optional variant (for Transformers.js)
   * @param {Function} onProgress - Progress callback (downloadedBytes, totalBytes)
   * @returns {Promise<Buffer>} - Model blob
   */
  async download(sourceReference, variant, onProgress) {
    throw new Error('Not implemented');
  }

  /**
   * Infer metadata from source
   * @param {string} sourceReference - Source identifier
   * @param {string} variant - Optional variant (for Transformers.js)
   * @returns {Promise<Object>} - { taskType, outputDimensions, description, tags }
   */
  async inferMetadata(sourceReference, variant = null) {
    throw new Error('Not implemented');
  }

  /**
   * List available variants (for preview)
   * @param {string} sourceReference - Source identifier
   * @returns {Promise<Array>} - Array of variant objects
   */
  async listVariants(sourceReference) {
    throw new Error('Not implemented');
  }
}
```

---

#### HuggingFaceAdapter

Handles HuggingFace Hub downloads with Transformers.js support:

```javascript
class HuggingFaceAdapter extends BaseSourceAdapter {
  constructor() {
    super();
    this.apiBase = 'https://huggingface.co';
  }

  async detectFramework(modelId, variant = null) {
    // Fetch repo file list
    const files = await this.listRepoFiles(modelId);

    // Check for Transformers.js structure (onnx/ directory)
    if (files.some(f => f.startsWith('onnx/'))) {
      return 'transformers';
    }

    // Check for single ONNX file
    if (files.some(f => f.endsWith('.onnx'))) {
      return 'onnx';
    }

    // Check for TensorFlow.js
    if (files.some(f => f.includes('tfjs_model'))) {
      return 'tensorflow';
    }

    return 'unsupported';
  }

  async listVariants(modelId) {
    const files = await this.listRepoFiles(modelId);
    const variants = [];

    // Check for Transformers.js variants
    if (files.includes('onnx/model.onnx')) {
      const size = await this.getFileSize(modelId, 'onnx/model.onnx');
      variants.push({
        name: 'default',
        files: ['onnx/model.onnx', 'tokenizer.json', 'config.json'],
        totalSize: size,
        precision: 'fp32'
      });
    }

    if (files.includes('onnx/model_quantized.onnx')) {
      const size = await this.getFileSize(modelId, 'onnx/model_quantized.onnx');
      variants.push({
        name: 'quantized',
        files: ['onnx/model_quantized.onnx', 'tokenizer.json', 'config.json'],
        totalSize: size,
        precision: 'int8'
      });
    }

    // Single ONNX file
    if (variants.length === 0 && files.some(f => f.endsWith('.onnx'))) {
      const onnxFile = files.find(f => f.endsWith('.onnx'));
      const size = await this.getFileSize(modelId, onnxFile);
      variants.push({
        name: 'default',
        files: [onnxFile],
        totalSize: size,
        precision: 'unknown'
      });
    }

    return variants;
  }

  async download(modelId, variant, onProgress) {
    const framework = await this.detectFramework(modelId, variant);

    if (framework === 'transformers') {
      // Download multiple files for Transformers.js
      return await this.downloadTransformersModel(modelId, variant, onProgress);
    } else if (framework === 'onnx') {
      // Download single ONNX file
      const onnxFile = await this.findOnnxFile(modelId);
      return await this.downloadFile(modelId, onnxFile, onProgress);
    } else {
      throw new Error(`Unsupported framework: ${framework}`);
    }
  }

  async downloadTransformersModel(modelId, variant, onProgress) {
    // Determine which model file to download
    const modelFile = variant === 'quantized'
      ? 'onnx/model_quantized.onnx'
      : 'onnx/model.onnx';

    // Required files for Transformers.js
    const requiredFiles = [
      modelFile,
      'tokenizer.json',
      'tokenizer_config.json',
      'config.json'
    ];

    // Download all files
    const files = {};
    let totalBytes = 0;
    let downloadedBytes = 0;

    // Calculate total size
    for (const file of requiredFiles) {
      const size = await this.getFileSize(modelId, file);
      totalBytes += size;
    }

    // Download each file
    for (const file of requiredFiles) {
      const buffer = await this.downloadFile(
        modelId,
        file,
        (bytes, total) => {
          onProgress(downloadedBytes + bytes, totalBytes);
        }
      );
      files[file] = buffer;
      downloadedBytes += buffer.length;
    }

    // Package as a single blob (JSON with embedded base64)
    return Buffer.from(JSON.stringify({
      type: 'transformers-model',
      variant,
      files: Object.entries(files).reduce((acc, [path, buffer]) => {
        acc[path] = buffer.toString('base64');
        return acc;
      }, {})
    }));
  }

  async downloadFile(modelId, filePath, onProgress) {
    const url = `${this.apiBase}/${modelId}/resolve/main/${filePath}`;
    const response = await fetch(url);

    if (response.status === 429) {
      const error = new Error('HuggingFace rate limit exceeded');
      error.statusCode = 429;
      error.response = response;
      throw error;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to download ${filePath}`);
    }

    const totalBytes = parseInt(response.headers.get('content-length') || '0');
    let downloadedBytes = 0;

    const chunks = [];
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloadedBytes += value.length;
      onProgress(downloadedBytes, totalBytes);
    }

    return Buffer.concat(chunks);
  }

  async inferMetadata(modelId, variant = null) {
    // Fetch model card and config.json
    const modelCard = await this.fetchModelCard(modelId);
    const config = await this.fetchConfig(modelId);

    return {
      taskType: this.inferTaskType(modelCard, config),
      outputDimensions: this.extractOutputDimensions(config),
      description: modelCard.description || `Model from HuggingFace: ${modelId}`,
      tags: modelCard.tags || []
    };
  }

  inferTaskType(modelCard, config) {
    // Check pipeline_tag in model card
    const pipelineTag = modelCard.pipeline_tag;

    const mapping = {
      'sentence-similarity': 'text-embedding',
      'feature-extraction': 'text-embedding',
      'text-classification': 'text-classification',
      'token-classification': 'named-entity-recognition',
      'text-generation': 'text-generation',
      'image-classification': 'image-classification',
      'object-detection': 'object-detection'
    };

    return mapping[pipelineTag] || 'unknown';
  }

  extractOutputDimensions(config) {
    // Try to extract from common config fields
    if (config.hidden_size) return [config.hidden_size];
    if (config.d_model) return [config.d_model];
    if (config.num_labels) return [config.num_labels];

    return null; // User must specify
  }

  async listRepoFiles(modelId) {
    const url = `${this.apiBase}/api/models/${modelId}/tree/main`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list files for ${modelId}`);
    }

    const data = await response.json();
    return data.map(item => item.path);
  }

  async getFileSize(modelId, filePath) {
    const url = `${this.apiBase}/${modelId}/resolve/main/${filePath}`;
    const response = await fetch(url, { method: 'HEAD' });
    return parseInt(response.headers.get('content-length') || '0');
  }

  async fetchModelCard(modelId) {
    const url = `${this.apiBase}/api/models/${modelId}`;
    const response = await fetch(url);
    return await response.json();
  }

  async fetchConfig(modelId) {
    try {
      const url = `${this.apiBase}/${modelId}/resolve/main/config.json`;
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      return {}; // Config not available
    }
  }
}
```

---

#### HttpUrlAdapter

Handles generic HTTP URL downloads:

```javascript
class HttpUrlAdapter extends BaseSourceAdapter {
  async detectFramework(url, variant = null) {
    // Infer from file extension
    if (url.endsWith('.onnx')) return 'onnx';
    if (url.endsWith('.pb')) return 'tensorflow';

    // Try HEAD request to check content-type
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('onnx')) return 'onnx';
    } catch (error) {
      // Ignore HEAD request failures
    }

    // Cannot detect - require user to specify
    throw new Error('Cannot detect framework from URL. Please specify framework explicitly.');
  }

  async listVariants(url) {
    // HTTP URLs only have single variant
    const response = await fetch(url, { method: 'HEAD' });
    const size = parseInt(response.headers.get('content-length') || '0');

    return [{
      name: 'default',
      files: [url],
      totalSize: size,
      precision: 'unknown'
    }];
  }

  async download(url, variant, onProgress) {
    const response = await fetch(url);

    if (response.status === 429) {
      const error = new Error('Source rate limit exceeded');
      error.statusCode = 429;
      error.response = response;
      throw error;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to download from URL`);
    }

    const totalBytes = parseInt(response.headers.get('content-length') || '0');
    let downloadedBytes = 0;

    const chunks = [];
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloadedBytes += value.length;
      onProgress(downloadedBytes, totalBytes);
    }

    return Buffer.concat(chunks);
  }

  async inferMetadata(url, variant = null) {
    // Limited metadata from URL
    return {
      description: `Model downloaded from ${url}`,
      tags: ['external']
    };
  }
}
```

---

#### LocalFilesystemAdapter

Handles local file imports with security restrictions:

```javascript
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

class LocalFilesystemAdapter extends BaseSourceAdapter {
  constructor() {
    super();
    // Safe base directory - models/ in repo root
    this.baseDir = path.resolve(process.cwd(), 'models');
  }

  /**
   * Validate and resolve safe file path
   * Prevents path traversal attacks (../, absolute paths, symlinks)
   */
  async validatePath(relativePath) {
    // Resolve absolute path
    const absolutePath = path.resolve(this.baseDir, relativePath);

    // Check if path escapes base directory
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new SecurityError(`Path ${relativePath} escapes models directory`);
    }

    // Check file exists
    try {
      const stats = await fs.stat(absolutePath);

      // Reject symlinks to prevent directory traversal
      if (stats.isSymbolicLink()) {
        throw new SecurityError('Symlinks are not allowed for security reasons');
      }

      if (!stats.isFile()) {
        throw new Error('Path must be a file, not a directory');
      }

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found in models directory: ${relativePath}`);
      }
      throw error;
    }

    return absolutePath;
  }

  async detectFramework(relativePath, variant = null) {
    await this.validatePath(relativePath);

    if (relativePath.endsWith('.onnx')) return 'onnx';
    if (relativePath.endsWith('.pb')) return 'tensorflow';

    throw new Error('Cannot detect framework from file path. Please specify framework explicitly.');
  }

  async listVariants(relativePath) {
    const safePath = await this.validatePath(relativePath);
    const stats = await fs.stat(safePath);

    return [{
      name: 'default',
      files: [relativePath],
      totalSize: stats.size,
      precision: 'unknown'
    }];
  }

  async download(relativePath, variant, onProgress) {
    const safePath = await this.validatePath(relativePath);

    const stats = await fs.stat(safePath);
    const totalBytes = stats.size;
    let downloadedBytes = 0;

    const chunks = [];
    const stream = createReadStream(safePath);

    for await (const chunk of stream) {
      chunks.push(chunk);
      downloadedBytes += chunk.length;
      onProgress(downloadedBytes, totalBytes);
    }

    return Buffer.concat(chunks);
  }

  async inferMetadata(relativePath, variant = null) {
    await this.validatePath(relativePath);

    return {
      description: `Model imported from models/${relativePath}`,
      tags: ['local']
    };
  }
}

class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
    this.code = 'SECURITY_VIOLATION';
  }
}
```

---

## CLI Tool Design

### harper-ai CLI Structure

```bash
npx harper-ai <command> <subcommand> [options]

# Or via npm script
npm run harper-ai <command> <subcommand> [options]
```

### Commands

#### 1. Model Operations

```bash
# Inspect model (preview variants)
npx harper-ai model inspect <source> <sourceReference>
npx harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2

# Fetch model
npx harper-ai model fetch <source> <sourceReference> [options]
npx harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
  --variant quantized \
  --name all-minilm-l6-v2 \
  --version v1

# Test inference (validate model works)
npx harper-ai model test <modelName:version> [--input <data>]
npx harper-ai model test all-minilm-l6-v2:v1
npx harper-ai model test all-minilm-l6-v2:v1 --input "Hello world"

# List models
npx harper-ai model list [--stage production] [--framework onnx]

# Get model details
npx harper-ai model get <modelName:version>

# Delete model
npx harper-ai model delete <modelName:version>

# Preload test models
npx harper-ai model preload [--type embeddings] [--clean]
```

#### 2. Job Management

```bash
# List jobs
npx harper-ai job list [--status queued|downloading|completed|failed]

# Get job details
npx harper-ai job get <jobId>

# Watch job progress (live updates)
npx harper-ai job watch <jobId>

# Retry failed job
npx harper-ai job retry <jobId>

# Cancel job
npx harper-ai job cancel <jobId>

# Clean up old jobs
npx harper-ai job cleanup [--older-than 7d] [--status completed|failed]
```

#### 3. Benchmark Operations

```bash
# Run benchmark
npx harper-ai benchmark run [--group embeddings-384] [--iterations 100]

# List benchmark history
npx harper-ai benchmark list [--taskType text-embedding]

# Compare models
npx harper-ai benchmark compare <model1:v1> <model2:v1>
```

#### 4. Ollama Operations

```bash
# Pull Ollama model
npx harper-ai ollama pull <model>

# List Ollama models
npx harper-ai ollama list
```

#### 5. Utilities

```bash
# Generate test models
npx harper-ai generate-test-models

# Health check
npx harper-ai health

# Worker status
npx harper-ai worker status
```

---

### Interactive Examples

#### Inspect → Fetch Workflow

```bash
# Step 1: Inspect
$ npx harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2

📦 Model: Xenova/all-MiniLM-L6-v2
🔧 Framework: transformers
📊 Task: text-embedding (384 dimensions)

Available variants:
  1. default (22.8 MB) - fp32 precision
  2. quantized (6.5 MB) - int8 precision ⭐ Recommended

Inferred metadata:
  - taskType: text-embedding
  - outputDimensions: [384]
  - tags: sentence-similarity, transformers

Suggested name: all-minilm-l6-v2

# Step 2: Fetch with variant choice
$ npx harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
    --variant quantized \
    --name all-minilm-l6-v2

✅ Job created: job-abc-123
📥 Status: queued
⏳ Use 'npx harper-ai job watch job-abc-123' to monitor progress

# Step 3: Watch progress
$ npx harper-ai job watch job-abc-123

📥 Downloading... [████████████████░░░░] 75% (4.9 MB / 6.5 MB)
⏱️  ETA: 2s

✅ Download complete!
🔄 Processing and storing model...
✅ Model ready: all-minilm-l6-v2:v1

# Step 4: Test inference
$ npx harper-ai model test all-minilm-l6-v2:v1

🧪 Testing model: all-minilm-l6-v2:v1
📦 Framework: transformers
🎯 Task Type: text-embedding

Generating test input for text-embedding...
Input: "The quick brown fox jumps over the lazy dog"

⏳ Running inference...
✅ Inference successful!

Results:
  - Latency: 45ms
  - Output shape: [384]
  - Output sample: [0.123, -0.456, 0.789, ...]

✅ Model is working correctly!
```

#### Job List Output

```bash
$ npx harper-ai job list

┌──────────────┬────────────────────────────────────┬──────────────┬──────────┬─────────────────┐
│ Job ID       │ Source                             │ Model        │ Status   │ Created         │
├──────────────┼────────────────────────────────────┼──────────────┼──────────┼─────────────────┤
│ job-abc-123  │ huggingface:Xenova/all-MiniLM-L6-v2│ minilm:v1    │ completed│ 2 hours ago     │
│ job-def-456  │ url:https://models.com/model.onnx  │ custom:v1    │ downloading (45%)         │
│ job-ghi-789  │ filesystem:my-model.onnx           │ local:v1     │ failed   │ 1 day ago       │
└──────────────┴────────────────────────────────────┴──────────────┴──────────┴─────────────────┘

$ npx harper-ai job list --status failed

┌──────────────┬─────────────────────────┬───────────┬────────┬───────────────────────────┐
│ Job ID       │ Source                  │ Model     │ Retries│ Error                     │
├──────────────┼─────────────────────────┼───────────┼────────┼───────────────────────────┤
│ job-ghi-789  │ filesystem:my-model.onnx│ local:v1  │ 3/3    │ MODEL_NOT_FOUND: File...  │
└──────────────┴─────────────────────────┴───────────┴────────┴───────────────────────────┘

Use 'npx harper-ai job get <jobId>' for details
Use 'npx harper-ai job retry <jobId>' to retry failed jobs
```

---

### CLI Implementation Structure

```
scripts/
├── cli/
│   ├── index.js              # Main CLI entry point
│   ├── commands/
│   │   ├── model.js          # Model commands
│   │   ├── job.js            # Job management
│   │   ├── benchmark.js      # Benchmark commands
│   │   ├── ollama.js         # Ollama commands
│   │   └── worker.js         # Worker status
│   └── lib/
│       ├── api-client.js     # Harper API client
│       ├── formatters.js     # Table/output formatting
│       └── progress.js       # Progress bar utilities
├── preload-models.js         # Backward compatibility
├── run-benchmark.js          # Backward compatibility
└── ...
```

**package.json:**
```json
{
  "name": "harper-edge-ai-example",
  "bin": {
    "harper-ai": "./scripts/cli/index.js"
  },
  "scripts": {
    "harper-ai": "node scripts/cli/index.js",

    "preload": "npm run harper-ai model preload",
    "benchmark": "npm run harper-ai benchmark run",
    "pull-ollama": "npm run harper-ai ollama pull"
  }
}
```

---

## Error Handling

### Error Categories

**1. Validation Errors (Fail Fast - 400 Bad Request)**
- Missing required fields (source, sourceReference)
- Invalid source type
- Unsupported framework detected
- Security violations (path traversal)
- Model name already exists (different source)

**2. Download Errors (Retry with Backoff)**
- Network timeouts
- Connection failures
- Incomplete downloads
- Rate limits (429) - special backoff handling

**3. Source Errors (Fail After Retries)**
- Model not found (404)
- Access denied (403)
- Server errors (500-599)
- Invalid model format

**4. Storage Errors (Fail, Manual Intervention)**
- Disk full
- Database write failures
- Blob storage failures

---

### Error Response Format

```javascript
{
  jobId: "job-abc-123",
  status: "failed",
  error: {
    code: "MODEL_NOT_FOUND",
    message: "Model 'invalid/model-id' not found on HuggingFace Hub",
    source: "huggingface",
    retryable: false,
    retryCount: 3,
    lastAttempt: 1234567890
  }
}
```

### Error Codes

```javascript
const ERROR_CODES = {
  // Validation
  INVALID_SOURCE: { retryable: false },
  UNSUPPORTED_FRAMEWORK: { retryable: false },
  SECURITY_VIOLATION: { retryable: false },
  MODEL_NAME_CONFLICT: { retryable: false },

  // Download
  NETWORK_TIMEOUT: { retryable: true },
  CONNECTION_FAILED: { retryable: true },
  RATE_LIMITED: { retryable: true, backoff: true },
  DOWNLOAD_INCOMPLETE: { retryable: true },

  // Source
  MODEL_NOT_FOUND: { retryable: false },
  ACCESS_DENIED: { retryable: false },
  SOURCE_SERVER_ERROR: { retryable: true },

  // Storage
  DISK_FULL: { retryable: false },
  STORAGE_FAILED: { retryable: true },
  FILE_TOO_LARGE: { retryable: false }
};
```

---

### Edge Cases

**1. Duplicate Active Jobs**
- Check for existing job with same source+reference+name+version
- **Solution:** Return existing jobId with message

**2. Model Already Exists (Same Source)**
- Same model, same source → Idempotent
- **Solution:** Return existing model immediately, no new job

**3. Model Already Exists (Different Source)**
- Different model, same name → User error
- **Solution:** Return 400 error, user must choose different name/version

**4. Partial Downloads**
- Download interrupted mid-stream
- **Solution:** Clean up partial data, mark job as failed, retry starts fresh

**5. Worker Crashes Mid-Download**
- Server restarts while downloading
- **Solution:** On worker startup, reset jobs with status='downloading' to 'queued'

**6. Webhook Failures**
- Webhook URL unreachable or returns error
- **Solution:** Best effort - log error but don't fail the job

**7. Very Large Models (5GB+)**
- Risk of memory issues, long download times
- **Solution:**
  - Enforce max file size limit (5GB default, configurable)
  - Stream to disk instead of memory for large files
  - Progress updates every 1% to reduce overhead

---

## Testing Strategy

### Unit Tests

**1. Source Adapters**
```javascript
// HuggingFaceAdapter
- detectFramework() correctly identifies ONNX/TensorFlow/Transformers
- listVariants() detects default and quantized variants
- inferMetadata() parses model cards and config.json
- download() handles 404, 429, network errors
- downloadTransformersModel() packages multiple files correctly
- Rate limit backoff works correctly

// HttpUrlAdapter
- detectFramework() from URL and content-type
- download() with progress tracking
- Handles 429 rate limits

// LocalFilesystemAdapter
- Path traversal attacks blocked (../, absolute paths)
- Symlinks rejected
- Validates file exists in models/ directory
- Progress tracking works
```

**2. ModelFetchWorker**
```javascript
- Respects maxConcurrent limit (3 jobs)
- Retry logic with exponential backoff (1s, 2s, 4s)
- Max retries (3) then fail
- Framework validation before download
- Idempotent model creation (same source)
- Error on duplicate name (different source)
- Webhook success/failure handling
- Job status transitions (queued→downloading→processing→completed)
- Worker recovery after crash (reset downloading→queued)
- Handles disk full errors
- Enforces max file size limit
```

**3. RateLimiter**
```javascript
- Global concurrent limit enforced
- 429 backoff per source
- Retry-After header parsing
- Multiple sources isolated
```

**4. FetchModel API**
```javascript
- Validates required fields
- Detects framework before creating job
- Returns existing job if duplicate
- Returns existing model if same source
- Errors on duplicate name (different source)
- Accepts metadata overrides
- Accepts webhook URL
```

**5. InspectModel API**
```javascript
- Lists variants for Transformers.js models
- Infers metadata correctly
- Suggests model name
- Handles model not found
```

### Integration Tests

**1. End-to-End Fetch Flow**
```javascript
- POST /InspectModel → variants returned
- POST /FetchModel → job created
- GET /ModelFetchJob → progress updates
- Job completes → Model created in table
- Webhook called on completion
- Metadata correctly inferred and stored
```

**2. Error Scenarios**
```javascript
- Invalid source reference (404) → fails after retries
- Unsupported framework → fails immediately
- Disk full → fails with clear error
- Duplicate model name (different source) → returns error
- Path traversal attack → rejected immediately
```

**3. Concurrent Jobs**
```javascript
- Submit 5 jobs, only 3 run concurrently
- Remaining 2 queued until slots available
- Worker crash recovery works
```

**4. CLI Commands**
```javascript
- harper-ai model inspect → displays variants
- harper-ai model fetch → creates job
- harper-ai job watch → shows progress
- harper-ai model test → runs inference
- harper-ai job list → displays jobs
```

### Mock Testing Strategy

**For unit tests, mock:**
- HuggingFace API responses (model cards, file lists)
- File downloads (use small test buffers)
- Harper table operations
- Webhook HTTP calls
- Filesystem operations

**For integration tests, use:**
- Real Harper tables (test environment)
- Small test model files (< 1MB)
- Local test HTTP server for URL adapter
- Real filesystem with test models/ directory
- Real HuggingFace API (rate limit carefully)

---

## Configuration

### Environment Variables

```env
# Worker Configuration
MODEL_FETCH_WORKER_ENABLED=true           # Enable/disable worker
MODEL_FETCH_MAX_CONCURRENT=3              # Max concurrent downloads
MODEL_FETCH_POLL_INTERVAL=5000            # Poll interval (ms)
MODEL_FETCH_MAX_RETRIES=3                 # Default max retries
MODEL_FETCH_MAX_FILE_SIZE=5368709120      # Max file size (5GB)

# Rate Limiting
MODEL_FETCH_RATE_LIMIT_BACKOFF=60         # Default backoff seconds

# Source Configuration
HUGGINGFACE_API_BASE=https://huggingface.co
MODELS_DIR=./models                        # Safe directory for filesystem adapter

# Webhooks
MODEL_FETCH_WEBHOOK_TIMEOUT=5000          # Webhook timeout (ms)
```

---

## Deployment Considerations

**1. Worker Lifecycle**
- Start worker on Harper server startup
- Graceful shutdown (finish active downloads)
- Health check endpoint: `GET /ModelFetchWorker/health`

**2. Storage Management**
- Monitor disk space before downloads
- Cleanup failed partial downloads
- Archive old completed/failed jobs (retention policy: 30 days default)

**3. Observability**
- Log all job state transitions
- Metrics: active jobs, queue depth, success/failure rate
- Alerts: disk space low, repeated failures, worker not responding

**4. Security**
- Filesystem adapter restricted to models/ directory
- No authentication for v1 (public models only)
- Validate URLs (no localhost, private IPs for URL adapter)
- Rate limiting to prevent abuse

---

## Future Roadmap

### v1.1 - Enhanced Observability
- Real-time worker metrics dashboard
- Job analytics (success rate, avg download time by source)
- Alerts for repeated failures
- Historical inference success rate per model

### v2.0 - Authentication & Private Models
- Stored credentials (encrypted at rest)
- Per-request auth tokens
- HuggingFace private models
- AWS S3 with IAM
- GitHub private releases
- Azure Blob Storage

### v3.0 - Advanced Features
- Model conversion (PyTorch → ONNX)
- Automatic model optimization (quantization)
- Delta downloads (resume interrupted)
- Multi-part parallel downloads
- Model dependency resolution
- Automated inference testing post-fetch (optional validation step)

---

## Success Metrics

### Developer Experience
- Time to fetch model: < 30 seconds (for small models < 100MB)
- CLI commands intuitive and discoverable
- Clear error messages with actionable guidance
- Inference test validates model functionality

### Reliability
- Job success rate: > 95%
- Auto-retry resolves 80% of transient failures
- No data loss on worker crashes
- Recovery time after crash: < 10 seconds

### Performance
- Support 3 concurrent downloads
- Handle models up to 5GB
- Progress updates every 1% (or 1MB, whichever is larger)
- Memory efficient (stream large files, don't buffer in RAM)

---

## Migration Plan

### Phase 1: Core Implementation (Week 1-2)
- ModelFetchJob table schema
- ModelFetchWorker with retry logic and rate limiting
- HuggingFaceAdapter (with Transformers.js support)
- HttpUrlAdapter
- LocalFilesystemAdapter (with security validation)
- API endpoints: InspectModel, FetchModel, ModelFetchJob CRUD
- Unit tests for all adapters and worker

### Phase 2: CLI Tool (Week 2-3)
- harper-ai CLI framework (using Commander.js or similar)
- Model commands (inspect, fetch, list, delete, test)
- Job commands (list, get, watch, retry, cancel, cleanup)
- Integration with existing scripts (backward compatibility)
- CLI unit tests and integration tests

### Phase 3: Testing & Polish (Week 3-4)
- Integration tests for end-to-end flows
- Error scenario coverage (all error codes)
- Worker crash recovery testing
- Rate limiting and retry testing
- Documentation and examples
- Performance testing (large models, concurrent jobs)

### Phase 4: Deployment (Week 4)
- Worker lifecycle management (startup, shutdown)
- Observability setup (logs, metrics)
- Production deployment checklist
- User documentation and tutorials
- Migration guide for existing users

---

## Appendix: Example Workflows

### Workflow 1: Fetch HuggingFace Model

```bash
# 1. Inspect model
$ npx harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2

# 2. Fetch quantized variant
$ npx harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \
    --variant quantized \
    --name all-minilm-l6-v2

# 3. Watch progress
$ npx harper-ai job watch job-abc-123

# 4. Test inference
$ npx harper-ai model test all-minilm-l6-v2:v1

# 5. Use in production
$ curl -X POST http://localhost:9926/predict \
    -d '{"modelName": "all-minilm-l6-v2", "features": {"text": "hello"}}'
```

### Workflow 2: Import Local Model

```bash
# 1. Copy model to models/ directory
$ cp ~/Downloads/my-model.onnx models/

# 2. Fetch from local filesystem
$ npx harper-ai model fetch filesystem my-model.onnx \
    --name my-custom-model \
    --framework onnx \
    --metadata '{"taskType":"text-embedding","outputDimensions":[768]}'

# 3. Test
$ npx harper-ai model test my-custom-model:v1
```

### Workflow 3: Fetch from Public URL

```bash
# 1. Fetch model from URL
$ npx harper-ai model fetch url https://example.com/models/model.onnx \
    --name public-model \
    --framework onnx

# 2. Monitor job
$ npx harper-ai job list --status downloading

# 3. Test when complete
$ npx harper-ai model test public-model:v1
```

---

## Conclusion

The Model Fetch System provides a production-grade solution for fetching ML models from external sources with automatic metadata inference, async job management, and comprehensive CLI tooling. The system is designed for reliability (auto-retry, crash recovery), security (filesystem restrictions), and developer experience (two-step workflow, progress tracking).

**Next Steps:**
1. Review and approve design
2. Begin Phase 1 implementation
3. Set up development environment
4. Create initial test fixtures

---

**Document Status:** Ready for Implementation
**Approver:** [To be assigned]
**Implementation Start Date:** [To be determined]
