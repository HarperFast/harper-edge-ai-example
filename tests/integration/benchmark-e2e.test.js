import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { tables } from '@harperdb/harperdb';
import {
  createMockBenchmarkModels,
  createMockInferenceEngine,
  cleanupBenchmarkResults,
  cleanupTestModels,
  generateTestData,
} from '../helpers/benchmark-helpers.js';

/**
 * E2E Benchmark Test
 * Tests the complete workflow:
 * 1. Upload models with metadata
 * 2. Run benchmark comparison
 * 3. Verify winner selection
 * 4. Use winning model for personalization
 */
describe('Benchmark E2E Workflow', () => {
  let modelsTable;
  let resultsTable;
  let cleanupModelKeys = [];
  let cleanupResultIds = [];

  before(async () => {
    modelsTable = tables.get('Model');
    resultsTable = tables.get('BenchmarkResult');
  });

  after(async () => {
    await cleanupBenchmarkResults(cleanupResultIds);
    await cleanupTestModels(cleanupModelKeys);
  });

  test('complete workflow: upload → benchmark → use winner', async () => {
    // STEP 1: Upload models with equivalent metadata
    console.log('Step 1: Creating equivalent models...');

    const models = await createMockBenchmarkModels({
      taskType: 'text-embedding',
      equivalenceGroup: 'e2e-test-models',
      outputDimensions: [512],
      count: 3, // Create 3 models to compare
    });
    cleanupModelKeys.push(...models.map((m) => m.id));

    assert.equal(models.length, 3, 'Should create 3 models');

    // Verify models are in the table
    for (const model of models) {
      const stored = await modelsTable.get(model.id);
      assert.ok(stored, `Model ${model.id} should be stored`);

      const metadata = JSON.parse(stored.metadata);
      assert.equal(metadata.taskType, 'text-embedding');
      assert.equal(metadata.equivalenceGroup, 'e2e-test-models');
    }

    console.log('✓ Models created successfully');

    // STEP 2: Run benchmark comparison
    console.log('Step 2: Running benchmark comparison...');

    const { BenchmarkEngine } = await import(
      '../../src/core/BenchmarkEngine.js'
    );

    // Create mock inference engine with different latencies per model
    const mockInferenceEngine = {
      predict: async (modelId, version, input) => {
        // Simulate different latencies based on model
        let latency;
        if (modelId === 'test-model-0') {
          latency = 5; // Fastest
        } else if (modelId === 'test-model-1') {
          latency = 15; // Medium
        } else {
          latency = 25; // Slowest
        }

        await new Promise((resolve) => setTimeout(resolve, latency));

        // Return mock embeddings
        return [Array(512).fill(0.1)];
      },
      initialize: async () => {},
    };

    const benchmarkEngine = new BenchmarkEngine(mockInferenceEngine);

    const testData = generateTestData('text-embedding', 5);
    const benchmarkResult = await benchmarkEngine.compareBenchmark(
      models,
      testData,
      {
        iterations: 10,
        taskType: 'text-embedding',
        equivalenceGroup: 'e2e-test-models',
        runBy: 'e2e-test',
        notes: 'E2E workflow test',
      }
    );

    cleanupResultIds.push(benchmarkResult.comparisonId);

    console.log('✓ Benchmark completed');

    // STEP 3: Verify benchmark results
    console.log('Step 3: Verifying benchmark results...');

    assert.ok(benchmarkResult.comparisonId, 'Should have comparison ID');
    assert.equal(benchmarkResult.modelIds.length, 3, 'Should compare 3 models');
    assert.ok(benchmarkResult.winner, 'Should identify a winner');
    assert.ok(benchmarkResult.results, 'Should have results for all models');

    // Verify winner is the fastest model
    assert.equal(
      benchmarkResult.winner.modelId,
      'test-model-0:v1',
      'test-model-0 should be the winner (lowest latency)'
    );

    // Verify metrics for all models
    for (const modelId of benchmarkResult.modelIds) {
      const metrics = benchmarkResult.results[modelId];

      assert.ok(
        metrics.avgLatency > 0,
        `${modelId} should have avgLatency > 0`
      );
      assert.ok(
        metrics.p50Latency >= 0,
        `${modelId} should have p50Latency >= 0`
      );
      assert.ok(
        metrics.p95Latency >= 0,
        `${modelId} should have p95Latency >= 0`
      );
      assert.ok(
        metrics.errorRate >= 0 && metrics.errorRate <= 1,
        `${modelId} errorRate should be between 0 and 1`
      );
      assert.equal(
        metrics.successCount + metrics.errorCount,
        10,
        `${modelId} should have 10 total attempts`
      );
    }

    // Verify latency ordering
    const model0Latency = benchmarkResult.results['test-model-0:v1'].avgLatency;
    const model1Latency = benchmarkResult.results['test-model-1:v1'].avgLatency;
    const model2Latency = benchmarkResult.results['test-model-2:v1'].avgLatency;

    assert.ok(
      model0Latency < model1Latency,
      'Model 0 should be faster than Model 1'
    );
    assert.ok(
      model1Latency < model2Latency,
      'Model 1 should be faster than Model 2'
    );

    console.log('✓ Benchmark results verified');

    // STEP 4: Verify result is stored in Harper table
    console.log('Step 4: Verifying stored benchmark result...');

    const storedResult = await resultsTable.get(benchmarkResult.comparisonId);

    assert.ok(storedResult, 'Result should be stored in BenchmarkResult table');
    assert.equal(storedResult.taskType, 'text-embedding');
    assert.equal(storedResult.equivalenceGroup, 'e2e-test-models');
    assert.equal(storedResult.iterations, 10);
    assert.equal(storedResult.runBy, 'e2e-test');

    // Verify JSON fields
    const storedModelIds = JSON.parse(storedResult.modelIds);
    assert.equal(storedModelIds.length, 3);

    const storedResults = JSON.parse(storedResult.results);
    assert.ok(storedResults['test-model-0:v1']);
    assert.ok(storedResults['test-model-1:v1']);
    assert.ok(storedResults['test-model-2:v1']);

    console.log('✓ Stored result verified');

    // STEP 5: Query historical results
    console.log('Step 5: Querying historical results...');

    const history = await benchmarkEngine.getHistoricalResults({
      taskType: 'text-embedding',
      equivalenceGroup: 'e2e-test-models',
    });

    assert.ok(Array.isArray(history), 'History should be an array');
    assert.ok(
      history.length >= 1,
      'Should have at least 1 historical result'
    );

    const found = history.find((r) => r.id === benchmarkResult.comparisonId);
    assert.ok(found, 'Should find our benchmark in history');

    console.log('✓ Historical results verified');

    // STEP 6: Use winning model with PersonalizationEngine
    console.log('Step 6: Using winning model for personalization...');

    const { PersonalizationEngine } = await import(
      '../../src/PersonalizationEngine.js'
    );

    // Create personalization engine with winner model
    const winnerModelId = benchmarkResult.winner.modelId.split(':')[0];
    const winnerVersion = benchmarkResult.winner.modelId.split(':')[1];

    const personalizationEngine = new PersonalizationEngine({
      inferenceEngine: mockInferenceEngine,
      modelId: winnerModelId,
      version: winnerVersion,
    });

    await personalizationEngine.initialize();

    assert.ok(
      personalizationEngine.isReady(),
      'Personalization engine should be ready'
    );

    // Test product enhancement
    const products = [
      { name: 'Tent', description: 'Camping tent', category: 'Shelter' },
      {
        name: 'Sleeping Bag',
        description: 'Warm sleeping bag',
        category: 'Sleep',
      },
      { name: 'Backpack', description: 'Hiking backpack', category: 'Gear' },
    ];

    const userContext = {
      activityType: 'camping',
      experienceLevel: 'beginner',
      season: 'summer',
    };

    const enhanced = await personalizationEngine.enhanceProducts(
      products,
      userContext
    );

    assert.equal(enhanced.length, 3, 'Should enhance all 3 products');

    for (const product of enhanced) {
      assert.ok(
        product.personalizedScore !== undefined,
        'Product should have personalizedScore'
      );
      assert.equal(
        product.personalized,
        true,
        'Product should be marked as personalized'
      );
    }

    console.log('✓ Personalization with winning model verified');

    // STEP 7: Verify model info
    const modelInfo = personalizationEngine.getLoadedModels();
    assert.equal(modelInfo.length, 1);
    assert.equal(modelInfo[0].name, `${winnerModelId}:${winnerVersion}`);
    assert.equal(modelInfo[0].mode, 'inference-engine');

    console.log('✓ E2E workflow completed successfully');
  });

  test('benchmark with model failures should exclude failed models from winner', async () => {
    console.log('Testing benchmark with failures...');

    // Create 3 models
    const models = await createMockBenchmarkModels({
      taskType: 'text-embedding',
      equivalenceGroup: 'failure-test',
      outputDimensions: [512],
      count: 3,
    });
    cleanupModelKeys.push(...models.map((m) => m.id));

    // Create mock engine where model-1 always fails
    const mockInferenceEngine = {
      predict: async (modelId, version, input) => {
        if (modelId === 'test-model-1') {
          throw new Error('Model failed');
        }

        await new Promise((resolve) =>
          setTimeout(resolve, modelId === 'test-model-0' ? 10 : 20)
        );
        return [Array(512).fill(0.1)];
      },
      initialize: async () => {},
    };

    const { BenchmarkEngine } = await import(
      '../../src/core/BenchmarkEngine.js'
    );
    const benchmarkEngine = new BenchmarkEngine(mockInferenceEngine);

    const testData = generateTestData('text-embedding', 2);
    const result = await benchmarkEngine.compareBenchmark(models, testData, {
      iterations: 5,
      taskType: 'text-embedding',
      equivalenceGroup: 'failure-test',
    });

    cleanupResultIds.push(result.comparisonId);

    // Verify model-1 has 100% error rate
    assert.equal(result.results['test-model-1:v1'].errorRate, 1.0);
    assert.equal(result.results['test-model-1:v1'].successCount, 0);

    // Verify winner is NOT model-1
    assert.notEqual(result.winner.modelId, 'test-model-1:v1');

    // Verify winner is model-0 (lowest latency among successful models)
    assert.equal(result.winner.modelId, 'test-model-0:v1');

    console.log('✓ Failure handling verified');
  });

  test('should support different output dimensions', async () => {
    console.log('Testing different output dimensions...');

    // Create models with 768-dimensional outputs (e.g., BERT)
    const models = await createMockBenchmarkModels({
      taskType: 'text-embedding',
      equivalenceGroup: 'bert-test',
      outputDimensions: [768],
      count: 2,
    });
    cleanupModelKeys.push(...models.map((m) => m.id));

    const mockInferenceEngine = {
      predict: async (modelId, version, input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [Array(768).fill(0.1)]; // 768-dimensional
      },
      initialize: async () => {},
    };

    const { BenchmarkEngine } = await import(
      '../../src/core/BenchmarkEngine.js'
    );
    const benchmarkEngine = new BenchmarkEngine(mockInferenceEngine);

    const testData = generateTestData('text-embedding', 2);
    const result = await benchmarkEngine.compareBenchmark(models, testData, {
      iterations: 5,
      taskType: 'text-embedding',
      equivalenceGroup: 'bert-test',
    });

    cleanupResultIds.push(result.comparisonId);

    assert.ok(result.winner);
    assert.equal(result.modelIds.length, 2);

    console.log('✓ Different dimensions supported');
  });
});
