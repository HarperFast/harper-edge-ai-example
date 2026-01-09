#!/usr/bin/env node
/**
 * Harper AI CLI
 *
 * Command-line interface for Harper AI operations including model fetching,
 * job management, benchmarking, and Ollama integration.
 *
 * Usage:
 *   harper-ai model inspect <source> <sourceReference> [--variant <variant>]
 *   harper-ai model fetch <source> <sourceReference> --name <name> [options]
 *   harper-ai model list [--stage <stage>] [--framework <framework>]
 *   harper-ai job list [--status <status>] [--modelName <name>]
 *   harper-ai job get <jobId>
 *   harper-ai job watch <jobId>
 *   harper-ai job retry <jobId>
 *
 * Global options:
 *   --url <url>       Harper instance URL (default: http://localhost:9926)
 *   --token <token>   Model Fetch API token (or set MODEL_FETCH_TOKEN env var)
 *   --help            Show help
 */

import { log } from '../lib/cli-utils.js';
import { getConfig } from '../lib/config.js';

const args = process.argv.slice(2);

// Handle help flag
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
	showHelp();
	process.exit(0);
}

// Get command and subcommand
const [command, subcommand, ...remainingArgs] = args;

// Route to appropriate command handler
try {
	switch (command) {
		case 'model':
			await handleModelCommand(subcommand, remainingArgs);
			break;

		case 'job':
			await handleJobCommand(subcommand, remainingArgs);
			break;

		default:
			log.error(`Unknown command: ${command}`);
			console.log('\nRun "harper-ai --help" for usage information');
			process.exit(1);
	}
} catch (error) {
	log.error(`Command failed: ${error.message}`);
	if (process.env.DEBUG) {
		console.error(error);
	}
	process.exit(1);
}

/**
 * Handle model commands
 */
async function handleModelCommand(subcommand, args) {
	const { default: modelCommands } = await import('./commands/model.js');

	switch (subcommand) {
		case 'inspect':
			await modelCommands.inspect(args);
			break;

		case 'fetch':
			await modelCommands.fetch(args);
			break;

		case 'list':
			await modelCommands.list(args);
			break;

		default:
			log.error(`Unknown model subcommand: ${subcommand}`);
			console.log('\nAvailable model commands: inspect, fetch, list');
			process.exit(1);
	}
}

/**
 * Handle job commands
 */
async function handleJobCommand(subcommand, args) {
	const { default: jobCommands } = await import('./commands/job.js');

	switch (subcommand) {
		case 'list':
			await jobCommands.list(args);
			break;

		case 'get':
			await jobCommands.get(args);
			break;

		case 'watch':
			await jobCommands.watch(args);
			break;

		case 'retry':
			await jobCommands.retry(args);
			break;

		default:
			log.error(`Unknown job subcommand: ${subcommand}`);
			console.log('\nAvailable job commands: list, get, watch, retry');
			process.exit(1);
	}
}

/**
 * Show help message
 */
function showHelp() {
	console.log(`
Harper AI CLI - Model fetching and job management

USAGE:
  harper-ai <command> <subcommand> [options]

COMMANDS:
  model              Model operations
    inspect          Inspect a model before downloading
    fetch            Fetch a model asynchronously
    list             List models in database

  job                Job operations
    list             List fetch jobs
    get              Get job status
    watch            Watch job progress (live updates)
    retry            Retry a failed job

EXAMPLES:
  # Inspect a model before downloading
  harper-ai model inspect filesystem test.onnx

  # Fetch a model from HuggingFace
  harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 \\
    --name minilm --version v1 --variant quantized

  # List all fetch jobs
  harper-ai job list

  # Watch a job's progress
  harper-ai job watch <jobId>

GLOBAL OPTIONS:
  --url <url>        Harper instance URL (default: http://localhost:9926)
  --token <token>    Model Fetch API token (or set MODEL_FETCH_TOKEN)
  --help, -h         Show this help message

ENVIRONMENT VARIABLES:
  HARPER_URL         Harper instance URL
  MODEL_FETCH_TOKEN  Authentication token for Model Fetch API

For more information, see docs/MODEL_FETCH_SYSTEM.md
`);
}
