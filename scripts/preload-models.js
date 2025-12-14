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
import { readFileSync, existsSync, createReadStream, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const config = getConfig(args);
const BASE_URL = config.url;

/**
 * Factory function to create model definition
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
	} catch (error) {
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
				await fetch(`${BASE_URL}/Model/${encodeURIComponent(model.id)}`, getFetchOptions(config, {
					method: 'DELETE',
				}));

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

/**
 * Convert data to base64 blob format
 */
function toBlob(data) {
	if (Buffer.isBuffer(data)) {
		// Already a buffer (e.g., ONNX model file)
		return data.toString('base64');
	}
	const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
	return Buffer.from(jsonString).toString('base64');
}

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
 * Create a model in Harper
 */
async function createModel(modelData) {
	const { modelName, modelVersion, framework, stage, metadata, modelBlob } = modelData;

	try {
		const id = `${modelName}:${modelVersion}`;

		// Step 1: Create the model record with metadata (no blob yet)
		// Note: id is computed from modelName:modelVersion, so we don't set it
		const record = {
			modelName,
			modelVersion,
			framework,
			stage: stage || 'development',
			metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
		};

		const response = await fetch(`${BASE_URL}/Model/${encodeURIComponent(id)}`, getFetchOptions(config, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(record),
		}));

		if (!response.ok) {
			const error = await response.text();
			throw new Error(error);
		}

		// Step 2: Upload blob data separately
		// For ONNX models, modelBlob is {path, size} object
		// For other models, it's a JSON object or string
		if (modelBlob) {
			let blobData;
			let contentLength;

			if (modelBlob && typeof modelBlob === 'object' && modelBlob.path) {
				// ONNX model - use file stream for large files
				const fileStream = createReadStream(modelBlob.path);
				contentLength = modelBlob.size;

				// Use stream as body
				const headers = {
					'Content-Type': 'application/octet-stream',
					'Content-Length': contentLength.toString(),
				};

				// Merge with auth headers and add duplex for streaming
				const fetchOptions = getFetchOptions(config, {
					method: 'PUT',
					headers,
					body: fileStream,
					duplex: 'half', // Required for streaming bodies in Node.js fetch
				});

				const blobResponse = await fetch(`${BASE_URL}/Model/${encodeURIComponent(id)}/modelBlob`, fetchOptions);

				if (!blobResponse.ok) {
					const error = await blobResponse.text();
					throw new Error(`Failed to upload blob: ${error}`);
				}
			} else {
				// Ollama/TensorFlow - convert to Buffer
				const jsonString = typeof modelBlob === 'string' ? modelBlob : JSON.stringify(modelBlob);
				blobData = Buffer.from(jsonString, 'utf-8');
				contentLength = blobData.length;

				const headers = {
					'Content-Type': 'application/octet-stream',
					'Content-Length': contentLength.toString(),
				};

				const fetchOptions = getFetchOptions(config, {
					method: 'PUT',
					headers,
					body: blobData,
				});

				const blobResponse = await fetch(`${BASE_URL}/Model/${encodeURIComponent(id)}/modelBlob`, fetchOptions);

				if (!blobResponse.ok) {
					const error = await blobResponse.text();
					throw new Error(`Failed to upload blob: ${error}`);
				}
			}
		}

		log.success(`  ${modelName}:${modelVersion} (${framework})`);
		return { id };
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
				equivalenceGroup: 'product-recommender',
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
				equivalenceGroup: 'product-recommender',
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
				equivalenceGroup: 'product-recommender',
				outputDimensions: [512],
				description: 'Universal Sentence Encoder (TensorFlow.js)',
				backend: 'tensorflow',
			},
			'universal-sentence-encoder'
		),

		createModelDef('all-MiniLM-L6-v2', 'onnx', {
			taskType: 'text-embedding',
			equivalenceGroup: 'product-recommender',
			outputDimensions: [384],
			description: 'Sentence-BERT MiniLM model (ONNX)',
			backend: 'onnx',
		}, loadOnnxModel('all-MiniLM-L6-v2.onnx')),
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
 * Load models for a specific type or all types
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
			} catch (error) {
				// Error already logged, continue with next model
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
	console.log('  node scripts/preload-models.js                    Load all models');
	console.log('  node scripts/preload-models.js --clean            Clean then load');
	console.log('  node scripts/preload-models.js --type embeddings  Load specific type');
	log.info('\nTask Types:');
	console.log('  embeddings      Product recommendation models');
	console.log('  classification  Price sensitivity classifiers');
	console.log('  vision          Image tagging models');
	log.warn('\nNotes:');
	console.log('  • Ensure Harper is running: npm run dev');
	console.log('  • Ensure Ollama is running with models pulled:');
	console.log('    ollama pull nomic-embed-text');
	console.log('    ollama pull mxbai-embed-large');
	console.log('    ollama pull llama2');
	console.log('    ollama pull mistral');
	console.log('    ollama pull llava');
	console.log('    ollama pull bakllava');
	console.log('  • ONNX models require manual download/conversion');
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

		// Load models
		const { totalLoaded, summary } = await loadModels(taskType);

		// Print summary
		printSummary(summary);

		log.success(`\nSuccessfully loaded ${totalLoaded} models`);
		log.info('\nNext steps:');
		console.log('  • Run benchmarks: node scripts/run-benchmark.js');
		console.log('  • View models: Query Model table in Harper');
		console.log('');

		process.exit(0);
	} catch (error) {
		log.error(`\nScript failed: ${error.message}`);
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { createModel, loadModels, cleanModels, MODEL_DEFINITIONS };
