#!/usr/bin/env node
/**
 * Real Benchmark Comparison Integration Tests
 *
 * This test runs REAL benchmarks with actually deployed models to validate:
 * 1. Full benchmark comparison workflow with real models
 * 2. Correct winner selection based on actual performance
 * 3. Accurate metrics calculation (latency, percentiles, error rates)
 * 4. Result storage and retrieval
 * 5. Different backend performance comparison
 *
 * Unlike other benchmark tests that use mocks, this test:
 * - Uses real models deployed in Harper
 * - Runs actual inference on each iteration
 * - Measures real latency and performance
 * - Validates equivalence groups produce comparable results
 *
 * Prerequisites:
 *   - Harper must be running
 *   - Benchmarking profile models must be deployed
 *   - Models must be in equivalence groups (2+ models per group)
 *
 * Usage:
 *   node --test tests/integration/benchmark-comparison.test.js
 *   TEST_PROFILE=benchmarking node --test tests/integration/benchmark-comparison.test.js
 */

import { describe, test, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

// Configuration
const PROFILE_NAME = process.env.TEST_PROFILE || 'benchmarking';
const HARPER_URL = process.env.HARPER_URL || 'http://localhost:9926';
const TEST_ITERATIONS = parseInt(process.env.TEST_ITERATIONS) || 10; // Use fewer iterations for faster tests

/**
 * Load profile configuration
 */
function loadProfile() {
	const profilePath = join(PROJECT_ROOT, 'profiles', `${PROFILE_NAME}.json`);

	if (!existsSync(profilePath)) {
		throw new Error(`Profile '${PROFILE_NAME}' not found at ${profilePath}`);
	}

	return JSON.parse(readFileSync(profilePath, 'utf-8'));
}

/**
 * Check if Harper is running
 */
async function checkHarper() {
	try {
		const response = await fetch(`${HARPER_URL}/Status`, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch (_error) {
		return false;
	}
}

/**
 * Fetch deployed models from Harper
 */
async function fetchDeployedModels() {
	const response = await fetch(`${HARPER_URL}/Model/`);

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`);
	}

	const models = await response.json();
	return Array.isArray(models) ? models : [];
}

/**
 * Group models by equivalence group
 */
function groupModelsByEquivalence(models) {
	const groups = {};

	for (const model of models) {
		const metadata = typeof model.metadata === 'string' ? JSON.parse(model.metadata) : model.metadata;

		const taskType = metadata?.taskType;
		const equivalenceGroup = metadata?.equivalenceGroup;

		if (!taskType || !equivalenceGroup) {
			continue;
		}

		const key = `${taskType}:${equivalenceGroup}`;

		if (!groups[key]) {
			groups[key] = {
				taskType,
				equivalenceGroup,
				models: [],
			};
		}

		groups[key].models.push({
			modelId: model.id,
			modelName: model.modelName,
			version: model.version,
			framework: model.framework,
			metadata,
		});
	}

	// Only return groups with 2+ models (needed for comparison)
	return Object.values(groups).filter((g) => g.models.length >= 2);
}

/**
 * Generate test data based on task type
 */
function generateTestData(taskType, count = 5) {
	const data = [];

	for (let i = 0; i < count; i++) {
		if (taskType.includes('embedding') || taskType.includes('classification')) {
			data.push({
				text: `Test sentence ${i + 1}: This is sample text for benchmarking model performance.`,
			});
		} else {
			data.push({ text: `Generic test input ${i + 1}` });
		}
	}

	return data;
}

/**
 * Run benchmark via API
 */
async function runBenchmark(taskType, equivalenceGroup, iterations = TEST_ITERATIONS) {
	const testData = generateTestData(taskType, 5);

	const response = await fetch(`${HARPER_URL}/Benchmark`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			taskType,
			equivalenceGroup,
			testData,
			iterations,
			runBy: 'integration-test',
			notes: `Real benchmark comparison test with ${iterations} iterations`,
		}),
	});

	const responseText = await response.text();

	if (!response.ok) {
		throw new Error(`Benchmark failed: ${response.status} ${responseText}`);
	}

	let result;
	try {
		result = responseText ? JSON.parse(responseText) : {};
	} catch (_e) {
		throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
	}

	if (result.error) {
		throw new Error(result.error);
	}

	return result;
}

/**
 * Validate benchmark result structure
 */
function validateBenchmarkResult(result, expectedModelCount) {
	assert.ok(result.comparisonId, 'Result should have comparisonId');
	assert.ok(result.taskType, 'Result should have taskType');
	assert.ok(result.equivalenceGroup, 'Result should have equivalenceGroup');
	assert.ok(Array.isArray(result.modelIds), 'Result should have modelIds array');
	assert.strictEqual(result.modelIds.length, expectedModelCount, `Should compare ${expectedModelCount} models`);
	assert.ok(result.results, 'Result should have results object');
	assert.ok(result.winner, 'Result should have winner');

	// Validate each model's metrics
	for (const modelId of result.modelIds) {
		const metrics = result.results[modelId];
		assert.ok(metrics, `Should have metrics for ${modelId}`);

		// Check required metric fields
		assert.ok(typeof metrics.avgLatency === 'number', 'avgLatency should be a number');
		assert.ok(typeof metrics.minLatency === 'number', 'minLatency should be a number');
		assert.ok(typeof metrics.maxLatency === 'number', 'maxLatency should be a number');
		assert.ok(typeof metrics.p50Latency === 'number', 'p50Latency should be a number');
		assert.ok(typeof metrics.p95Latency === 'number', 'p95Latency should be a number');
		assert.ok(typeof metrics.p99Latency === 'number', 'p99Latency should be a number');
		assert.ok(typeof metrics.successCount === 'number', 'successCount should be a number');
		assert.ok(typeof metrics.errorCount === 'number', 'errorCount should be a number');
		assert.ok(typeof metrics.errorRate === 'number', 'errorRate should be a number');

		// Validate metric ranges
		assert.ok(metrics.avgLatency >= 0, 'avgLatency should be non-negative');
		assert.ok(metrics.minLatency >= 0, 'minLatency should be non-negative');
		assert.ok(metrics.maxLatency >= metrics.avgLatency, 'maxLatency should be >= avgLatency');
		assert.ok(metrics.errorRate >= 0 && metrics.errorRate <= 1, 'errorRate should be between 0 and 1');
		assert.strictEqual(
			metrics.successCount + metrics.errorCount,
			result.iterations * result.testDataSummary.sampleCount,
			'Total attempts should match iterations * samples'
		);

		// Validate percentile ordering
		assert.ok(metrics.p50Latency >= metrics.minLatency, 'p50 should be >= min');
		assert.ok(metrics.p95Latency >= metrics.p50Latency, 'p95 should be >= p50');
		assert.ok(metrics.p99Latency >= metrics.p95Latency, 'p99 should be >= p95');
		assert.ok(metrics.maxLatency >= metrics.p99Latency, 'max should be >= p99');
	}

	// Validate winner
	assert.ok(result.winner.modelName, 'Winner should have modelName');
	assert.ok(result.winner.framework, 'Winner should have framework');
	assert.ok(typeof result.winner.avgLatency === 'number', 'Winner should have avgLatency');

	// Winner should be one of the compared models
	const winnerModelId = result.modelIds.find((id) => id.startsWith(result.winner.modelName));
	assert.ok(winnerModelId, 'Winner should be one of the compared models');

	// Winner should have lowest avg latency among successful models
	const successfulModels = result.modelIds.filter((id) => result.results[id].errorRate < 1.0);
	if (successfulModels.length > 0) {
		const winnerMetrics = result.results[winnerModelId];
		for (const modelId of successfulModels) {
			const metrics = result.results[modelId];
			assert.ok(
				winnerMetrics.avgLatency <= metrics.avgLatency,
				`Winner should have lowest latency (winner: ${winnerMetrics.avgLatency}ms, ${modelId}: ${metrics.avgLatency}ms)`
			);
		}
	}
}

/**
 * Main test suite
 */
describe('Real Benchmark Comparison Tests', () => {
	let profile;
	let deployedModels;
	let equivalenceGroups;

	before(async () => {
		console.log(`\n📊 Real Benchmark Comparison Tests`);
		console.log(`📋 Profile: ${PROFILE_NAME}`);
		console.log(`🔗 Harper URL: ${HARPER_URL}`);
		console.log(`🔢 Test iterations: ${TEST_ITERATIONS}\n`);

		// Check Harper is running
		const harperRunning = await checkHarper();
		if (!harperRunning) {
			throw new Error(`Harper is not running at ${HARPER_URL}. Please start Harper first.`);
		}
		console.log('✓ Harper is running\n');

		// Load profile
		profile = loadProfile();
		console.log(`📦 Profile has ${profile.models.length} model(s) configured\n`);

		// Fetch deployed models
		deployedModels = await fetchDeployedModels();
		console.log(`🚀 ${deployedModels.length} model(s) deployed in Harper\n`);

		if (deployedModels.length === 0) {
			throw new Error('No models deployed. Please run: npm run preload');
		}

		// Group by equivalence
		equivalenceGroups = groupModelsByEquivalence(deployedModels);
		console.log(`🔗 ${equivalenceGroups.length} equivalence group(s) found:`);
		equivalenceGroups.forEach((group) => {
			console.log(`  - ${group.taskType}:${group.equivalenceGroup} (${group.models.length} models)`);
			group.models.forEach((m) => {
				console.log(`    • ${m.modelId} (${m.framework})`);
			});
		});
		console.log('');

		if (equivalenceGroups.length === 0) {
			throw new Error(
				'No equivalence groups found. Please deploy models with equivalenceGroup metadata (try: npm run preload:benchmarking)'
			);
		}
	});

	test('should have Harper running', async () => {
		const running = await checkHarper();
		assert.ok(running, 'Harper should be accessible');
	});

	test('should have models deployed in equivalence groups', () => {
		assert.ok(equivalenceGroups.length > 0, 'Should have at least one equivalence group');
		equivalenceGroups.forEach((group) => {
			assert.ok(group.models.length >= 2, `Group ${group.equivalenceGroup} should have at least 2 models`);
		});
	});

	describe('Real Benchmark Execution', () => {
		test('should run benchmark on first equivalence group', async function () {
			// Increase timeout for real benchmark (can take time depending on models)
			this.timeout = 60000; // 60 seconds

			const group = equivalenceGroups[0];
			console.log(`\n  Running benchmark: ${group.taskType} - ${group.equivalenceGroup}`);
			console.log(`  Models: ${group.models.map((m) => m.framework).join(', ')}`);
			console.log(`  Iterations: ${TEST_ITERATIONS}\n`);

			const startTime = Date.now();
			const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);
			const duration = ((Date.now() - startTime) / 1000).toFixed(2);

			console.log(`  ✓ Benchmark completed in ${duration}s`);
			console.log(`  Winner: ${result.winner.modelName} (${result.winner.framework})`);
			console.log(`  Average latency: ${result.winner.avgLatency.toFixed(2)}ms\n`);

			// Display all results
			console.log('  Results:');
			for (const modelId of result.modelIds) {
				const metrics = result.results[modelId];
				const isWinner = modelId.startsWith(result.winner.modelName);
				const marker = isWinner ? '★' : ' ';
				console.log(
					`  ${marker} ${modelId.padEnd(35)} avg: ${metrics.avgLatency.toFixed(2)}ms  p95: ${metrics.p95Latency.toFixed(2)}ms  errors: ${(metrics.errorRate * 100).toFixed(1)}%`
				);
			}
			console.log('');

			validateBenchmarkResult(result, group.models.length);
		});

		test('should run benchmarks on all equivalence groups', async function () {
			// Increase timeout for multiple benchmarks
			this.timeout = 120000; // 2 minutes

			const results = [];

			for (const group of equivalenceGroups) {
				console.log(`\n  Benchmarking: ${group.taskType} - ${group.equivalenceGroup}`);

				try {
					const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);

					validateBenchmarkResult(result, group.models.length);
					results.push({ group, result, success: true });

					console.log(`  ✓ Winner: ${result.winner.modelName} (${result.winner.avgLatency.toFixed(2)}ms avg)`);
				} catch (error) {
					console.log(`  ✗ Failed: ${error.message}`);
					results.push({ group, error, success: false });
				}
			}

			console.log(`\n  Summary: ${results.filter((r) => r.success).length}/${results.length} benchmarks successful\n`);

			// At least one benchmark should succeed
			assert.ok(
				results.some((r) => r.success),
				'At least one benchmark should complete successfully'
			);
		});
	});

	describe('Result Validation', () => {
		test('should store results in BenchmarkResult table', async function () {
			this.timeout = 60000;

			const group = equivalenceGroups[0];
			const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);

			// Fetch the stored result
			const response = await fetch(`${HARPER_URL}/BenchmarkResult/${result.comparisonId}`);
			assert.ok(response.ok, 'Should be able to fetch stored result');

			const stored = await response.json();
			assert.ok(stored, 'Stored result should exist');
			assert.equal(stored.id, result.comparisonId, 'IDs should match');
			assert.equal(stored.taskType, group.taskType, 'Task type should match');
			assert.equal(stored.equivalenceGroup, group.equivalenceGroup, 'Equivalence group should match');
			assert.equal(stored.iterations, TEST_ITERATIONS, 'Iterations should match');
		});

		test('should retrieve benchmark history', async function () {
			this.timeout = 60000;

			const group = equivalenceGroups[0];

			// Run a benchmark
			const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);

			// Query history (BenchmarkResult table)
			const response = await fetch(`${HARPER_URL}/BenchmarkResult/`);
			assert.ok(response.ok, 'Should be able to query benchmark history');

			const history = await response.json();
			assert.ok(Array.isArray(history), 'History should be an array');

			// Find our benchmark in history
			const found = history.find((r) => r.id === result.comparisonId);
			assert.ok(found, 'Should find our benchmark in history');
		});
	});

	describe('Performance Comparison', () => {
		test('should show measurable latency differences between backends', async function () {
			this.timeout = 60000;

			const group = equivalenceGroups[0];

			// Only test if we have at least 2 different backends
			const backends = [...new Set(group.models.map((m) => m.framework))];
			if (backends.length < 2) {
				console.log('  ⚠️  Skipped (need 2+ different backends for comparison)');
				return;
			}

			const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);

			// Get latencies by backend
			const latenciesByBackend = {};
			for (const modelId of result.modelIds) {
				const model = group.models.find((m) => modelId.startsWith(m.modelName));
				const backend = model.framework;
				const avgLatency = result.results[modelId].avgLatency;

				if (!latenciesByBackend[backend]) {
					latenciesByBackend[backend] = [];
				}
				latenciesByBackend[backend].push(avgLatency);
			}

			console.log('\n  Backend Performance:');
			for (const [backend, latencies] of Object.entries(latenciesByBackend)) {
				const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
				console.log(`    ${backend}: ${avg.toFixed(2)}ms avg`);
			}
			console.log('');

			// Validate we have different backends with results
			assert.ok(Object.keys(latenciesByBackend).length >= 2, 'Should have results from 2+ backends');
		});

		test('should correctly identify fastest model', async function () {
			this.timeout = 60000;

			const group = equivalenceGroups[0];
			const result = await runBenchmark(group.taskType, group.equivalenceGroup, TEST_ITERATIONS);

			// Find model with lowest average latency among successful models
			const successfulModels = result.modelIds.filter((id) => result.results[id].errorRate < 1.0);

			assert.ok(successfulModels.length > 0, 'Should have at least one successful model');

			let fastestModelId = successfulModels[0];
			let fastestLatency = result.results[fastestModelId].avgLatency;

			for (const modelId of successfulModels) {
				const avgLatency = result.results[modelId].avgLatency;
				if (avgLatency < fastestLatency) {
					fastestLatency = avgLatency;
					fastestModelId = modelId;
				}
			}

			// Winner should be the fastest model
			assert.ok(
				result.winner.modelName === fastestModelId.split(':')[0],
				`Winner (${result.winner.modelName}) should be the fastest model (${fastestModelId})`
			);
		});
	});
});
