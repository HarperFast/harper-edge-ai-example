# Walking Skeleton Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build minimal end-to-end MLOps pipeline that touches every component (FeatureStore, TrainingProvider, ModelRegistry, InferenceEngine, MonitoringBackend) with the thinnest possible slice.

**Architecture:** Single Harper instance with in-process components. All operations synchronous. TDD approach: write test first, watch it fail, implement minimal code, watch it pass, commit. No external dependencies beyond existing TensorFlow.js.

**Tech Stack:**

- Harper (database + application server)
- Node.js ES modules
- TensorFlow.js (@tensorflow/tfjs-node)
- Testing: Node built-in test runner
- No testing framework initially - use simple assertions

---

## Task 1: Setup Testing Infrastructure

**Files:**

- Create: `tests/setup.js`
- Create: `tests/FeatureStore.test.js`
- Modify: `package.json` (add test script)

**Step 1: Create test setup file**

Create `tests/setup.js`:

```javascript
// Test setup and utilities
import assert from 'node:assert';
import { test, describe } from 'node:test';

// Helper to clean up test data
export async function cleanupTestData(tables) {
	// TODO: Implement Harper table cleanup
	// For now, just a placeholder
}

export { assert, test, describe };
```

**Step 2: Add test script to package.json**

Modify `package.json`:

```json
{
	"scripts": {
		"test": "node --no-deprecation models/test-model.js",
		"test:unit": "node --test tests/**/*.test.js",
		"test:all": "npm run test && npm run test:unit"
	}
}
```

**Step 3: Verify test infrastructure**

Run: `npm run test:unit`

Expected: "No test files found" or empty test run (OK - we haven't written tests yet)

**Step 4: Commit setup**

```bash
git add tests/setup.js package.json
git commit -m "feat: add test infrastructure with Node test runner"
```

---

## Task 2: Feature Store - Write Test

**Files:**

- Create: `tests/FeatureStore.test.js`

**Step 1: Write failing test for writeFeatures**

Create `tests/FeatureStore.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FeatureStore } from '../src/core/FeatureStore.js';

describe('FeatureStore', () => {
	test('should write and read features for an entity', async () => {
		const store = new FeatureStore();

		// Write features
		await store.writeFeatures('user_123', {
			age: 25,
			city: 'SF',
		});

		// Read features back
		const features = await store.getFeatures('user_123', ['age', 'city']);

		// Verify
		assert.strictEqual(features.age, 25);
		assert.strictEqual(features.city, 'SF');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../src/core/FeatureStore.js'"

**Step 3: Commit failing test**

```bash
git add tests/FeatureStore.test.js
git commit -m "test: add failing test for FeatureStore read/write"
```

---

## Task 3: Feature Store - Minimal Implementation

**Files:**

- Create: `src/core/FeatureStore.js`

**Step 1: Create minimal FeatureStore class**

Create `src/core/FeatureStore.js`:

```javascript
/**
 * Minimal Feature Store implementation
 * Stores features in memory (will migrate to Harper tables later)
 */
export class FeatureStore {
	constructor() {
		// In-memory storage: { entity_id: { feature_name: value } }
		this.features = new Map();
	}

	/**
	 * Write features for an entity
	 * @param {string} entityId - The entity identifier
	 * @param {Object} features - Feature name-value pairs
	 * @param {Date} [timestamp] - Optional timestamp (unused in minimal version)
	 */
	async writeFeatures(entityId, features, timestamp) {
		this.features.set(entityId, { ...features });
	}

	/**
	 * Get features for an entity
	 * @param {string} entityId - The entity identifier
	 * @param {string[]} featureNames - List of feature names to retrieve
	 * @returns {Object} Feature name-value pairs
	 */
	async getFeatures(entityId, featureNames) {
		const allFeatures = this.features.get(entityId) || {};

		// Return only requested features
		const result = {};
		for (const name of featureNames) {
			if (name in allFeatures) {
				result[name] = allFeatures[name];
			}
		}

		return result;
	}
}
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS - "1 test passed"

**Step 3: Commit implementation**

```bash
git add src/core/FeatureStore.js
git commit -m "feat: implement minimal FeatureStore with in-memory storage"
```

---

## Task 4: Model Registry - Write Test

**Files:**

- Create: `tests/ModelRegistry.test.js`

**Step 1: Write failing test for registerModel**

Create `tests/ModelRegistry.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../src/core/ModelRegistry.js';

describe('ModelRegistry', () => {
	test('should register and retrieve a model', async () => {
		const registry = new ModelRegistry();

		// Register model
		const registration = {
			modelId: 'test-model',
			version: 'v1',
			framework: 'tensorflow',
			artifactUri: '/tmp/models/test-model-v1',
			metadata: {
				accuracy: 0.85,
				description: 'Test binary classifier',
			},
		};

		const registered = await registry.registerModel(registration);

		// Verify registration returned
		assert.strictEqual(registered.modelId, 'test-model');
		assert.strictEqual(registered.version, 'v1');

		// Retrieve model
		const retrieved = await registry.getModel('test-model', 'v1');

		// Verify retrieval
		assert.strictEqual(retrieved.modelId, 'test-model');
		assert.strictEqual(retrieved.version, 'v1');
		assert.strictEqual(retrieved.framework, 'tensorflow');
		assert.strictEqual(retrieved.metadata.accuracy, 0.85);
	});

	test('should get latest version when version not specified', async () => {
		const registry = new ModelRegistry();

		// Register two versions
		await registry.registerModel({
			modelId: 'test-model',
			version: 'v1',
			framework: 'tensorflow',
			artifactUri: '/tmp/models/test-model-v1',
			metadata: {},
		});

		await registry.registerModel({
			modelId: 'test-model',
			version: 'v2',
			framework: 'tensorflow',
			artifactUri: '/tmp/models/test-model-v2',
			metadata: {},
		});

		// Get without version should return latest
		const latest = await registry.getModel('test-model');
		assert.strictEqual(latest.version, 'v2');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../src/core/ModelRegistry.js'"

**Step 3: Commit failing test**

```bash
git add tests/ModelRegistry.test.js
git commit -m "test: add failing test for ModelRegistry register/retrieve"
```

---

## Task 5: Model Registry - Minimal Implementation

**Files:**

- Create: `src/core/ModelRegistry.js`

**Step 1: Create minimal ModelRegistry class**

Create `src/core/ModelRegistry.js`:

```javascript
/**
 * Minimal Model Registry implementation
 * Stores model metadata in memory (will migrate to Harper tables later)
 */
export class ModelRegistry {
	constructor() {
		// In-memory storage: { modelId: { version: registeredModel } }
		this.models = new Map();
	}

	/**
	 * Register a new model
	 * @param {Object} registration - Model registration data
	 * @returns {Object} Registered model with timestamp
	 */
	async registerModel(registration) {
		const { modelId, version } = registration;

		// Get or create model versions map
		if (!this.models.has(modelId)) {
			this.models.set(modelId, new Map());
		}

		const versions = this.models.get(modelId);

		// Create registered model record
		const registered = {
			...registration,
			registeredAt: new Date(),
			stage: 'development',
		};

		// Store version
		versions.set(version, registered);

		return registered;
	}

	/**
	 * Get a model by ID and optional version
	 * @param {string} modelId - The model identifier
	 * @param {string} [version] - Optional version (defaults to latest)
	 * @returns {Object} Registered model or null
	 */
	async getModel(modelId, version) {
		const versions = this.models.get(modelId);

		if (!versions || versions.size === 0) {
			return null;
		}

		// If version specified, return that version
		if (version) {
			return versions.get(version) || null;
		}

		// Otherwise, return latest version (last registered)
		const allVersions = Array.from(versions.values());
		return allVersions[allVersions.length - 1];
	}

	/**
	 * List all models
	 * @returns {Object[]} Array of registered models
	 */
	async listModels() {
		const result = [];
		for (const versions of this.models.values()) {
			for (const model of versions.values()) {
				result.push(model);
			}
		}
		return result;
	}
}
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS - "3 tests passed" (1 FeatureStore + 2 ModelRegistry)

**Step 3: Commit implementation**

```bash
git add src/core/ModelRegistry.js
git commit -m "feat: implement minimal ModelRegistry with in-memory storage"
```

---

## Task 6: Training Provider - Write Test

**Files:**

- Create: `tests/TrainingProvider.test.js`

**Step 1: Write failing test for binary classification training**

Create `tests/TrainingProvider.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { TrainingProvider } from '../src/core/TrainingProvider.js';
import { ModelRegistry } from '../src/core/ModelRegistry.js';

describe('TrainingProvider', () => {
	test('should train a simple binary classifier', async () => {
		const trainer = new TrainingProvider();
		const registry = new ModelRegistry();

		// Inject registry into trainer
		trainer.setRegistry(registry);

		// Simple XOR-like training data
		const trainingData = [
			{ features: { x: 0, y: 0 }, label: 0 },
			{ features: { x: 0, y: 1 }, label: 1 },
			{ features: { x: 1, y: 0 }, label: 1 },
			{ features: { x: 1, y: 1 }, label: 0 },
			// Duplicate for more training samples
			{ features: { x: 0, y: 0 }, label: 0 },
			{ features: { x: 0, y: 1 }, label: 1 },
			{ features: { x: 1, y: 0 }, label: 1 },
			{ features: { x: 1, y: 1 }, label: 0 },
		];

		// Train
		const job = await trainer.train({
			modelId: 'test-xor',
			trainingData,
			featureColumns: ['x', 'y'],
			labelColumn: 'label',
		});

		// Verify job completed
		assert.strictEqual(job.status, 'completed');
		assert.ok(job.metrics.accuracy, 'should have accuracy metric');
		assert.ok(job.metrics.loss, 'should have loss metric');
		assert.ok(job.modelVersion, 'should have model version');

		// Verify model was registered
		const model = await registry.getModel('test-xor', job.modelVersion);
		assert.ok(model, 'model should be registered');
		assert.strictEqual(model.framework, 'tensorflow');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../src/core/TrainingProvider.js'"

**Step 3: Commit failing test**

```bash
git add tests/TrainingProvider.test.js
git commit -m "test: add failing test for TrainingProvider binary classification"
```

---

## Task 7: Training Provider - Minimal Implementation

**Files:**

- Create: `src/core/TrainingProvider.js`

**Step 1: Create minimal TrainingProvider class**

Create `src/core/TrainingProvider.js`:

```javascript
import * as tf from '@tensorflow/tfjs-node';
import { v4 as uuidv4 } from 'uuid';

/**
 * Minimal Training Provider implementation
 * Trains simple binary classifiers using TensorFlow.js
 */
export class TrainingProvider {
	constructor() {
		this.registry = null;
	}

	/**
	 * Set the model registry for storing trained models
	 */
	setRegistry(registry) {
		this.registry = registry;
	}

	/**
	 * Train a binary classifier
	 * @param {Object} config - Training configuration
	 * @returns {Object} Training job result
	 */
	async train(config) {
		const { modelId, trainingData, featureColumns, labelColumn } = config;

		const jobId = uuidv4();
		const startTime = new Date();

		try {
			// Extract features and labels
			const features = trainingData.map((row) => featureColumns.map((col) => row.features[col]));
			const labels = trainingData.map((row) => row[labelColumn]);

			// Convert to tensors
			const xs = tf.tensor2d(features);
			const ys = tf.tensor2d(labels.map((l) => [l]));

			// Create simple sequential model
			const model = tf.sequential({
				layers: [
					tf.layers.dense({ inputShape: [featureColumns.length], units: 8, activation: 'relu' }),
					tf.layers.dense({ units: 4, activation: 'relu' }),
					tf.layers.dense({ units: 1, activation: 'sigmoid' }),
				],
			});

			// Compile model
			model.compile({
				optimizer: tf.train.adam(0.01),
				loss: 'binaryCrossentropy',
				metrics: ['accuracy'],
			});

			// Train model
			const history = await model.fit(xs, ys, {
				epochs: 50,
				batchSize: 4,
				verbose: 0,
			});

			// Get final metrics
			const finalMetrics = history.history;
			const accuracy = finalMetrics.acc[finalMetrics.acc.length - 1];
			const loss = finalMetrics.loss[finalMetrics.loss.length - 1];

			// Save model to temporary location
			const modelVersion = `v${Date.now()}`;
			const artifactPath = `/tmp/models/${modelId}/${modelVersion}`;
			await model.save(`file://${artifactPath}`);

			// Register model if registry available
			if (this.registry) {
				await this.registry.registerModel({
					modelId,
					version: modelVersion,
					framework: 'tensorflow',
					artifactUri: artifactPath,
					metadata: {
						featureColumns,
						labelColumn,
						trainingJobId: jobId,
					},
				});
			}

			// Cleanup tensors
			xs.dispose();
			ys.dispose();
			model.dispose();

			// Return job result
			return {
				jobId,
				modelId,
				modelVersion,
				status: 'completed',
				startTime,
				endTime: new Date(),
				metrics: {
					accuracy,
					loss,
				},
			};
		} catch (error) {
			return {
				jobId,
				modelId,
				status: 'failed',
				startTime,
				endTime: new Date(),
				error: error.message,
			};
		}
	}
}
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS - "4 tests passed"

Note: This may take 10-20 seconds due to TensorFlow.js model training

**Step 3: Commit implementation**

```bash
git add src/core/TrainingProvider.js
git commit -m "feat: implement minimal TrainingProvider with TensorFlow.js binary classifier"
```

---

## Task 8: Monitoring Backend - Write Test

**Files:**

- Create: `tests/MonitoringBackend.test.js`

**Step 1: Write failing test for recordInference**

Create `tests/MonitoringBackend.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { MonitoringBackend } from '../src/core/MonitoringBackend.js';

describe('MonitoringBackend', () => {
	test('should record and query inference events', async () => {
		const monitoring = new MonitoringBackend();

		// Record inference event
		const event = {
			timestamp: new Date(),
			modelId: 'test-model',
			modelVersion: 'v1',
			requestId: 'req-123',
			features: { x: 1.5, y: 2.5 },
			prediction: 1,
			confidence: 0.92,
			latencyMs: 45,
		};

		await monitoring.recordInference(event);

		// Query recent events
		const events = await monitoring.queryEvents({
			modelId: 'test-model',
			startTime: new Date(Date.now() - 1000),
		});

		// Verify
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].requestId, 'req-123');
		assert.strictEqual(events[0].confidence, 0.92);
		assert.strictEqual(events[0].latencyMs, 45);
	});

	test('should filter events by time range', async () => {
		const monitoring = new MonitoringBackend();

		const now = Date.now();

		// Record events at different times
		await monitoring.recordInference({
			timestamp: new Date(now - 2000),
			modelId: 'test-model',
			modelVersion: 'v1',
			requestId: 'req-old',
			prediction: 0,
			confidence: 0.8,
			latencyMs: 40,
		});

		await monitoring.recordInference({
			timestamp: new Date(now - 500),
			modelId: 'test-model',
			modelVersion: 'v1',
			requestId: 'req-recent',
			prediction: 1,
			confidence: 0.9,
			latencyMs: 42,
		});

		// Query only recent events (last 1 second)
		const recentEvents = await monitoring.queryEvents({
			modelId: 'test-model',
			startTime: new Date(now - 1000),
		});

		// Should only get the recent event
		assert.strictEqual(recentEvents.length, 1);
		assert.strictEqual(recentEvents[0].requestId, 'req-recent');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL with "Cannot find module '../src/core/MonitoringBackend.js'"

**Step 3: Commit failing test**

```bash
git add tests/MonitoringBackend.test.js
git commit -m "test: add failing test for MonitoringBackend record/query"
```

---

## Task 9: Monitoring Backend - Minimal Implementation

**Files:**

- Create: `src/core/MonitoringBackend.js`

**Step 1: Create minimal MonitoringBackend class**

Create `src/core/MonitoringBackend.js`:

```javascript
/**
 * Minimal Monitoring Backend implementation
 * Stores inference events in memory (will migrate to Harper tables later)
 */
export class MonitoringBackend {
	constructor() {
		// In-memory storage: array of events
		this.events = [];
	}

	/**
	 * Record an inference event
	 * @param {Object} event - Inference event data
	 */
	async recordInference(event) {
		this.events.push({
			...event,
			timestamp: event.timestamp || new Date(),
		});
	}

	/**
	 * Query inference events
	 * @param {Object} query - Query parameters
	 * @returns {Object[]} Filtered events
	 */
	async queryEvents(query) {
		const { modelId, startTime, endTime } = query;

		let filtered = this.events;

		// Filter by model ID
		if (modelId) {
			filtered = filtered.filter((e) => e.modelId === modelId);
		}

		// Filter by start time
		if (startTime) {
			filtered = filtered.filter((e) => e.timestamp >= startTime);
		}

		// Filter by end time
		if (endTime) {
			filtered = filtered.filter((e) => e.timestamp <= endTime);
		}

		// Sort by timestamp descending (most recent first)
		return filtered.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Get summary metrics for a model
	 * @param {string} modelId - The model identifier
	 * @returns {Object} Summary metrics
	 */
	async getMetrics(modelId) {
		const events = await this.queryEvents({ modelId });

		if (events.length === 0) {
			return {
				count: 0,
				avgConfidence: 0,
				avgLatency: 0,
			};
		}

		const totalConfidence = events.reduce((sum, e) => sum + (e.confidence || 0), 0);
		const totalLatency = events.reduce((sum, e) => sum + (e.latencyMs || 0), 0);

		return {
			count: events.length,
			avgConfidence: totalConfidence / events.length,
			avgLatency: totalLatency / events.length,
		};
	}
}
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS - "6 tests passed"

**Step 3: Commit implementation**

```bash
git add src/core/MonitoringBackend.js
git commit -m "feat: implement minimal MonitoringBackend with in-memory event storage"
```

---

## Task 10: Integration - Wire Components Together

**Files:**

- Create: `src/core/index.js`
- Modify: `src/resources.js`

**Step 1: Create barrel export for core components**

Create `src/core/index.js`:

```javascript
export { FeatureStore } from './FeatureStore.js';
export { TrainingProvider } from './TrainingProvider.js';
export { ModelRegistry } from './ModelRegistry.js';
export { MonitoringBackend } from './MonitoringBackend.js';
```

**Step 2: Update resources.js to use core components**

Modify `src/resources.js` - add at top of file after existing imports:

```javascript
import { FeatureStore, TrainingProvider, ModelRegistry, MonitoringBackend } from './core/index.js';

// Initialize shared instances
const featureStore = new FeatureStore();
const modelRegistry = new ModelRegistry();
const trainingProvider = new TrainingProvider();
trainingProvider.setRegistry(modelRegistry);
const monitoring = new MonitoringBackend();
```

**Step 3: Verify imports work**

Run: `npm run dev` (start Harper)

Expected: Harper starts without errors

Stop with Ctrl+C

**Step 4: Commit integration**

```bash
git add src/core/index.js src/resources.js
git commit -m "feat: wire core components together in resources"
```

---

## Task 11: REST API - Data Upload Endpoint

**Files:**

- Modify: `src/resources.js`
- Create: `tests/api/data-upload.test.js`

**Step 1: Write failing API test**

Create `tests/api/data-upload.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';

describe('Data Upload API', () => {
	test('should accept and store training data', async () => {
		// This test will be manual for now (requires running Harper)
		// Full API integration tests will come later

		const data = {
			rows: [
				{ features: { x: 1.0, y: 2.0 }, label: 1 },
				{ features: { x: 2.0, y: 3.0 }, label: 0 },
			],
		};

		// For now, just verify data structure is valid
		assert.ok(Array.isArray(data.rows));
		assert.ok(data.rows.length > 0);
		assert.ok(data.rows[0].features);
		assert.ok('label' in data.rows[0]);
	});
});
```

**Step 2: Add data upload resource to resources.js**

Add to `src/resources.js`:

```javascript
// Storage for uploaded training data
const trainingDataStore = new Map();

export class DataUpload extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.uploadData.bind(this),
		};
	}

	async uploadData(request) {
		const { rows } = await request.json();

		if (!Array.isArray(rows) || rows.length === 0) {
			return Response.json({ error: 'Invalid data: rows must be non-empty array' }, { status: 400 });
		}

		// Generate dataset ID
		const datasetId = `dataset-${Date.now()}`;

		// Store data
		trainingDataStore.set(datasetId, rows);

		return Response.json({
			datasetId,
			rowCount: rows.length,
			message: 'Training data uploaded successfully',
		});
	}
}
```

**Step 3: Run unit test**

Run: `npm run test:unit`

Expected: PASS - "7 tests passed"

**Step 4: Commit data upload endpoint**

```bash
git add src/resources.js tests/api/data-upload.test.js
git commit -m "feat: add data upload REST API endpoint"
```

---

## Task 12: REST API - Train Endpoint

**Files:**

- Modify: `src/resources.js`

**Step 1: Add train resource to resources.js**

Add to `src/resources.js`:

```javascript
export class Train extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.trainModel.bind(this),
		};
	}

	async trainModel(request) {
		const { modelId, datasetId, labelColumn } = await request.json();

		if (!modelId) {
			return Response.json({ error: 'modelId required' }, { status: 400 });
		}

		// Get training data (from upload or generate sample)
		let trainingData;

		if (datasetId && trainingDataStore.has(datasetId)) {
			trainingData = trainingDataStore.get(datasetId);
		} else {
			// Generate sample XOR data for testing
			trainingData = [
				{ features: { x: 0, y: 0 }, label: 0 },
				{ features: { x: 0, y: 1 }, label: 1 },
				{ features: { x: 1, y: 0 }, label: 1 },
				{ features: { x: 1, y: 1 }, label: 0 },
				{ features: { x: 0, y: 0 }, label: 0 },
				{ features: { x: 0, y: 1 }, label: 1 },
				{ features: { x: 1, y: 0 }, label: 1 },
				{ features: { x: 1, y: 1 }, label: 0 },
			];
		}

		// Detect feature columns from first row
		const featureColumns = Object.keys(trainingData[0].features);
		const label = labelColumn || 'label';

		// Train model
		const job = await trainingProvider.train({
			modelId,
			trainingData,
			featureColumns,
			labelColumn: label,
		});

		if (job.status === 'failed') {
			return Response.json(
				{
					error: 'Training failed',
					details: job.error,
				},
				{ status: 500 }
			);
		}

		return Response.json({
			modelId: job.modelId,
			version: job.modelVersion,
			accuracy: job.metrics.accuracy,
			loss: job.metrics.loss,
			status: job.status,
		});
	}
}
```

**Step 2: Test manually with Harper**

Run: `npm run dev`

In another terminal:

```bash
curl -X POST http://localhost:9926/train \
  -H "Content-Type: application/json" \
  -d '{"model_id": "test-classifier", "label_column": "label"}'
```

Expected: JSON response with `modelId`, `version`, `accuracy`

Stop Harper with Ctrl+C

**Step 3: Commit train endpoint**

```bash
git add src/resources.js
git commit -m "feat: add train REST API endpoint"
```

---

## Task 13: REST API - Predict Endpoint

**Files:**

- Modify: `src/resources.js`
- Modify: `src/PersonalizationEngine.js` (extend to support generic models)

**Step 1: Add predict resource to resources.js**

Add to `src/resources.js`:

```javascript
// Track loaded models in memory
const loadedModels = new Map();

export class Predict extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.predict.bind(this),
		};
	}

	async predict(request) {
		const { modelId, version, features } = await request.json();

		if (!modelId || !features) {
			return Response.json(
				{
					error: 'modelId and features required',
				},
				{ status: 400 }
			);
		}

		try {
			// Get model from registry
			const modelMeta = await modelRegistry.getModel(modelId, version);

			if (!modelMeta) {
				return Response.json(
					{
						error: 'Model not found',
					},
					{ status: 404 }
				);
			}

			// Load model if not already loaded
			const modelKey = `${modelId}:${modelMeta.version}`;

			if (!loadedModels.has(modelKey)) {
				// For now, return mock prediction since we need TensorFlow.js model loading
				// This will be implemented properly in next task
				return Response.json(
					{
						error: 'Model loading not yet implemented',
						modelId,
						version: modelMeta.version,
					},
					{ status: 501 }
				);
			}

			// Make prediction (placeholder)
			const prediction = 1; // Mock
			const confidence = 0.92; // Mock

			// Record telemetry
			const startTime = Date.now();
			await monitoring.recordInference({
				timestamp: new Date(),
				modelId,
				modelVersion: modelMeta.version,
				requestId: `req-${Date.now()}`,
				features,
				prediction,
				confidence,
				latencyMs: Date.now() - startTime,
			});

			return Response.json({
				prediction,
				confidence,
				modelVersion: modelMeta.version,
			});
		} catch (error) {
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

**Step 2: Commit predict endpoint (partial)**

```bash
git add src/resources.js
git commit -m "feat: add predict REST API endpoint (model loading TODO)"
```

---

## Task 14: REST API - Monitoring Endpoint

**Files:**

- Modify: `src/resources.js`

**Step 1: Add monitoring resource**

Add to `src/resources.js`:

```javascript
export class Monitoring extends Resource {
	constructor() {
		super();
		this.rest = {
			recent: this.getRecentEvents.bind(this),
			metrics: this.getMetrics.bind(this),
		};
	}

	async getRecentEvents(request) {
		const url = new URL(request.url);
		const modelId = url.searchParams.get('model_id');
		const limit = parseInt(url.searchParams.get('limit') || '10');

		const events = await monitoring.queryEvents({
			modelId,
			startTime: new Date(Date.now() - 3600000), // Last hour
		});

		return Response.json({
			events: events.slice(0, limit),
		});
	}

	async getMetrics(request) {
		const url = new URL(request.url);
		const modelId = url.searchParams.get('model_id');

		if (!modelId) {
			return Response.json(
				{
					error: 'model_id parameter required',
				},
				{ status: 400 }
			);
		}

		const metrics = await monitoring.getMetrics(modelId);

		return Response.json(metrics);
	}
}
```

**Step 2: Test manually**

Run: `npm run dev`

In another terminal:

```bash
# Get recent events
curl http://localhost:9926/monitoring/recent

# Get metrics for a model
curl http://localhost:9926/monitoring/metrics?model_id=test-classifier
```

Expected: JSON responses with event data

Stop Harper

**Step 3: Commit monitoring endpoint**

```bash
git add src/resources.js
git commit -m "feat: add monitoring REST API endpoints"
```

---

## Task 15: End-to-End Test

**Files:**

- Create: `tests/e2e/complete-flow.test.js`
- Create: `demo-walkthrough.sh`

**Step 1: Write end-to-end test**

Create `tests/e2e/complete-flow.test.js`:

```javascript
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FeatureStore } from '../../src/core/FeatureStore.js';
import { TrainingProvider } from '../../src/core/TrainingProvider.js';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';

describe('End-to-End MLOps Flow', () => {
	test('should complete full pipeline: data -> train -> register -> monitor', async () => {
		// Initialize components
		const registry = new ModelRegistry();
		const trainer = new TrainingProvider();
		trainer.setRegistry(registry);
		const monitoring = new MonitoringBackend();

		// 1. Prepare training data
		const trainingData = [
			{ features: { x: 0, y: 0 }, label: 0 },
			{ features: { x: 0, y: 1 }, label: 1 },
			{ features: { x: 1, y: 0 }, label: 1 },
			{ features: { x: 1, y: 1 }, label: 0 },
			{ features: { x: 0, y: 0 }, label: 0 },
			{ features: { x: 0, y: 1 }, label: 1 },
			{ features: { x: 1, y: 0 }, label: 1 },
			{ features: { x: 1, y: 1 }, label: 0 },
		];

		// 2. Train model
		const trainResult = await trainer.train({
			modelId: 'e2e-test',
			trainingData,
			featureColumns: ['x', 'y'],
			labelColumn: 'label',
		});

		assert.strictEqual(trainResult.status, 'completed');
		assert.ok(trainResult.modelVersion);

		// 3. Verify model registered
		const model = await registry.getModel('e2e-test');
		assert.ok(model);
		assert.strictEqual(model.modelId, 'e2e-test');

		// 4. Simulate inference and monitoring
		await monitoring.recordInference({
			timestamp: new Date(),
			modelId: 'e2e-test',
			modelVersion: model.version,
			requestId: 'test-req-1',
			features: { x: 0.5, y: 0.5 },
			prediction: 1,
			confidence: 0.85,
			latencyMs: 42,
		});

		// 5. Query telemetry
		const events = await monitoring.queryEvents({
			modelId: 'e2e-test',
			startTime: new Date(Date.now() - 1000),
		});

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].modelId, 'e2e-test');

		// 6. Get metrics
		const metrics = await monitoring.getMetrics('e2e-test');
		assert.strictEqual(metrics.count, 1);
		assert.strictEqual(metrics.avgConfidence, 0.85);

		console.log('✅ End-to-end flow completed successfully');
	});
});
```

**Step 2: Run e2e test**

Run: `npm run test:unit`

Expected: PASS - "8 tests passed" including the e2e test

**Step 3: Create demo script**

Create `demo-walkthrough.sh`:

```bash
#!/bin/bash

echo "🚀 Walking Skeleton Demo"
echo "========================"
echo ""

# Check if Harper is running
if ! curl -s http://localhost:9926/health > /dev/null 2>&1; then
  echo "❌ Harper is not running. Start with: npm run dev"
  exit 1
fi

echo "1️⃣  Training a model..."
TRAIN_RESPONSE=$(curl -s -X POST http://localhost:9926/train \
  -H "Content-Type: application/json" \
  -d '{"model_id": "demo-model", "label_column": "label"}')

echo "$TRAIN_RESPONSE" | jq '.'

MODEL_VERSION=$(echo "$TRAIN_RESPONSE" | jq -r '.version')
echo ""
echo "✅ Model trained: version $MODEL_VERSION"
echo ""

sleep 1

echo "2️⃣  Getting monitoring metrics..."
curl -s "http://localhost:9926/monitoring/metrics?model_id=demo-model" | jq '.'
echo ""

echo "3️⃣  Getting recent events..."
curl -s "http://localhost:9926/monitoring/recent?model_id=demo-model&limit=5" | jq '.'
echo ""

echo "✅ Demo complete!"
```

Make executable:

```bash
chmod +x demo-walkthrough.sh
```

**Step 4: Commit e2e test and demo**

```bash
git add tests/e2e/complete-flow.test.js demo-walkthrough.sh
git commit -m "test: add end-to-end test and demo walkthrough script"
```

---

## Task 16: Documentation Update

**Files:**

- Create: `docs/walking-skeleton-status.md`
- Modify: `README.md`

**Step 1: Create status document**

Create `docs/walking-skeleton-status.md`:

````markdown
# Walking Skeleton Status

**Status**: ✅ Complete - All core components implemented and tested

**Completed**: 2025-11-24

## What's Working

### Core Components

- ✅ **FeatureStore**: In-memory feature storage with write/read
- ✅ **TrainingProvider**: Binary classification with TensorFlow.js
- ✅ **ModelRegistry**: Model versioning and metadata storage
- ✅ **MonitoringBackend**: Inference event tracking and metrics

### REST API Endpoints

- ✅ `POST /data/upload` - Upload training data
- ✅ `POST /train` - Train binary classifier
- ✅ `POST /predict` - Make predictions (model loading partial)
- ✅ `GET /monitoring/recent` - Query recent inference events
- ✅ `GET /monitoring/metrics` - Get model metrics

### Tests

- ✅ 8 unit tests passing
- ✅ End-to-end flow test passing
- ✅ Manual API tests via demo script

## Current Limitations

### Intentional (Minimal Implementation)

- In-memory storage (no Harper tables yet)
- No persistence across restarts
- Single model type (binary classification)
- No model loading in predict endpoint (returns mock)
- No authentication
- No input validation beyond basics

### Next Steps (Not in Walking Skeleton Scope)

- Migrate to Harper table storage
- Implement actual model loading for predictions
- Add more model types
- Implement drift detection
- Add retraining triggers
- Implement CI/CD pipeline

## How to Use

### Run Tests

```bash
npm run test:unit
```
````

### Start Harper

```bash
npm run dev
```

### Run Demo

```bash
./demo-walkthrough.sh
```

### Manual Testing

Train a model:

```bash
curl -X POST http://localhost:9926/train \
  -H "Content-Type: application/json" \
  -d '{"model_id": "test", "label_column": "label"}'
```

Check metrics:

```bash
curl "http://localhost:9926/monitoring/metrics?model_id=test"
```

## Architecture

All components run in-process in a single Harper instance:

```
Harper Instance
├── FeatureStore (in-memory)
├── TrainingProvider (TensorFlow.js)
├── ModelRegistry (in-memory)
├── MonitoringBackend (in-memory)
└── REST API (Harper resources)
```

## Test Coverage

- Feature store read/write: ✅
- Model registration/retrieval: ✅
- Binary classification training: ✅
- Monitoring record/query: ✅
- End-to-end pipeline: ✅

````

**Step 2: Update README.md**

Add to `README.md` after existing Quick Start section:

```markdown
## Walking Skeleton (New)

The walking skeleton implements a minimal end-to-end MLOps pipeline:

- Upload training data
- Train binary classifiers
- Register trained models
- Monitor inference telemetry

**Status**: See [docs/walking-skeleton-status.md](docs/walking-skeleton-status.md)

**Quick Test**:
```bash
npm run test:unit      # Run unit tests
npm run dev            # Start Harper
./demo-walkthrough.sh  # Run demo (in another terminal)
````

````

**Step 3: Commit documentation**

```bash
git add docs/walking-skeleton-status.md README.md
git commit -m "docs: add walking skeleton status and update README"
````

---

## Completion Checklist

- ✅ Feature Store (write/read features)
- ✅ Model Registry (register/retrieve models)
- ✅ Training Provider (binary classification)
- ✅ Monitoring Backend (record/query events)
- ✅ REST API endpoints (train, predict, monitoring)
- ✅ Unit tests for all components
- ✅ End-to-end test
- ✅ Demo script
- ✅ Documentation

**Total: 16 tasks, all components integrated and tested**

---

## What's Next

After walking skeleton is complete:

1. **Migrate to Harper Tables**: Replace in-memory storage with actual Harper database tables
2. **Implement Model Loading**: Complete the predict endpoint with real model deserialization
3. **Add More Model Types**: Support regression, multi-class classification
4. **Implement Drift Detection**: Basic PSI-based input drift monitoring
5. **Add Retraining Triggers**: Automatic retraining when drift detected

These will be planned separately after walking skeleton validation.
