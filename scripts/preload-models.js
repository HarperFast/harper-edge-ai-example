#!/usr/bin/env node
/**
 * Preload Models Script
 *
 * Preloads test models into Harper for benchmarking across backends.
 * Supports 3 task types with equivalents across Ollama, TensorFlow, and ONNX.
 *
 * Usage:
 *   node scripts/preload-models.js                    # Load all models
 *   node scripts/preload-models.js --clean            # Remove existing models first
 *   node scripts/preload-models.js --type embeddings  # Load specific type
 *   node scripts/preload-models.js --url https://my-harper.cloud.harperdb.io
 *   node scripts/preload-models.js --username admin --password pass
 *
 * Configuration (priority: CLI args > env vars > .env file > defaults):
 *   CLI_TARGET_URL / HARPER_URL - Harper instance URL (default: http://localhost:9926)
 *   CLI_TARGET_USERNAME - Username for authentication
 *   CLI_TARGET_PASSWORD - Password for authentication
 *
 * Requirements:
 *   - Harper must be running
 *   - Ollama must be running with models pulled
 *   - ONNX models in models/test/ directory
 */

import { log } from './lib/cli-utils.js';
import { getConfig, getFetchOptions } from './lib/config.js';
import { ModelFetchClient } from './lib/model-fetch-client.js';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const config = getConfig(args);
const BASE_URL = config.url;

// Parse mode and profile flags
const isRemoteMode = args.includes('--remote');
const profileIndex = args.indexOf('--profile');
const profileName = profileIndex >= 0 ? args[profileIndex + 1] : 'development';
const configFileIndex = args.indexOf('--config');
const configFile = configFileIndex >= 0 ? args[configFileIndex + 1] : null; // null = auto-detect

let modelFetchClient;

/**
 * Load model profiles from configuration file
 */
function loadModelProfiles() {
	let configPath;

	if (configFile) {
		// Explicit config file specified with --config
		configPath = join(PROJECT_ROOT, configFile);
	} else {
		// Auto-detect: Try profiles/<profileName>.json first, then fall back to model-profiles.json
		const newPath = join(PROJECT_ROOT, 'profiles', `${profileName}.json`);
		const legacyPath = join(PROJECT_ROOT, 'model-profiles.json');

		if (existsSync(newPath)) {
			configPath = newPath;
		} else if (existsSync(legacyPath)) {
			configPath = legacyPath;
		} else {
			log.warn(`Profile not found: ${profileName}`);
			log.info('Using legacy hardcoded model definitions');
			return null;
		}
	}

	if (!existsSync(configPath)) {
		log.warn(`Configuration file not found: ${configPath}`);
		log.info('Using legacy hardcoded model definitions');
		return null;
	}

	try {
		const configData = readFileSync(configPath, 'utf-8');
		const data = JSON.parse(configData);

		// Handle both formats:
		// 1. New format: { "name": "testing", "models": [...] }
		// 2. Legacy format: { "profiles": { "testing": { "models": [...] } } }
		if (data.profiles) {
			// Legacy format - return entire structure
			return data;
		} else {
			// New format - wrap in profiles object for backward compatibility
			return {
				profiles: {
					[data.name || profileName]: {
						description: data.description,
						models: data.models,
					},
				},
			};
		}
	} catch (error) {
		log.error(`Failed to load configuration file: ${error.message}`);
		throw error;
	}
}

/**
 * Factory function to create model definition (legacy support)
 */
function createModelDef(name, framework, metadata, modelBlob = {}) {
	return {
		modelName: name,
		modelVersion: 'v1',
		framework,
		stage: 'development',
		metadata,
		modelBlob,
	};
}

/**
 * Check if Harper is running
 */
async function checkHarper() {
	try {
		const response = await fetch(`${BASE_URL}/Status`, getFetchOptions(config));
		if (!response.ok) {
			throw new Error('Harper not responding');
		}
		log.success(`Harper is running at ${BASE_URL}`);
		return true;
	} catch {
		log.error(`Harper is not running at ${BASE_URL}`);
		log.warn('  Run: npm run dev');
		return false;
	}
}

/**
 * Delete all existing models
 */
async function cleanModels() {
	try {
		log.warn('\nCleaning existing models...');

		// Get all models using REST (trailing slash = all records)
		const response = await fetch(`${BASE_URL}/Model/`, getFetchOptions(config));
		const models = await response.json();

		if (models && models.length > 0) {
			// Delete each model
			for (const model of models) {
				await fetch(
					`${BASE_URL}/Model/${encodeURIComponent(model.id)}`,
					getFetchOptions(config, {
						method: 'DELETE',
					})
				);

				log.info(`  Deleted: ${model.modelName}:${model.modelVersion}`);
			}

			log.success(`Cleaned ${models.length} models`);
		} else {
			log.info('  No models to clean');
		}
	} catch (error) {
		log.error(`Failed to clean models: ${error.message}`);
		throw error;
	}
}

// Removed unused toBlob function - no longer needed after switching to UploadModelBlob

/**
 * Load ONNX model file info (returns path, not Buffer to avoid memory issues)
 */
function loadOnnxModel(filename) {
	const modelPath = join(PROJECT_ROOT, 'models', 'test', filename);
	if (!existsSync(modelPath)) {
		log.warn(`  ONNX model file not found: ${modelPath}`);
		return null;
	}
	// Return path and size info instead of loading entire file
	const stats = statSync(modelPath);
	return {
		path: modelPath,
		size: stats.size,
	};
}

/**
 * Create a model in Harper (local mode)
 */
async function createModelLocal(modelData) {
	const { modelName, modelVersion, framework, stage, metadata, modelBlob } = modelData;

	const id = `${modelName}:${modelVersion}`;

	// Use UploadModelBlob resource for ALL models (uses Harper's native tables API)
	if (modelBlob) {
		let blobBuffer;

		if (typeof modelBlob === 'object' && modelBlob.path) {
			// ONNX model - read binary file
			blobBuffer = readFileSync(modelBlob.path);
		} else if (typeof modelBlob === 'object' && modelBlob.source === 'filesystem') {
			// Config-based filesystem reference
			// Path is relative to models/ directory (same as LocalFilesystemAdapter)
			const modelPath = join(PROJECT_ROOT, 'models', modelBlob.path);
			blobBuffer = readFileSync(modelPath);
		} else {
			// Ollama/TensorFlow/Transformers - convert JSON object to Buffer
			const jsonString = typeof modelBlob === 'string' ? modelBlob : JSON.stringify(modelBlob);
			blobBuffer = Buffer.from(jsonString, 'utf-8');
		}

		// Upload via UploadModelBlob resource (uses tables API)
		// Pass metadata as query parameters (headers aren't accessible in Harper resources)
		const metadataString = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
		const queryParams = new URLSearchParams({
			modelName,
			modelVersion,
			framework,
			stage: stage || 'development',
			metadata: metadataString,
		});

		const response = await fetch(
			`${BASE_URL}/UploadModelBlob?${queryParams}`,
			getFetchOptions(config, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/octet-stream',
					'Content-Length': blobBuffer.length.toString(),
				},
				body: blobBuffer,
			})
		);

		const result = await response.json();

		if (!response.ok || !result.success) {
			throw new Error(result.error || 'Upload failed');
		}
	} else {
		// Models without blobs - create record only
		const record = {
			modelName,
			modelVersion,
			framework,
			stage: stage || 'development',
			metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
		};

		const response = await fetch(
			`${BASE_URL}/Model/${encodeURIComponent(id)}`,
			getFetchOptions(config, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(record),
			})
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(error);
		}
	}

	log.success(`  ${modelName}:${modelVersion} (${framework})`);
	return { id };
}

/**
 * Create a model in Harper (remote mode using FetchModel worker)
 */
async function createModelRemote(modelData) {
	const { modelName, modelVersion, framework, stage, metadata, modelBlob } = modelData;

	// For ONNX models with file paths, use FetchModel worker
	if (
		framework === 'onnx' &&
		modelBlob &&
		typeof modelBlob === 'object' &&
		(modelBlob.path || modelBlob.source === 'filesystem')
	) {
		const sourceReference = modelBlob.path || modelBlob.sourceReference;

		log.info(`  Creating fetch job for ${modelName}:${modelVersion}...`);

		const jobResult = await modelFetchClient.fetchModel({
			source: 'filesystem',
			sourceReference,
			modelName,
			modelVersion,
			framework,
			stage: stage || 'development',
			metadata,
		});

		log.info(`    Job ${jobResult.jobId} created (${jobResult.status})`);

		// Poll for completion
		const jobId = jobResult.jobId;
		let attempts = 0;
		const maxAttempts = 60; // 5 minutes max

		while (attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

			const job = await modelFetchClient.getJob(jobId);

			if (job.status === 'completed') {
				log.success(`  ${modelName}:${modelVersion} (${framework}) - fetch completed`);
				return { id: `${modelName}:${modelVersion}`, jobId };
			} else if (job.status === 'failed') {
				throw new Error(`Fetch job failed: ${job.error || 'Unknown error'}`);
			}

			// Still in progress
			if (job.progress) {
				log.info(`    Progress: ${job.progress}%`);
			}

			attempts++;
		}

		throw new Error('Fetch job timed out');
	} else {
		// For non-ONNX models (Ollama, TensorFlow, Transformers), use local mode
		// These are metadata-only or use external services
		return await createModelLocal(modelData);
	}
}

/**
 * Create a model in Harper (dispatches to local or remote)
 */
async function createModel(modelData) {
	const { modelName, modelVersion } = modelData;

	try {
		if (isRemoteMode) {
			return await createModelRemote(modelData);
		} else {
			return await createModelLocal(modelData);
		}
	} catch (error) {
		log.error(`  Failed to create ${modelName}:${modelVersion}: ${error.message}`);
		throw error;
	}
}

/**
 * Model definitions organized by task type
 */
const MODEL_DEFINITIONS = {
	embeddings: [
		createModelDef(
			'nomic-embed-text',
			'ollama',
			{
				taskType: 'text-embedding',
				equivalenceGroup: 'embeddings-768',
				outputDimensions: [768],
				description: 'Nomic embedding model for product recommendations',
				backend: 'ollama',
			},
			{ modelName: 'nomic-embed-text', mode: 'embeddings' }
		),

		createModelDef(
			'mxbai-embed-large',
			'ollama',
			{
				taskType: 'text-embedding',
				equivalenceGroup: 'embeddings-1024',
				outputDimensions: [1024],
				description: 'MxBai large embedding model',
				backend: 'ollama',
			},
			{ modelName: 'mxbai-embed-large', mode: 'embeddings' }
		),

		createModelDef(
			'universal-sentence-encoder',
			'tensorflow',
			{
				taskType: 'text-embedding',
				equivalenceGroup: 'embeddings-512',
				outputDimensions: [512],
				description: 'Universal Sentence Encoder (TensorFlow.js)',
				backend: 'tensorflow',
			},
			'universal-sentence-encoder'
		),

		createModelDef(
			'all-MiniLM-L6-v2',
			'onnx',
			{
				taskType: 'text-embedding',
				equivalenceGroup: 'embeddings-384',
				outputDimensions: [384],
				description: 'Sentence-BERT MiniLM model (ONNX)',
				backend: 'onnx',
			},
			loadOnnxModel('all-MiniLM-L6-v2.onnx')
		),

		createModelDef(
			'all-MiniLM-L6-v2-transformers',
			'transformers',
			{
				taskType: 'text-embedding',
				equivalenceGroup: 'embeddings-384',
				outputDimensions: [384],
				description: 'Sentence-BERT MiniLM model (Transformers.js)',
				backend: 'transformers',
			},
			{ modelName: 'Xenova/all-MiniLM-L6-v2', taskType: 'feature-extraction' }
		),
	],

	classification: [
		createModelDef(
			'llama2-classifier',
			'ollama',
			{
				taskType: 'classification',
				equivalenceGroup: 'price-classifier',
				outputDimensions: [1],
				description: 'Llama2 for price sensitivity classification',
				backend: 'ollama',
			},
			{ modelName: 'llama2', mode: 'chat' }
		),

		createModelDef(
			'mistral-classifier',
			'ollama',
			{
				taskType: 'classification',
				equivalenceGroup: 'price-classifier',
				outputDimensions: [1],
				description: 'Mistral for price sensitivity classification',
				backend: 'ollama',
			},
			{ modelName: 'mistral', mode: 'chat' }
		),
	],

	vision: [
		createModelDef(
			'llava',
			'ollama',
			{
				taskType: 'image-tagging',
				equivalenceGroup: 'image-tagger',
				outputDimensions: [1],
				description: 'LLaVA vision model for image tagging',
				backend: 'ollama',
			},
			{ modelName: 'llava', mode: 'chat' }
		),

		createModelDef(
			'bakllava',
			'ollama',
			{
				taskType: 'image-tagging',
				equivalenceGroup: 'image-tagger',
				outputDimensions: [1],
				description: 'BakLLaVA vision model for image tagging',
				backend: 'ollama',
			},
			{ modelName: 'bakllava', mode: 'chat' }
		),
	],
};

/**
 * Load models from configuration profile
 */
async function loadModelsFromProfile(profileData) {
	let totalLoaded = 0;
	const summary = {
		embeddings: [],
		classification: [],
		vision: [],
		other: [],
	};

	log.info(`\nLoading models from profile: ${profileData.description || profileName}`);

	for (const modelDef of profileData.models) {
		try {
			await createModel(modelDef);

			// Categorize by task type
			const taskType = modelDef.metadata?.taskType || 'other';
			let category = 'other';

			if (taskType.includes('embedding')) {
				category = 'embeddings';
			} else if (taskType.includes('classification')) {
				category = 'classification';
			} else if (taskType.includes('image') || taskType.includes('vision')) {
				category = 'vision';
			}

			summary[category].push({
				modelId: `${modelDef.modelName}:${modelDef.modelVersion}`,
				framework: modelDef.framework,
				equivalenceGroup: modelDef.metadata?.equivalenceGroup || 'none',
			});
			totalLoaded++;
		} catch {
			// Error already logged in createModel, continue with next model
		}
	}

	return { totalLoaded, summary };
}

/**
 * Load models for a specific type or all types (legacy mode)
 */
async function loadModels(taskType = 'all') {
	const typesToLoad = taskType === 'all' ? ['embeddings', 'classification', 'vision'] : [taskType];

	let totalLoaded = 0;
	const summary = {
		embeddings: [],
		classification: [],
		vision: [],
	};

	for (const type of typesToLoad) {
		if (!MODEL_DEFINITIONS[type]) {
			log.error(`Unknown task type: ${type}`);
			continue;
		}

		log.info(`\nLoading ${type} models:`);

		for (const modelDef of MODEL_DEFINITIONS[type]) {
			try {
				await createModel(modelDef);
				summary[type].push({
					modelId: `${modelDef.modelName}:${modelDef.modelVersion}`,
					framework: modelDef.framework,
					equivalenceGroup: modelDef.metadata.equivalenceGroup,
				});
				totalLoaded++;
			} catch {
				// Error already logged in createModel, continue with next model
			}
		}
	}

	return { totalLoaded, summary };
}

/**
 * Print summary of loaded models
 */
function printSummary(summary) {
	log.section('Model Loading Summary');

	for (const [type, models] of Object.entries(summary)) {
		if (models.length === 0) continue;

		log.info(`\n${type.toUpperCase()}:`);
		for (const model of models) {
			console.log(`  • ${model.modelId} (${model.framework}) - ${model.equivalenceGroup}`);
		}
	}

	console.log('\n' + '='.repeat(60));
}

/**
 * Print usage instructions
 */
function printUsage() {
	console.log('\nPreload Models Script');
	log.info('Usage:');
	console.log('  node scripts/preload-models.js                         Load development profile (default)');
	console.log('  node scripts/preload-models.js --profile production    Load production profile');
	console.log('  node scripts/preload-models.js --clean                 Clean then load');
	console.log('  node scripts/preload-models.js --remote                Use FetchModel worker (for remote Harper)');
	console.log('  node scripts/preload-models.js --config custom.json    Use custom config file');
	console.log('  node scripts/preload-models.js --type embeddings       [Legacy] Load specific type');
	log.info('\nAvailable Profiles (from profiles/ directory):');
	console.log('  minimal       Single model for quick testing');
	console.log('  testing       One model per backend (integration tests)');
	console.log('  benchmarking  Performance comparison models');
	console.log('  development   Full test suite with all backends');
	console.log('  production    Production-ready models only');
	log.info('\nModes:');
	console.log('  Local mode (default)   Directly upload model files');
	console.log('  Remote mode (--remote) Use FetchModel worker for ONNX models');
	log.warn('\nNotes:');
	console.log('  • Ensure Harper is running: npm run dev');
	console.log('  • For Ollama models, ensure Ollama is running with models pulled');
	console.log('  • ONNX models in local mode require files in models/test/');
	console.log('  • Remote mode requires MODEL_FETCH_TOKEN in .env');
	console.log('');
}

/**
 * Main execution
 */
async function main() {
	const args = process.argv.slice(2);

	// Handle help
	if (args.includes('--help') || args.includes('-h')) {
		printUsage();
		process.exit(0);
	}

	// Parse arguments
	const shouldClean = args.includes('--clean');
	const typeIndex = args.indexOf('--type');
	const taskType = typeIndex >= 0 ? args[typeIndex + 1] : 'all';

	log.section('Harper Edge AI - Model Preload Script');

	// Initialize ModelFetchClient if in remote mode
	if (isRemoteMode) {
		log.info(`Mode: Remote (using FetchModel worker)`);
		modelFetchClient = new ModelFetchClient(BASE_URL, config.modelFetchToken, config.username, config.password);
	} else {
		log.info(`Mode: Local (direct upload)`);
	}

	// Check Harper
	const harperRunning = await checkHarper();
	if (!harperRunning) {
		process.exit(1);
	}

	try {
		// Clean if requested
		if (shouldClean) {
			await cleanModels();
		}

		// Load configuration
		const profiles = loadModelProfiles();

		let result;

		if (profiles && profiles.profiles && profiles.profiles[profileName]) {
			// Use configuration-based loading
			log.info(`Using profile: ${profileName}`);
			result = await loadModelsFromProfile(profiles.profiles[profileName]);
		} else if (profiles) {
			// Config file exists but profile not found
			const availableProfiles = Object.keys(profiles.profiles || {}).join(', ');
			log.error(`Profile '${profileName}' not found in configuration`);
			log.info(`Available profiles: ${availableProfiles}`);
			process.exit(1);
		} else {
			// Fallback to legacy mode
			log.warn('Using legacy hardcoded model definitions');
			result = await loadModels(taskType);
		}

		// Print summary
		printSummary(result.summary);

		log.success(`\nSuccessfully loaded ${result.totalLoaded} models`);
		log.info('\nNext steps:');
		console.log('  • Run benchmarks: node scripts/run-benchmark.js');
		console.log('  • View models: Query Model table in Harper');
		console.log('');

		process.exit(0);
	} catch (error) {
		log.error(`\nScript failed: ${error.message}`);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { createModel, loadModels, cleanModels, MODEL_DEFINITIONS };
