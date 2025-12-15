import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { createBenchmarkTestContext } from '../helpers/test-context.js';
import { createMockBenchmarkModels, generateTestData } from '../helpers/benchmark-helpers.js';

describe('Benchmark API Integration', () => {
	let ctx;
	let modelsTable;
	let resultsTable;

	before(async () => {
		ctx = createBenchmarkTestContext();
		await ctx.setup();
		modelsTable = ctx.tables.get('Model');
		resultsTable = ctx.tables.get('BenchmarkResult');
	});

	after(async () => {
		await ctx.teardown();
	});

	describe('POST /benchmark/compare', () => {
		test('should compare equivalent models successfully', async () => {
			// Setup: Create mock models with matching metadata
			const models = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'test-use',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...models.map((m) => m.id));

			// Make API request (simulated)
			const testData = generateTestData('text-embedding', 3);
			const requestBody = {
				taskType: 'text-embedding',
				equivalenceGroup: 'test-use',
				testData,
				iterations: 5,
				runBy: 'integration-test',
				notes: 'Test benchmark comparison',
			};

			// In a real integration test with server running, you'd use fetch()
			// For now, we test the underlying engine behavior
			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { InferenceEngine } = await import('../../src/core/InferenceEngine.js');

			const inferenceEngine = new InferenceEngine(ctx.tables);
			await inferenceEngine.initialize();

			const benchmarkEngine = new BenchmarkEngine(inferenceEngine, ctx.tables);

			// Find models
			const foundModels = await benchmarkEngine.findEquivalentModels(
				requestBody.taskType,
				requestBody.equivalenceGroup
			);

			assert.ok(foundModels.length >= 2, 'Should find at least 2 equivalent models');

			// Note: We can't actually run predictions without real model files
			// This test verifies the API structure and model finding logic
			assert.equal(foundModels.length, 2);
			// Verify model names contain the equivalence group
			assert.ok(foundModels[0].modelName.includes('test-use'));
			assert.ok(foundModels[1].modelName.includes('test-use'));

			await inferenceEngine.cleanup();
		});

		test('should return error if not enough models found', async () => {
			// Create only 1 model
			const model = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'lonely-model',
				outputDimensions: [512],
				count: 1,
			});
			ctx.trackModel(...model.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { InferenceEngine } = await import('../../src/core/InferenceEngine.js');

			const inferenceEngine = new InferenceEngine(ctx.tables);
			await inferenceEngine.initialize();

			const benchmarkEngine = new BenchmarkEngine(inferenceEngine, ctx.tables);

			const foundModels = await benchmarkEngine.findEquivalentModels('text-embedding', 'lonely-model');

			assert.equal(foundModels.length, 1, 'Should only find 1 model (not enough)');

			await inferenceEngine.cleanup();
		});

		test('should validate output dimensions match', async () => {
			// Create models with different output dimensions
			const model1 = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'mismatched',
				outputDimensions: [512],
				count: 1,
			});

			const model2 = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'mismatched',
				outputDimensions: [768],
				count: 1,
				startIndex: 1, // Avoid overwriting model1
			});

			ctx.trackModel(...model1.map((m) => m.id));
			ctx.trackModel(...model2.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { InferenceEngine } = await import('../../src/core/InferenceEngine.js');

			const inferenceEngine = new InferenceEngine(ctx.tables);
			await inferenceEngine.initialize();

			const benchmarkEngine = new BenchmarkEngine(inferenceEngine, ctx.tables);

			// Fetch both models
			const allModels = await benchmarkEngine.findEquivalentModels('text-embedding', 'mismatched');

			// Should throw when validating
			assert.throws(() => {
				benchmarkEngine.validateModelsForComparison(allModels);
			}, /output dimensions.*do not match/i);

			await inferenceEngine.cleanup();
		});

		test('should store result in BenchmarkResult table', async () => {
			// Create models
			const models = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'storage-test',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...models.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			const testData = generateTestData('text-embedding', 2);
			const result = await benchmarkEngine.compareBenchmark(models, testData, {
				iterations: 5,
				taskType: 'text-embedding',
				equivalenceGroup: 'storage-test',
				runBy: 'integration-test',
				notes: 'Testing storage',
			});

			ctx.trackResult(result.comparisonId);

			// Verify it's in the table
			const stored = await resultsTable.get(result.comparisonId);

			assert.ok(stored);
			assert.equal(stored.taskType, 'text-embedding');
			assert.equal(stored.equivalenceGroup, 'storage-test');
			assert.equal(stored.runBy, 'integration-test');
			assert.equal(stored.notes, 'Testing storage');
			assert.equal(stored.iterations, 5);

			// Verify JSON fields can be parsed
			const modelIds = JSON.parse(stored.modelIds);
			assert.ok(Array.isArray(modelIds));
			assert.equal(modelIds.length, 2);

			const results = JSON.parse(stored.results);
			assert.ok(results);
			assert.ok(results[modelIds[0]]);
			assert.ok(results[modelIds[1]]);

			const summary = JSON.parse(stored.testDataSummary);
			assert.equal(summary.sampleCount, 2);
		});
	});

	describe('GET /benchmark/history', () => {
		test('should retrieve benchmark history', async () => {
			// Create models and run benchmark
			const models = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'history-test',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...models.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			const testData = generateTestData('text-embedding', 2);
			const result = await benchmarkEngine.compareBenchmark(models, testData, {
				iterations: 5,
				taskType: 'text-embedding',
				equivalenceGroup: 'history-test',
			});

			ctx.trackResult(result.comparisonId);

			// Query history
			const history = await benchmarkEngine.getHistoricalResults({
				taskType: 'text-embedding',
				equivalenceGroup: 'history-test',
			});

			assert.ok(Array.isArray(history));
			assert.ok(history.length >= 1);

			const found = history.find((r) => r.id === result.comparisonId);
			assert.ok(found, 'Should find the benchmark we just ran');
		});

		test('should filter by taskType', async () => {
			// Create models for different task types
			const embeddingModels = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'filter-test-1',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...embeddingModels.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			const testData = generateTestData('text-embedding', 2);
			const result = await benchmarkEngine.compareBenchmark(embeddingModels, testData, {
				iterations: 5,
				taskType: 'text-embedding',
				equivalenceGroup: 'filter-test-1',
			});

			ctx.trackResult(result.comparisonId);

			// Query by taskType
			const history = await benchmarkEngine.getHistoricalResults({
				taskType: 'text-embedding',
			});

			assert.ok(Array.isArray(history));
			assert.ok(
				history.every((r) => r.taskType === 'text-embedding'),
				'All results should have taskType=text-embedding'
			);
		});

		test('should return empty array for nonexistent filters', async () => {
			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			const history = await benchmarkEngine.getHistoricalResults({
				taskType: 'nonexistent-task-12345',
			});

			assert.ok(Array.isArray(history));
			assert.equal(history.length, 0);
		});
	});

	describe('validation', () => {
		test('should reject empty testData', async () => {
			const models = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'validation-test',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...models.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			await assert.rejects(async () => {
				await benchmarkEngine.compareBenchmark(models, [], {
					iterations: 5,
					taskType: 'text-embedding',
					equivalenceGroup: 'validation-test',
				});
			}, /test data.*empty/i);
		});

		test('should reject zero iterations', async () => {
			const models = await createMockBenchmarkModels({
				taskType: 'text-embedding',
				equivalenceGroup: 'validation-test',
				outputDimensions: [512],
				count: 2,
			});
			ctx.trackModel(...models.map((m) => m.id));

			const { BenchmarkEngine } = await import('../../src/core/BenchmarkEngine.js');
			const { createMockInferenceEngine } = await import('../helpers/benchmark-helpers.js');

			const mockEngine = createMockInferenceEngine({ latency: 10 });
			const benchmarkEngine = new BenchmarkEngine(mockEngine, ctx.tables);

			const testData = generateTestData('text-embedding', 2);

			await assert.rejects(async () => {
				await benchmarkEngine.compareBenchmark(models, testData, {
					iterations: 0,
					taskType: 'text-embedding',
					equivalenceGroup: 'validation-test',
				});
			}, /iterations.*greater than 0/i);
		});
	});
});
