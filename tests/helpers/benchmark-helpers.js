import { tables } from '@harperdb/harperdb';

/**
 * Create a mock model for testing benchmarks
 * @param {Object} options - Model configuration
 * @param {string} options.modelId - Model identifier
 * @param {string} options.version - Model version
 * @param {string} options.framework - Backend framework (onnx, tensorflowjs, ollama)
 * @param {Object} options.metadata - Model metadata
 * @returns {Promise<Object>} Created model record
 */
export async function createMockModel({
  modelId,
  version = 'v1',
  framework = 'onnx',
  metadata = {},
}) {
  const modelsTable = tables.get('Model');
  const key = `${modelId}:${version}`;

  const model = {
    id: key,
    modelId,
    version,
    framework,
    stage: 'development',
    metadata: JSON.stringify(metadata),
    inputSchema: JSON.stringify({ type: 'object' }),
    outputSchema: JSON.stringify({ type: 'array' }),
    uploadedAt: Date.now(),
  };

  await modelsTable.put(model);
  return model;
}

/**
 * Create mock inference engine for testing
 * @param {Object} options - Configuration options
 * @param {number} options.latency - Simulated latency in ms
 * @param {boolean} options.shouldFail - Whether predictions should fail
 * @param {Array} options.output - Output to return from predictions
 * @returns {Object} Mock inference engine
 */
export function createMockInferenceEngine({
  latency = 10,
  shouldFail = false,
  output = [Array(512).fill(0.1)],
} = {}) {
  return {
    async predict(modelId, version, input) {
      // Simulate latency
      await new Promise((resolve) => setTimeout(resolve, latency));

      if (shouldFail) {
        throw new Error('Prediction failed');
      }

      return output;
    },
    async initialize() {
      // No-op for mock
    },
  };
}

/**
 * Create mock inference engine with specific latency per model
 * Useful for testing latency-based comparisons
 * @param {Object} latencyMap - Map of modelId to latency in ms
 * @returns {Object} Mock inference engine
 */
export function createLatencyMockEngine(latencyMap) {
  return {
    async predict(modelId, version, input) {
      const latency = latencyMap[modelId] || 10;
      await new Promise((resolve) => setTimeout(resolve, latency));
      return [Array(512).fill(0.1)];
    },
    async initialize() {
      // No-op for mock
    },
  };
}

/**
 * Create mock models for benchmark comparison
 * @param {Object} options - Configuration
 * @param {string} options.taskType - Task type for models
 * @param {string} options.equivalenceGroup - Equivalence group
 * @param {Array} options.outputDimensions - Output dimensions
 * @param {number} options.count - Number of models to create (default: 2)
 * @returns {Promise<Array>} Array of created models
 */
export async function createMockBenchmarkModels({
  taskType = 'text-embedding',
  equivalenceGroup = 'test-model',
  outputDimensions = [512],
  count = 2,
} = {}) {
  const models = [];
  const frameworks = ['onnx', 'tensorflowjs', 'ollama'];

  for (let i = 0; i < count; i++) {
    const model = await createMockModel({
      modelId: `test-model-${i}`,
      version: 'v1',
      framework: frameworks[i % frameworks.length],
      metadata: {
        taskType,
        equivalenceGroup,
        outputDimensions,
      },
    });
    models.push(model);
  }

  return models;
}

/**
 * Cleanup benchmark results from tests
 * @param {string[]} ids - Array of benchmark result IDs to delete
 */
export async function cleanupBenchmarkResults(ids = []) {
  const resultsTable = tables.get('BenchmarkResult');

  for (const id of ids) {
    try {
      await resultsTable.delete(id);
    } catch (err) {
      // Ignore if doesn't exist
    }
  }
}

/**
 * Cleanup all test benchmark results
 */
export async function cleanupAllBenchmarkResults() {
  const resultsTable = tables.get('BenchmarkResult');
  const testResults = [];

  for await (const record of resultsTable.search()) {
    testResults.push(record);
  }

  for (const result of testResults) {
    await resultsTable.delete(result.id);
  }
}

/**
 * Cleanup test models
 * @param {string[]} modelKeys - Array of model keys (id:version format)
 */
export async function cleanupTestModels(modelKeys) {
  const modelsTable = tables.get('Model');

  for (const key of modelKeys) {
    try {
      await modelsTable.delete(key);
    } catch (err) {
      // Ignore if doesn't exist
    }
  }
}

/**
 * Generate test data for benchmarking
 * @param {string} taskType - Type of task
 * @param {number} count - Number of test samples
 * @returns {Array} Test data array
 */
export function generateTestData(taskType = 'text-embedding', count = 5) {
  switch (taskType) {
    case 'text-embedding':
      return Array.from({ length: count }, (_, i) => ({
        texts: [`Test sentence ${i + 1}`],
      }));

    case 'image-classification':
      return Array.from({ length: count }, (_, i) => ({
        image: Buffer.alloc(224 * 224 * 3), // Mock image data
        label: i,
      }));

    case 'sentiment-analysis':
      return Array.from({ length: count }, (_, i) => ({
        text: `Sample text for sentiment analysis ${i + 1}`,
      }));

    default:
      return Array.from({ length: count }, (_, i) => ({
        input: `test-${i + 1}`,
      }));
  }
}

/**
 * Assert that latency metrics are valid
 * @param {Object} metrics - Metrics object to validate
 */
export function assertValidLatencyMetrics(metrics) {
  const requiredFields = [
    'avgLatency',
    'p50Latency',
    'p95Latency',
    'p99Latency',
    'minLatency',
    'maxLatency',
  ];

  for (const field of requiredFields) {
    if (typeof metrics[field] !== 'number' || metrics[field] < 0) {
      throw new Error(`Invalid ${field}: ${metrics[field]}`);
    }
  }

  // Verify order: min <= p50 <= avg <= p95 <= p99 <= max
  if (
    metrics.minLatency > metrics.p50Latency ||
    metrics.p50Latency > metrics.avgLatency ||
    metrics.avgLatency > metrics.p95Latency ||
    metrics.p95Latency > metrics.p99Latency ||
    metrics.p99Latency > metrics.maxLatency
  ) {
    throw new Error('Latency metrics are not in correct order');
  }
}

/**
 * Assert that error metrics are valid
 * @param {Object} metrics - Metrics object to validate
 * @param {number} totalIterations - Total number of iterations
 */
export function assertValidErrorMetrics(metrics, totalIterations) {
  if (
    typeof metrics.successCount !== 'number' ||
    metrics.successCount < 0 ||
    metrics.successCount > totalIterations
  ) {
    throw new Error(`Invalid successCount: ${metrics.successCount}`);
  }

  if (
    typeof metrics.errorCount !== 'number' ||
    metrics.errorCount < 0 ||
    metrics.errorCount > totalIterations
  ) {
    throw new Error(`Invalid errorCount: ${metrics.errorCount}`);
  }

  if (metrics.successCount + metrics.errorCount !== totalIterations) {
    throw new Error(
      `successCount + errorCount (${metrics.successCount + metrics.errorCount}) != totalIterations (${totalIterations})`
    );
  }

  if (
    typeof metrics.errorRate !== 'number' ||
    metrics.errorRate < 0 ||
    metrics.errorRate > 1
  ) {
    throw new Error(`Invalid errorRate: ${metrics.errorRate}`);
  }

  const expectedErrorRate = metrics.errorCount / totalIterations;
  if (Math.abs(metrics.errorRate - expectedErrorRate) > 0.001) {
    throw new Error(
      `errorRate ${metrics.errorRate} doesn't match expected ${expectedErrorRate}`
    );
  }
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in ms
 * @param {number} interval - Check interval in ms
 */
export async function waitForCondition(
  condition,
  timeout = 5000,
  interval = 100
) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Condition not met within timeout');
}
