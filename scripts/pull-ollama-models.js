#!/usr/bin/env node
/**
 * Pull Ollama Models from Profile
 *
 * Reads a profile JSON and pulls all specified Ollama models using the API.
 * Works with both local and containerized Ollama instances.
 * Reads Ollama configuration from .env file.
 *
 * Usage:
 *   node scripts/pull-ollama-models.js
 *   node scripts/pull-ollama-models.js --profile edge-ai
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './lib/cli-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

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

// Load environment
const envVars = loadEnv();
const OLLAMA_HOST = process.env.OLLAMA_HOST || envVars.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Check if Ollama is installed and running
 */
async function checkOllama() {
	try {
		const response = await fetch(`${OLLAMA_HOST}/api/tags`);
		if (!response.ok) {
			throw new Error('Ollama not responding');
		}
		log.success(`Ollama is running at ${OLLAMA_HOST}`);
		return true;
	} catch (error) {
		log.error(`Ollama is not running at ${OLLAMA_HOST}`);
		log.warn('  Install: https://ollama.ai/');
		log.warn('  Or start: ollama serve');
		log.warn('  Or update OLLAMA_HOST in .env file');
		return false;
	}
}

/**
 * Load profile from file
 */
function loadProfile(profileName) {
	const profilePath = join(PROJECT_ROOT, 'profiles', `${profileName}.json`);

	if (!existsSync(profilePath)) {
		throw new Error(`Profile not found: ${profilePath}`);
	}

	const content = readFileSync(profilePath, 'utf-8');
	return JSON.parse(content);
}

/**
 * Pull a single model using Ollama API
 * https://github.com/ollama/ollama/blob/main/docs/api.md#pull-a-model
 */
async function pullModel(modelName, tag = 'latest') {
	const fullName = tag === 'latest' ? modelName : `${modelName}:${tag}`;

	log.info(`Pulling ${fullName}...`);

	try {
		const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: fullName,
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Stream the response to show progress
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let lastStatus = '';

		while (true) {
			const { done, value } = await reader.read();

			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split('\n').filter(line => line.trim());

			for (const line of lines) {
				try {
					const data = JSON.parse(line);

					// Show progress
					if (data.status && data.status !== lastStatus) {
						process.stdout.write(`\r  ${data.status}`);
						lastStatus = data.status;

						if (data.total && data.completed) {
							const percent = ((data.completed / data.total) * 100).toFixed(1);
							process.stdout.write(` ${percent}%`);
						}
					}
				} catch (e) {
					// Ignore JSON parse errors for incomplete chunks
				}
			}
		}

		console.log(''); // New line after progress
		log.success(`Pulled ${fullName}`);
		return { success: true, model: fullName };

	} catch (error) {
		console.log(''); // New line after progress
		log.error(`Failed to pull ${fullName}: ${error.message}`);
		return { success: false, model: fullName, error: error.message };
	}
}

/**
 * List currently installed models
 */
async function listInstalledModels() {
	try {
		const response = await fetch(`${OLLAMA_HOST}/api/tags`);
		if (!response.ok) {
			return [];
		}
		const data = await response.json();
		return data.models || [];
	} catch (error) {
		return [];
	}
}

/**
 * Main execution
 */
async function main() {
	const args = process.argv.slice(2);
	const profileName = args.find(arg => !arg.startsWith('--')) || 'edge-ai';

	log.section('Harper Edge AI - Pull Ollama Models');

	try {
		// Check Ollama is running
		const ollamaRunning = await checkOllama();
		if (!ollamaRunning) {
			process.exit(1);
		}

		// Load profile
		log.info(`Loading profile: ${profileName}`);
		const profile = loadProfile(profileName);

		console.log('');
		log.info(`Profile: ${profile.name}`);
		log.info(`Description: ${profile.description}`);
		log.info(`Size estimate: ${profile.size_estimate}`);
		console.log('');

		// List currently installed models
		const installed = await listInstalledModels();
		const installedNames = installed.map(m => m.name);

		log.info(`Models to pull (${profile.models.length}):`);
		for (const model of profile.models) {
			const fullName = model.tag && model.tag !== 'latest'
				? `${model.name}:${model.tag}`
				: model.name;

			const alreadyInstalled = installedNames.some(name => name.startsWith(model.name));
			const status = alreadyInstalled ? '[installed]' : '[will pull]';

			console.log(`  • ${fullName} - ${model.purpose} ${status}`);
		}
		console.log('');

		// Pull each model
		const results = [];
		for (const model of profile.models) {
			const result = await pullModel(model.name, model.tag);
			results.push({ ...result, model: model.name });
			console.log('');
		}

		// Summary
		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;

		console.log('');
		log.section('Summary');
		log.success(`Successfully pulled: ${successful} model(s)`);
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

export { checkOllama, loadProfile, pullModel };
