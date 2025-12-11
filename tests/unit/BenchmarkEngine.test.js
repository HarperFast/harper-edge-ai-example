import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tables } from '@harperdb/harperdb';
import { BenchmarkEngine } from '../../src/core/BenchmarkEngine.js';
import {
  createMockModel,
  createMockInferenceEngine,
  createMockBenchmarkModels,
  cleanupBenchmarkResults,
  cleanupTestModels,
  generateTestData,
  assertValidLatencyMetrics,
  assertValidErrorMetrics,
} from '../helpers/benchmark-helpers.js';

describe('BenchmarkEngine', () => {
  let benchmarkEngine;
  let mockInferenceEngine;
  let cleanupIds = [];
  let cleanupModelKeys = [];

  beforeEach(async () => {
    mockInferenceEngine = createMockInferenceEngine({ latency: 10 });
    benchmarkEngine = new BenchmarkEngine(mockInferenceEngine);
    cleanupIds = [];
    cleanupModelKeys = [];
  });

  afterEach(async () => {
    await cleanupBenchmarkResults(cleanupIds);
    await cleanupTestModels(cleanupModelKeys);
  });

  describe('constructor', () => {
    it('should create instance with inference engine', () => {
      assert.ok(benchmarkEngine instanceof BenchmarkEngine);
    });

    it('should throw error if inference engine is not provided', () => {
      assert.throws(
        () => new BenchmarkEngine(),
        /inference engine is required/i
      );
    });
  });

  describe('findEquivalentModels', () => {
    it('should find models with matching taskType and equivalenceGroup', async () => {
      const models = await createMockBenchmarkModels({
        taskType: 'text-embedding',
        equivalenceGroup: 'use',
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const found = await benchmarkEngine.findEquivalentModels(
        'text-embedding',
        'use'
      );

      assert.equal(found.length, 2);
      assert.equal(found[0].modelId, 'test-model-0');
      assert.equal(found[1].modelId, 'test-model-1');
    });

    it('should return empty array if no models match', async () => {
      const found = await benchmarkEngine.findEquivalentModels(
        'nonexistent-task',
        'nonexistent-group'
      );

      assert.equal(found.length, 0);
    });

    it('should filter by both taskType and equivalenceGroup', async () => {
      // Create models with different metadata
      const model1 = await createMockModel({
        modelId: 'model-a',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'use',
          outputDimensions: [512],
        },
      });
      const model2 = await createMockModel({
        modelId: 'model-b',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'bert',
          outputDimensions: [768],
        },
      });
      cleanupModelKeys.push(model1.id, model2.id);

      const found = await benchmarkEngine.findEquivalentModels(
        'text-embedding',
        'use'
      );

      assert.equal(found.length, 1);
      assert.equal(found[0].modelId, 'model-a');
    });
  });

  describe('validateModelsForComparison', () => {
    it('should validate models with matching dimensions', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      assert.doesNotThrow(() => {
        benchmarkEngine.validateModelsForComparison(models);
      });
    });

    it('should throw error if less than 2 models', async () => {
      const models = await createMockBenchmarkModels({ count: 1 });
      cleanupModelKeys.push(...models.map((m) => m.id));

      assert.throws(
        () => benchmarkEngine.validateModelsForComparison(models),
        /at least 2 models/i
      );
    });

    it('should throw error if output dimensions do not match', async () => {
      const model1 = await createMockModel({
        modelId: 'model-a',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      const model2 = await createMockModel({
        modelId: 'model-b',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [768],
        },
      });
      cleanupModelKeys.push(model1.id, model2.id);

      assert.throws(
        () => benchmarkEngine.validateModelsForComparison([model1, model2]),
        /output dimensions.*do not match/i
      );
    });

    it('should throw error if metadata is missing', async () => {
      const model = await createMockModel({
        modelId: 'model-no-metadata',
        version: 'v1',
        metadata: {},
      });
      cleanupModelKeys.push(model.id);

      assert.throws(
        () => benchmarkEngine.validateModelsForComparison([model, model]),
        /missing.*outputDimensions/i
      );
    });
  });

  describe('calculatePercentile', () => {
    it('should calculate p50 (median)', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const p50 = benchmarkEngine.calculatePercentile(values, 50);

      assert.equal(p50, 5.5);
    });

    it('should calculate p95', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = benchmarkEngine.calculatePercentile(values, 95);

      assert.equal(p95, 95.5);
    });

    it('should calculate p99', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p99 = benchmarkEngine.calculatePercentile(values, 99);

      assert.equal(p99, 99.5);
    });

    it('should handle single value array', () => {
      const values = [42];
      const p50 = benchmarkEngine.calculatePercentile(values, 50);

      assert.equal(p50, 42);
    });

    it('should handle edge case percentiles', () => {
      const values = [1, 2, 3, 4, 5];
      const p0 = benchmarkEngine.calculatePercentile(values, 0);
      const p100 = benchmarkEngine.calculatePercentile(values, 100);

      assert.equal(p0, 1);
      assert.equal(p100, 5);
    });
  });

  describe('compareBenchmark', () => {
    it('should run benchmark and return results', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 5);
      const options = {
        iterations: 10,
        taskType: 'text-embedding',
        equivalenceGroup: 'test-model',
      };

      const result = await benchmarkEngine.compareBenchmark(
        models,
        testData,
        options
      );

      // Verify result structure
      assert.ok(result.comparisonId);
      assert.equal(result.taskType, 'text-embedding');
      assert.equal(result.equivalenceGroup, 'test-model');
      assert.ok(Array.isArray(result.modelIds));
      assert.equal(result.modelIds.length, 2);
      assert.ok(result.results);
      assert.ok(result.winner);
      assert.ok(result.timestamp);
      assert.ok(result.completedAt);

      cleanupIds.push(result.comparisonId);
    });

    it('should compute correct latency metrics', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 3);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 20,
        taskType: 'text-embedding',
        equivalenceGroup: 'test-model',
      });

      // Check each model's metrics
      for (const modelKey of result.modelIds) {
        const metrics = result.results[modelKey];

        assertValidLatencyMetrics(metrics);
        assertValidErrorMetrics(metrics, 20);
      }

      cleanupIds.push(result.comparisonId);
    });

    it('should identify winner with lowest avgLatency', async () => {
      // Create mock engines with different latencies
      const fastEngine = createMockInferenceEngine({ latency: 5 });
      const slowEngine = createMockInferenceEngine({ latency: 20 });

      const model1 = await createMockModel({
        modelId: 'fast-model',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      const model2 = await createMockModel({
        modelId: 'slow-model',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      cleanupModelKeys.push(model1.id, model2.id);

      // Override predict to use different latencies
      mockInferenceEngine.predict = async (modelId, version, input) => {
        const latency = modelId === 'fast-model' ? 5 : 20;
        await new Promise((resolve) => setTimeout(resolve, latency));
        return [Array(512).fill(0.1)];
      };

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(
        [model1, model2],
        testData,
        {
          iterations: 10,
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
        }
      );

      assert.equal(result.winner.modelId, 'fast-model:v1');
      assert.ok(
        result.results['fast-model:v1'].avgLatency <
          result.results['slow-model:v1'].avgLatency
      );

      cleanupIds.push(result.comparisonId);
    });

    it('should track error rate correctly', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      // Make every other prediction fail
      let callCount = 0;
      mockInferenceEngine.predict = async (modelId, version, input) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Prediction failed');
        }
        return [Array(512).fill(0.1)];
      };

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 10,
        taskType: 'text-embedding',
        equivalenceGroup: 'test',
      });

      // Each model runs 10 iterations, half should fail
      for (const modelKey of result.modelIds) {
        const metrics = result.results[modelKey];
        assert.equal(metrics.errorCount, 5);
        assert.equal(metrics.successCount, 5);
        assert.equal(metrics.errorRate, 0.5);
      }

      cleanupIds.push(result.comparisonId);
    });

    it('should exclude models with 100% error rate from winner selection', async () => {
      const model1 = await createMockModel({
        modelId: 'working-model',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      const model2 = await createMockModel({
        modelId: 'broken-model',
        version: 'v1',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      cleanupModelKeys.push(model1.id, model2.id);

      mockInferenceEngine.predict = async (modelId, version, input) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (modelId === 'broken-model') {
          throw new Error('Always fails');
        }
        return [Array(512).fill(0.1)];
      };

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(
        [model1, model2],
        testData,
        {
          iterations: 10,
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
        }
      );

      assert.equal(result.winner.modelId, 'working-model:v1');
      assert.equal(result.results['broken-model:v1'].errorRate, 1.0);

      cleanupIds.push(result.comparisonId);
    });

    it('should store result in BenchmarkResult table', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 3);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 5,
        taskType: 'text-embedding',
        equivalenceGroup: 'test-model',
        runBy: 'test-suite',
        notes: 'Test benchmark',
      });

      // Fetch from Harper table
      const resultsTable = tables.get('BenchmarkResult');
      const stored = await resultsTable.get(result.comparisonId);

      assert.ok(stored);
      assert.equal(stored.taskType, 'text-embedding');
      assert.equal(stored.equivalenceGroup, 'test-model');
      assert.equal(stored.runBy, 'test-suite');
      assert.equal(stored.notes, 'Test benchmark');
      assert.equal(stored.iterations, 5);

      cleanupIds.push(result.comparisonId);
    });

    it('should include testDataSummary in stored result', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 4);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 5,
        taskType: 'text-embedding',
        equivalenceGroup: 'test-model',
      });

      const resultsTable = tables.get('BenchmarkResult');
      const stored = await resultsTable.get(result.comparisonId);

      const summary = JSON.parse(stored.testDataSummary);
      assert.equal(summary.sampleCount, 4);

      cleanupIds.push(result.comparisonId);
    });
  });

  describe('getHistoricalResults', () => {
    it('should retrieve historical results by taskType', async () => {
      // Create and run a benchmark
      const models = await createMockBenchmarkModels({
        taskType: 'text-embedding',
        equivalenceGroup: 'test-group',
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 5,
        taskType: 'text-embedding',
        equivalenceGroup: 'test-group',
      });
      cleanupIds.push(result.comparisonId);

      // Query historical results
      const historical = await benchmarkEngine.getHistoricalResults({
        taskType: 'text-embedding',
      });

      assert.ok(Array.isArray(historical));
      assert.ok(
        historical.length >= 1,
        'Should have at least one historical result'
      );

      const found = historical.find((r) => r.id === result.comparisonId);
      assert.ok(found, 'Should find the benchmark we just ran');
      assert.equal(found.taskType, 'text-embedding');
    });

    it('should retrieve historical results by equivalenceGroup', async () => {
      const models = await createMockBenchmarkModels({
        taskType: 'text-embedding',
        equivalenceGroup: 'specific-group',
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(models, testData, {
        iterations: 5,
        taskType: 'text-embedding',
        equivalenceGroup: 'specific-group',
      });
      cleanupIds.push(result.comparisonId);

      const historical = await benchmarkEngine.getHistoricalResults({
        equivalenceGroup: 'specific-group',
      });

      assert.ok(
        historical.length >= 1,
        'Should have at least one historical result'
      );
      const found = historical.find((r) => r.id === result.comparisonId);
      assert.ok(found);
      assert.equal(found.equivalenceGroup, 'specific-group');
    });

    it('should return empty array if no results match', async () => {
      const historical = await benchmarkEngine.getHistoricalResults({
        taskType: 'nonexistent-task-type-12345',
      });

      assert.ok(Array.isArray(historical));
      assert.equal(historical.length, 0);
    });

    it('should retrieve all results if no filters provided', async () => {
      const historical = await benchmarkEngine.getHistoricalResults({});

      assert.ok(Array.isArray(historical));
      // Should contain all benchmark results (may be empty if no benchmarks run)
    });
  });

  describe('edge cases', () => {
    it('should handle empty test data gracefully', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      await assert.rejects(
        async () => {
          await benchmarkEngine.compareBenchmark(models, [], {
            iterations: 5,
            taskType: 'text-embedding',
            equivalenceGroup: 'test',
          });
        },
        /test data.*empty/i
      );
    });

    it('should handle iterations = 0', async () => {
      const models = await createMockBenchmarkModels({
        outputDimensions: [512],
        count: 2,
      });
      cleanupModelKeys.push(...models.map((m) => m.id));

      const testData = generateTestData('text-embedding', 2);

      await assert.rejects(
        async () => {
          await benchmarkEngine.compareBenchmark(models, testData, {
            iterations: 0,
            taskType: 'text-embedding',
            equivalenceGroup: 'test',
          });
        },
        /iterations.*greater than 0/i
      );
    });

    it('should handle models from same framework', async () => {
      const model1 = await createMockModel({
        modelId: 'model-1',
        version: 'v1',
        framework: 'onnx',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      const model2 = await createMockModel({
        modelId: 'model-2',
        version: 'v1',
        framework: 'onnx',
        metadata: {
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
          outputDimensions: [512],
        },
      });
      cleanupModelKeys.push(model1.id, model2.id);

      const testData = generateTestData('text-embedding', 2);
      const result = await benchmarkEngine.compareBenchmark(
        [model1, model2],
        testData,
        {
          iterations: 5,
          taskType: 'text-embedding',
          equivalenceGroup: 'test',
        }
      );

      // Should work fine, just both models use same framework
      assert.ok(result.winner);
      assert.equal(result.modelIds.length, 2);

      cleanupIds.push(result.comparisonId);
    });
  });
});
