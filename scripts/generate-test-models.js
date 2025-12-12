#!/usr/bin/env node
/**
 * Download Test ONNX Models
 *
 * Downloads small, real ONNX models for testing the inference infrastructure.
 * No Python dependencies required - downloads pre-converted models.
 *
 * Usage:
 *   node scripts/generate-test-models.js
 *   npm run generate-test-models
 *
 * Output:
 *   - models/test/all-MiniLM-L6-v2.onnx    Small sentence embedding model (~90MB)
 *   - models/test/model-metadata.json      Model metadata for Harper
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { log } from './lib/cli-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const MODELS_DIR = join(PROJECT_ROOT, 'models', 'test');

/**
 * Model definitions - small, publicly available ONNX models
 */
const MODELS = [
	{
		name: 'all-MiniLM-L6-v2',
		filename: 'all-MiniLM-L6-v2.onnx',
		url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx',
		size: '~90MB',
		metadata: {
			taskType: 'text-embedding',
			equivalenceGroup: 'sentence-encoder',
			outputDimensions: [384],
			description: 'Sentence transformer model for semantic similarity',
			framework: 'onnx',
			inputFormat: 'tokenized text (input_ids, attention_mask)',
			useCase: 'Text embeddings for semantic search and similarity'
		}
	}
];

/**
 * Ensure models directory exists
 */
function ensureModelsDir() {
	if (!existsSync(MODELS_DIR)) {
		mkdirSync(MODELS_DIR, { recursive: true });
		log.success(`Created directory: ${MODELS_DIR}`);
	}
}

/**
 * Download a file with progress
 */
async function downloadFile(url, outputPath, modelName) {
	log.info(`Downloading ${modelName}...`);

	try {
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const fileStream = createWriteStream(outputPath);
		await pipeline(response.body, fileStream);

		log.success(`Downloaded ${modelName}`);
		return true;
	} catch (error) {
		log.error(`Failed to download ${modelName}: ${error.message}`);
		return false;
	}
}

/**
 * Check if model already exists
 */
function modelExists(filepath) {
	return existsSync(filepath);
}

/**
 * Save model metadata
 */
function saveMetadata(models) {
	const metadataPath = join(MODELS_DIR, 'model-metadata.json');
	const metadata = models.map(m => ({
		name: m.name,
		filename: m.filename,
		...m.metadata
	}));

	writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
	log.success(`Saved metadata: ${metadataPath}`);
}

/**
 * Generate README
 */
function generateReadme() {
	const readme = `# Test ONNX Models

This directory contains real, pre-trained ONNX models for testing the inference infrastructure.

## Available Models

### all-MiniLM-L6-v2

**Source**: [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

- **Size**: ~90MB
- **Task**: Text embeddings / Sentence similarity
- **Input**: Tokenized text (input_ids, attention_mask)
- **Output**: 384-dimensional embeddings
- **Use Case**: Semantic search, text similarity, clustering

**Example usage:**
\`\`\`javascript
// Upload to Harper
const modelBlob = fs.readFileSync('all-MiniLM-L6-v2.onnx');

await fetch('http://localhost:9926/Model', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'all-MiniLM-L6-v2:v1',
    modelId: 'all-MiniLM-L6-v2',
    version: 'v1',
    framework: 'onnx',
    stage: 'development',
    modelBlob: modelBlob.toString('base64'),
    metadata: JSON.stringify({
      taskType: 'text-embedding',
      equivalenceGroup: 'sentence-encoder',
      outputDimensions: [384]
    })
  })
});
\`\`\`

## Downloading Models

Models are automatically downloaded when you run:

\`\`\`bash
npm run generate-test-models
\`\`\`

Or manually:

\`\`\`bash
node scripts/generate-test-models.js
\`\`\`

## Model Metadata

The \`model-metadata.json\` file contains structured metadata for each model:

- **taskType**: Type of ML task (e.g., "text-embedding")
- **equivalenceGroup**: Group of equivalent models for benchmarking
- **outputDimensions**: Shape of model output
- **description**: Human-readable description
- **useCase**: Intended use case

## Adding More Models

To add more models, edit \`scripts/generate-test-models.js\` and add to the \`MODELS\` array:

\`\`\`javascript
{
  name: 'model-name',
  filename: 'model-name.onnx',
  url: 'https://example.com/model.onnx',
  size: '~XXmb',
  metadata: {
    taskType: 'classification',
    equivalenceGroup: 'image-classifiers',
    outputDimensions: [1000],
    // ...
  }
}
\`\`\`

## Notes

- Models are downloaded from official Hugging Face repositories
- All models are pre-trained and production-ready
- Models are selected for small size (<100MB) for quick testing
- For larger models, consider downloading separately

## References

- [Hugging Face Models](https://huggingface.co/models)
- [ONNX Model Zoo](https://github.com/onnx/models)
- [Sentence Transformers](https://www.sbert.net/)
`;

	const readmePath = join(MODELS_DIR, 'README.md');
	writeFileSync(readmePath, readme);
	log.success(`Created README: ${readmePath}`);
}

/**
 * Main execution
 */
async function main() {
	log.section('Harper Edge AI - Download Test ONNX Models');

	try {
		// Ensure directory exists
		ensureModelsDir();

		console.log('');
		log.info('Models to download:');
		for (const model of MODELS) {
			console.log(`  • ${model.name} (${model.size})`);
		}
		console.log('');

		// Download each model
		const results = [];
		for (const model of MODELS) {
			const outputPath = join(MODELS_DIR, model.filename);

			if (modelExists(outputPath)) {
				log.info(`${model.name} already exists, skipping...`);
				results.push({ model, success: true, skipped: true });
				continue;
			}

			const success = await downloadFile(model.url, outputPath, model.name);
			results.push({ model, success, skipped: false });
		}

		console.log('');

		// Save metadata
		saveMetadata(MODELS);

		// Generate README
		generateReadme();

		// Summary
		const downloaded = results.filter(r => r.success && !r.skipped).length;
		const skipped = results.filter(r => r.skipped).length;
		const failed = results.filter(r => !r.success).length;

		console.log('');
		log.section('Summary');
		if (downloaded > 0) {
			log.success(`Downloaded: ${downloaded} model(s)`);
		}
		if (skipped > 0) {
			log.info(`Skipped: ${skipped} model(s) (already exist)`);
		}
		if (failed > 0) {
			log.error(`Failed: ${failed} model(s)`);
		}

		console.log('');
		log.info('Next steps:');
		console.log('  1. Run Harper: npm run dev');
		console.log('  2. Preload models: npm run preload-models');
		console.log('  3. Run benchmarks: npm run benchmark');
		console.log('');

		process.exit(failed > 0 ? 1 : 0);
	} catch (error) {
		console.log('');
		log.error(`Failed: ${error.message}`);
		if (error.stack) {
			console.log(error.stack);
		}
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { MODELS, downloadFile };
