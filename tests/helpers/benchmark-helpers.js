import assert from 'node:assert';
import { createRestTables } from './rest-api.js';

// Create REST API tables interface for tests running outside Harper process
const tables = createRestTables();

/**
 * Create a mock model for testing benchmarks
 * @param {Object} options - Model configuration
 * @param {string} options.modelName - Model identifier
 * @param {string} options.modelVersion - Model version
 * @param {string} options.framework - Backend framework (onnx, tensorflowjs, ollama)
 * @param {Object} options.metadata - Model metadata
 * @returns {Promise<Object>} Created model record
 */
export async function createMockModel({ modelName, modelVersion = 'v1', framework = 'onnx', metadata = {} }) {
	const modelsTable = tables.get('Model');

	const model = {
		modelName,
		modelVersion,
		framework,
		stage: 'development',
		metadata: JSON.stringify(metadata),
		inputSchema: JSON.stringify({ type: 'object' }),
		outputSchema: JSON.stringify({ type: 'array' }),
	};

	const created = await modelsTable.put(model);
	return created;
}

/**
 * Create mock inference engine for testing
 * @param {Object} options - Configuration options
 * @param {number} options.latency - Simulated latency in ms
 * @param {boolean} options.shouldFail - Whether predictions should fail
 * @param {Array} options.output - Output to return from predictions
 * @returns {Object} Mock inference engine
 */
export function createMockInferenceEngine({ latency = 10, shouldFail = false, output = [Array(512).fill(0.1)] } = {}) {
	return {
		async predict(modelName, modelVersion, input) {
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
		async cleanup() {
			// No-op for mock
		},
	};
}

/**
 * Create mock inference engine with specific latency per model
 * Useful for testing latency-based comparisons
 * @param {Object} latencyMap - Map of modelName to latency in ms
 * @returns {Object} Mock inference engine
 */
export function createLatencyMockEngine(latencyMap) {
	return {
		async predict(modelName, modelVersion, input) {
			const latency = latencyMap[modelName] || 10;
			await new Promise((resolve) => setTimeout(resolve, latency));
			return [Array(512).fill(0.1)];
		},
		async initialize() {
			// No-op for mock
		},
		async cleanup() {
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
 * @param {number} options.startIndex - Starting index for model names (default: 0)
 * @returns {Promise<Array>} Array of created models
 */
export async function createMockBenchmarkModels({
	taskType = 'text-embedding',
	equivalenceGroup = 'test-model',
	outputDimensions = [512],
	count = 2,
	startIndex = 0,
} = {}) {
	const models = [];
	const frameworks = ['onnx', 'tensorflowjs', 'ollama'];

	for (let i = 0; i < count; i++) {
		const modelIndex = startIndex + i;
		// Use equivalence group in model name to avoid conflicts between parallel tests
		const modelName = `test-${equivalenceGroup}-${modelIndex}`;
		const model = await createMockModel({
			modelName,
			modelVersion: 'v1',
			framework: frameworks[modelIndex % frameworks.length],
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

// Re-export generateTestData from shared factory
export { generateTestData } from '../../src/core/utils/testDataFactory.js';

/**
 * Assert that latency metrics are valid
 * @param {Object} metrics - Metrics object to validate
 */
export function assertValidLatencyMetrics(metrics) {
	const requiredFields = ['avgLatency', 'p50Latency', 'p95Latency', 'p99Latency', 'minLatency', 'maxLatency'];

	for (const field of requiredFields) {
		if (typeof metrics[field] !== 'number' || metrics[field] < 0) {
			throw new Error(`Invalid ${field}: ${metrics[field]}`);
		}
	}

	// Verify order: min <= p50 <= p95 <= p99 <= max
	// Note: avg position varies by distribution, so we don't check it in the order
	if (
		metrics.minLatency > metrics.p50Latency ||
		metrics.p50Latency > metrics.p95Latency ||
		metrics.p95Latency > metrics.p99Latency ||
		metrics.p99Latency > metrics.maxLatency
	) {
		throw new Error(`Latency metrics are not in correct order: min=${metrics.minLatency}, p50=${metrics.p50Latency}, p95=${metrics.p95Latency}, p99=${metrics.p99Latency}, max=${metrics.maxLatency}`);
	}

	// Verify avg is within reasonable bounds
	if (metrics.avgLatency < metrics.minLatency || metrics.avgLatency > metrics.maxLatency) {
		throw new Error(`Average latency ${metrics.avgLatency} is outside min-max range [${metrics.minLatency}, ${metrics.maxLatency}]`);
	}
}

/**
 * Assert that error metrics are valid
 * @param {Object} metrics - Metrics object to validate
 * @param {number} totalIterations - Total number of iterations
 */
export function assertValidErrorMetrics(metrics, totalIterations) {
	if (typeof metrics.successCount !== 'number' || metrics.successCount < 0 || metrics.successCount > totalIterations) {
		throw new Error(`Invalid successCount: ${metrics.successCount}`);
	}

	if (typeof metrics.errorCount !== 'number' || metrics.errorCount < 0 || metrics.errorCount > totalIterations) {
		throw new Error(`Invalid errorCount: ${metrics.errorCount}`);
	}

	if (metrics.successCount + metrics.errorCount !== totalIterations) {
		throw new Error(
			`successCount + errorCount (${metrics.successCount + metrics.errorCount}) != totalIterations (${totalIterations})`
		);
	}

	if (typeof metrics.errorRate !== 'number' || metrics.errorRate < 0 || metrics.errorRate > 1) {
		throw new Error(`Invalid errorRate: ${metrics.errorRate}`);
	}

	const expectedErrorRate = metrics.errorCount / totalIterations;
	if (Math.abs(metrics.errorRate - expectedErrorRate) > 0.001) {
		throw new Error(`errorRate ${metrics.errorRate} doesn't match expected ${expectedErrorRate}`);
	}
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in ms
 * @param {number} interval - Check interval in ms
 */
export async function waitForCondition(condition, timeout = 5000, interval = 100) {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		if (await condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	throw new Error('Condition not met within timeout');
}

/**
 * Assert benchmark result structure and optional values
 */
export function assertBenchmarkResult(result, expected = {}) {
	assert.ok(result.comparisonId, 'Missing comparisonId');
	assert.ok(result.timestamp, 'Missing timestamp');
	assert.ok(result.completedAt, 'Missing completedAt');
	assert.ok(Array.isArray(result.modelIds), 'modelIds should be array');
	assert.ok(result.results, 'Missing results');

	if (expected.taskType) {
		assert.strictEqual(result.taskType, expected.taskType, 'taskType mismatch');
	}

	if (expected.equivalenceGroup) {
		assert.strictEqual(result.equivalenceGroup, expected.equivalenceGroup, 'equivalenceGroup mismatch');
	}

	if (expected.modelCount !== undefined) {
		assert.strictEqual(result.modelIds.length, expected.modelCount, 'model count mismatch');
	}

	if (!expected.allowNoWinner) {
		assert.ok(result.winner, 'Missing winner');
		assert.ok(result.winner.modelName, 'Winner missing modelName');
		assert.ok(result.winner.framework, 'Winner missing framework');
		assert.ok(typeof result.winner.avgLatency === 'number', 'Winner missing avgLatency');
	}
}

/**
 * Assert model metrics structure
 */
export function assertModelMetrics(metrics) {
	assert.ok(typeof metrics.avgLatency === 'number', 'Missing avgLatency');
	assert.ok(typeof metrics.p50Latency === 'number', 'Missing p50Latency');
	assert.ok(typeof metrics.p95Latency === 'number', 'Missing p95Latency');
	assert.ok(typeof metrics.p99Latency === 'number', 'Missing p99Latency');
	assert.ok(typeof metrics.minLatency === 'number', 'Missing minLatency');
	assert.ok(typeof metrics.maxLatency === 'number', 'Missing maxLatency');
	assert.ok(typeof metrics.errorRate === 'number', 'Missing errorRate');
	assert.ok(typeof metrics.successCount === 'number', 'Missing successCount');
	assert.ok(typeof metrics.errorCount === 'number', 'Missing errorCount');
}

/**
 * Assert API error response
 */
export function assertErrorResponse(response, expectedStatus = 400, expectedMessage = null) {
	assert.strictEqual(response.status, expectedStatus, `Expected status ${expectedStatus}`);
	assert.ok(response.error, 'Missing error field');

	if (expectedMessage) {
		assert.match(response.error, expectedMessage, 'Error message mismatch');
	}
}
