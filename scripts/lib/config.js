import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

/**
 * Load .env file if it exists
 */
function loadEnv() {
	const envPath = join(PROJECT_ROOT, '.env');
	if (!existsSync(envPath)) {
		return {};
	}

	const content = readFileSync(envPath, 'utf-8');
	const env = {};

	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) {
			const [key, ...valueParts] = trimmed.split('=');
			if (key && valueParts.length > 0) {
				env[key.trim()] = valueParts.join('=').trim();
			}
		}
	}

	return env;
}

/**
 * Parse command line arguments for URL and auth
 * Supports: --url, --username, --password
 */
function parseArgs(args) {
	const parsed = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const value = args[i + 1];
			if (value && !value.startsWith('--')) {
				parsed[key] = value;
				i++; // Skip next arg since we consumed it
			}
		}
	}

	return parsed;
}

/**
 * Get Harper configuration from environment, .env file, and CLI args
 * Priority: CLI args > environment variables > .env file > defaults
 *
 * @param {string[]} args - Command line arguments (process.argv.slice(2))
 * @returns {Object} Configuration object
 */
export function getConfig(args = []) {
	const envVars = loadEnv();
	const cliArgs = parseArgs(args);

	const config = {
		url:
			cliArgs.url ||
			process.env.CLI_TARGET_URL ||
			envVars.CLI_TARGET_URL ||
			process.env.HARPER_URL ||
			envVars.HARPER_URL ||
			'http://localhost:9926',

		username: cliArgs.username || process.env.CLI_TARGET_USERNAME || envVars.CLI_TARGET_USERNAME || null,

		password: cliArgs.password || process.env.CLI_TARGET_PASSWORD || envVars.CLI_TARGET_PASSWORD || null,

		ollamaHost:
			process.env.OLLAMA_HOST || envVars.OLLAMA_HOST || 'http://localhost:11434',
	};

	return config;
}

/**
 * Create fetch options with basic auth if credentials provided
 */
export function getFetchOptions(config, additionalOptions = {}) {
	const options = { ...additionalOptions };

	if (config.username && config.password) {
		const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
		options.headers = {
			...options.headers,
			Authorization: `Basic ${auth}`,
		};
	}

	return options;
}

/**
 * Print configuration (for debugging)
 */
export function printConfig(config) {
	console.log('Configuration:');
	console.log(`  Harper URL: ${config.url}`);
	console.log(`  Username: ${config.username || '(none)'}`);
	console.log(`  Password: ${config.password ? '***' : '(none)'}`);
	console.log(`  Ollama Host: ${config.ollamaHost}`);
	console.log('');
}
