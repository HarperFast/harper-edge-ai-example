#!/usr/bin/env node
/**
 * Profile-Based Deployment Integration Tests
 *
 * Dynamic integration tests that:
 * 1. Read the active profile from configuration
 * 2. Check .env for backend availability (OLLAMA_HOST, etc.)
 * 3. Query Harper to see what models are actually deployed
 * 4. Test each deployed model's inference end-to-end
 * 5. Validate equivalence groups for benchmarking profile
 *
 * Usage:
 *   node --test tests/integration/profile-deployment.test.js
 *   TEST_PROFILE=testing node --test tests/integration/profile-deployment.test.js
 *   TEST_PROFILE=benchmarking node --test tests/integration/profile-deployment.test.js
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
const PROFILE_NAME = process.env.TEST_PROFILE || 'testing';
const PROFILE_CONFIG = process.env.PROFILE_CONFIG || 'model-profiles.json';
const HARPER_URL = process.env.HARPER_URL || 'http://localhost:9926';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Load model profile configuration
 */
function loadProfile() {
	const configPath = join(PROJECT_ROOT, PROFILE_CONFIG);

	if (!existsSync(configPath)) {
		throw new Error(`Profile configuration not found: ${configPath}`);
	}

	const config = JSON.parse(readFileSync(configPath, 'utf-8'));

	if (!config.profiles || !config.profiles[PROFILE_NAME]) {
		throw new Error(`Profile '${PROFILE_NAME}' not found in ${PROFILE_CONFIG}`);
	}

	return config.profiles[PROFILE_NAME];
}

/**
 * Check if backend is configured and available
 */
async function checkBackendAvailability() {
	const availability = {
		transformers: true, // Always available (no external deps)
		onnx: true, // Always available (no external deps)
		tensorflow: true, // TensorFlow.js is a dependency
		ollama: false,
	};

	// Check if Ollama is configured and reachable
	if (OLLAMA_HOST) {
		try {
			const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
				method: 'GET',
				signal: AbortSignal.timeout(2000), // 2 second timeout
			});
			availability.ollama = response.ok;
		} catch {
			// Ollama not available
			availability.ollama = false;
		}
	}

	return availability;
}

/**
 * Fetch deployed models from Harper
 */
async function fetchDeployedModels() {
	try {
		const response = await fetch(`${HARPER_URL}/Model/`);

		if (!response.ok) {
			throw new Error(`Failed to fetch models: ${response.statusText}`);
		}

		const models = await response.json();
		return Array.isArray(models) ? models : [];
	} catch (error) {
		throw new Error(`Cannot connect to Harper at ${HARPER_URL}: ${error.message}`);
	}
}

/**
 * Test model inference
 */
async function testModelInference(model) {
	// Prepare test input based on task type
	const metadata = typeof model.metadata === 'string' ? JSON.parse(model.metadata) : model.metadata;

	const taskType = metadata?.taskType || 'text-embedding';

	let inputs;
	if (taskType.includes('embedding') || taskType.includes('classification')) {
		inputs = { text: 'This is a test sentence for model inference validation' };
	} else if (taskType.includes('image') || taskType.includes('vision')) {
		// Skip image tests for now
		return { skipped: true, reason: 'Image/vision tests not yet implemented' };
	} else {
		inputs = { text: 'Generic test input' };
	}

	// Run inference
	const response = await fetch(`${HARPER_URL}/Predict`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			modelName: model.modelName,
			modelVersion: model.modelVersion,
			features: inputs,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Inference failed: ${error}`);
	}

	const result = await response.json();

	// Validate output based on task type
	if (taskType.includes('embedding')) {
		const prediction = result.prediction || result;
		assert.ok(prediction.embedding || prediction.embeddings, 'Output should have embedding/embeddings field');

		const embedding = prediction.embedding || prediction.embeddings[0];
		assert.ok(Array.isArray(embedding), 'Embedding should be an array');
		assert.ok(embedding.length > 0, 'Embedding should not be empty');

		// Validate dimensions match metadata
		const expectedDims = metadata?.outputDimensions?.[0];
		if (expectedDims) {
			assert.strictEqual(
				embedding.length,
				expectedDims,
				`Embedding dimensions should match metadata (expected ${expectedDims}, got ${embedding.length})`
			);
		}
	}

	return result;
}

/**
 * Main test suite
 */
describe('Profile-Based Deployment Tests', () => {
	let profile;
	let backendAvailability;
	let deployedModels;
	let profileModels;

	before(async () => {
		console.log(`\n📋 Testing profile: ${PROFILE_NAME}`);
		console.log(`🔗 Harper URL: ${HARPER_URL}`);
		console.log(`🦙 Ollama URL: ${OLLAMA_HOST}\n`);

		// Load profile configuration
		profile = loadProfile();
		profileModels = profile.models;

		console.log(`📦 Profile has ${profileModels.length} model(s) configured\n`);

		// Check backend availability
		backendAvailability = await checkBackendAvailability();
		console.log('🔍 Backend Availability:');
		Object.entries(backendAvailability).forEach(([backend, available]) => {
			console.log(`  ${available ? '✓' : '✗'} ${backend}: ${available ? 'available' : 'not available'}`);
		});
		console.log('');

		// Fetch deployed models
		deployedModels = await fetchDeployedModels();
		console.log(`🚀 ${deployedModels.length} model(s) deployed in Harper\n`);
	});

	test('should have Harper running', async () => {
		assert.ok(deployedModels, 'Harper should be accessible');
	});

	test('should have at least one model deployed', async () => {
		assert.ok(deployedModels.length > 0, 'At least one model should be deployed');
	});

	describe('Model Deployment Validation', () => {
		test('should have all expected models deployed', async () => {
			const deployedIds = deployedModels.map((m) => m.id);

			const missing = [];
			const skipped = [];

			for (const model of profileModels) {
				const modelId = `${model.modelName}:${model.modelVersion}`;
				const metadata = model.metadata || {};
				const requiresExternal = metadata.requiresExternal;
				const backend = model.framework;

				// Skip if backend is not available and model requires it
				if (requiresExternal && !backendAvailability[backend]) {
					skipped.push(`${modelId} (${backend} not available)`);
					continue;
				}

				if (!deployedIds.includes(modelId)) {
					missing.push(modelId);
				}
			}

			if (skipped.length > 0) {
				console.log(`\n⚠️  Skipped ${skipped.length} model(s) (backend not available):`);
				skipped.forEach((m) => console.log(`  - ${m}`));
			}

			assert.strictEqual(missing.length, 0, `Missing models: ${missing.join(', ')}`);
		});
	});

	describe('Model Inference Tests', () => {
		test('should run inference on all deployed models', async () => {
			let tested = 0;
			let skipped = 0;

			for (const model of profileModels) {
				const modelId = `${model.modelName}:${model.modelVersion}`;
				const metadata = model.metadata || {};
				const requiresExternal = metadata.requiresExternal;
				const backend = model.framework;

				// Skip if backend is not available
				if (requiresExternal && !backendAvailability[backend]) {
					console.log(`  ⚠️  Skipped ${modelId} (${backend} not available)`);
					skipped++;
					continue;
				}

				// Check if model is deployed
				const deployed = deployedModels.find((m) => m.id === modelId);
				if (!deployed) {
					console.log(`  ⚠️  Skipped ${modelId} (not deployed)`);
					skipped++;
					continue;
				}

				// Test inference
				console.log(`  Testing ${modelId} (${backend})...`);
				const result = await testModelInference(deployed);

				if (result.skipped) {
					console.log(`    ⚠️  Skipped: ${result.reason}`);
					skipped++;
					continue;
				}

				console.log(`    ✓ Inference successful`);
				tested++;
			}

			console.log(`\n📊 Inference tests: ${tested} tested, ${skipped} skipped`);
			assert.ok(tested > 0, 'At least one model should be tested');
		});
	});

	describe('Equivalence Group Validation', () => {
		test('should have valid equivalence groups for benchmarking profile', async () => {
			if (PROFILE_NAME !== 'benchmarking') {
				console.log('  ⚠️  Skipped (not benchmarking profile)');
				return;
			}

			// Group models by equivalence group
			const groups = {};
			for (const model of profileModels) {
				const metadata = model.metadata || {};
				const group = metadata.equivalenceGroup;

				if (!group) {
					throw new Error(`Model ${model.modelName} missing equivalenceGroup in metadata`);
				}

				if (!groups[group]) {
					groups[group] = [];
				}

				groups[group].push({
					modelId: `${model.modelName}:${model.modelVersion}`,
					framework: model.framework,
					backend: metadata.backend,
					requiresExternal: metadata.requiresExternal,
				});
			}

			// Validate each group has multiple backends
			const warnings = [];
			for (const [group, models] of Object.entries(groups)) {
				// Filter out models with unavailable backends
				const availableModels = models.filter((m) => {
					if (m.requiresExternal) {
						return backendAvailability[m.framework];
					}
					return true;
				});

				console.log(`\n  📊 ${group}:`);
				availableModels.forEach((m) => {
					console.log(`    - ${m.modelId} (${m.framework})`);
				});

				if (availableModels.length < 2) {
					warnings.push(
						`Equivalence group '${group}' has only ${availableModels.length} available backend(s) (need 2+ for benchmarking)`
					);
				}

				// Validate all models in group have same output dimensions
				const deployedInGroup = availableModels
					.map((m) => deployedModels.find((d) => d.id === m.modelId))
					.filter(Boolean);

				if (deployedInGroup.length > 0) {
					const dims = deployedInGroup.map((m) => {
						const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
						return meta?.outputDimensions?.[0];
					});

					const uniqueDims = [...new Set(dims)];
					assert.strictEqual(uniqueDims.length, 1, `All models in group '${group}' should have same output dimensions`);
				}
			}

			if (warnings.length > 0) {
				console.log('\n⚠️  Warnings:');
				warnings.forEach((w) => console.log(`  - ${w}`));
			}
		});
	});

	describe('Backend Coverage Tests', () => {
		test('should test all available backends', async () => {
			const testedBackends = new Set();
			const availableBackends = Object.entries(backendAvailability)
				.filter(([, available]) => available)
				.map(([backend]) => backend);

			for (const model of profileModels) {
				const metadata = model.metadata || {};
				const backend = model.framework;
				const requiresExternal = metadata.requiresExternal;

				if (!requiresExternal || backendAvailability[backend]) {
					testedBackends.add(backend);
				}
			}

			console.log(`\n  📊 Backend Coverage:`);
			console.log(`    Available: ${availableBackends.join(', ')}`);
			console.log(`    Tested: ${[...testedBackends].join(', ')}`);

			const missing = availableBackends.filter((b) => !testedBackends.has(b));
			if (missing.length > 0) {
				console.log(`    ⚠️  Not tested: ${missing.join(', ')}`);
			}
		});
	});
});
