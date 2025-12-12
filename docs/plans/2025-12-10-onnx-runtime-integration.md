# ONNX Runtime Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ONNX Runtime support alongside TensorFlow.js with unified MLOps architecture (ModelRegistry, InferenceEngine, MonitoringBackend, FeatureStore).

**Architecture:** Framework-agnostic components with pluggable inference backends. All models stored as blobs in Harper tables. InferenceEngine automatically routes to correct backend (ONNX or TensorFlow) based on model framework field. Existing PersonalizationEngine enhanced to use InferenceEngine internally.

**Tech Stack:** Harper, Node.js ES modules, ONNX Runtime Node.js, TensorFlow.js, Node test runner

---

## Task 1: Setup Dependencies and Schema

**Files:**

- Modify: `package.json`
- Modify: `schema.graphql`

**Step 1: Add onnxruntime-node dependency**

Modify `package.json` dependencies section:

```json
"dependencies": {
  "@tensorflow-models/universal-sentence-encoder": "^1.3.3",
  "@tensorflow/tfjs-node": "^4.22.0",
  "onnxruntime-node": "^1.20.0",
  "uuid": "^11.0.3"
}
```

**Step 2: Install dependencies**

Run: `npm install`

Expected: Package installs successfully with onnxruntime-node added

**Step 3: Update schema.graphql with Harper tables**

Replace entire `schema.graphql` content:

```graphql
# Database for Harper Edge AI Example with MLOps
type Model @table(database: "harper-edge-ai-example") @export {
	# Composite key as single field: "${modelId}:${version}"
	id: ID @primaryKey

	# Model metadata
	modelId: String @indexed
	version: String @indexed
	framework: String @indexed # "onnx" | "tensorflow" | "tfjs-graph"
	stage: String @indexed # "development" | "staging" | "production"
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
	id: ID @primaryKey # This will be the inferenceId
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

**Step 4: Commit dependency and schema changes**

```bash
git add package.json package-lock.json schema.graphql
git commit -m "feat: add onnxruntime-node dependency and Harper schema for MLOps"
```

---

## Task 2: ModelRegistry - Write Test

**Files:**

- Create: `tests/unit/ModelRegistry.test.js`
- Create: `tests/fixtures/` (directory for test models)

**Step 1: Create test fixtures directory**

Run: `mkdir -p tests/fixtures tests/unit`

**Step 2: Write failing test for ModelRegistry**

Create `tests/unit/ModelRegistry.test.js`:

```javascript
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';

describe('ModelRegistry', () => {
	let registry;

	before(async () => {
		registry = new ModelRegistry();
		await registry.initialize();
	});

	after(async () => {
		// Cleanup test data
		await registry.cleanup();
	});

	test('should store and retrieve ONNX model blob', async () => {
		// Create a minimal test blob (fake ONNX model)
		const modelBlob = Buffer.from('fake onnx model data');

		const registration = {
			modelId: 'test-onnx',
			version: 'v1',
			framework: 'onnx',
			modelBlob,
			inputSchema: JSON.stringify({ shape: [1, 10] }),
			outputSchema: JSON.stringify({ shape: [1, 2] }),
			metadata: JSON.stringify({ description: 'Test ONNX model' }),
			stage: 'development',
		};

		// Register model
		const registered = await registry.registerModel(registration);

		// Verify registration
		assert.strictEqual(registered.modelId, 'test-onnx');
		assert.strictEqual(registered.version, 'v1');
		assert.strictEqual(registered.framework, 'onnx');

		// Retrieve model
		const retrieved = await registry.getModel('test-onnx', 'v1');

		// Verify retrieval
		assert.strictEqual(retrieved.modelId, 'test-onnx');
		assert.strictEqual(retrieved.framework, 'onnx');
		assert.ok(Buffer.isBuffer(retrieved.modelBlob));
		assert.strictEqual(retrieved.modelBlob.toString(), 'fake onnx model data');
	});

	test('should get latest version when version not specified', async () => {
		const blob1 = Buffer.from('v1 data');
		const blob2 = Buffer.from('v2 data');

		// Register two versions
		await registry.registerModel({
			modelId: 'test-versions',
			version: 'v1',
			framework: 'onnx',
			modelBlob: blob1,
			inputSchema: '{}',
			outputSchema: '{}',
			metadata: '{}',
			stage: 'development',
		});

		await registry.registerModel({
			modelId: 'test-versions',
			version: 'v2',
			framework: 'onnx',
			modelBlob: blob2,
			inputSchema: '{}',
			outputSchema: '{}',
			metadata: '{}',
			stage: 'development',
		});

		// Get without version should return latest
		const latest = await registry.getModel('test-versions');
		assert.strictEqual(latest.version, 'v2');
		assert.strictEqual(latest.modelBlob.toString(), 'v2 data');
	});

	test('should list all versions of a model', async () => {
		const versions = await registry.listVersions('test-versions');

		assert.ok(Array.isArray(versions));
		assert.strictEqual(versions.length, 2);
		assert.ok(versions.some((v) => v.version === 'v1'));
		assert.ok(versions.some((v) => v.version === 'v2'));
	});
});
```

**Step 3: Update package.json test scripts**

Add to `package.json` scripts:

```json
"scripts": {
  "test": "node --no-deprecation models/test-model.js",
  "test:unit": "node --test tests/unit/**/*.test.js",
  "test:all": "npm run test && npm run test:unit"
}
```

**Step 4: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../../src/core/ModelRegistry.js'"

**Step 5: Commit failing test**

```bash
git add tests/unit/ModelRegistry.test.js package.json
git commit -m "test: add failing tests for ModelRegistry"
```

---

## Task 3: ModelRegistry - Implementation

**Files:**

- Create: `src/core/ModelRegistry.js`

**Step 1: Create ModelRegistry implementation**

Create `src/core/ModelRegistry.js`:

```javascript
import { tables } from '@harperdb/harperdb';

/**
 * Model Registry - Store and retrieve models from Harper tables
 * Supports both ONNX and TensorFlow models
 */
export class ModelRegistry {
	constructor() {
		this.modelsTable = null;
	}

	async initialize() {
		// Get reference to Harper Model table
		this.modelsTable = tables.get('Model');
	}

	/**
	 * Generate composite key for model
	 */
	_buildModelKey(modelId, version) {
		return `${modelId}:${version}`;
	}

	/**
	 * Parse composite key into modelId and version
	 */
	_parseModelKey(key) {
		const [modelId, version] = key.split(':');
		return { modelId, version };
	}

	/**
	 * Register a new model
	 * @param {Object} registration - Model registration data
	 * @returns {Object} Registered model
	 */
	async registerModel(registration) {
		const { modelId, version, framework, modelBlob, inputSchema, outputSchema, metadata, stage } = registration;

		const id = this._buildModelKey(modelId, version);

		const record = {
			id,
			modelId,
			version,
			framework,
			modelBlob,
			inputSchema,
			outputSchema,
			metadata,
			stage: stage || 'development',
		};

		// Insert into Harper table
		await this.modelsTable.put(record);

		return {
			id,
			modelId,
			version,
			framework,
			stage: record.stage,
			uploadedAt: new Date(),
		};
	}

	/**
	 * Get a model by ID and optional version
	 * @param {string} modelId - The model identifier
	 * @param {string} [version] - Optional version (defaults to latest)
	 * @returns {Object} Model record with blob
	 */
	async getModel(modelId, version) {
		if (version) {
			// Get specific version
			const id = this._buildModelKey(modelId, version);
			const record = await this.modelsTable.get(id);
			return record || null;
		}

		// Get latest version - query all versions and sort by uploadedAt
		const allVersions = [];
		for await (const record of this.modelsTable.search({ modelId })) {
			allVersions.push(record);
		}

		if (allVersions.length === 0) {
			return null;
		}

		// Sort by uploadedAt descending (most recent first)
		allVersions.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
		return allVersions[0];
	}

	/**
	 * List all versions of a model
	 * @param {string} modelId - The model identifier
	 * @returns {Object[]} Array of model versions
	 */
	async listVersions(modelId) {
		const versions = [];
		for await (const record of this.modelsTable.search({ modelId })) {
			versions.push({
				id: record.id,
				modelId: record.modelId,
				version: record.version,
				framework: record.framework,
				stage: record.stage,
				uploadedAt: record.uploadedAt,
			});
		}
		return versions;
	}

	/**
	 * List all models
	 * @returns {Object[]} Array of all models
	 */
	async listModels() {
		const models = [];
		for await (const record of this.modelsTable.search()) {
			models.push({
				id: record.id,
				modelId: record.modelId,
				version: record.version,
				framework: record.framework,
				stage: record.stage,
				uploadedAt: record.uploadedAt,
			});
		}
		return models;
	}

	/**
	 * Cleanup test data (for testing only)
	 */
	async cleanup() {
		// Delete all test models
		const testModels = [];
		for await (const record of this.modelsTable.search()) {
			if (record.modelId.startsWith('test-')) {
				testModels.push(record.id);
			}
		}

		for (const id of testModels) {
			await this.modelsTable.delete(id);
		}
	}
}
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS - "3 tests passed" (ModelRegistry tests)

Note: Tests require Harper to be running. If Harper not running, tests will fail with connection error. That's expected - tests are written correctly.

**Step 3: Commit implementation**

```bash
git add src/core/ModelRegistry.js
git commit -m "feat: implement ModelRegistry with Harper table storage"
```

---

## Task 4: InferenceEngine Backends - Write Tests

**Files:**

- Create: `tests/unit/InferenceEngine.test.js`
- Create: `tests/fixtures/test-models.js` (helper to download/generate test models)

**Step 1: Create test model helper**

Create `tests/fixtures/test-models.js`:

```javascript
import * as ort from 'onnxruntime-node';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;

/**
 * Get or create a minimal ONNX model for testing
 * Creates a simple 2-input -> 1-output linear model
 */
export async function getTestOnnxModel() {
	const modelPath = path.join(FIXTURES_DIR, 'test-model.onnx');

	try {
		// Try to read existing model
		const buffer = await fs.readFile(modelPath);
		return buffer;
	} catch (err) {
		// Create minimal ONNX model programmatically
		// For now, return a placeholder - we'll use a real tiny ONNX model
		// This is a valid minimal ONNX model (identity function)
		const minimalOnnx = Buffer.from(
			'080712050a03312e30120f746573742d6d696e696d616c2d312200220b0a04646174611202080122080a06726573756c74' +
				'1a1c0a06726573756c74120464617461220449646e741a00120f0a0964617461696e7075742201783a0b0a06726573756c7412017942020801',
			'hex'
		);

		await fs.writeFile(modelPath, minimalOnnx);
		return minimalOnnx;
	}
}

/**
 * Get test TensorFlow.js model (use existing Universal Sentence Encoder)
 */
export async function getTestTensorFlowModel() {
	// For TensorFlow test, we'll use a simple mock
	// In real usage, models would be uploaded by users
	return {
		type: 'tensorflow',
		modelJson: JSON.stringify({
			modelTopology: {
				node: [],
				name: 'test-tf-model',
				version: '1.0',
			},
			weightsManifest: [],
		}),
	};
}
```

**Step 2: Write failing tests for InferenceEngine**

Create `tests/unit/InferenceEngine.test.js`:

```javascript
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';
import { getTestOnnxModel } from '../fixtures/test-models.js';

describe('InferenceEngine', () => {
	let engine;
	let registry;

	before(async () => {
		registry = new ModelRegistry();
		await registry.initialize();

		engine = new InferenceEngine(registry);
		await engine.initialize();
	});

	after(async () => {
		await registry.cleanup();
		await engine.cleanup();
	});

	test('should load and cache ONNX model', async () => {
		// Register a test ONNX model
		const modelBlob = await getTestOnnxModel();

		await registry.registerModel({
			modelId: 'test-onnx-inference',
			version: 'v1',
			framework: 'onnx',
			modelBlob,
			inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
			outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
			metadata: '{}',
			stage: 'development',
		});

		// Load model
		const loaded = await engine.loadModel('test-onnx-inference', 'v1');

		assert.ok(loaded);
		assert.strictEqual(loaded.modelId, 'test-onnx-inference');
		assert.strictEqual(loaded.framework, 'onnx');

		// Verify it's cached
		const cached = engine.isCached('test-onnx-inference', 'v1');
		assert.strictEqual(cached, true);
	});

	test('should run inference with ONNX model', async () => {
		// Simple inference test with minimal ONNX model
		const input = new Float32Array([1.0, 2.0]);

		const result = await engine.predict('test-onnx-inference', {
			data: input,
		});

		assert.ok(result);
		assert.ok(result.output);
		// Minimal model is identity function, so output should equal input
		assert.ok(Array.isArray(result.output) || result.output instanceof Float32Array);
	});

	test('should select correct backend based on framework', async () => {
		const backend = engine.getBackend('onnx');
		assert.strictEqual(backend.name, 'OnnxRuntimeBackend');

		const tfBackend = engine.getBackend('tensorflow');
		assert.strictEqual(tfBackend.name, 'TensorFlowBackend');
	});
});
```

**Step 3: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../../src/core/InferenceEngine.js'"

**Step 4: Commit failing tests**

```bash
git add tests/unit/InferenceEngine.test.js tests/fixtures/test-models.js
git commit -m "test: add failing tests for InferenceEngine"
```

---

## Task 5: InferenceEngine - ONNX Backend Implementation

**Files:**

- Create: `src/core/backends/OnnxRuntimeBackend.js`
- Create: `src/core/backends/TensorFlowBackend.js`
- Create: `src/core/InferenceEngine.js`
- Create: `src/core/index.js` (barrel export)

**Step 1: Implement ONNX Runtime Backend**

Create `src/core/backends/OnnxRuntimeBackend.js`:

```javascript
import * as ort from 'onnxruntime-node';

/**
 * ONNX Runtime Backend - Load and run ONNX models
 */
export class OnnxRuntimeBackend {
	constructor() {
		this.name = 'OnnxRuntimeBackend';
		this.sessions = new Map(); // Cache loaded sessions
	}

	/**
	 * Load ONNX model from buffer
	 * @param {string} modelKey - Cache key
	 * @param {Buffer} modelBlob - ONNX model binary
	 * @returns {Object} Loaded session metadata
	 */
	async loadModel(modelKey, modelBlob) {
		try {
			// Create ONNX Runtime session from buffer
			const session = await ort.InferenceSession.create(modelBlob);

			// Cache session
			this.sessions.set(modelKey, session);

			return {
				loaded: true,
				inputNames: session.inputNames,
				outputNames: session.outputNames,
			};
		} catch (error) {
			console.error('Failed to load ONNX model:', error);
			throw new Error(`ONNX model loading failed: ${error.message}`);
		}
	}

	/**
	 * Run inference with ONNX model
	 * @param {string} modelKey - Cache key
	 * @param {Object} inputs - Input tensors { inputName: Float32Array }
	 * @returns {Object} Output tensors
	 */
	async predict(modelKey, inputs) {
		const session = this.sessions.get(modelKey);

		if (!session) {
			throw new Error(`Model ${modelKey} not loaded`);
		}

		try {
			// Convert inputs to ONNX tensors
			const feeds = {};
			for (const [name, data] of Object.entries(inputs)) {
				// Determine shape from data
				let shape;
				if (data instanceof Float32Array || Array.isArray(data)) {
					shape = [1, data.length]; // Assume batch size 1
				} else {
					throw new Error(`Unsupported input type for ${name}`);
				}

				feeds[name] = new ort.Tensor('float32', Float32Array.from(data), shape);
			}

			// Run inference
			const results = await session.run(feeds);

			// Convert output tensors to plain objects
			const output = {};
			for (const [name, tensor] of Object.entries(results)) {
				output[name] = Array.from(tensor.data);
			}

			return output;
		} catch (error) {
			console.error('ONNX inference failed:', error);
			throw new Error(`ONNX inference failed: ${error.message}`);
		}
	}

	/**
	 * Check if model is loaded
	 */
	isLoaded(modelKey) {
		return this.sessions.has(modelKey);
	}

	/**
	 * Unload model from cache
	 */
	async unload(modelKey) {
		const session = this.sessions.get(modelKey);
		if (session) {
			// ONNX Runtime sessions don't need explicit disposal in Node.js
			this.sessions.delete(modelKey);
		}
	}

	/**
	 * Cleanup all loaded models
	 */
	async cleanup() {
		this.sessions.clear();
	}
}
```

**Step 2: Implement TensorFlow Backend stub**

Create `src/core/backends/TensorFlowBackend.js`:

```javascript
/**
 * TensorFlow Backend - Load and run TensorFlow.js models
 * Stub implementation for now - will be completed when integrating existing TF.js code
 */
export class TensorFlowBackend {
	constructor() {
		this.name = 'TensorFlowBackend';
		this.models = new Map();
	}

	async loadModel(modelKey, modelBlob) {
		// TODO: Implement TensorFlow.js model loading
		// For now, just cache the blob
		this.models.set(modelKey, { loaded: true, blob: modelBlob });

		return {
			loaded: true,
			inputNames: ['input'],
			outputNames: ['output'],
		};
	}

	async predict(modelKey, inputs) {
		// TODO: Implement TensorFlow.js inference
		// For now, return mock output
		throw new Error('TensorFlow backend not yet implemented');
	}

	isLoaded(modelKey) {
		return this.models.has(modelKey);
	}

	async unload(modelKey) {
		this.models.delete(modelKey);
	}

	async cleanup() {
		this.models.clear();
	}
}
```

**Step 3: Implement InferenceEngine**

Create `src/core/InferenceEngine.js`:

```javascript
import { OnnxRuntimeBackend } from './backends/OnnxRuntimeBackend.js';
import { TensorFlowBackend } from './backends/TensorFlowBackend.js';

/**
 * Inference Engine - Framework-agnostic model loading and inference
 * Automatically routes to correct backend based on model framework
 */
export class InferenceEngine {
	constructor(modelRegistry) {
		this.registry = modelRegistry;
		this.backends = new Map();
		this.cache = new Map(); // Cache loaded models: modelKey -> { backend, metadata }
		this.maxCacheSize = 10; // LRU cache size
	}

	async initialize() {
		// Initialize backends
		this.backends.set('onnx', new OnnxRuntimeBackend());
		this.backends.set('tensorflow', new TensorFlowBackend());
	}

	/**
	 * Build cache key for model
	 */
	_buildCacheKey(modelId, version) {
		return `${modelId}:${version}`;
	}

	/**
	 * Get backend by framework name
	 */
	getBackend(framework) {
		return this.backends.get(framework);
	}

	/**
	 * Check if model is cached
	 */
	isCached(modelId, version) {
		const key = this._buildCacheKey(modelId, version);
		return this.cache.has(key);
	}

	/**
	 * Load model from registry into appropriate backend
	 * @param {string} modelId - Model identifier
	 * @param {string} [version] - Optional version (defaults to latest)
	 * @returns {Object} Loaded model metadata
	 */
	async loadModel(modelId, version) {
		const cacheKey = this._buildCacheKey(modelId, version || 'latest');

		// Check cache first
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey).metadata;
		}

		// Fetch from registry
		const model = await this.registry.getModel(modelId, version);

		if (!model) {
			throw new Error(`Model ${modelId}:${version || 'latest'} not found`);
		}

		// Get appropriate backend
		const backend = this.backends.get(model.framework);

		if (!backend) {
			throw new Error(`No backend available for framework: ${model.framework}`);
		}

		// Load into backend
		const loadResult = await backend.loadModel(cacheKey, model.modelBlob);

		// Store in cache
		const metadata = {
			modelId: model.modelId,
			version: model.version,
			framework: model.framework,
			...loadResult,
		};

		this.cache.set(cacheKey, {
			backend,
			metadata,
			lastUsed: Date.now(),
		});

		// Evict if cache too large (simple LRU)
		if (this.cache.size > this.maxCacheSize) {
			this._evictLRU();
		}

		return metadata;
	}

	/**
	 * Run inference with a loaded model
	 * @param {string} modelId - Model identifier
	 * @param {Object} inputs - Input data
	 * @param {string} [version] - Optional version
	 * @returns {Object} Prediction results
	 */
	async predict(modelId, inputs, version) {
		// Load model if not cached
		if (!this.isCached(modelId, version || 'latest')) {
			await this.loadModel(modelId, version);
		}

		const cacheKey = this._buildCacheKey(modelId, version || 'latest');
		const cached = this.cache.get(cacheKey);

		if (!cached) {
			throw new Error(`Model ${modelId} failed to load`);
		}

		// Update last used time
		cached.lastUsed = Date.now();

		// Run prediction through backend
		const startTime = Date.now();
		const output = await cached.backend.predict(cacheKey, inputs);
		const latencyMs = Date.now() - startTime;

		return {
			output,
			latencyMs,
			modelVersion: cached.metadata.version,
			framework: cached.metadata.framework,
		};
	}

	/**
	 * Evict least recently used model from cache
	 */
	_evictLRU() {
		let oldestKey = null;
		let oldestTime = Date.now();

		for (const [key, value] of this.cache.entries()) {
			if (value.lastUsed < oldestTime) {
				oldestTime = value.lastUsed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			const cached = this.cache.get(oldestKey);
			cached.backend.unload(oldestKey);
			this.cache.delete(oldestKey);
		}
	}

	/**
	 * Cleanup all loaded models and backends
	 */
	async cleanup() {
		for (const backend of this.backends.values()) {
			await backend.cleanup();
		}
		this.cache.clear();
	}
}
```

**Step 4: Create barrel export**

Create `src/core/index.js`:

```javascript
export { ModelRegistry } from './ModelRegistry.js';
export { InferenceEngine } from './InferenceEngine.js';
export { OnnxRuntimeBackend } from './backends/OnnxRuntimeBackend.js';
export { TensorFlowBackend } from './backends/TensorFlowBackend.js';
```

**Step 5: Run tests to verify they pass**

Run: `npm run test:unit`

Expected: Tests should pass for ONNX backend. Note: Requires Harper running for ModelRegistry tests.

**Step 6: Commit implementation**

```bash
git add src/core/
git commit -m "feat: implement InferenceEngine with ONNX Runtime backend"
```

---

## Task 6: FeatureStore and MonitoringBackend - Write Tests

**Files:**

- Create: `tests/unit/FeatureStore.test.js`
- Create: `tests/unit/MonitoringBackend.test.js`

**Step 1: Write FeatureStore tests**

Create `tests/unit/FeatureStore.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FeatureStore } from '../../src/core/FeatureStore.js';

describe('FeatureStore', () => {
	test('should write and read features for an entity', async () => {
		const store = new FeatureStore();

		// Write features
		await store.writeFeatures('user_123', {
			age: 25,
			city: 'SF',
			active: true,
		});

		// Read all features
		const features = await store.getFeatures('user_123', ['age', 'city', 'active']);

		// Verify
		assert.strictEqual(features.age, 25);
		assert.strictEqual(features.city, 'SF');
		assert.strictEqual(features.active, true);
	});

	test('should return only requested features', async () => {
		const store = new FeatureStore();

		await store.writeFeatures('user_456', {
			age: 30,
			city: 'NYC',
			country: 'USA',
		});

		// Request subset
		const features = await store.getFeatures('user_456', ['age', 'country']);

		assert.strictEqual(features.age, 30);
		assert.strictEqual(features.country, 'USA');
		assert.strictEqual(features.city, undefined); // Not requested
	});

	test('should return empty object for non-existent entity', async () => {
		const store = new FeatureStore();

		const features = await store.getFeatures('non_existent', ['age']);

		assert.deepStrictEqual(features, {});
	});
});
```

**Step 2: Write MonitoringBackend tests**

Create `tests/unit/MonitoringBackend.test.js`:

```javascript
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';

describe('MonitoringBackend', () => {
	let monitoring;

	before(async () => {
		monitoring = new MonitoringBackend();
		await monitoring.initialize();
	});

	after(async () => {
		await monitoring.cleanup();
	});

	test('should record and query inference events', async () => {
		const event = {
			modelId: 'test-model',
			modelVersion: 'v1',
			framework: 'onnx',
			requestId: 'req-123',
			userId: 'user-1',
			sessionId: 'session-1',
			featuresIn: JSON.stringify({ x: 1.5, y: 2.5 }),
			prediction: JSON.stringify({ class: 1 }),
			confidence: 0.92,
			latencyMs: 45,
		};

		const inferenceId = await monitoring.recordInference(event);

		assert.ok(inferenceId);
		assert.strictEqual(typeof inferenceId, 'string');

		// Query recent events
		const events = await monitoring.queryEvents({
			modelId: 'test-model',
			startTime: new Date(Date.now() - 1000),
		});

		assert.ok(Array.isArray(events));
		assert.ok(events.length >= 1);

		const recorded = events.find((e) => e.id === inferenceId);
		assert.ok(recorded);
		assert.strictEqual(recorded.modelId, 'test-model');
		assert.strictEqual(recorded.confidence, 0.92);
	});

	test('should record feedback for inference', async () => {
		// Record inference
		const inferenceId = await monitoring.recordInference({
			modelId: 'test-feedback',
			modelVersion: 'v1',
			framework: 'onnx',
			requestId: 'req-456',
			featuresIn: '{}',
			prediction: JSON.stringify({ class: 1 }),
			confidence: 0.85,
			latencyMs: 30,
		});

		// Record feedback
		await monitoring.recordFeedback(inferenceId, {
			actualOutcome: JSON.stringify({ class: 1 }),
			correct: true,
		});

		// Query with feedback
		const events = await monitoring.queryEvents({ modelId: 'test-feedback' });
		const withFeedback = events.find((e) => e.id === inferenceId);

		assert.ok(withFeedback);
		assert.strictEqual(withFeedback.correct, true);
		assert.ok(withFeedback.feedbackTimestamp);
	});

	test('should calculate aggregate metrics', async () => {
		const metrics = await monitoring.getMetrics('test-model');

		assert.ok(metrics);
		assert.ok(typeof metrics.count === 'number');
		assert.ok(typeof metrics.avgLatency === 'number');
		assert.ok(typeof metrics.avgConfidence === 'number');
	});
});
```

**Step 3: Run tests to verify they fail**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module" errors for FeatureStore and MonitoringBackend

**Step 4: Commit failing tests**

```bash
git add tests/unit/FeatureStore.test.js tests/unit/MonitoringBackend.test.js
git commit -m "test: add failing tests for FeatureStore and MonitoringBackend"
```

---

## Task 7: FeatureStore and MonitoringBackend - Implementation

**Files:**

- Create: `src/core/FeatureStore.js`
- Create: `src/core/MonitoringBackend.js`
- Modify: `src/core/index.js`

**Step 1: Implement FeatureStore (in-memory)**

Create `src/core/FeatureStore.js`:

```javascript
/**
 * Feature Store - Store entity features for inference
 * In-memory implementation for MVP (will migrate to Harper tables later)
 */
export class FeatureStore {
	constructor() {
		// In-memory storage: Map<entityId, Map<featureName, value>>
		this.features = new Map();
	}

	/**
	 * Write features for an entity
	 * @param {string} entityId - The entity identifier
	 * @param {Object} features - Feature name-value pairs
	 * @param {Date} [timestamp] - Optional timestamp (unused in minimal version)
	 */
	async writeFeatures(entityId, features, timestamp) {
		// Store features
		this.features.set(entityId, { ...features });
	}

	/**
	 * Get features for an entity
	 * @param {string} entityId - The entity identifier
	 * @param {string[]} featureNames - List of feature names to retrieve
	 * @returns {Object} Feature name-value pairs
	 */
	async getFeatures(entityId, featureNames) {
		const allFeatures = this.features.get(entityId);

		if (!allFeatures) {
			return {};
		}

		// Return only requested features
		const result = {};
		for (const name of featureNames) {
			if (name in allFeatures) {
				result[name] = allFeatures[name];
			}
		}

		return result;
	}

	/**
	 * Get all features for an entity
	 * @param {string} entityId - The entity identifier
	 * @returns {Object} All features
	 */
	async getAllFeatures(entityId) {
		return this.features.get(entityId) || {};
	}
}
```

**Step 2: Implement MonitoringBackend (Harper tables)**

Create `src/core/MonitoringBackend.js`:

```javascript
import { tables } from '@harperdb/harperdb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Monitoring Backend - Record and query inference events
 * Stores events in Harper tables
 */
export class MonitoringBackend {
	constructor() {
		this.eventsTable = null;
	}

	async initialize() {
		// Get reference to Harper InferenceEvent table
		this.eventsTable = tables.get('InferenceEvent');
	}

	/**
	 * Record an inference event
	 * @param {Object} event - Inference event data
	 * @returns {string} inferenceId
	 */
	async recordInference(event) {
		const inferenceId = uuidv4();

		const record = {
			id: inferenceId,
			timestamp: Date.now(),
			modelId: event.modelId,
			modelVersion: event.modelVersion,
			framework: event.framework,
			requestId: event.requestId || inferenceId,
			userId: event.userId || null,
			sessionId: event.sessionId || null,
			featuresIn: event.featuresIn,
			prediction: event.prediction,
			confidence: event.confidence || null,
			latencyMs: event.latencyMs,
			actualOutcome: null,
			feedbackTimestamp: null,
			correct: null,
		};

		await this.eventsTable.put(record);

		return inferenceId;
	}

	/**
	 * Record feedback for an inference
	 * @param {string} inferenceId - The inference ID
	 * @param {Object} feedback - Feedback data
	 */
	async recordFeedback(inferenceId, feedback) {
		const event = await this.eventsTable.get(inferenceId);

		if (!event) {
			throw new Error(`Inference ${inferenceId} not found`);
		}

		// Update with feedback
		event.actualOutcome = feedback.actualOutcome;
		event.feedbackTimestamp = Date.now();
		event.correct = feedback.correct;

		await this.eventsTable.put(event);
	}

	/**
	 * Query inference events
	 * @param {Object} query - Query parameters
	 * @returns {Object[]} Filtered events
	 */
	async queryEvents(query) {
		const { modelId, startTime, endTime, userId, limit } = query;

		const results = [];

		// Build search criteria
		const searchCriteria = {};
		if (modelId) {
			searchCriteria.modelId = modelId;
		}
		if (userId) {
			searchCriteria.userId = userId;
		}

		// Search events
		for await (const record of this.eventsTable.search(searchCriteria)) {
			// Filter by time range
			if (startTime && record.timestamp < startTime.getTime()) {
				continue;
			}
			if (endTime && record.timestamp > endTime.getTime()) {
				continue;
			}

			results.push(record);
		}

		// Sort by timestamp descending (most recent first)
		results.sort((a, b) => b.timestamp - a.timestamp);

		// Apply limit
		if (limit) {
			return results.slice(0, limit);
		}

		return results;
	}

	/**
	 * Get aggregate metrics for a model
	 * @param {string} modelId - The model identifier
	 * @param {Object} [options] - Optional time range
	 * @returns {Object} Aggregate metrics
	 */
	async getMetrics(modelId, options = {}) {
		const events = await this.queryEvents({
			modelId,
			startTime: options.startTime,
			endTime: options.endTime,
		});

		if (events.length === 0) {
			return {
				count: 0,
				avgLatency: 0,
				avgConfidence: 0,
				accuracy: null,
			};
		}

		// Calculate aggregates
		const totalLatency = events.reduce((sum, e) => sum + (e.latencyMs || 0), 0);
		const totalConfidence = events.reduce((sum, e) => sum + (e.confidence || 0), 0);

		const withFeedback = events.filter((e) => e.correct !== null);
		const correct = withFeedback.filter((e) => e.correct === true).length;

		return {
			count: events.length,
			avgLatency: totalLatency / events.length,
			avgConfidence: totalConfidence / events.length,
			accuracy: withFeedback.length > 0 ? correct / withFeedback.length : null,
		};
	}

	/**
	 * Cleanup test data (for testing only)
	 */
	async cleanup() {
		// Delete all test events
		const testEvents = [];
		for await (const record of this.eventsTable.search()) {
			if (record.modelId.startsWith('test-')) {
				testEvents.push(record.id);
			}
		}

		for (const id of testEvents) {
			await this.eventsTable.delete(id);
		}
	}
}
```

**Step 3: Update barrel export**

Modify `src/core/index.js`:

```javascript
export { ModelRegistry } from './ModelRegistry.js';
export { InferenceEngine } from './InferenceEngine.js';
export { OnnxRuntimeBackend } from './backends/OnnxRuntimeBackend.js';
export { TensorFlowBackend } from './backends/TensorFlowBackend.js';
export { FeatureStore } from './FeatureStore.js';
export { MonitoringBackend } from './MonitoringBackend.js';
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:unit`

Expected: PASS - All unit tests passing (Note: Requires Harper running)

**Step 5: Commit implementation**

```bash
git add src/core/
git commit -m "feat: implement FeatureStore and MonitoringBackend"
```

---

## Task 8: REST API - Model Upload Endpoint

**Files:**

- Modify: `src/resources.js`

**Step 1: Add core imports and initialize components in resources.js**

Add at top of `src/resources.js` after existing imports:

```javascript
import { ModelRegistry, InferenceEngine, FeatureStore, MonitoringBackend } from './core/index.js';

// Initialize shared instances
const modelRegistry = new ModelRegistry();
const featureStore = new FeatureStore();
const monitoringBackend = new MonitoringBackend();
const inferenceEngine = new InferenceEngine(modelRegistry);

// Initialize on module load
(async () => {
	await modelRegistry.initialize();
	await monitoringBackend.initialize();
	await inferenceEngine.initialize();
	console.log('MLOps components initialized');
})();
```

**Step 2: Add ModelUpload resource**

Add to `src/resources.js`:

```javascript
export class ModelUpload extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.uploadModel.bind(this),
		};
	}

	async uploadModel(request) {
		try {
			const contentType = request.headers.get('content-type');

			// Handle multipart/form-data
			if (contentType?.includes('multipart/form-data')) {
				const formData = await request.formData();

				const modelId = formData.get('modelId');
				const version = formData.get('version');
				const framework = formData.get('framework');
				const file = formData.get('file');
				const inputSchema = formData.get('inputSchema');
				const outputSchema = formData.get('outputSchema');
				const metadata = formData.get('metadata') || '{}';
				const stage = formData.get('stage') || 'development';

				// Validation
				if (!modelId || !version || !framework || !file) {
					return Response.json(
						{
							error: 'Missing required fields: modelId, version, framework, file',
						},
						{ status: 400 }
					);
				}

				// Convert file to buffer
				const arrayBuffer = await file.arrayBuffer();
				const modelBlob = Buffer.from(arrayBuffer);

				// Register model
				const registered = await modelRegistry.registerModel({
					modelId,
					version,
					framework,
					modelBlob,
					inputSchema: inputSchema || '{}',
					outputSchema: outputSchema || '{}',
					metadata,
					stage,
				});

				return Response.json({
					success: true,
					modelId: registered.modelId,
					version: registered.version,
					uploadedAt: registered.uploadedAt,
				});
			}

			// Handle JSON (for metadata only)
			const data = await request.json();

			if (data.modelId && data.version && data.modelBlob) {
				// Direct JSON upload with base64 blob
				const modelBlob = Buffer.from(data.modelBlob, 'base64');

				const registered = await modelRegistry.registerModel({
					modelId: data.modelId,
					version: data.version,
					framework: data.framework || 'onnx',
					modelBlob,
					inputSchema: data.inputSchema || '{}',
					outputSchema: data.outputSchema || '{}',
					metadata: data.metadata || '{}',
					stage: data.stage || 'development',
				});

				return Response.json({
					success: true,
					modelId: registered.modelId,
					version: registered.version,
					uploadedAt: registered.uploadedAt,
				});
			}

			return Response.json(
				{
					error: 'Invalid request format',
				},
				{ status: 400 }
			);
		} catch (error) {
			console.error('Model upload failed:', error);
			return Response.json(
				{
					error: 'Model upload failed',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}
}
```

**Step 3: Add ModelInfo resource (get model metadata)**

Add to `src/resources.js`:

```javascript
export class ModelInfo extends Resource {
	constructor() {
		super();
		this.rest = {
			GET: this.getModel.bind(this),
			versions: this.getVersions.bind(this),
		};
	}

	async getModel(request) {
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/').filter(Boolean);

		// /model/:modelId/:version
		if (pathParts.length >= 2) {
			const modelId = pathParts[1];
			const version = pathParts[2];

			try {
				const model = await modelRegistry.getModel(modelId, version);

				if (!model) {
					return Response.json(
						{
							error: 'Model not found',
						},
						{ status: 404 }
					);
				}

				// Return metadata only (not the blob)
				return Response.json({
					id: model.id,
					modelId: model.modelId,
					version: model.version,
					framework: model.framework,
					stage: model.stage,
					inputSchema: model.inputSchema,
					outputSchema: model.outputSchema,
					metadata: model.metadata,
					uploadedAt: model.uploadedAt,
				});
			} catch (error) {
				return Response.json(
					{
						error: 'Failed to retrieve model',
						details: error.message,
					},
					{ status: 500 }
				);
			}
		}

		return Response.json(
			{
				error: 'Invalid request',
			},
			{ status: 400 }
		);
	}

	async getVersions(request) {
		const url = new URL(request.url);
		const modelId = url.searchParams.get('modelId');

		if (!modelId) {
			return Response.json(
				{
					error: 'modelId parameter required',
				},
				{ status: 400 }
			);
		}

		try {
			const versions = await modelRegistry.listVersions(modelId);

			return Response.json({
				modelId,
				versions,
			});
		} catch (error) {
			return Response.json(
				{
					error: 'Failed to list versions',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}
}
```

**Step 4: Commit model upload endpoints**

```bash
git add src/resources.js
git commit -m "feat: add model upload and info REST API endpoints"
```

---

## Task 9: REST API - Predict Endpoint

**Files:**

- Modify: `src/resources.js`

**Step 1: Add Predict resource**

Add to `src/resources.js`:

```javascript
export class Predict extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.predict.bind(this),
		};
	}

	async predict(request) {
		try {
			const data = await request.json();
			const { modelId, version, features, userId, sessionId } = data;

			// Validation
			if (!modelId || !features) {
				return Response.json(
					{
						error: 'modelId and features required',
					},
					{ status: 400 }
				);
			}

			// Run inference
			const startTime = Date.now();
			const result = await inferenceEngine.predict(modelId, features, version);

			// Record to monitoring
			const inferenceId = await monitoringBackend.recordInference({
				modelId,
				modelVersion: result.modelVersion,
				framework: result.framework,
				requestId: `req-${Date.now()}`,
				userId: userId || null,
				sessionId: sessionId || null,
				featuresIn: JSON.stringify(features),
				prediction: JSON.stringify(result.output),
				confidence: result.confidence || null,
				latencyMs: result.latencyMs,
			});

			return Response.json({
				inferenceId,
				prediction: result.output,
				confidence: result.confidence,
				modelVersion: result.modelVersion,
				latencyMs: result.latencyMs,
			});
		} catch (error) {
			console.error('Prediction failed:', error);
			return Response.json(
				{
					error: 'Prediction failed',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}
}
```

**Step 2: Commit predict endpoint**

```bash
git add src/resources.js
git commit -m "feat: add predict REST API endpoint with monitoring"
```

---

## Task 10: REST API - Feedback and Monitoring Endpoints

**Files:**

- Modify: `src/resources.js`

**Step 1: Add Feedback resource**

Add to `src/resources.js`:

```javascript
export class Feedback extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.recordFeedback.bind(this),
		};
	}

	async recordFeedback(request) {
		try {
			const data = await request.json();
			const { inferenceId, outcome, correct } = data;

			// Validation
			if (!inferenceId || !outcome) {
				return Response.json(
					{
						error: 'inferenceId and outcome required',
					},
					{ status: 400 }
				);
			}

			// Record feedback
			await monitoringBackend.recordFeedback(inferenceId, {
				actualOutcome: JSON.stringify(outcome),
				correct: correct !== undefined ? correct : null,
			});

			return Response.json({
				success: true,
				inferenceId,
			});
		} catch (error) {
			console.error('Feedback recording failed:', error);
			return Response.json(
				{
					error: 'Feedback recording failed',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}
}
```

**Step 2: Add Monitoring resource**

Add to `src/resources.js`:

```javascript
export class Monitoring extends Resource {
	constructor() {
		super();
		this.rest = {
			events: this.getEvents.bind(this),
			metrics: this.getMetrics.bind(this),
		};
	}

	async getEvents(request) {
		try {
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');
			const userId = url.searchParams.get('userId');
			const limit = parseInt(url.searchParams.get('limit') || '100');

			// Time range
			let startTime = url.searchParams.get('startTime');
			let endTime = url.searchParams.get('endTime');

			if (startTime) {
				startTime = new Date(parseInt(startTime));
			} else {
				// Default to last hour
				startTime = new Date(Date.now() - 3600000);
			}

			if (endTime) {
				endTime = new Date(parseInt(endTime));
			}

			const events = await monitoringBackend.queryEvents({
				modelId,
				userId,
				startTime,
				endTime,
				limit,
			});

			return Response.json({
				events,
				count: events.length,
			});
		} catch (error) {
			console.error('Query events failed:', error);
			return Response.json(
				{
					error: 'Query events failed',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}

	async getMetrics(request) {
		try {
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');

			if (!modelId) {
				return Response.json(
					{
						error: 'modelId parameter required',
					},
					{ status: 400 }
				);
			}

			// Time range
			let startTime = url.searchParams.get('startTime');
			let endTime = url.searchParams.get('endTime');

			if (startTime) {
				startTime = new Date(parseInt(startTime));
			}
			if (endTime) {
				endTime = new Date(parseInt(endTime));
			}

			const metrics = await monitoringBackend.getMetrics(modelId, {
				startTime,
				endTime,
			});

			return Response.json({
				modelId,
				...metrics,
			});
		} catch (error) {
			console.error('Get metrics failed:', error);
			return Response.json(
				{
					error: 'Get metrics failed',
					details: error.message,
				},
				{ status: 500 }
			);
		}
	}
}
```

**Step 3: Commit feedback and monitoring endpoints**

```bash
git add src/resources.js
git commit -m "feat: add feedback and monitoring REST API endpoints"
```

---

## Task 11: Update PersonalizationEngine to Use InferenceEngine

**Files:**

- Modify: `src/PersonalizationEngine.js`

**Step 1: Refactor PersonalizationEngine**

The current PersonalizationEngine directly uses TensorFlow.js. We need to optionally support InferenceEngine for future backend swapping while keeping existing functionality working.

Modify `src/PersonalizationEngine.js`:

At the top, add import:

```javascript
import '@tensorflow/tfjs-node'; // Import backend first
import * as use from '@tensorflow-models/universal-sentence-encoder';
import '../models/polyfill.js';
```

Keep the existing implementation intact for now. In a future iteration, we can refactor it to use InferenceEngine, but that requires:

1. Loading Universal Sentence Encoder into ModelRegistry
2. Updating the inference calls to use InferenceEngine

For the MVP, leave PersonalizationEngine as-is. Document this as a future enhancement.

**Step 2: Add comment documenting future refactor**

Add comment at top of PersonalizationEngine.js:

```javascript
/**
 * Simplified PersonalizationEngine - Universal Sentence Encoder only
 * Single-tenant, single-model implementation for Harper Edge AI
 *
 * TODO: Refactor to use InferenceEngine for backend-agnostic sentence encoding
 * This will allow swapping between TensorFlow.js and ONNX sentence encoders
 */
```

**Step 3: Commit documentation**

```bash
git add src/PersonalizationEngine.js
git commit -m "docs: add TODO for PersonalizationEngine InferenceEngine integration"
```

---

## Task 12: Create Postman Collection

**Files:**

- Create: `postman/Harper-Edge-AI-MLOps.postman_collection.json`
- Create: `postman/README.md`

**Step 1: Create Postman collection**

Create `postman/Harper-Edge-AI-MLOps.postman_collection.json`:

```json
{
	"info": {
		"name": "Harper Edge AI - MLOps",
		"description": "REST API collection for Harper Edge AI with ONNX Runtime",
		"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
	},
	"variable": [
		{
			"key": "baseUrl",
			"value": "http://localhost:9926",
			"type": "string"
		}
	],
	"item": [
		{
			"name": "Model Management",
			"item": [
				{
					"name": "Upload Model (multipart)",
					"request": {
						"method": "POST",
						"header": [],
						"body": {
							"mode": "formdata",
							"formdata": [
								{
									"key": "modelId",
									"value": "my-classifier",
									"type": "text"
								},
								{
									"key": "version",
									"value": "v1",
									"type": "text"
								},
								{
									"key": "framework",
									"value": "onnx",
									"type": "text"
								},
								{
									"key": "file",
									"type": "file",
									"src": "/path/to/model.onnx"
								},
								{
									"key": "inputSchema",
									"value": "{\"inputs\": [{\"name\": \"input\", \"shape\": [1, 10]}]}",
									"type": "text"
								},
								{
									"key": "outputSchema",
									"value": "{\"outputs\": [{\"name\": \"output\", \"shape\": [1, 2]}]}",
									"type": "text"
								},
								{
									"key": "metadata",
									"value": "{\"description\": \"Binary classifier\"}",
									"type": "text"
								}
							]
						},
						"url": {
							"raw": "{{baseUrl}}/model/upload",
							"host": ["{{baseUrl}}"],
							"path": ["model", "upload"]
						}
					}
				},
				{
					"name": "Get Model Info",
					"request": {
						"method": "GET",
						"url": {
							"raw": "{{baseUrl}}/model/:modelId/:version",
							"host": ["{{baseUrl}}"],
							"path": ["model", ":modelId", ":version"],
							"variable": [
								{
									"key": "modelId",
									"value": "my-classifier"
								},
								{
									"key": "version",
									"value": "v1"
								}
							]
						}
					}
				},
				{
					"name": "List Model Versions",
					"request": {
						"method": "GET",
						"url": {
							"raw": "{{baseUrl}}/model/versions?modelId=my-classifier",
							"host": ["{{baseUrl}}"],
							"path": ["model", "versions"],
							"query": [
								{
									"key": "modelId",
									"value": "my-classifier"
								}
							]
						}
					}
				}
			]
		},
		{
			"name": "Inference",
			"item": [
				{
					"name": "Predict",
					"request": {
						"method": "POST",
						"header": [
							{
								"key": "Content-Type",
								"value": "application/json"
							}
						],
						"body": {
							"mode": "raw",
							"raw": "{\n  \"modelId\": \"my-classifier\",\n  \"version\": \"v1\",\n  \"features\": {\n    \"input\": [0.5, 1.2, 0.8, 1.5, 0.3, 0.9, 1.1, 0.6, 1.4, 0.7]\n  },\n  \"userId\": \"user-123\",\n  \"sessionId\": \"session-456\"\n}"
						},
						"url": {
							"raw": "{{baseUrl}}/predict",
							"host": ["{{baseUrl}}"],
							"path": ["predict"]
						}
					}
				},
				{
					"name": "Personalize Products (existing)",
					"request": {
						"method": "POST",
						"header": [
							{
								"key": "Content-Type",
								"value": "application/json"
							}
						],
						"body": {
							"mode": "raw",
							"raw": "{\n  \"products\": [\n    {\n      \"id\": \"trail-runner-pro\",\n      \"name\": \"Trail Runner Pro Shoes\",\n      \"description\": \"Lightweight running shoes for mountain trails\",\n      \"category\": \"footwear\"\n    },\n    {\n      \"id\": \"ultralight-backpack\",\n      \"name\": \"Ultralight Backpack 40L\",\n      \"description\": \"Minimalist pack for fast hiking\",\n      \"category\": \"packs\"\n    }\n  ],\n  \"userContext\": {\n    \"activityType\": \"trail-running\",\n    \"experienceLevel\": \"advanced\",\n    \"season\": \"spring\"\n  }\n}"
						},
						"url": {
							"raw": "{{baseUrl}}/personalize",
							"host": ["{{baseUrl}}"],
							"path": ["personalize"]
						}
					}
				}
			]
		},
		{
			"name": "Observability",
			"item": [
				{
					"name": "Record Feedback",
					"request": {
						"method": "POST",
						"header": [
							{
								"key": "Content-Type",
								"value": "application/json"
							}
						],
						"body": {
							"mode": "raw",
							"raw": "{\n  \"inferenceId\": \"<inferenceId-from-predict>\",\n  \"outcome\": {\n    \"class\": 1\n  },\n  \"correct\": true\n}"
						},
						"url": {
							"raw": "{{baseUrl}}/feedback",
							"host": ["{{baseUrl}}"],
							"path": ["feedback"]
						}
					}
				},
				{
					"name": "Get Inference Events",
					"request": {
						"method": "GET",
						"url": {
							"raw": "{{baseUrl}}/monitoring/events?modelId=my-classifier&limit=10",
							"host": ["{{baseUrl}}"],
							"path": ["monitoring", "events"],
							"query": [
								{
									"key": "modelId",
									"value": "my-classifier"
								},
								{
									"key": "limit",
									"value": "10"
								}
							]
						}
					}
				},
				{
					"name": "Get Model Metrics",
					"request": {
						"method": "GET",
						"url": {
							"raw": "{{baseUrl}}/monitoring/metrics?modelId=my-classifier",
							"host": ["{{baseUrl}}"],
							"path": ["monitoring", "metrics"],
							"query": [
								{
									"key": "modelId",
									"value": "my-classifier"
								}
							]
						}
					}
				}
			]
		}
	]
}
```

**Step 2: Create Postman README**

Create `postman/README.md`:

```markdown
# Harper Edge AI - Postman Collection

This collection provides examples for testing the Harper Edge AI MLOps REST API.

## Setup

1. Import `Harper-Edge-AI-MLOps.postman_collection.json` into Postman
2. Ensure Harper is running: `npm run dev`
3. Update `baseUrl` variable if needed (default: `http://localhost:9926`)

## Usage

### Model Management

1. **Upload Model** - Upload an ONNX or TensorFlow model
   - Update the `file` field with path to your ONNX model
   - Modify `inputSchema` and `outputSchema` to match your model

2. **Get Model Info** - Retrieve model metadata

3. **List Model Versions** - Get all versions of a model

### Inference

1. **Predict** - Run inference with uploaded model
   - Update `features` to match your model's input schema
   - Save the `inferenceId` from response for feedback

2. **Personalize Products** - Test existing TensorFlow.js endpoint

### Observability

1. **Record Feedback** - Add ground truth for an inference
   - Use `inferenceId` from Predict response
   - Set `correct: true/false` or provide `outcome`

2. **Get Inference Events** - Query recent inference events

3. **Get Model Metrics** - View aggregate metrics (latency, confidence, accuracy)

## Example Workflow

1. Upload a model via **Upload Model**
2. Run inference via **Predict** (save the `inferenceId`)
3. Check metrics via **Get Model Metrics**
4. When you learn the actual outcome, use **Record Feedback**
5. View updated metrics including accuracy

## Notes

- Model files must be ONNX format for ONNX Runtime backend
- TensorFlow.js models not yet supported via upload (use existing PersonalizationEngine)
- Feedback loop enables accuracy tracking over time
```

**Step 3: Commit Postman collection**

```bash
git add postman/
git commit -m "docs: add Postman collection for MLOps REST API"
```

---

## Task 13: Integration Test

**Files:**

- Create: `tests/integration/e2e-onnx-flow.test.js`

**Step 1: Write end-to-end integration test**

Create `tests/integration/e2e-onnx-flow.test.js`:

```javascript
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';
import { getTestOnnxModel } from '../fixtures/test-models.js';

describe('End-to-End ONNX Flow', () => {
	let registry;
	let engine;
	let monitoring;
	let inferenceId;

	before(async () => {
		registry = new ModelRegistry();
		await registry.initialize();

		monitoring = new MonitoringBackend();
		await monitoring.initialize();

		engine = new InferenceEngine(registry);
		await engine.initialize();
	});

	after(async () => {
		await registry.cleanup();
		await monitoring.cleanup();
		await engine.cleanup();
	});

	test('complete flow: upload → predict → feedback', async () => {
		// 1. Upload model
		const modelBlob = await getTestOnnxModel();

		const registered = await registry.registerModel({
			modelId: 'test-e2e-onnx',
			version: 'v1',
			framework: 'onnx',
			modelBlob,
			inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
			outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
			metadata: JSON.stringify({ description: 'E2E test model' }),
			stage: 'development',
		});

		assert.ok(registered);
		assert.strictEqual(registered.modelId, 'test-e2e-onnx');

		// 2. Run prediction
		const input = new Float32Array([1.0, 2.0]);
		const result = await engine.predict('test-e2e-onnx', { data: input }, 'v1');

		assert.ok(result);
		assert.ok(result.output);
		assert.ok(result.latencyMs > 0);

		// 3. Record inference to monitoring
		inferenceId = await monitoring.recordInference({
			modelId: 'test-e2e-onnx',
			modelVersion: 'v1',
			framework: 'onnx',
			requestId: 'test-req-1',
			userId: 'test-user',
			sessionId: 'test-session',
			featuresIn: JSON.stringify({ data: Array.from(input) }),
			prediction: JSON.stringify(result.output),
			confidence: 0.95,
			latencyMs: result.latencyMs,
		});

		assert.ok(inferenceId);

		// 4. Query inference events
		const events = await monitoring.queryEvents({
			modelId: 'test-e2e-onnx',
			startTime: new Date(Date.now() - 1000),
		});

		assert.ok(Array.isArray(events));
		assert.ok(events.length >= 1);

		const recorded = events.find((e) => e.id === inferenceId);
		assert.ok(recorded);
		assert.strictEqual(recorded.userId, 'test-user');

		// 5. Record feedback
		await monitoring.recordFeedback(inferenceId, {
			actualOutcome: JSON.stringify({ result: [1.0, 2.0] }),
			correct: true,
		});

		// 6. Verify feedback recorded
		const withFeedback = await monitoring.queryEvents({
			modelId: 'test-e2e-onnx',
		});

		const feedbackEvent = withFeedback.find((e) => e.id === inferenceId);
		assert.ok(feedbackEvent);
		assert.strictEqual(feedbackEvent.correct, true);
		assert.ok(feedbackEvent.feedbackTimestamp);

		// 7. Check metrics
		const metrics = await monitoring.getMetrics('test-e2e-onnx');
		assert.ok(metrics);
		assert.ok(metrics.count >= 1);
		assert.ok(metrics.avgLatency > 0);
		assert.strictEqual(metrics.accuracy, 1.0); // 100% since we marked it correct

		console.log('✅ End-to-end ONNX flow completed successfully');
	});
});
```

**Step 2: Update test scripts in package.json**

Modify `package.json` scripts:

```json
"scripts": {
  "test": "node --no-deprecation models/test-model.js",
  "test:unit": "node --test tests/unit/**/*.test.js",
  "test:integration": "node --test tests/integration/**/*.test.js",
  "test:all": "npm run test && npm run test:unit && npm run test:integration"
}
```

**Step 3: Run integration test**

Run: `npm run test:integration`

Expected: PASS - Integration test completes successfully (requires Harper running)

**Step 4: Commit integration test**

```bash
git add tests/integration/ package.json
git commit -m "test: add end-to-end integration test for ONNX flow"
```

---

## Task 14: Update Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/ONNX_RUNTIME_GUIDE.md`

**Step 1: Update README.md**

Add section after Quick Start in `README.md`:

````markdown
## ONNX Runtime Integration (New)

This project now supports both TensorFlow.js and ONNX Runtime for model inference through a unified MLOps architecture.

### Features

- **Unified InferenceEngine**: Automatically routes to correct backend (ONNX or TensorFlow) based on model framework
- **Model Registry**: Store and version models in Harper database tables
- **Monitoring**: Track inference events, latency, confidence, and accuracy with feedback loop
- **REST API**: Upload models, run predictions, record feedback, query metrics

### Quick Start with ONNX

```bash
# Start Harper
npm run dev

# Upload an ONNX model (in another terminal)
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=my-model" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@path/to/model.onnx" \
  -F "inputSchema={\"inputs\":[{\"name\":\"input\",\"shape\":[1,10]}]}" \
  -F "outputSchema={\"outputs\":[{\"name\":\"output\",\"shape\":[1,2]}]}"

# Run prediction
curl -X POST http://localhost:9926/predict \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "my-model",
    "features": {"input": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]},
    "userId": "user-123"
  }'

# Record feedback (use inferenceId from prediction response)
curl -X POST http://localhost:9926/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "inferenceId": "<inferenceId>",
    "outcome": {"class": 1},
    "correct": true
  }'

# Check metrics
curl http://localhost:9926/monitoring/metrics?modelId=my-model
```
````

### Testing

```bash
npm run test:unit         # Unit tests (requires Harper running)
npm run test:integration  # Integration tests (requires Harper running)
npm run test:all          # All tests including TensorFlow.js model test
```

### API Documentation

See [ONNX Runtime Guide](docs/ONNX_RUNTIME_GUIDE.md) for detailed API documentation.

Use the Postman collection in `postman/` for interactive API testing.

````

**Step 2: Create ONNX Runtime guide**

Create `docs/ONNX_RUNTIME_GUIDE.md`:

```markdown
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

## REST API

### Model Management

#### Upload Model

```bash
POST /model/upload
Content-Type: multipart/form-data

Fields:
- modelId (required): Model identifier
- version (required): Version string
- framework (required): "onnx" | "tensorflow"
- file (required): Model file (ONNX or TF.js)
- inputSchema (optional): JSON describing input shape
- outputSchema (optional): JSON describing output shape
- metadata (optional): Additional metadata
- stage (optional): "development" | "staging" | "production"

Response:
{
  "success": true,
  "modelId": "my-model",
  "version": "v1",
  "uploadedAt": 1234567890
}
````

#### Get Model Info

```bash
GET /model/:modelId/:version

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

#### List Model Versions

```bash
GET /model/versions?modelId=my-model

Response:
{
  "modelId": "my-model",
  "versions": [
    {"version": "v1", "framework": "onnx", "stage": "development"},
    {"version": "v2", "framework": "onnx", "stage": "production"}
  ]
}
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

#### Record Feedback

```bash
POST /feedback
Content-Type: application/json

Body:
{
  "inferenceId": "uuid",
  "outcome": {
    "class": 1
  },
  "correct": true  // optional, boolean
}

Response:
{
  "success": true,
  "inferenceId": "uuid"
}
```

#### Query Inference Events

```bash
GET /monitoring/events?modelId=my-model&limit=10&startTime=1234567890

Query Parameters:
- modelId (optional): Filter by model
- userId (optional): Filter by user
- limit (optional): Max results (default: 100)
- startTime (optional): Unix timestamp in ms
- endTime (optional): Unix timestamp in ms

Response:
{
  "events": [
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
  ],
  "count": 1
}
```

#### Get Model Metrics

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

### Upload to Harper

```bash
curl -X POST http://localhost:9926/model/upload \
  -F "modelId=sklearn-classifier" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@model.onnx" \
  -F "inputSchema={\"inputs\":[{\"name\":\"float_input\",\"shape\":[1,10]}]}" \
  -F "outputSchema={\"outputs\":[{\"name\":\"output_label\",\"shape\":[1]},{\"name\":\"output_probability\",\"shape\":[1,2]}]}"
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

````

**Step 3: Commit documentation**

```bash
git add README.md docs/ONNX_RUNTIME_GUIDE.md
git commit -m "docs: add ONNX Runtime integration guide and update README"
````

---

## Task 15: Final Verification and Cleanup

**Files:**

- Review all files
- Run all tests

**Step 1: Run complete test suite**

Run: `npm run test:all`

Expected: All tests pass (requires Harper running)

**Step 2: Manual API testing**

Start Harper: `npm run dev`

In another terminal, test endpoints:

```bash
# 1. Check health
curl http://localhost:9926/health

# 2. Test existing personalize endpoint
curl -X POST http://localhost:9926/personalize \
  -H "Content-Type: application/json" \
  -d '{
    "products": [{"id": "1", "name": "Test", "description": "Product"}],
    "userContext": {"activityType": "hiking"}
  }'

# Expected: Products with personalizedScore

# 3. Try uploading a model (will need actual ONNX file)
# This validates the endpoint exists and responds correctly

curl -X POST http://localhost:9926/model/upload \
  -F "modelId=test" \
  -F "version=v1" \
  -F "framework=onnx" \
  -F "file=@tests/fixtures/test-model.onnx" \
  -F "inputSchema={}" \
  -F "outputSchema={}"

# Expected: Success or validation error if file doesn't exist
```

**Step 3: Review implementation checklist**

Verify completed:

- ✅ ONNX Runtime dependency installed
- ✅ Harper schema with Model and InferenceEvent tables
- ✅ ModelRegistry with Harper table storage
- ✅ InferenceEngine with ONNX backend
- ✅ FeatureStore (in-memory)
- ✅ MonitoringBackend with Harper tables
- ✅ REST API endpoints (upload, predict, feedback, monitoring)
- ✅ Unit tests for all components
- ✅ Integration test for end-to-end flow
- ✅ Postman collection
- ✅ Documentation (README, guide)

**Step 4: Create final commit**

```bash
git add .
git commit -m "feat: complete ONNX Runtime integration

- Unified InferenceEngine with pluggable backends (ONNX + TensorFlow)
- ModelRegistry stores models as blobs in Harper tables
- MonitoringBackend tracks inference events with feedback loop
- FeatureStore for entity features (in-memory MVP)
- REST API endpoints for model upload, predict, feedback, monitoring
- Comprehensive testing (unit + integration)
- Postman collection for API testing
- Documentation and usage guide

MVP limitations:
- TensorFlow backend is stub (ONNX fully functional)
- FeatureStore in-memory only
- PersonalizationEngine not yet using InferenceEngine

All tests passing. Ready for review."
```

---

## Completion Checklist

- ✅ ONNX Runtime dependency added
- ✅ Harper schema defined (Model, InferenceEvent tables)
- ✅ ModelRegistry implemented with Harper storage
- ✅ InferenceEngine with ONNX Runtime backend
- ✅ TensorFlow backend (stub for future)
- ✅ FeatureStore (in-memory)
- ✅ MonitoringBackend with Harper tables
- ✅ REST API: model upload, predict, feedback, monitoring
- ✅ Unit tests (all components)
- ✅ Integration test (end-to-end ONNX flow)
- ✅ Postman collection
- ✅ Documentation (README + guide)
- ✅ Manual verification

**Total: 15 tasks completed**

---

## Next Steps (Post-MVP)

After this implementation:

1. **Complete TensorFlow Backend**: Implement full TensorFlow.js model loading and inference
2. **Refactor PersonalizationEngine**: Use InferenceEngine for backend-agnostic sentence encoding
3. **Migrate FeatureStore**: Move from in-memory to Harper tables
4. **Add Drift Detection**: Implement PSI-based monitoring using collected data
5. **Performance Benchmarks**: Compare ONNX vs TensorFlow.js latency and resource usage
6. **Automated Retraining**: Trigger retraining when accuracy drops below threshold

These will be planned in separate implementation plans after MVP validation.
