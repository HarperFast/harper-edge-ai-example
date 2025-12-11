#!/usr/bin/env node
/**
 * Interactive Benchmark Runner
 *
 * Interactive CLI for running benchmarks comparing equivalent models
 * across different backends (Ollama, TensorFlow, ONNX).
 *
 * Usage:
 *   node scripts/run-benchmark.js
 *
 * Features:
 *   - Interactive menu for selecting task type and equivalence group
 *   - Generates appropriate test data for each task type
 *   - Runs benchmarks via BenchmarkEngine
 *   - Displays results in formatted table
 *   - Shows winner and performance comparison
 */

import * as readline from 'readline';

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Create readline interface for user input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
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
    return true;
  } catch (error) {
    log('✗ Harper is not running. Please start Harper first.', 'red');
    log('  Run: npm run dev', 'yellow');
    return false;
  }
}

/**
 * Fetch available models from Harper
 */
async function fetchModels() {
  const query = `
    query {
      Model {
        id
        modelId
        version
        framework
        metadata
      }
    }
  `;

  const response = await fetch(`${BASE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data?.Model || [];
}

/**
 * Group models by task type and equivalence group
 */
function groupModels(models) {
  const groups = {};

  for (const model of models) {
    try {
      const metadata = JSON.parse(model.metadata || '{}');
      const taskType = metadata.taskType || 'unknown';
      const equivalenceGroup = metadata.equivalenceGroup || 'unknown';

      const key = `${taskType}:${equivalenceGroup}`;

      if (!groups[key]) {
        groups[key] = {
          taskType,
          equivalenceGroup,
          description: metadata.description || 'No description',
          models: [],
        };
      }

      groups[key].models.push({
        modelId: model.modelId,
        version: model.version,
        framework: model.framework,
        description: metadata.description,
      });
    } catch (error) {
      // Skip models with invalid metadata
      continue;
    }
  }

  return groups;
}

/**
 * Display menu and get user selection
 */
async function selectBenchmarkGroup(groups) {
  log('\n' + '='.repeat(60), 'bright');
  log('Available Benchmark Groups', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  const groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    log('No models found. Please run: node scripts/preload-models.js', 'red');
    return null;
  }

  groupKeys.forEach((key, index) => {
    const group = groups[key];
    log(`${index + 1}. ${colors.cyan}${group.taskType}${colors.reset} - ${colors.yellow}${group.equivalenceGroup}${colors.reset}`);
    log(`   ${group.models.length} models: ${group.models.map((m) => m.framework).join(', ')}`, 'dim');
  });

  log('');
  const answer = await prompt('Select benchmark group (number): ');
  const selection = parseInt(answer) - 1;

  if (selection >= 0 && selection < groupKeys.length) {
    return groups[groupKeys[selection]];
  }

  log('Invalid selection', 'red');
  return null;
}

/**
 * Get number of iterations
 */
async function getIterations() {
  log('');
  const answer = await prompt('Number of iterations (default 100): ');
  const iterations = parseInt(answer) || 100;

  if (iterations < 1 || iterations > 10000) {
    log('Using default: 100 iterations', 'yellow');
    return 100;
  }

  return iterations;
}

/**
 * Generate test data for embeddings
 */
function generateEmbeddingTestData() {
  return [
    { prompt: 'trail running shoes lightweight breathable mesh upper' },
    { prompt: 'waterproof hiking boots winter insulated ankle support' },
    { prompt: 'camping tent 4 person family double wall weatherproof' },
    { prompt: 'sleeping bag 20 degree down fill mummy style' },
    { prompt: 'portable camping stove propane fuel compact design' },
    { prompt: 'backpacking water filter gravity system safe drinking' },
    { prompt: 'LED camping lantern rechargeable battery bright portable' },
    { prompt: 'camping hammock lightweight nylon tree straps included' },
    { prompt: 'trekking poles adjustable aluminum lightweight collapsible' },
    { prompt: 'camping cookware set non-stick pots pans utensils' },
  ];
}

/**
 * Generate test data for classification
 */
function generateClassificationTestData() {
  return [
    { prompt: 'This product is way too expensive for what you get. Not worth it at all.' },
    { prompt: 'Great value for the money! Would definitely buy again at this price.' },
    { prompt: 'Quality is excellent, price is reasonable for premium materials used.' },
    { prompt: 'I would pay more for better quality. This feels cheap.' },
    { prompt: 'Perfect price point for everyday use. Not fancy but does the job.' },
    { prompt: 'Overpriced considering there are cheaper alternatives with same features.' },
    { prompt: 'You get what you pay for. Premium price, premium quality.' },
    { prompt: 'I only buy on sale. Full price is ridiculous for this.' },
    { prompt: 'Worth every penny! The craftsmanship justifies the higher cost.' },
    { prompt: 'Too pricey for casual buyers but professionals will appreciate it.' },
  ];
}

/**
 * Generate test data for vision
 */
function generateVisionTestData() {
  return [
    {
      prompt: 'Describe this product image and provide relevant tags',
      image: '/path/to/product1.jpg', // Placeholder
      note: 'Vision models require actual image files'
    },
    {
      prompt: 'What are the key features visible in this product photo?',
      image: '/path/to/product2.jpg',
      note: 'Vision models require actual image files'
    },
    {
      prompt: 'Generate product tags based on this image',
      image: '/path/to/product3.jpg',
      note: 'Vision models require actual image files'
    },
  ];
}

/**
 * Generate appropriate test data for task type
 */
function generateTestData(taskType) {
  switch (taskType) {
    case 'text-embedding':
      return generateEmbeddingTestData();
    case 'classification':
      return generateClassificationTestData();
    case 'image-tagging':
      return generateVisionTestData();
    default:
      log(`Warning: Unknown task type "${taskType}", using generic data`, 'yellow');
      return [{ prompt: 'test input' }];
  }
}

/**
 * Run benchmark via API
 */
async function runBenchmark(group, iterations) {
  log('\n' + '='.repeat(60), 'bright');
  log('Running Benchmark...', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  const testData = generateTestData(group.taskType);

  log(`Task Type: ${group.taskType}`, 'cyan');
  log(`Equivalence Group: ${group.equivalenceGroup}`, 'cyan');
  log(`Models: ${group.models.length}`, 'cyan');
  log(`Test Samples: ${testData.length}`, 'cyan');
  log(`Iterations: ${iterations}`, 'cyan');
  log('');

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/benchmark/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: group.taskType,
        equivalenceGroup: group.equivalenceGroup,
        testData,
        iterations,
        runBy: 'interactive-cli',
        notes: `Interactive benchmark run with ${iterations} iterations`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || response.statusText);
    }

    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log(`✓ Benchmark completed in ${duration}s\n`, 'green');

    return result;
  } catch (error) {
    log(`✗ Benchmark failed: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Format latency value
 */
function formatLatency(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(2)}ms`;
}

/**
 * Display results in formatted table
 */
function displayResults(result) {
  log('='.repeat(80), 'bright');
  log('BENCHMARK RESULTS', 'bright');
  log('='.repeat(80) + '\n', 'bright');

  log(`Comparison ID: ${result.comparisonId}`, 'dim');
  log(`Task Type: ${result.taskType}`, 'cyan');
  log(`Equivalence Group: ${result.equivalenceGroup}`, 'cyan');
  log(`Models Compared: ${result.modelIds.length}`, 'cyan');
  log('');

  // Find winner for highlighting
  const winnerId = result.winner?.modelId;

  // Table header
  log('┌────────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────────┐', 'dim');
  log('│ Model                          │ Avg Latency  │ P50 Latency  │ P95 Latency  │ P99 Latency  │ Error Rate │', 'bright');
  log('├────────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────────┤', 'dim');

  // Sort by average latency
  const sortedModels = Object.entries(result.results).sort(
    ([, a], [, b]) => a.avgLatency - b.avgLatency
  );

  for (const [modelId, metrics] of sortedModels) {
    const isWinner = modelId === winnerId;
    const color = isWinner ? 'green' : 'reset';
    const marker = isWinner ? ' ★' : '  ';

    const modelName = modelId.padEnd(28).substring(0, 28);
    const avg = formatLatency(metrics.avgLatency).padStart(11);
    const p50 = formatLatency(metrics.p50Latency).padStart(11);
    const p95 = formatLatency(metrics.p95Latency).padStart(11);
    const p99 = formatLatency(metrics.p99Latency).padStart(11);
    const errorRate = `${(metrics.errorRate * 100).toFixed(1)}%`.padStart(9);

    log(
      `│${marker}${colors[color]}${modelName}${colors.reset} │ ${avg} │ ${p50} │ ${p95} │ ${p99} │ ${errorRate} │`,
      color
    );
  }

  log('└────────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴────────────┘', 'dim');

  // Winner announcement
  if (result.winner) {
    log('\n' + '★'.repeat(80), 'green');
    log(`  WINNER: ${result.winner.modelId} (${result.winner.framework})`, 'green');
    log(`  Average Latency: ${formatLatency(result.winner.avgLatency)}`, 'green');

    // Calculate speedup
    const latencies = Object.values(result.results).map((m) => m.avgLatency);
    const slowest = Math.max(...latencies);
    const fastest = result.winner.avgLatency;

    if (slowest > fastest) {
      const speedup = ((slowest / fastest - 1) * 100).toFixed(1);
      log(`  Speedup: ${speedup}% faster than slowest`, 'green');
    }

    log('★'.repeat(80) + '\n', 'green');
  }

  // Detailed metrics
  log('Detailed Metrics:', 'cyan');
  log('');

  for (const [modelId, metrics] of sortedModels) {
    const isWinner = modelId === winnerId;
    const color = isWinner ? 'green' : 'reset';

    log(`${isWinner ? '★ ' : '  '}${modelId}:`, color);
    log(`    Min: ${formatLatency(metrics.minLatency)}, Max: ${formatLatency(metrics.maxLatency)}`, 'dim');
    log(`    Success: ${metrics.successCount}/${metrics.successCount + metrics.errorCount}`, 'dim');
    log('');
  }
}

/**
 * Save results to file (optional)
 */
async function offerSaveResults(result) {
  const answer = await prompt('\nSave results to file? (y/N): ');

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    const fs = await import('fs');
    const filename = `benchmark-${result.comparisonId}.json`;

    fs.writeFileSync(filename, JSON.stringify(result, null, 2));
    log(`✓ Results saved to ${filename}`, 'green');
  }
}

/**
 * Main execution
 */
async function main() {
  log('\n' + '='.repeat(60), 'bright');
  log('Harper Edge AI - Interactive Benchmark Runner', 'bright');
  log('='.repeat(60), 'bright');

  try {
    // Check Harper
    const harperRunning = await checkHarper();
    if (!harperRunning) {
      process.exit(1);
    }

    log('✓ Harper is running', 'green');

    // Fetch models
    log('Fetching models...', 'yellow');
    const models = await fetchModels();

    if (models.length === 0) {
      log('\n✗ No models found in database', 'red');
      log('Run: node scripts/preload-models.js', 'yellow');
      process.exit(1);
    }

    log(`✓ Found ${models.length} models`, 'green');

    // Group models
    const groups = groupModels(models);

    // Select group
    const selectedGroup = await selectBenchmarkGroup(groups);
    if (!selectedGroup) {
      process.exit(1);
    }

    // Get iterations
    const iterations = await getIterations();

    // Run benchmark
    const result = await runBenchmark(selectedGroup, iterations);

    // Display results
    displayResults(result);

    // Offer to save
    await offerSaveResults(result);

    log('\n✓ Benchmark complete!', 'green');
    log('\nNext steps:', 'cyan');
    log('  • View history: Query BenchmarkResult table in Harper');
    log('  • Run again: node scripts/run-benchmark.js');
    log('  • Compare models: node examples/benchmark-comparison.js');
    log('');

    process.exit(0);
  } catch (error) {
    log(`\n✗ Benchmark failed: ${error.message}`, 'red');
    if (error.stack) {
      log(error.stack, 'dim');
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runBenchmark, generateTestData, displayResults };
