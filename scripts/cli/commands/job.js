/**
 * Job Commands
 *
 * CLI commands for job operations: list, get, watch, retry
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
 * List fetch jobs
 *
 * Usage: harper-ai job list [--status <status>] [--modelName <name>]
 */
async function list(args) {
	const parsed = parseArgs(args);
	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken, config.username, config.password);

	try {
		const filters = {};
		if (parsed.status) filters.status = parsed.status;
		if (parsed.modelName) filters.modelName = parsed.modelName;

		const result = await client.listJobs(filters);

		if (result.error) {
			log.error(`List failed: ${result.error}`);
			process.exit(1);
		}

		const jobs = result.jobs || [];

		if (jobs.length === 0) {
			log.info('No jobs found');
			return;
		}

		console.log('');
		log.info(`Found ${jobs.length} job(s)`);
		console.log('');

		const tableData = jobs.map((j) => [
			j.id.substring(0, 8) + '...',
			j.modelName,
			j.modelVersion,
			j.source,
			formatStatus(j.status),
			`${j.progress || 0}%`,
			new Date(j.createdAt).toLocaleString(),
		]);

		printTable(tableData, ['Job ID', 'Model', 'Version', 'Source', 'Status', 'Progress', 'Created']);

		console.log('\nUse "harper-ai job get <jobId>" for details');
	} catch (error) {
		log.error(`List failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Get job status
 *
 * Usage: harper-ai job get <jobId>
 */
async function get(args) {
	const parsed = parseArgs(args);
	const [jobId] = parsed.positional;

	if (!jobId) {
		log.error('Missing job ID');
		console.log('\nUsage: harper-ai job get <jobId>');
		process.exit(1);
	}

	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken, config.username, config.password);

	try {
		const job = await client.getJob(jobId);

		if (job.error) {
			log.error(`Get failed: ${job.error}`);
			process.exit(1);
		}

		// Display job details
		console.log('');
		log.info('Job Details');
		console.log('');

		console.log(`Job ID:         ${job.id || job.jobId}`);
		console.log(`Status:         ${formatStatus(job.status)}`);
		console.log(`Progress:       ${job.progress || 0}%`);

		console.log(`\nModel:          ${job.modelName}:${job.modelVersion}`);
		console.log(`Source:         ${job.source}`);
		console.log(`Reference:      ${job.sourceReference}`);
		if (job.variant) console.log(`Variant:        ${job.variant}`);
		console.log(`Framework:      ${job.framework}`);
		console.log(`Stage:          ${job.stage}`);

		console.log(`\nCreated:        ${new Date(job.createdAt).toLocaleString()}`);
		if (job.startedAt) console.log(`Started:        ${new Date(job.startedAt).toLocaleString()}`);
		if (job.completedAt) console.log(`Completed:      ${new Date(job.completedAt).toLocaleString()}`);

		if (job.downloadedBytes && job.totalBytes) {
			console.log(`\nDownload:       ${formatBytes(job.downloadedBytes)} / ${formatBytes(job.totalBytes)}`);
		}

		if (job.retryCount > 0) {
			console.log(`\nRetries:        ${job.retryCount} / ${job.maxRetries}`);
		}

		if (job.lastError) {
			console.log(`\nLast Error:     ${job.lastError}`);
			if (job.errorCode) console.log(`Error Code:     ${job.errorCode}`);
			console.log(`Retryable:      ${job.retryable ? 'Yes' : 'No'}`);
		}

		if (job.resultModelId) {
			console.log(`\nResult:         ${job.resultModelId}`);
		}

		// Suggest next actions
		console.log('');
		if (job.status === 'failed' && job.retryable) {
			console.log('To retry: harper-ai job retry ' + jobId);
		} else if (job.status === 'queued' || job.status === 'downloading') {
			console.log('To watch: harper-ai job watch ' + jobId);
		}
	} catch (error) {
		log.error(`Get failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Watch job progress with live updates
 *
 * Usage: harper-ai job watch <jobId>
 */
async function watch(args) {
	const parsed = parseArgs(args);
	const [jobId] = parsed.positional;

	if (!jobId) {
		log.error('Missing job ID');
		console.log('\nUsage: harper-ai job watch <jobId>');
		process.exit(1);
	}

	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken, config.username, config.password);

	console.log('');
	log.info(`Watching job ${jobId}...`);
	console.log('Press Ctrl+C to stop');
	console.log('');

	let lastStatus = null;
	let lastProgress = null;

	try {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const job = await client.getJob(jobId);

			if (job.error) {
				log.error(`Watch failed: ${job.error}`);
				process.exit(1);
			}

			// Print update if status or progress changed
			if (job.status !== lastStatus || job.progress !== lastProgress) {
				const timestamp = new Date().toLocaleTimeString();
				const progressBar = createProgressBar(job.progress || 0, 30);
				const statusIcon = getStatusIcon(job.status);

				process.stdout.write(`\r[${timestamp}] ${statusIcon} ${job.status.padEnd(12)} ${progressBar} ${job.progress || 0}%`);

				if (job.downloadedBytes && job.totalBytes) {
					process.stdout.write(` (${formatBytes(job.downloadedBytes)} / ${formatBytes(job.totalBytes)})`);
				}

				lastStatus = job.status;
				lastProgress = job.progress;
			}

			// Check for terminal states
			if (job.status === 'completed') {
				console.log('\n');
				log.success(`Job completed: ${job.resultModelId}`);
				break;
			}

			if (job.status === 'failed') {
				console.log('\n');
				log.error(`Job failed: ${job.lastError}`);
				if (job.retryable) {
					console.log(`\nTo retry: harper-ai job retry ${jobId}`);
				}
				process.exit(1);
			}

			// Wait 1 second before next poll
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	} catch (error) {
		console.log('\n');
		log.error(`Watch failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Retry a failed job
 *
 * Usage: harper-ai job retry <jobId>
 */
async function retry(args) {
	const parsed = parseArgs(args);
	const [jobId] = parsed.positional;

	if (!jobId) {
		log.error('Missing job ID');
		console.log('\nUsage: harper-ai job retry <jobId>');
		process.exit(1);
	}

	const config = getConfig(args);
	const client = new ModelFetchClient(config.url, config.modelFetchToken, config.username, config.password);

	try {
		log.info(`Retrying job ${jobId}...`);

		const result = await client.retryJob(jobId);

		if (result.error) {
			log.error(`Retry failed: ${result.error}`);
			process.exit(1);
		}

		console.log('');
		log.success('Job queued for retry');
		console.log('');

		console.log('Track progress with:');
		console.log(`  harper-ai job watch ${jobId}`);
	} catch (error) {
		log.error(`Retry failed: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Format status with color
 */
function formatStatus(status) {
	const colors = {
		reset: '\x1b[0m',
		green: '\x1b[32m',
		yellow: '\x1b[33m',
		red: '\x1b[31m',
		blue: '\x1b[34m',
	};

	const statusColors = {
		queued: colors.blue,
		downloading: colors.yellow,
		processing: colors.yellow,
		completed: colors.green,
		failed: colors.red,
	};

	const color = statusColors[status] || colors.reset;
	return `${color}${status}${colors.reset}`;
}

/**
 * Get status icon
 */
function getStatusIcon(status) {
	const icons = {
		queued: '⏳',
		downloading: '⬇️ ',
		processing: '⚙️ ',
		completed: '✅',
		failed: '❌',
	};

	return icons[status] || '•';
}

/**
 * Create a progress bar
 */
function createProgressBar(progress, width = 30) {
	const filled = Math.round((progress / 100) * width);
	const empty = width - filled;
	return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default {
	list,
	get,
	watch,
	retry,
};
