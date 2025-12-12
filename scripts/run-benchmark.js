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
import { generateTestData } from '../src/core/utils/testDataFactory.js';
import { log } from './lib/cli-utils.js';

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

// Keep colors object for table formatting
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

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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
    log.error('Harper is not running. Please start Harper first.');
    log.warn('  Run: npm run dev');
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
    log.error('No models found. Please run: node scripts/preload-models.js');
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

// Test data generation now imported from testDataFactory

/**
 * Run benchmark via API
 */
async function runBenchmark(group, iterations) {
  log('\n' + '='.repeat(60), 'bright');
  log('Running Benchmark...', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  const testData = generateTestData(group.taskType, 10);

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

// Format latency: inline where needed since it's a simple one-liner
const formatLatency = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(2)}ms`;

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

export { runBenchmark, displayResults };
