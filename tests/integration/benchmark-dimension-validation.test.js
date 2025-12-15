import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { BenchmarkEngine } from '../../src/core/BenchmarkEngine.js';
import { createBenchmarkTestContext } from '../helpers/test-context.js';
import { createMockBenchmarkModels } from '../helpers/benchmark-helpers.js';
import { createRestTables } from '../helpers/rest-api.js';

/**
 * Benchmark Dimension Validation Tests
 *
 * Ensures no regressions on:
 * 1. Models with different output dimensions in same equivalence group fail validation
 * 2. Models with same dimensions in same equivalence group pass validation
 * 3. Specific equivalence groups work correctly (embeddings-384, etc.)
 */
describe('Benchmark Dimension Validation (Regression Tests)', () => {
	let ctx;
	let benchmarkEngine;
	let mockInferenceEngine;

	before(async () => {
		ctx = createBenchmarkTestContext();
		await ctx.setup();

		// Mock inference engine that always succeeds
		mockInferenceEngine = {
			predict: async (modelName, modelVersion, input) => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return [Array(512).fill(0.1)]; // Return 512-dimensional output
			},
			initialize: async () => {},
		};

		// Create tables for BenchmarkEngine (required for tests running outside Harper)
		const tables = createRestTables();
		benchmarkEngine = new BenchmarkEngine(mockInferenceEngine, tables);
	});

	after(async () => {
		await ctx.teardown();
	});

	test('should reject benchmark with mismatched output dimensions', async () => {
		// Create models with DIFFERENT output dimensions in same equivalence group
		const model384 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'dimension-test',
			outputDimensions: [384],
			count: 1,
		});

		const model512 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'dimension-test',
			outputDimensions: [512],
			count: 1,
			startIndex: 1,
		});

		const models = [...model384, ...model512];
		ctx.trackModel(...models.map((m) => m.id));

		// Attempt to benchmark - should fail validation
		const testData = [{ text: 'test' }];

		try {
			await benchmarkEngine.compareBenchmark(models, testData, {
				iterations: 5,
				taskType: 'text-embedding',
				equivalenceGroup: 'dimension-test',
			});

			assert.fail('Should have thrown error for dimension mismatch');
		} catch (error) {
			assert.ok(
				error.message.includes('Output dimensions do not match'),
				'Error should mention dimension mismatch'
			);
			assert.ok(
				error.message.includes('[384]') && error.message.includes('[512]'),
				'Error should show conflicting dimensions'
			);
		}
	});

	test('should accept benchmark with matching output dimensions', async () => {
		// Create models with SAME output dimensions
		const models = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'matching-dimensions',
			outputDimensions: [512],
			count: 3,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test' }];

		// Should succeed
		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 5,
			taskType: 'text-embedding',
			equivalenceGroup: 'matching-dimensions',
		});

		ctx.trackResult(result.comparisonId);

		assert.ok(result.comparisonId, 'Should complete benchmark successfully');
		assert.equal(result.modelIds.length, 3, 'Should benchmark all 3 models');
		assert.ok(result.winner, 'Should select a winner');
	});

	test('should validate embeddings-384 equivalence group', async () => {
		// Test the specific equivalence group we use in production
		const models = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-384',
			outputDimensions: [384],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test embedding' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-384',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'embeddings-384');
		assert.ok(result.winner);
	});

	test('should validate embeddings-512 equivalence group', async () => {
		const models = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-512',
			outputDimensions: [512],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test embedding' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-512',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'embeddings-512');
		assert.ok(result.winner);
	});

	test('should validate embeddings-768 equivalence group', async () => {
		const models = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-768',
			outputDimensions: [768],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test embedding' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-768',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'embeddings-768');
		assert.ok(result.winner);
	});

	test('should validate embeddings-1024 equivalence group', async () => {
		const models = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-1024',
			outputDimensions: [1024],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test embedding' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'text-embedding',
			equivalenceGroup: 'embeddings-1024',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'embeddings-1024');
		assert.ok(result.winner);
	});

	test('should validate price-classifier equivalence group', async () => {
		const models = await createMockBenchmarkModels({
			taskType: 'classification',
			equivalenceGroup: 'price-classifier',
			outputDimensions: [1],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ prompt: 'This product is expensive' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'classification',
			equivalenceGroup: 'price-classifier',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'price-classifier');
		assert.equal(result.taskType, 'classification');
		assert.ok(result.winner);
	});

	test('should validate image-tagger equivalence group', async () => {
		const models = await createMockBenchmarkModels({
			taskType: 'image-tagging',
			equivalenceGroup: 'image-tagger',
			outputDimensions: [1],
			count: 2,
		});

		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ prompt: 'What is in this image?' }];

		const result = await benchmarkEngine.compareBenchmark(models, testData, {
			iterations: 3,
			taskType: 'image-tagging',
			equivalenceGroup: 'image-tagger',
		});

		ctx.trackResult(result.comparisonId);

		assert.equal(result.equivalenceGroup, 'image-tagger');
		assert.equal(result.taskType, 'image-tagging');
		assert.ok(result.winner);
	});

	test('should reject mixed dimensions across multiple models', async () => {
		// Create 4 models with different dimensions
		const models384 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'mixed-test',
			outputDimensions: [384],
			count: 1,
		});

		const models512 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'mixed-test',
			outputDimensions: [512],
			count: 1,
			startIndex: 1,
		});

		const models768 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'mixed-test',
			outputDimensions: [768],
			count: 1,
			startIndex: 2,
		});

		const models1024 = await createMockBenchmarkModels({
			taskType: 'text-embedding',
			equivalenceGroup: 'mixed-test',
			outputDimensions: [1024],
			count: 1,
			startIndex: 3,
		});

		const models = [...models384, ...models512, ...models768, ...models1024];
		ctx.trackModel(...models.map((m) => m.id));

		const testData = [{ text: 'test' }];

		try {
			await benchmarkEngine.compareBenchmark(models, testData, {
				iterations: 3,
				taskType: 'text-embedding',
				equivalenceGroup: 'mixed-test',
			});

			assert.fail('Should have thrown error for mixed dimensions');
		} catch (error) {
			assert.ok(
				error.message.includes('Output dimensions do not match'),
				'Error should mention dimension mismatch'
			);

			// Should mention all conflicting dimensions
			assert.ok(error.message.includes('[384]'));
			assert.ok(error.message.includes('[512]'));
			assert.ok(error.message.includes('[768]'));
			assert.ok(error.message.includes('[1024]'));
		}
	});
});
