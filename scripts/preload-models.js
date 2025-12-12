#!/usr/bin/env node
/**
 * Preload Models Script
 *
 * Preloads test models into Harper for benchmarking across backends.
 * Supports 3 task types with equivalents across Ollama, TensorFlow, and ONNX.
 *
 * Usage:
 *   node scripts/preload-models.js           # Load all models
 *   node scripts/preload-models.js --clean   # Remove existing models first
 *   node scripts/preload-models.js --type embeddings  # Load specific type
 *
 * Requirements:
 *   - Harper must be running (http://localhost:9926)
 *   - Ollama must be running with models pulled
 *   - ONNX models in models/test/ directory
 */

import { log } from './lib/cli-utils.js';

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

/**
 * Factory function to create model definition
 */
function createModelDef(id, framework, metadata, modelBlob = {}) {
  return {
    modelId: id,
    version: 'v1',
    framework,
    stage: 'development',
    metadata,
    modelBlob
  };
}

/**
 * Check if Harper is running
 */
async function checkHarper() {
  try {
    const response = await fetch(`${BASE_URL}/status`);
    if (!response.ok) {
      throw new Error('Harper not responding');
    }
    log.success('Harper is running');
    return true;
  } catch (error) {
    log.error('Harper is not running. Please start Harper first.');
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

    // Get all models using GraphQL
    const query = `
      query {
        Model {
          id
          modelId
          version
        }
      }
    `;

    const response = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.data?.Model && result.data.Model.length > 0) {
      // Delete each model
      for (const model of result.data.Model) {
        const deleteQuery = `
          mutation {
            deleteModel(id: "${model.id}")
          }
        `;

        await fetch(`${BASE_URL}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: deleteQuery }),
        });

        log.info(`  Deleted: ${model.modelId}:${model.version}`);
      }

      log.success(`Cleaned ${result.data.Model.length} models`);
    } else {
      log.info('  No models to clean');
    }
  } catch (error) {
    log.error(`Failed to clean models: ${error.message}`);
    throw error;
  }
}

/**
 * Create a model in Harper
 */
async function createModel(modelData) {
  const { modelId, version, framework, stage, metadata, modelBlob } = modelData;

  try {
    const mutation = `
      mutation($input: ModelInput!) {
        insertModel(values: $input) {
          id
          modelId
          version
          framework
        }
      }
    `;

    const input = {
      id: `${modelId}:${version}`,
      modelId,
      version,
      framework,
      stage: stage || 'development',
      metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      modelBlob: typeof modelBlob === 'string' ? modelBlob : (modelBlob || JSON.stringify({ modelName: modelId })),
    };

    const response = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables: { input } }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    log.success(`  ${modelId}:${version} (${framework})`);
    return result.data.insertModel;
  } catch (error) {
    log.error(`  Failed to create ${modelId}:${version}: ${error.message}`);
    throw error;
  }
}

/**
 * Model definitions organized by task type
 */
const MODEL_DEFINITIONS = {
  embeddings: [
    createModelDef('nomic-embed-text', 'ollama', {
      taskType: 'text-embedding',
      equivalenceGroup: 'product-recommender',
      outputDimensions: [768],
      description: 'Nomic embedding model for product recommendations',
      backend: 'ollama'
    }, { modelName: 'nomic-embed-text', mode: 'embeddings' }),

    createModelDef('mxbai-embed-large', 'ollama', {
      taskType: 'text-embedding',
      equivalenceGroup: 'product-recommender',
      outputDimensions: [1024],
      description: 'MxBai large embedding model',
      backend: 'ollama'
    }, { modelName: 'mxbai-embed-large', mode: 'embeddings' }),

    createModelDef('universal-sentence-encoder', 'tensorflow', {
      taskType: 'text-embedding',
      equivalenceGroup: 'product-recommender',
      outputDimensions: [512],
      description: 'Universal Sentence Encoder (TensorFlow.js)',
      backend: 'tensorflow'
    }, 'universal-sentence-encoder'),

    createModelDef('all-MiniLM-L6-v2', 'onnx', {
      taskType: 'text-embedding',
      equivalenceGroup: 'product-recommender',
      outputDimensions: [384],
      description: 'Sentence-BERT MiniLM model (ONNX)',
      backend: 'onnx'
    })
  ],

  classification: [
    createModelDef('llama2-classifier', 'ollama', {
      taskType: 'classification',
      equivalenceGroup: 'price-classifier',
      outputDimensions: [1],
      description: 'Llama2 for price sensitivity classification',
      backend: 'ollama'
    }, { modelName: 'llama2', mode: 'chat' }),

    createModelDef('mistral-classifier', 'ollama', {
      taskType: 'classification',
      equivalenceGroup: 'price-classifier',
      outputDimensions: [1],
      description: 'Mistral for price sensitivity classification',
      backend: 'ollama'
    }, { modelName: 'mistral', mode: 'chat' })
  ],

  vision: [
    createModelDef('llava', 'ollama', {
      taskType: 'image-tagging',
      equivalenceGroup: 'image-tagger',
      outputDimensions: [1],
      description: 'LLaVA vision model for image tagging',
      backend: 'ollama'
    }, { modelName: 'llava', mode: 'chat' }),

    createModelDef('bakllava', 'ollama', {
      taskType: 'image-tagging',
      equivalenceGroup: 'image-tagger',
      outputDimensions: [1],
      description: 'BakLLaVA vision model for image tagging',
      backend: 'ollama'
    }, { modelName: 'bakllava', mode: 'chat' })
  ]
};

/**
 * Load models for a specific type or all types
 */
async function loadModels(taskType = 'all') {
  const typesToLoad =
    taskType === 'all'
      ? ['embeddings', 'classification', 'vision']
      : [taskType];

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
          modelId: modelDef.modelId,
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
      console.log(
        `  • ${model.modelId} (${model.framework}) - ${model.equivalenceGroup}`
      );
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
