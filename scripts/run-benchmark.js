#!/usr/bin/env node
/**
 * Interactive Benchmark Runner
 *
 * Interactive CLI for running benchmarks comparing equivalent models
 * across different backends (Ollama, TensorFlow, ONNX).
 *
 * Usage:
 *   node scripts/run-benchmark.js                    # Interactive mode
 *   node scripts/run-benchmark.js --all              # Run all benchmarks with defaults
 *   node scripts/run-benchmark.js --all --no-prompt  # Run all benchmarks, auto-save results
 *   npm run benchmark                                # Interactive mode
 *   npm run benchmark:all                            # Run all benchmarks (no prompts)
 *
 * Flags:
 *   --all         Run all benchmark groups with 100 iterations each
 *   --no-prompt   Auto-save results without prompting (useful for automation/CI)
 *
 * Features:
 *   - Interactive menu for selecting task type and equivalence group
 *   - --all flag to run all benchmark groups with sensible defaults (100 iterations)
 *   - --no-prompt flag to auto-save results without user interaction
 *   - Generates appropriate test data for each task type
 *   - Runs benchmarks via BenchmarkEngine
 *   - Displays results in formatted table
 *   - Shows winner and performance comparison
 */

import * as readline from 'readline';
import { generateTestData } from '../src/core/utils/testDataFactory.js';
import { log as cliLog } from './lib/cli-utils.js';
import { getConfig, getFetchOptions } from './lib/config.js';

const config = getConfig(process.argv.slice(2));
const BASE_URL = config.url;

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

// Helper function for colored output
function log(msg, color = 'reset') {
	const colorCode = colors[color] || colors.reset;
	console.log(`${colorCode}${msg}${colors.reset}`);
}

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
		const response = await fetch(`${BASE_URL}/Status`, getFetchOptions(config));
		if (!response.ok) {
			throw new Error('Harper not responding');
		}
		return true;
	} catch (_error) {
		cliLog.error('Harper is not running. Please start Harper first.');
		cliLog.warn('  Run: npm run dev');
		return false;
	}
}

/**
 * Fetch available models from Harper
 */
async function fetchModels() {
	// Trailing slash indicates collection (all records)
	const response = await fetch(`${BASE_URL}/Model/`, getFetchOptions(config));

	if (!response.ok) {
		throw new Error(`Failed to fetch models: ${response.statusText}`);
	}

	const models = await response.json();
	return Array.isArray(models) ? models : [];
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
		} catch (_error) {
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
		cliLog.error('No models found. Please run: node scripts/preload-models.js');
		return null;
	}

	groupKeys.forEach((key, index) => {
		const group = groups[key];
		log(
			`${index + 1}. ${colors.cyan}${group.taskType}${colors.reset} - ${colors.yellow}${group.equivalenceGroup}${colors.reset}`
		);
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
		const payload = {
			taskType: group.taskType,
			equivalenceGroup: group.equivalenceGroup,
			testData,
			iterations,
			runBy: 'interactive-cli',
			notes: `Interactive benchmark run with ${iterations} iterations`,
		};

		const response = await fetch(
			`${BASE_URL}/Benchmark`,
			getFetchOptions(config, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
		);

		const responseText = await response.text();

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${responseText}`);
		}

		let result;
		try {
			result = responseText ? JSON.parse(responseText) : {};
		} catch (_e) {
			throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		// Check if we got an error in the response
		if (result.error) {
			throw new Error(result.error);
		}

		// Validate result structure
		if (!result.comparisonId || !result.modelIds || !result.results) {
			throw new Error(`Incomplete result from server: ${JSON.stringify(Object.keys(result))}`);
		}

		log(`✓ Benchmark completed in ${duration}s\n`, 'green');

		return result;
	} catch (error) {
		log(`✗ Benchmark failed: ${error.message}`, 'red');
		throw error;
	}
}

// Format latency: inline where needed since it's a simple one-liner
const formatLatency = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(2)}ms`);

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
	log(
		'┌────────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────────┐',
		'dim'
	);
	log(
		'│ Model                          │ Avg Latency  │ P50 Latency  │ P95 Latency  │ P99 Latency  │ Error Rate │',
		'bright'
	);
	log(
		'├────────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────────┤',
		'dim'
	);

	// Sort by average latency
	const sortedModels = Object.entries(result.results).sort(([, a], [, b]) => a.avgLatency - b.avgLatency);

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

	log(
		'└────────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴────────────┘',
		'dim'
	);

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
 * Save results to file (optional or automatic)
 */
async function offerSaveResults(result, noPrompt = false) {
	if (noPrompt) {
		// Auto-save without prompting (for automation/CI)
		const fs = await import('fs');
		const filename = `benchmark-${result.comparisonId}.json`;

		fs.writeFileSync(filename, JSON.stringify(result, null, 2));
		log(`✓ Results auto-saved to ${filename}`, 'green');
		return;
	}

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
	const args = process.argv.slice(2);
	const runAll = args.includes('--all');
	const noPrompt = args.includes('--no-prompt');
	const defaultIterations = 100;

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
		const groupsList = Object.values(groups);

		if (runAll) {
			// Run all benchmark groups
			log(`\n✓ Running all ${groupsList.length} benchmark groups with ${defaultIterations} iterations each\n`, 'cyan');

			const allResults = [];
			for (let i = 0; i < groupsList.length; i++) {
				const group = groupsList[i];
				log(`\n[${i + 1}/${groupsList.length}] ${group.taskType} - ${group.equivalenceGroup}`, 'bright');

				try {
					const result = await runBenchmark(group, defaultIterations);
					allResults.push(result);
					displayResults(result);
					await offerSaveResults(result, noPrompt);
				} catch (error) {
					log(`✗ Failed: ${error.message}`, 'red');
				}
			}

			log('\n' + '='.repeat(60), 'bright');
			log('ALL BENCHMARKS COMPLETE', 'bright');
			log('='.repeat(60), 'bright');
			log(`\n✓ Completed ${allResults.length}/${groupsList.length} benchmarks`, 'green');
		} else {
			// Interactive mode
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
			await offerSaveResults(result, noPrompt);

			log('\n✓ Benchmark complete!', 'green');
		}

		log('\nNext steps:', 'cyan');
		log('  • View history: Query BenchmarkResult table in Harper');
		log('  • Run again: node scripts/run-benchmark.js');
		log('  • Run all: node scripts/run-benchmark.js --all');
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
