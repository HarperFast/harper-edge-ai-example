/**
 * ModelFetchWorker Unit Tests
 *
 * Tests job queue processing, retry logic, crash recovery, and rate limiting.
 * Uses mock tables and adapters for isolated testing.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ModelFetchWorker } from '../../src/core/ModelFetchWorker.js';
import { NetworkError, ModelNotFoundError, SecurityError } from '../../src/core/errors/ModelFetchErrors.js';

/**
 * Create mock tables object for testing
 */
function createMockTables() {
	const jobs = new Map();
	const models = new Map();

	return {
		ModelFetchJob: {
			findMany: mock.fn(async ({ where, orderBy, limit }) => {
				const allJobs = Array.from(jobs.values());
				let filtered = allJobs;

				if (where) {
					filtered = allJobs.filter((job) => {
						return Object.entries(where).every(([key, value]) => job[key] === value);
					});
				}

				if (orderBy) {
					const [sortKey, sortOrder] = Object.entries(orderBy)[0];
					filtered.sort((a, b) => {
						if (sortOrder === 'asc') {
							return a[sortKey] - b[sortKey];
						}
						return b[sortKey] - a[sortKey];
					});
				}

				if (limit) {
					filtered = filtered.slice(0, limit);
				}

				return filtered;
			}),
			update: mock.fn(async ({ where, data }) => {
				const job = jobs.get(where.id);
				if (job) {
					Object.assign(job, data);
				}
				return job;
			}),
			create: mock.fn(async (data) => {
				jobs.set(data.id, data);
				return data;
			}),
			// For test helpers
			_jobs: jobs,
		},
		Model: {
			create: mock.fn(async (data) => {
				models.set(data.id, data);
				return data;
			}),
			_models: models,
		},
	};
}

/**
 * Create mock adapter for testing
 */
function createMockAdapter(options = {}) {
	return {
		detectFramework: mock.fn(async () => options.framework || 'onnx'),
		listVariants: mock.fn(async () => [{ name: 'default', files: [], totalSize: 1000 }]),
		download: mock.fn(async (sourceRef, variant, onProgress) => {
			if (options.downloadError) {
				throw options.downloadError;
			}

			// Simulate progress updates
			if (onProgress) {
				onProgress(500, 1000);
				onProgress(1000, 1000);
			}

			return options.modelBlob || Buffer.from('mock model data');
		}),
		inferMetadata: mock.fn(async () => ({ description: 'Mock model', tags: [] })),
	};
}

describe('ModelFetchWorker', () => {
	let worker;
	let mockTables;
	let originalSetInterval;
	let originalClearInterval;
	let intervals;

	beforeEach(() => {
		// Create mock tables
		mockTables = createMockTables();

		// Mock setInterval/clearInterval
		intervals = [];
		originalSetInterval = global.setInterval;
		originalClearInterval = global.clearInterval;

		global.setInterval = (fn, delay) => {
			const id = Symbol('interval');
			intervals.push({ id, fn, delay });
			return id;
		};

		global.clearInterval = (id) => {
			const index = intervals.findIndex((interval) => interval.id === id);
			if (index >= 0) {
				intervals.splice(index, 1);
			}
		};

		// Create worker
		worker = new ModelFetchWorker(mockTables);
	});

	afterEach(async () => {
		// Stop worker
		if (worker) {
			await worker.stop();
		}

		// Restore setInterval/clearInterval
		global.setInterval = originalSetInterval;
		global.clearInterval = originalClearInterval;
	});

	describe('constructor', () => {
		it('should create instance with tables object', () => {
			assert.ok(worker instanceof ModelFetchWorker);
			assert.equal(worker.tables, mockTables);
		});

		it('should throw error if tables object not provided', () => {
			assert.throws(() => new ModelFetchWorker(null), /requires tables object/i);
		});

		it('should initialize with default configuration', () => {
			assert.equal(worker.maxConcurrent, 3);
			assert.equal(worker.pollInterval, 5000);
			assert.equal(worker.maxRetries, 3);
		});

		it('should initialize empty active jobs map', () => {
			assert.equal(worker.activeJobs.size, 0);
		});

		it('should initialize adapters', () => {
			assert.ok(worker.adapters.filesystem);
			assert.ok(worker.adapters.url);
			assert.ok(worker.adapters.huggingface);
		});

		it('should initialize rate limiter', () => {
			assert.ok(worker.rateLimiter);
		});
	});

	describe('start', () => {
		it('should start worker and set running flag', async () => {
			await worker.start();

			assert.equal(worker.running, true);
			assert.ok(worker.intervalHandle);
		});

		it('should call recoverCrashedJobs on start', async () => {
			// Add a crashed job
			mockTables.ModelFetchJob._jobs.set('job1', {
				id: 'job1',
				status: 'downloading',
				source: 'filesystem',
				sourceReference: 'test.onnx',
			});

			await worker.start();

			// Job should be reset to queued
			const job = mockTables.ModelFetchJob._jobs.get('job1');
			assert.equal(job.status, 'queued');
			assert.match(job.lastError, /crashed/i);
		});

		it('should not start twice', async () => {
			await worker.start();
			const firstHandle = worker.intervalHandle;

			await worker.start();
			assert.equal(worker.intervalHandle, firstHandle);
		});

		it('should set up polling interval', async () => {
			await worker.start();

			// Check interval was created (worker creates 1, RateLimiter cleanup creates 1)
			assert.ok(intervals.length >= 1);
			// Find the worker's polling interval (5000ms)
			const pollingInterval = intervals.find((i) => i.delay === 5000);
			assert.ok(pollingInterval);
		});
	});

	describe('stop', () => {
		it('should stop worker and clear running flag', async () => {
			await worker.start();
			await worker.stop();

			assert.equal(worker.running, false);
			assert.equal(worker.intervalHandle, null);
		});

		it('should clear polling interval', async () => {
			await worker.start();
			const intervalCountBefore = intervals.length;
			assert.ok(intervalCountBefore >= 1);

			await worker.stop();
			// At least one interval should be cleared (the worker's polling interval)
			assert.ok(intervals.length < intervalCountBefore);
		});

		it('should wait for active jobs to complete', async () => {
			await worker.start();

			// Simulate active job that completes quickly
			let resolveJob;
			const jobPromise = new Promise((resolve) => {
				resolveJob = resolve;
			});
			worker.activeJobs.set('job1', jobPromise);

			// Should still have active job initially
			assert.equal(worker.activeJobs.size, 1);

			// Start stop (it will wait)
			const stopPromise = worker.stop();

			// Resolve the job after a short delay
			setTimeout(() => {
				worker.activeJobs.delete('job1');
				resolveJob();
			}, 100);

			await stopPromise;

			// Job should be removed
			assert.equal(worker.activeJobs.size, 0);
		});
	});

	describe('recoverCrashedJobs', () => {
		it('should reset downloading jobs to queued', async () => {
			// Add crashed jobs
			mockTables.ModelFetchJob._jobs.set('job1', {
				id: 'job1',
				status: 'downloading',
			});
			mockTables.ModelFetchJob._jobs.set('job2', {
				id: 'job2',
				status: 'downloading',
			});
			mockTables.ModelFetchJob._jobs.set('job3', {
				id: 'job3',
				status: 'queued',
			});

			await worker.recoverCrashedJobs();

			// Check jobs were recovered
			assert.equal(mockTables.ModelFetchJob._jobs.get('job1').status, 'queued');
			assert.equal(mockTables.ModelFetchJob._jobs.get('job2').status, 'queued');
			assert.equal(mockTables.ModelFetchJob._jobs.get('job3').status, 'queued'); // unchanged
		});

		it('should handle empty queue', async () => {
			await worker.recoverCrashedJobs();
			// Should not throw
		});
	});

	describe('fetchQueuedJobs', () => {
		it('should fetch jobs with status=queued', async () => {
			mockTables.ModelFetchJob._jobs.set('job1', {
				id: 'job1',
				status: 'queued',
				createdAt: 100,
			});
			mockTables.ModelFetchJob._jobs.set('job2', {
				id: 'job2',
				status: 'completed',
				createdAt: 200,
			});

			const jobs = await worker.fetchQueuedJobs(10);

			assert.equal(jobs.length, 1);
			assert.equal(jobs[0].id, 'job1');
		});

		it('should return jobs in FIFO order (oldest first)', async () => {
			mockTables.ModelFetchJob._jobs.set('job1', {
				id: 'job1',
				status: 'queued',
				createdAt: 300,
			});
			mockTables.ModelFetchJob._jobs.set('job2', {
				id: 'job2',
				status: 'queued',
				createdAt: 100,
			});
			mockTables.ModelFetchJob._jobs.set('job3', {
				id: 'job3',
				status: 'queued',
				createdAt: 200,
			});

			const jobs = await worker.fetchQueuedJobs(10);

			assert.equal(jobs.length, 3);
			assert.equal(jobs[0].id, 'job2'); // oldest
			assert.equal(jobs[1].id, 'job3');
			assert.equal(jobs[2].id, 'job1');
		});

		it('should respect limit parameter', async () => {
			for (let i = 0; i < 5; i++) {
				mockTables.ModelFetchJob._jobs.set(`job${i}`, {
					id: `job${i}`,
					status: 'queued',
					createdAt: i,
				});
			}

			const jobs = await worker.fetchQueuedJobs(2);

			assert.equal(jobs.length, 2);
		});
	});

	describe('processJob - successful download', () => {
		it('should download model and store in database', async () => {
			// Create mock adapter
			const mockAdapter = createMockAdapter();
			worker.adapters.filesystem = mockAdapter;

			// Create job
			const job = {
				id: 'job1',
				source: 'filesystem',
				sourceReference: 'test-model.onnx',
				variant: null,
				modelName: 'test-model',
				modelVersion: 'v1',
				framework: 'onnx',
				stage: 'development',
				inferredMetadata: '{}',
				userMetadata: '{}',
				retryCount: 0,
			};

			await worker.processJob(job);

			// Check download was called
			assert.equal(mockAdapter.download.mock.calls.length, 1);

			// Check model was stored
			const model = mockTables.Model._models.get('test-model:v1');
			assert.ok(model);
			assert.equal(model.modelName, 'test-model');
			assert.equal(model.framework, 'onnx');

			// Check job status updated
			assert.equal(mockTables.ModelFetchJob.update.mock.calls.length >= 3, true); // downloading, progress, completed
		});

		it('should call progress callback during download', async () => {
			const mockAdapter = createMockAdapter();
			worker.adapters.filesystem = mockAdapter;

			const job = {
				id: 'job1',
				source: 'filesystem',
				sourceReference: 'test-model.onnx',
				variant: null,
				modelName: 'test-model',
				modelVersion: 'v1',
				framework: 'onnx',
				inferredMetadata: '{}',
				userMetadata: '{}',
			};

			await worker.processJob(job);

			// Check progress was reported (at least one update call with progress)
			const updateCalls = mockTables.ModelFetchJob.update.mock.calls;
			const progressCalls = updateCalls.filter((call) => call.arguments[0].data.progress !== undefined);
			assert.ok(progressCalls.length > 0);
		});
	});

	describe('processJob - failure handling', () => {
		it('should retry on network error', async () => {
			const mockAdapter = createMockAdapter({
				downloadError: new NetworkError('Connection failed'),
			});
			worker.adapters.filesystem = mockAdapter;

			const job = {
				id: 'job1',
				source: 'filesystem',
				sourceReference: 'test-model.onnx',
				modelName: 'test-model',
				modelVersion: 'v1',
				framework: 'onnx',
				retryCount: 0,
				maxRetries: 3,
				inferredMetadata: '{}',
				userMetadata: '{}',
			};
			mockTables.ModelFetchJob._jobs.set(job.id, job);

			await worker.processJob(job);

			// Job should be reset to queued for retry
			const updatedJob = mockTables.ModelFetchJob._jobs.get('job1');
			assert.equal(updatedJob.status, 'queued');
			assert.equal(updatedJob.retryCount, 1);
			assert.ok(updatedJob.lastError.includes('Connection failed'));
		});

		it('should fail permanently on security error (non-retryable)', async () => {
			const mockAdapter = createMockAdapter({
				downloadError: new SecurityError('Path traversal detected'),
			});
			worker.adapters.filesystem = mockAdapter;

			const job = {
				id: 'job1',
				source: 'filesystem',
				sourceReference: '../../../etc/passwd',
				modelName: 'test-model',
				modelVersion: 'v1',
				framework: 'onnx',
				retryCount: 0,
				maxRetries: 3,
				inferredMetadata: '{}',
				userMetadata: '{}',
			};
			mockTables.ModelFetchJob._jobs.set(job.id, job);

			await worker.processJob(job);

			// Job should be marked as failed
			const updatedJob = mockTables.ModelFetchJob._jobs.get('job1');
			assert.equal(updatedJob.status, 'failed');
			assert.equal(updatedJob.retryable, false);
		});

		it('should fail permanently after max retries', async () => {
			const mockAdapter = createMockAdapter({
				downloadError: new NetworkError('Connection failed'),
			});
			worker.adapters.filesystem = mockAdapter;

			const job = {
				id: 'job1',
				source: 'filesystem',
				sourceReference: 'test-model.onnx',
				modelName: 'test-model',
				modelVersion: 'v1',
				framework: 'onnx',
				retryCount: 2, // Already retried twice
				maxRetries: 3,
				inferredMetadata: '{}',
				userMetadata: '{}',
			};
			mockTables.ModelFetchJob._jobs.set(job.id, job);

			await worker.processJob(job);

			// Job should be marked as failed
			const updatedJob = mockTables.ModelFetchJob._jobs.get('job1');
			assert.equal(updatedJob.status, 'failed');
			assert.equal(updatedJob.retryCount, 3);
		});
	});

	describe('isRetryableError', () => {
		it('should return true for network errors', () => {
			assert.equal(worker.isRetryableError(new NetworkError('timeout')), true);
		});

		it('should return false for security errors', () => {
			assert.equal(worker.isRetryableError(new SecurityError('path traversal')), false);
		});

		it('should return false for model not found errors', () => {
			assert.equal(worker.isRetryableError(new ModelNotFoundError('model.onnx')), false);
		});

		it('should use error.retryable flag if present', () => {
			const error = new Error('Custom error');
			error.retryable = true;
			assert.equal(worker.isRetryableError(error), true);

			error.retryable = false;
			assert.equal(worker.isRetryableError(error), false);
		});
	});

	describe('getStatus', () => {
		it('should return worker status', () => {
			const status = worker.getStatus();

			assert.equal(status.running, false);
			assert.equal(status.activeJobs, 0);
			assert.equal(status.maxConcurrent, 3);
			assert.equal(status.pollInterval, 5000);
			assert.ok(Array.isArray(status.rateLimitedSources));
		});

		it('should reflect active jobs', () => {
			worker.activeJobs.set('job1', Promise.resolve());
			worker.activeJobs.set('job2', Promise.resolve());

			const status = worker.getStatus();
			assert.equal(status.activeJobs, 2);
		});
	});
});
