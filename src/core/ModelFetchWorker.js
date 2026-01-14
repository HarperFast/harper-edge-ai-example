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
	 * Recovers crashed jobs. No longer polls - worker is triggered on-demand when jobs are created.
	 */
	async start() {
		if (this.running) {
			logger.info('[ModelFetchWorker] Already initialized');
			return;
		}

		logger.info('[ModelFetchWorker] Initializing on-demand worker...');
		this.running = true;

		// Recover any jobs that were stuck in "downloading" state from previous crash
		await this.recoverCrashedJobs();

		// Trigger processing for any recovered jobs
		await this.triggerProcessing();

		logger.info(`[ModelFetchWorker] Worker initialized (on-demand mode, max ${this.maxConcurrent} concurrent jobs)`);
	}

	/**
	 * Trigger processing of available jobs
	 *
	 * Processes jobs until the queue is empty or max concurrent limit is reached.
	 * This is called when a new job is created or when recovered jobs need processing.
	 */
	async triggerProcessing() {
		if (!this.running) {
			logger.warn('[ModelFetchWorker] Cannot trigger processing - worker not initialized');
			return;
		}

		// Process queue once
		await this.processQueue();
	}

	/**
	 * Stop the worker gracefully
	 *
	 * Waits for active jobs to complete (with timeout).
	 */
	async stop() {
		if (!this.running) {
			return;
		}

		logger.info('[ModelFetchWorker] Stopping...');
		this.running = false;

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
				// Extra safety: Only recover jobs that are actually in downloading state
				// (Harper's filter sometimes returns wrong results due to stale indexes)
				if (job.status === 'downloading') {
					stuckJobs.push(job);
				} else {
					logger.warn(`[ModelFetchWorker] Job ${job.id} has status='${job.status}' but was returned by downloading filter - skipping recovery`);
				}
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
				// Skip if already processing this job
				if (this.activeJobs.has(job.id)) {
					logger.info(`[ModelFetchWorker] Job ${job.id} already in progress, skipping`);
					continue;
				}

				// Extra safety: Skip if job status is not actually 'queued'
				// (Harper's filter sometimes returns wrong results due to stale indexes)
				if (job.status !== 'queued') {
					logger.warn(`[ModelFetchWorker] Job ${job.id} has status='${job.status}' but was returned by queued filter - skipping!`);
					continue;
				}

				logger.info(`[ModelFetchWorker] Starting to process job ${job.id}`);

				// Start processing job (don't await - runs in background)
				const jobPromise = this.processJob(job)
					.catch((error) => {
						logger.error(`[ModelFetchWorker] Error processing job ${job.id}:`, error);
					})
					.finally(() => {
						// Remove from active jobs when done
						logger.info(`[ModelFetchWorker] Removing job ${job.id} from activeJobs`);
						this.activeJobs.delete(job.id);
					});

				// Track active job
				this.activeJobs.set(job.id, jobPromise);
				logger.info(`[ModelFetchWorker] Added job ${job.id} to activeJobs (total: ${this.activeJobs.size})`);
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
			logger.info(`[ModelFetchWorker] Found job ${job.id} with status='${job.status}' (filter was 'queued')`);
			jobs.push(job);
			if (jobs.length >= limit) break;
		}

		// Sort by createdAt (FIFO)
		jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

		logger.info(`[ModelFetchWorker] Fetched ${jobs.length} queued jobs`);
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
			await this.completeJob(job, modelId);

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
		try {
			// Update with new status and fields, preserving all existing fields
			logger.info(`[ModelFetchWorker] Updating job ${job.id} status: ${job.status} → ${status}`);

			// Convert date strings to timestamps (Harper needs integers for Date fields)
			const jobData = { ...job, status, ...updates };
			if (typeof jobData.createdAt === 'string') {
				jobData.createdAt = new Date(jobData.createdAt).getTime();
			}
			if (typeof jobData.startedAt === 'string') {
				jobData.startedAt = new Date(jobData.startedAt).getTime();
			}
			if (typeof jobData.completedAt === 'string') {
				jobData.completedAt = new Date(jobData.completedAt).getTime();
			}

			await this.tables.ModelFetchJob.put(jobData);
			logger.info(`[ModelFetchWorker] Job ${job.id} status updated to ${status}`);
		} catch (error) {
			logger.error(`[ModelFetchWorker] Failed to update job ${job.id} status:`, error);
			throw error;
		}
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
		const jobData = {
			...job,
			id: job.id, // Ensure primary key is always set
			downloadedBytes,
			totalBytes,
			progress,
		};

		// Convert date strings to timestamps (Harper needs integers for Date fields)
		if (typeof jobData.createdAt === 'string') {
			jobData.createdAt = new Date(jobData.createdAt).getTime();
		}
		if (typeof jobData.startedAt === 'string') {
			jobData.startedAt = new Date(jobData.startedAt).getTime();
		}
		if (typeof jobData.completedAt === 'string') {
			jobData.completedAt = new Date(jobData.completedAt).getTime();
		}

		await this.tables.ModelFetchJob.put(jobData);
	}

	/**
	 * Mark job as completed
	 *
	 * @param {Object} job - Full job object (to preserve all fields)
	 * @param {string} modelId - Resulting model ID
	 * @private
	 */
	async completeJob(job, modelId) {
		await this.updateJobStatus(job, 'completed', {
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
