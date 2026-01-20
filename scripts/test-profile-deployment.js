#!/usr/bin/env node
/**
 * Profile Deployment Test Runner
 *
 * Convenience script to test profile deployments with different configurations.
 *
 * Usage:
 *   node scripts/test-profile-deployment.js
 *   node scripts/test-profile-deployment.js --profile testing
 *   node scripts/test-profile-deployment.js --profile benchmarking
 *   node scripts/test-profile-deployment.js --deploy --profile testing
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : 'testing';
const shouldDeploy = args.includes('--deploy');
const verbose = args.includes('--verbose');

console.log(`\n${'='.repeat(60)}`);
console.log(`Profile Deployment Test`);
console.log(`${'='.repeat(60)}\n`);
console.log(`Profile: ${profile}`);
console.log(`Deploy first: ${shouldDeploy ? 'yes' : 'no'}\n`);

/**
 * Run a command and return a promise
 */
function runCommand(command, args, env = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: verbose ? 'inherit' : 'pipe',
			env: { ...process.env, ...env },
			cwd: PROJECT_ROOT,
		});

		let stdout = '';
		let stderr = '';

		if (!verbose) {
			child.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data) => {
				stderr += data.toString();
			});
		}

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`Command failed with exit code ${code}\n${stderr}`));
			}
		});

		child.on('error', (error) => {
			reject(error);
		});
	});
}

/**
 * Main execution
 */
async function main() {
	try {
		// Step 1: Deploy models if requested
		if (shouldDeploy) {
			console.log(`📦 Deploying models from '${profile}' profile...\n`);

			try {
				await runCommand('node', [
					'scripts/preload-models.js',
					'--profile',
					profile,
					'--clean',
				]);
				console.log('✓ Models deployed successfully\n');
			} catch (error) {
				console.error('✗ Model deployment failed:', error.message);
				process.exit(1);
			}
		}

		// Step 2: Run integration tests
		console.log(`🧪 Running integration tests for '${profile}' profile...\n`);

		const testEnv = {
			TEST_PROFILE: profile,
		};

		try {
			const result = await runCommand('node', [
				'--test',
				'tests/integration/profile-deployment.test.js',
			], testEnv);

			if (!verbose) {
				console.log(result.stdout);
			}

			console.log('\n✓ All tests passed!\n');
			process.exit(0);
		} catch (error) {
			console.error('\n✗ Tests failed:', error.message);
			process.exit(1);
		}
	} catch (error) {
		console.error('\n✗ Unexpected error:', error.message);
		process.exit(1);
	}
}

// Show usage if help requested
if (args.includes('--help') || args.includes('-h')) {
	console.log('Profile Deployment Test Runner\n');
	console.log('Usage:');
	console.log('  node scripts/test-profile-deployment.js [options]\n');
	console.log('Options:');
	console.log('  --profile <name>    Profile to test (default: testing)');
	console.log('  --deploy            Deploy models before testing');
	console.log('  --verbose           Show detailed output');
	console.log('  --help, -h          Show this help message\n');
	console.log('Examples:');
	console.log('  node scripts/test-profile-deployment.js');
	console.log('  node scripts/test-profile-deployment.js --profile benchmarking');
	console.log('  node scripts/test-profile-deployment.js --deploy --profile testing');
	console.log('');
	process.exit(0);
}

main();
