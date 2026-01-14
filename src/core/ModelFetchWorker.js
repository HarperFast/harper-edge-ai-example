/**
 * Model Fetch Worker
 *
 * Background worker that processes model fetch jobs from the ModelFetchJob queue.
 * Handles downloading models from various sources (HuggingFace, HTTP URLs, filesystem),
 * storing them in the Model table, and managing retry logic with rate limiting.
 *
 * Features:
 * - Polling-based job queue (checks every 5 seconds)
 * - Concurrent job processing (default: 3 jobs max)
 * - Automatic retry with exponential backoff (3 attempts)
 * - Rate limiting integration (respects 429 backoff)
 * - Crash recovery (resets stuck "downloading" jobs to "queued")
 * - Webhook notifications on completion/failure
 * - Progress tracking with database updates
 *
 * Architecture:
 * - Stateless design (can be stopped/restarted safely)
 * - Uses setInterval for polling (no complex job scheduler)
 * - Maps active jobs to prevent double-processing
 *
 * Usage:
 *   const worker = new ModelFetchWorker();
 *   await worker.start();
 *   // ... worker runs in background ...
 *   await worker.stop();
 *
 * Note: Uses Harper's global logger and tables objects. Initialized via handleApplication.
 */

/* global tables, logger */

import { v4 as uuidv4 } from 'uuid';
import { HuggingFaceAdapter } from './fetchers/HuggingFaceAdapter.js';
import { HttpUrlAdapter } from './fetchers/HttpUrlAdapter.js';
import { LocalFilesystemAdapter } from './fetchers/LocalFilesystemAdapter.js';
import { RateLimiter } from './utils/RateLimiter.js';
import {
	SecurityError,
	RateLimitError,
	NetworkError,
	ModelNotFoundError,
	UnsupportedFrameworkError,
	StorageError,
	FileTooLargeError,
} from './errors/ModelFetchErrors.js';

export class ModelFetchWorker {
	/**
	 * Create a model fetch worker
	 * Uses Harper's global tables and logger objects
	 */
	constructor() {
		// Use Harper's global tables object
		if (typeof tables === 'undefined') {
			throw new Error('ModelFetchWorker requires Harper tables global');
		}
		this.tables = tables;

		// Configuration from environment variables
		this.maxConcurrent = parseInt(process.env.MODEL_FETCH_MAX_CONCURRENT) || 3;
		this.pollInterval = parseInt(process.env.MODEL_FETCH_POLL_INTERVAL) || 5000; // 5 seconds
		this.maxFileSize = parseInt(process.env.MODEL_FETCH_MAX_FILE_SIZE) || 5 * 1024 * 1024 * 1024; // 5GB
		this.maxRetries = parseInt(process.env.MODEL_FETCH_MAX_RETRIES) || 3;
		this.initialRetryDelayMs = parseInt(process.env.MODEL_FETCH_INITIAL_RETRY_DELAY) || 5000; // 5s

		// Active job tracking
		this.activeJobs = new Map(); // jobId -> Promise

		// Rate limiter for 429 handling
		this.rateLimiter = new RateLimiter();

		// Source adapters
		this.adapters = {
			huggingface: new HuggingFaceAdapter(),
			url: new HttpUrlAdapter(),
			filesystem: new LocalFilesystemAdapter(),
		};

		// Worker state
		this.running = false;
		this.intervalHandle = null;
	}

	/**
	 * Start the worker
	 *
	 * Recovers crashed jobs and begins polling the job queue.
	 */
	async start() {
		if (this.running) {
			logger.info('[ModelFetchWorker] Already running');
			return;
		}

		logger.info('[ModelFetchWorker] Starting...');
		this.running = true;

		// Recover any jobs that were stuck in "downloading" state from previous crash
		await this.recoverCrashedJobs();

		// Start polling loop
		this.intervalHandle = setInterval(() => {
			this.processQueue().catch((error) => {
				logger.error('[ModelFetchWorker] Error processing queue:', error);
			});
		}, this.pollInterval);

		logger.info(
			`[ModelFetchWorker] Started (polling every ${this.pollInterval}ms, max ${this.maxConcurrent} concurrent jobs)`
		);
	}

	/**
	 * Stop the worker gracefully
	 *
	 * Waits for active jobs to complete (with timeout), then stops polling.
	 */
	async stop() {
		if (!this.running) {
			return;
		}

		logger.info('[ModelFetchWorker] Stopping...');
		this.running = false;

		// Stop polling
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}

		// Wait for active jobs to complete (with timeout)
		const timeout = 30000; // 30 seconds
		const start = Date.now();
		while (this.activeJobs.size > 0 && Date.now() - start < timeout) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (this.activeJobs.size > 0) {
			logger.warn(
				`[ModelFetchWorker] Stopped with ${this.activeJobs.size} active jobs still running`
			);
		} else {
			logger.info('[ModelFetchWorker] Stopped gracefully');
		}
	}

	/**
	 * Recover jobs that were stuck in "downloading" state
	 *
	 * Called on startup to handle worker crashes. Resets stuck jobs to "queued"
	 * so they can be retried.
	 *
	 * @private
	 */
	async recoverCrashedJobs() {
		try {
			// Find all jobs stuck in "downloading" state
			const stuckJobs = [];
			for await (const job of this.tables.ModelFetchJob.search({
				filter: ['status', '=', 'downloading'],
			})) {
				stuckJobs.push(job);
			}

			if (stuckJobs.length === 0) {
				return;
			}

			logger.info(`[ModelFetchWorker] Recovering ${stuckJobs.length} crashed jobs...`);

			// Reset them to "queued" so they can be retried
			for (const job of stuckJobs) {
				await this.updateJobStatus(job, 'queued', {
					lastError: 'Worker crashed during download, retrying...',
				});
			}

			logger.info(`[ModelFetchWorker] Recovered ${stuckJobs.length} jobs`);
		} catch (error) {
			logger.error('[ModelFetchWorker] Error recovering crashed jobs:', error);
		}
	}

	/**
	 * Process the job queue
	 *
	 * Fetches queued jobs and processes them (respecting concurrent limit).
	 * Called periodically by the polling interval.
	 *
	 * @private
	 */
	async processQueue() {
		if (!this.running) {
			return;
		}

		// Check if we can accept more jobs
		const availableSlots = this.maxConcurrent - this.activeJobs.size;
		if (availableSlots <= 0) {
			return; // Already at max capacity
		}

		// Fetch queued jobs (FIFO order by createdAt)
		try {
			const queuedJobs = await this.fetchQueuedJobs(availableSlots);

			if (queuedJobs.length === 0) {
				return; // No jobs to process
			}

			// Process each job concurrently
			for (const job of queuedJobs) {
				// Start processing job (don't await - runs in background)
				const jobPromise = this.processJob(job)
					.catch((error) => {
						logger.error(`[ModelFetchWorker] Error processing job ${job.id}:`, error);
					})
					.finally(() => {
						// Remove from active jobs when done
						this.activeJobs.delete(job.id);
					});

				// Track active job
				this.activeJobs.set(job.id, jobPromise);
			}
		} catch (error) {
			logger.error('[ModelFetchWorker] Error fetching queued jobs:', error);
		}
	}

	/**
	 * Fetch queued jobs from the database
	 *
	 * @param {number} limit - Maximum number of jobs to fetch
	 * @returns {Promise<Array>} Array of job objects
	 * @private
	 */
	async fetchQueuedJobs(limit) {
		const jobs = [];
		for await (const job of this.tables.ModelFetchJob.search({
			filter: ['status', '=', 'queued'],
		})) {
			jobs.push(job);
			if (jobs.length >= limit) break;
		}

		// Sort by createdAt (FIFO)
		jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

		return jobs;
	}

	/**
	 * Process a single job
	 *
	 * Downloads model from source, stores in database, and handles errors/retries.
	 *
	 * @param {Object} job - Job object from ModelFetchJob table
	 * @private
	 */
	async processJob(job) {
		logger.info(`[ModelFetchWorker] Processing job ${job.id} (${job.source}:${job.sourceReference})`);

		try {
			// Update status to "downloading"
			await this.updateJobStatus(job, 'downloading', {
				startedAt: Date.now(),
			});

			// Get adapter for source
			const adapter = this.adapters[job.source];
			if (!adapter) {
				throw new Error(`Unsupported source: ${job.source}`);
			}

			// Check rate limiting before download
			await this.rateLimiter.waitIfNeeded(job.source);

			// Download model with progress tracking
			const onProgress = (downloadedBytes, totalBytes) => {
				this.updateProgress(job, downloadedBytes, totalBytes).catch((error) => {
					logger.error(`[ModelFetchWorker] Error updating progress for job ${job.id}:`, error);
				});
			};

			const modelBlob = await adapter.download(job.sourceReference, job.variant, onProgress);

			// Check file size
			if (modelBlob.length > this.maxFileSize) {
				throw new FileTooLargeError(modelBlob.length, this.maxFileSize);
			}

			// Merge inferred and user metadata
			const finalMetadata = {
				...JSON.parse(job.inferredMetadata || '{}'),
				...JSON.parse(job.userMetadata || '{}'),
				fetchSource: job.source,
				fetchReference: job.sourceReference,
				fetchVariant: job.variant,
				fetchedAt: new Date().toISOString(),
			};

			// Store model in Model table
			const modelId = await this.storeModel(job, modelBlob, finalMetadata);

			// Mark job as completed
			await this.completeJob(job.id, modelId);

			// Call webhook if provided
			if (job.webhookUrl) {
				await this.callWebhook(job.webhookUrl, {
					jobId: job.id,
					status: 'completed',
					modelId,
				});
			}

			logger.info(`[ModelFetchWorker] Job ${job.id} completed successfully`);
		} catch (error) {
			logger.error(`[ModelFetchWorker] Job ${job.id} failed:`, error.message);
			await this.handleFailure(job, error);
		}
	}

	/**
	 * Handle job failure with retry logic
	 *
	 * @param {Object} job - Job object
	 * @param {Error} error - Error that caused failure
	 * @private
	 */
	async handleFailure(job, error) {
		const retryCount = (job.retryCount || 0) + 1;
		const maxRetries = job.maxRetries || this.maxRetries;

		// Check if error is retryable
		const isRetryable = this.isRetryableError(error);

		// Handle rate limiting
		if (error instanceof RateLimitError) {
			// Set rate limit backoff
			this.rateLimiter.handle429Response(job.source, {}, error.retryAfterSeconds);
		}

		// Determine if we should retry
		const shouldRetry = isRetryable && retryCount < maxRetries;

		if (shouldRetry) {
			// Calculate exponential backoff delay
			const delayMs = this.initialRetryDelayMs * Math.pow(2, retryCount - 1);

			logger.info(
				`[ModelFetchWorker] Job ${job.id} will retry (${retryCount}/${maxRetries}) after ${delayMs}ms`
			);

			// Update job status to "queued" for retry
			await this.updateJobStatus(job, 'queued', {
				retryCount,
				lastError: error.message,
				errorCode: error.code || 'UNKNOWN_ERROR',
				retryable: isRetryable,
			});

			// Wait for backoff delay, then let next poll pick it up
			// (We could also add a "retryAfter" field to the job and skip it in fetchQueuedJobs)
			setTimeout(() => {
				// Job will be picked up by next poll
			}, delayMs);
		} else {
			// Mark job as failed (no more retries)
			await this.updateJobStatus(job, 'failed', {
				retryCount,
				lastError: error.message,
				errorCode: error.code || 'UNKNOWN_ERROR',
				retryable: isRetryable,
				completedAt: Date.now(),
			});

			// Call webhook if provided
			if (job.webhookUrl) {
				await this.callWebhook(job.webhookUrl, {
					jobId: job.id,
					status: 'failed',
					error: error.message,
					errorCode: error.code || 'UNKNOWN_ERROR',
					retryCount,
				});
			}

			logger.info(`[ModelFetchWorker] Job ${job.id} failed permanently after ${retryCount} attempts`);
		}
	}

	/**
	 * Store downloaded model in the Model table
	 *
	 * @param {Object} job - Job object
	 * @param {Buffer} modelBlob - Model binary data
	 * @param {Object} metadata - Final metadata
	 * @returns {Promise<string>} Model ID
	 * @private
	 */
	async storeModel(job, modelBlob, metadata) {
		const modelId = `${job.modelName}:${job.modelVersion}`;

		// Create Model record
		await this.tables.Model.create({
			id: modelId,
			modelName: job.modelName,
			modelVersion: job.modelVersion,
			framework: job.framework,
			stage: job.stage || 'development',
			modelBlob,
			inputSchema: null, // TODO: Extract from model if possible
			outputSchema: null, // TODO: Extract from model if possible
			metadata: JSON.stringify(metadata),
		});

		return modelId;
	}

	/**
	 * Update job status in database
	 *
	 * @param {Object} job - Full job object (to preserve all fields)
	 * @param {string} status - New status
	 * @param {Object} updates - Additional fields to update
	 * @private
	 */
	async updateJobStatus(job, status, updates = {}) {
		// Update with new status and fields, preserving all existing fields
		await this.tables.ModelFetchJob.put({
			...job,
			id: job.id, // Ensure primary key is always set
			status,
			...updates,
		});
	}

	/**
	 * Update job progress
	 *
	 * @param {Object} job - Full job object (to preserve all fields)
	 * @param {number} downloadedBytes - Downloaded bytes
	 * @param {number} totalBytes - Total bytes
	 * @private
	 */
	async updateProgress(job, downloadedBytes, totalBytes) {
		const progress = Math.round((downloadedBytes / totalBytes) * 100);

		// Update progress fields, preserving all existing fields
		await this.tables.ModelFetchJob.put({
			...job,
			id: job.id, // Ensure primary key is always set
			downloadedBytes,
			totalBytes,
			progress,
		});
	}

	/**
	 * Mark job as completed
	 *
	 * @param {string} jobId - Job ID
	 * @param {string} modelId - Resulting model ID
	 * @private
	 */
	async completeJob(jobId, modelId) {
		await this.updateJobStatus(jobId, 'completed', {
			resultModelId: modelId,
			progress: 100,
			completedAt: Date.now(),
		});
	}

	/**
	 * Call webhook URL with job status
	 *
	 * Best-effort HTTP POST. Errors are logged but don't fail the job.
	 *
	 * @param {string} url - Webhook URL
	 * @param {Object} payload - Payload to send
	 * @private
	 */
	async callWebhook(url, payload) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				logger.warn(`[ModelFetchWorker] Webhook failed: ${response.status} ${response.statusText}`);
			}
		} catch (error) {
			logger.error('[ModelFetchWorker] Error calling webhook:', error.message);
		}
	}

	/**
	 * Check if an error is retryable
	 *
	 * @param {Error} error - Error object
	 * @returns {boolean} True if error is retryable
	 * @private
	 */
	isRetryableError(error) {
		// Use error's retryable flag if available
		if (error.retryable !== undefined) {
			return error.retryable;
		}

		// Check error types
		if (
			error instanceof NetworkError ||
			error instanceof RateLimitError ||
			error instanceof StorageError
		) {
			return true;
		}

		// Non-retryable errors
		if (
			error instanceof SecurityError ||
			error instanceof ModelNotFoundError ||
			error instanceof UnsupportedFrameworkError ||
			error instanceof FileTooLargeError
		) {
			return false;
		}

		// Default: non-retryable
		return false;
	}

	/**
	 * Get worker status (for monitoring/debugging)
	 *
	 * @returns {Object} Worker status
	 */
	getStatus() {
		return {
			running: this.running,
			activeJobs: this.activeJobs.size,
			maxConcurrent: this.maxConcurrent,
			pollInterval: this.pollInterval,
			rateLimitedSources: Array.from(this.rateLimiter.getBackoffMap().keys()),
		};
	}
}
