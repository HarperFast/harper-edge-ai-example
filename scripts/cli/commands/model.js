/**
 * Model Commands
 *
 * CLI commands for model operations: inspect, fetch, list
 */

import { log, printTable } from '../../lib/cli-utils.js';
import { getConfig } from '../../lib/config.js';
import { ModelFetchClient } from '../../lib/model-fetch-client.js';

/**
 * Parse CLI arguments into key-value pairs
 */
function parseArgs(args) {
	const parsed = { positional: [] };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const value = args[i + 1];
			if (value && !value.startsWith('--')) {
				parsed[key] = value;
				i++; // Skip next arg
			} else {
				parsed[key] = true;
			}
		} else {
			parsed.positional.push(arg);
		}
	}

	return parsed;
}

/**
 * Inspect a model before downloading
 *
 * Usage: harper-ai model inspect <source> <sourceReference> [--variant <variant>]
 */
async function inspect(args) {
	const parsed = parseArgs(args);
	const [source, sourceReference] = parsed.positional;

	if (!source || !sourceReference) {
		log.error('Missing required arguments');
		console.log('\nUsage: harper-ai model inspect <source> <sourceReference> [--variant <variant>]');
		console.log('\nExamples:');
		console.log('  harper-ai model inspect filesystem test-fixtures/test-model.onnx');
		console.log('  harper-ai model inspect huggingface Xenova/all-MiniLM-L6-v2 --variant quantized');
		console.log('  harper-ai model inspect url https://example.com/model.onnx');
		process.exit(1);
	}

	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken);

	try {
		log.info(`Inspecting model: ${sourceReference}...`);

		const result = await client.inspectModel(source, sourceReference, parsed.variant);

		if (result.error) {
			log.error(`Inspection failed: ${result.error}`);
			if (result.debug) {
				console.log('\nDebug Info:');
				console.log(JSON.stringify(result.debug, null, 2));
			}
			process.exit(1);
		}

		// Display results
		console.log('');
		log.success('Model inspection complete');
		console.log('');

		console.log(`Source:          ${result.source}`);
		console.log(`Reference:       ${result.sourceReference}`);
		console.log(`Framework:       ${result.framework}`);
		console.log(`Suggested Name:  ${result.suggestedModelName}`);

		console.log('\nVariants:');
		const variantTable = result.variants.map((v) => [
			v.name,
			v.precision,
			formatBytes(v.totalSize),
			v.files.length,
		]);
		printTable(variantTable, ['Name', 'Precision', 'Size', 'Files']);

		if (result.inferredMetadata && Object.keys(result.inferredMetadata).length > 0) {
			console.log('\nInferred Metadata:');
			console.log(JSON.stringify(result.inferredMetadata, null, 2));
		}
	} catch (error) {
		log.error(`Inspection failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Fetch a model asynchronously
 *
 * Usage: harper-ai model fetch <source> <sourceReference> --name <name> [options]
 */
async function fetch(args) {
	const parsed = parseArgs(args);
	const [source, sourceReference] = parsed.positional;

	// Support both --name and --modelName (prefer --modelName if both provided)
	const modelName = parsed.modelName || parsed.name;
	// Support both --version and --modelVersion (prefer --modelVersion if both provided)
	const modelVersion = parsed.modelVersion || parsed.version || 'v1';

	if (!source || !sourceReference || !modelName) {
		log.error('Missing required arguments');
		console.log('\nUsage: harper-ai model fetch <source> <sourceReference> --name <name> [options]');
		console.log('\nRequired:');
		console.log('  --name <name>              Model name (or --modelName)');
		console.log('\nOptional:');
		console.log('  --version <version>        Model version (or --modelVersion, default: v1)');
		console.log('  --variant <variant>        Variant name (for HuggingFace)');
		console.log('  --framework <framework>    Framework override');
		console.log('  --stage <stage>            Stage (development|staging|production)');
		console.log('  --webhook <url>            Webhook URL for notifications');
		console.log('\nExamples:');
		console.log('  harper-ai model fetch filesystem test-fixtures/test-model.onnx --name test-model');
		console.log('  harper-ai model fetch huggingface Xenova/all-MiniLM-L6-v2 --name minilm --variant quantized');
		console.log('  harper-ai model fetch url https://example.com/model.onnx --modelName remote-model --modelVersion v2');
		process.exit(1);
	}

	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken);

	try {
		const fetchData = {
			source,
			sourceReference,
			modelName,
			modelVersion,
		};

		if (parsed.variant) fetchData.variant = parsed.variant;
		if (parsed.framework) fetchData.framework = parsed.framework;
		if (parsed.stage) fetchData.stage = parsed.stage;
		if (parsed.webhook) fetchData.webhookUrl = parsed.webhook;

		log.info(`Creating fetch job for ${fetchData.modelName}:${fetchData.modelVersion}...`);

		const result = await client.fetchModel(fetchData);

		if (result.error) {
			log.error(`Fetch failed: ${result.error}`);
			process.exit(1);
		}

		console.log('');
		log.success('Fetch job created');
		console.log('');

		console.log(`Job ID:   ${result.jobId}`);
		console.log(`Model ID: ${result.modelId}`);
		console.log(`Status:   ${result.status}`);

		console.log('\nTrack progress with:');
		console.log(`  harper-ai job watch ${result.jobId}`);
	} catch (error) {
		log.error(`Fetch failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * List models in database
 *
 * Usage: harper-ai model list [--stage <stage>] [--framework <framework>]
 */
async function list(args) {
	const parsed = parseArgs(args);
	const config = getConfig(args);

	try {
		// Call ModelList resource
		const params = new URLSearchParams();
		if (parsed.stage) params.append('stage', parsed.stage);
		if (parsed.framework) params.append('framework', parsed.framework);

		const fetchOptions = {};
		if (config.modelFetchToken) {
			fetchOptions.headers = {
				'X-Model-Fetch-Token': config.modelFetchToken,
			};
		}

		const url = `${config.url}/ModelList${params.toString() ? '?' + params.toString() : ''}`;
		const response = await globalThis.fetch(url, fetchOptions);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const models = await response.json();

		if (!models || models.length === 0) {
			log.info('No models found');
			return;
		}

		console.log('');
		log.info(`Found ${models.length} model(s)`);
		console.log('');

		const tableData = models.map((m) => [
			m.modelName,
			m.modelVersion,
			m.framework,
			m.stage,
			formatBytes(m.blobSize || 0),
		]);

		printTable(tableData, ['Name', 'Version', 'Framework', 'Stage', 'Size']);
	} catch (error) {
		log.error(`List failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default {
	inspect,
	fetch,
	list,
};
