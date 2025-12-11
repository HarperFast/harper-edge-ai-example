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

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
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
    log('✓ Harper is running', 'green');
    return true;
  } catch (error) {
    log('✗ Harper is not running. Please start Harper first.', 'red');
    log('  Run: npm run dev', 'yellow');
    return false;
  }
}

/**
 * Delete all existing models
 */
async function cleanModels() {
  try {
    log('\nCleaning existing models...', 'yellow');

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

        log(`  Deleted: ${model.modelId}:${model.version}`, 'cyan');
      }

      log(`✓ Cleaned ${result.data.Model.length} models`, 'green');
    } else {
      log('  No models to clean', 'cyan');
    }
  } catch (error) {
    log(`✗ Failed to clean models: ${error.message}`, 'red');
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
      metadata: JSON.stringify(metadata),
      modelBlob: modelBlob || JSON.stringify({ modelName: modelId }),
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

    log(`  ✓ ${modelId}:${version} (${framework})`, 'green');
    return result.data.insertModel;
  } catch (error) {
    log(`  ✗ Failed to create ${modelId}:${version}: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Model definitions for each task type and backend
 */
const MODEL_DEFINITIONS = {
  // Product Recommendations - Text Embeddings
  embeddings: [
    {
      modelId: 'nomic-embed-text',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'text-embedding',
        equivalenceGroup: 'product-recommender',
        outputDimensions: [768],
        description: 'Nomic embedding model for product recommendations',
        useCase: 'Product search and recommendation based on semantic similarity',
        backend: 'ollama',
      },
      modelBlob: JSON.stringify({
        modelName: 'nomic-embed-text',
        mode: 'embeddings',
      }),
    },
    {
      modelId: 'mxbai-embed-large',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'text-embedding',
        equivalenceGroup: 'product-recommender',
        outputDimensions: [1024],
        description: 'MixedBread.ai large embedding model',
        useCase: 'High-quality product embeddings for recommendation',
        backend: 'ollama',
      },
      modelBlob: JSON.stringify({
        modelName: 'mxbai-embed-large',
        mode: 'embeddings',
      }),
    },
    {
      modelId: 'universal-sentence-encoder',
      version: 'v1',
      framework: 'tensorflow',
      stage: 'development',
      metadata: {
        taskType: 'text-embedding',
        equivalenceGroup: 'product-recommender',
        outputDimensions: [512],
        description: 'Google Universal Sentence Encoder',
        useCase: 'Product semantic search with TensorFlow',
        backend: 'tensorflow',
      },
      modelBlob: JSON.stringify({
        modelName: 'universal-sentence-encoder',
        modelPath: '@tensorflow-models/universal-sentence-encoder',
      }),
    },
    {
      modelId: 'all-MiniLM-L6-v2',
      version: 'v1',
      framework: 'onnx',
      stage: 'development',
      metadata: {
        taskType: 'text-embedding',
        equivalenceGroup: 'product-recommender',
        outputDimensions: [384],
        description: 'Sentence Transformers MiniLM model (ONNX)',
        useCase: 'Fast product embeddings with ONNX Runtime',
        backend: 'onnx',
        downloadUrl: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2',
        note: 'Convert using optimum: optimum-cli export onnx --model sentence-transformers/all-MiniLM-L6-v2 all-MiniLM-L6-v2/',
      },
      modelBlob: JSON.stringify({
        modelPath: 'models/test/all-MiniLM-L6-v2.onnx',
        note: 'Placeholder - model file needs to be downloaded and converted',
      }),
    },
  ],

  // Price Sensitivity - Text Classification
  classification: [
    {
      modelId: 'llama2-classifier',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'classification',
        equivalenceGroup: 'price-classifier',
        outputDimensions: [1],
        description: 'Llama2 for price sensitivity classification',
        useCase: 'Analyze customer price sensitivity from reviews and feedback',
        backend: 'ollama',
        classes: ['price-sensitive', 'value-focused', 'premium-willing'],
      },
      modelBlob: JSON.stringify({
        modelName: 'llama2',
        mode: 'chat',
        systemPrompt:
          'You are a classifier that analyzes text to determine price sensitivity. Respond with one of: price-sensitive, value-focused, premium-willing',
      }),
    },
    {
      modelId: 'mistral-classifier',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'classification',
        equivalenceGroup: 'price-classifier',
        outputDimensions: [1],
        description: 'Mistral for price sensitivity classification',
        useCase: 'Fast price sensitivity analysis with Mistral',
        backend: 'ollama',
        classes: ['price-sensitive', 'value-focused', 'premium-willing'],
      },
      modelBlob: JSON.stringify({
        modelName: 'mistral',
        mode: 'chat',
        systemPrompt:
          'You are a classifier that analyzes text to determine price sensitivity. Respond with one of: price-sensitive, value-focused, premium-willing',
      }),
    },
  ],

  // Image Tagging - Vision
  vision: [
    {
      modelId: 'llava',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'image-tagging',
        equivalenceGroup: 'image-tagger',
        outputDimensions: [1],
        description: 'LLaVA vision model for product image tagging',
        useCase: 'Automatic tagging of product images for search and categorization',
        backend: 'ollama',
        capabilities: ['image-understanding', 'tagging', 'description'],
      },
      modelBlob: JSON.stringify({
        modelName: 'llava',
        mode: 'chat',
        systemPrompt:
          'You are a product image tagger. Analyze images and provide relevant tags for e-commerce products.',
      }),
    },
    {
      modelId: 'bakllava',
      version: 'v1',
      framework: 'ollama',
      stage: 'development',
      metadata: {
        taskType: 'image-tagging',
        equivalenceGroup: 'image-tagger',
        outputDimensions: [1],
        description: 'BakLLaVA vision model for product image analysis',
        useCase: 'Enhanced product image understanding and tagging',
        backend: 'ollama',
        capabilities: ['image-understanding', 'tagging', 'description'],
      },
      modelBlob: JSON.stringify({
        modelName: 'bakllava',
        mode: 'chat',
        systemPrompt:
          'You are a product image tagger. Analyze images and provide relevant tags for e-commerce products.',
      }),
    },
  ],
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
      log(`✗ Unknown task type: ${type}`, 'red');
      continue;
    }

    log(`\n${colors.bright}Loading ${type} models:${colors.reset}`, 'blue');

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
  log('\n' + '='.repeat(60), 'bright');
  log('Model Loading Summary', 'bright');
  log('='.repeat(60), 'bright');

  for (const [type, models] of Object.entries(summary)) {
    if (models.length === 0) continue;

    log(`\n${type.toUpperCase()}:`, 'cyan');
    for (const model of models) {
      log(
        `  • ${model.modelId} (${model.framework}) - ${model.equivalenceGroup}`,
        'reset'
      );
    }
  }

  log('\n' + '='.repeat(60), 'bright');
}

/**
 * Print usage instructions
 */
function printUsage() {
  log('\nPreload Models Script', 'bright');
  log('Usage:', 'cyan');
  log('  node scripts/preload-models.js                    Load all models');
  log('  node scripts/preload-models.js --clean            Clean then load');
  log(
    '  node scripts/preload-models.js --type embeddings  Load specific type'
  );
  log('\nTask Types:', 'cyan');
  log('  embeddings      Product recommendation models');
  log('  classification  Price sensitivity classifiers');
  log('  vision          Image tagging models');
  log('\nNotes:', 'yellow');
  log('  • Ensure Harper is running: npm run dev');
  log('  • Ensure Ollama is running with models pulled:');
  log('    ollama pull nomic-embed-text');
  log('    ollama pull mxbai-embed-large');
  log('    ollama pull llama2');
  log('    ollama pull mistral');
  log('    ollama pull llava');
  log('    ollama pull bakllava');
  log('  • ONNX models require manual download/conversion');
  log('');
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

  log('\n' + '='.repeat(60), 'bright');
  log('Harper Edge AI - Model Preload Script', 'bright');
  log('='.repeat(60), 'bright');

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

    log(`\n✓ Successfully loaded ${totalLoaded} models`, 'green');
    log('\nNext steps:', 'cyan');
    log('  • Run benchmarks: node scripts/run-benchmark.js');
    log('  • View models: Query Model table in Harper');
    log('');

    process.exit(0);
  } catch (error) {
    log(`\n✗ Script failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createModel, loadModels, cleanModels, MODEL_DEFINITIONS };
