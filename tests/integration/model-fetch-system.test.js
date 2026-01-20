/**
 * Model Fetch System Integration Test
 *
 * End-to-end test of the model fetch system with real LocalFilesystemAdapter.
 * Tests the complete flow: InspectModel → FetchModel → Job Processing → Model Storage
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ModelFetchWorker } from '../../src/core/ModelFetchWorker.js';
import { LocalFilesystemAdapter } from '../../src/core/fetchers/LocalFilesystemAdapter.js';

// Mock tables for testing
function createMockTables() {
	const jobs = new Map();
	const models = new Map();

	return {
		ModelFetchJob: {
			create: async (data) => {
				jobs.set(data.id, { ...data });
				return data;
			},
			get: async (id) => jobs.get(id),
			findMany: async ({ where, orderBy, limit }) => {
				let results = Array.from(jobs.values());
				if (where) {
					results = results.filter(job => {
						return Object.entries(where).every(([key, value]) => job[key] === value);
					});
				}
				if (orderBy) {
					const [key, order] = Object.entries(orderBy)[0];
					results.sort((a, b) => order === 'asc' ? a[key] - b[key] : b[key] - a[key]);
				}
				return limit ? results.slice(0, limit) : results;
			},
			update: async ({ where, data }) => {
				const job = jobs.get(where.id);
				if (job) Object.assign(job, data);
				return job;
			},
			_jobs: jobs
		},
		Model: {
			create: async (data) => {
				models.set(data.id, { ...data });
				return data;
			},
			get: async (id) => models.get(id),
			_models: models
		}
	};
}

describe('Model Fetch System Integration', () => {
	let worker;
	let mockTables;
	let adapter;

	beforeEach(() => {
		mockTables = createMockTables();
		worker = new ModelFetchWorker(mockTables);
		adapter = new LocalFilesystemAdapter();
	});

	afterEach(async () => {
		if (worker) {
			await worker.stop();
		}
	});

	it('should complete full workflow: inspect -> fetch -> process -> store', async () => {
		const sourceReference = 'test-fixtures/test-model.onnx';

		// Step 1: Inspect model (verify adapter works)
		const framework = await adapter.detectFramework(sourceReference);
		assert.equal(framework, 'onnx');

		const variants = await adapter.listVariants(sourceReference);
		assert.ok(Array.isArray(variants));
		assert.equal(variants.length, 1);

		// Step 2: Create fetch job (simulate FetchModel resource)
		const job = {
			id: 'test-job-1',
			jobId: 'test-job-1',
			source: 'filesystem',
			sourceReference,
			variant: null,
			modelName: 'test-model',
			modelVersion: 'v1',
			framework,
			stage: 'development',
			status: 'queued',
			progress: 0,
			downloadedBytes: 0,
			totalBytes: 0,
			retryCount: 0,
			maxRetries: 3,
			inferredMetadata: '{}',
			userMetadata: '{}',
			createdAt: Date.now()
		};

		await mockTables.ModelFetchJob.create(job);

		// Step 3: Start worker to process job
		await worker.start();

		// Step 4: Manually trigger job processing (skip polling delay)
		await worker.processJob(job);

		// Step 5: Verify job completed
		const completedJob = await mockTables.ModelFetchJob.get('test-job-1');
		assert.equal(completedJob.status, 'completed');
		assert.equal(completedJob.progress, 100);

		// Step 6: Verify model was stored
		const storedModel = await mockTables.Model.get('test-model:v1');
		assert.ok(storedModel);
		assert.equal(storedModel.modelName, 'test-model');
		assert.equal(storedModel.framework, 'onnx');
		assert.ok(storedModel.modelBlob);
		assert.ok(Buffer.isBuffer(storedModel.modelBlob));
	});

	it('should handle job failures with retry logic', async () => {
		// Create job for non-existent model (will fail)
		const job = {
			id: 'test-job-2',
			jobId: 'test-job-2',
			source: 'filesystem',
			sourceReference: 'nonexistent/model.onnx',
			modelName: 'test-model-2',
			modelVersion: 'v1',
			framework: 'onnx',
			stage: 'development',
			status: 'queued',
			progress: 0,
			retryCount: 0,
			maxRetries: 3,
			inferredMetadata: '{}',
			userMetadata: '{}',
			createdAt: Date.now()
		};

		await mockTables.ModelFetchJob.create(job);
		await worker.start();

		// Process job (will fail because model doesn't exist)
		await worker.processJob(job);

		// Verify job failed permanently (ModelNotFoundError is not retryable)
		const failedJob = await mockTables.ModelFetchJob.get('test-job-2');
		assert.equal(failedJob.status, 'failed');
		assert.ok(failedJob.lastError);
		assert.equal(failedJob.retryable, false);
	});
});
