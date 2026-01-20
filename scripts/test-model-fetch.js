#!/usr/bin/env node
/**
 * Model Fetch System Integration Test
 *
 * Tests the complete Model Fetch workflow:
 * 1. Inspect a HuggingFace model
 * 2. Fetch the model (create job)
 * 3. Wait for job completion
 * 4. List models
 * 5. Test inference
 * 6. Clean up (optional)
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const COLORS = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
	console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function section(title) {
	console.log('');
	log('='.repeat(60), 'cyan');
	log(title, 'bright');
	log('='.repeat(60), 'cyan');
	console.log('');
}

async function runCommand(command, args = []) {
	return new Promise((resolve, reject) => {
		log(`Running: ${command} ${args.join(' ')}`, 'blue');

		const proc = spawn(command, args, { stdio: 'inherit' });

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command failed with exit code ${code}`));
			}
		});

		proc.on('error', (err) => {
			reject(err);
		});
	});
}

async function runCommandWithOutput(command, args = []) {
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';

		const proc = spawn(command, args);

		proc.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		proc.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`Command failed: ${stderr}`));
			}
		});

		proc.on('error', (err) => {
			reject(err);
		});
	});
}

async function waitForJob(jobId, maxAttempts = 60, intervalSeconds = 5) {
	log(`Waiting for job ${jobId} to complete...`, 'yellow');

	for (let i = 0; i < maxAttempts; i++) {
		const { stdout } = await runCommandWithOutput('node', [
			'scripts/cli/harper-ai.js',
			'job',
			'get',
			jobId
		]);

		if (stdout.includes('Status: completed')) {
			log('✓ Job completed successfully', 'green');
			return true;
		}

		if (stdout.includes('Status: failed')) {
			log('✗ Job failed', 'red');
			console.log(stdout);
			return false;
		}

		// Show progress
		const progressMatch = stdout.match(/Progress:\s+(\d+)%/);
		if (progressMatch) {
			process.stdout.write(`\rProgress: ${progressMatch[1]}%`);
		}

		await setTimeout(intervalSeconds * 1000);
	}

	log(`✗ Job timed out after ${maxAttempts * intervalSeconds} seconds`, 'red');
	return false;
}

async function main() {
	// Use timestamp to ensure unique model name on each test run
	const timestamp = Date.now();
	const testModel = {
		source: 'huggingface',
		reference: 'Xenova/all-MiniLM-L6-v2',
		name: `test-minilm-${timestamp}`,
		version: 'v1',
		variant: 'quantized'
	};

	let jobId = null;

	try {
		section('Test 1: Inspect Model');
		await runCommand('node', [
			'scripts/cli/harper-ai.js',
			'model',
			'inspect',
			testModel.source,
			testModel.reference,
			'--variant',
			testModel.variant
		]);
		log('✓ Model inspection successful', 'green');

		section('Test 2: Fetch Model');
		const { stdout: fetchOutput } = await runCommandWithOutput('node', [
			'scripts/cli/harper-ai.js',
			'model',
			'fetch',
			testModel.source,
			testModel.reference,
			'--name',
			testModel.name,
			'--version',
			testModel.version,
			'--variant',
			testModel.variant
		]);

		// Extract job ID from output
		const jobIdMatch = fetchOutput.match(/Job ID:\s+([a-f0-9-]+)/i);
		if (jobIdMatch) {
			jobId = jobIdMatch[1];
			log(`✓ Fetch job created: ${jobId}`, 'green');
		} else {
			throw new Error('Could not extract job ID from output');
		}

		section('Test 3: Wait for Job Completion');
		const jobCompleted = await waitForJob(jobId);

		if (!jobCompleted) {
			throw new Error('Job did not complete successfully');
		}

		section('Test 4: List Models');
		await runCommand('node', [
			'scripts/cli/harper-ai.js',
			'model',
			'list'
		]);
		log('✓ Model listing successful', 'green');

		section('Test 5: Test Inference');
		log('Testing prediction with downloaded model...', 'yellow');

		const testInput = 'This is a test sentence for embeddings';
		const curlArgs = [
			'-X', 'POST',
			'http://localhost:9926/Predict',
			'-H', 'Content-Type: application/json',
			'-d', JSON.stringify({
				modelName: testModel.name,
				modelVersion: testModel.version,
				input: testInput
			})
		];

		const { stdout: predictOutput } = await runCommandWithOutput('curl', curlArgs);
		const result = JSON.parse(predictOutput);

		if (result.output && Array.isArray(result.output)) {
			log(`✓ Inference successful! Got ${result.output.length} dimensions`, 'green');
			log(`  First 5 values: [${result.output.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`, 'cyan');
		} else if (result.error) {
			throw new Error(`Inference failed: ${result.error}`);
		} else {
			log('✗ Unexpected response format', 'red');
			console.log(result);
		}

		section('All Tests Passed! ✓');
		log('Model Fetch system is working correctly', 'green');

		// Ask about cleanup
		console.log('');
		log('Test model created:', 'yellow');
		log(`  Model: ${testModel.name}:${testModel.version}`, 'cyan');
		log(`  Job ID: ${jobId}`, 'cyan');
		log('', 'reset');
		log('To clean up, run:', 'yellow');
		log(`  DELETE http://localhost:9926/Model?id=${testModel.name}:${testModel.version}`, 'cyan');
		log(`  Or use Harper Studio to delete the model`, 'cyan');

	} catch (error) {
		console.log('');
		log('✗ Test Failed', 'red');
		log(error.message, 'red');

		if (error.stack) {
			console.error(error.stack);
		}

		process.exit(1);
	}
}

// Run tests
main();
