/**
 * Harper Application Entry Point
 *
 * Exports handleApplication function that Harper calls on startup to initialize
 * background workers and services.
 *
 * Pattern from bigquery-ingestor for proper worker lifecycle management.
 */

import { globals } from './globals.js';
import { ModelFetchWorker } from './core/ModelFetchWorker.js';

/**
 * Initialize application on Harper startup
 *
 * Called by Harper when the application starts. Initializes background workers
 * and stores them in globals for access by resources.
 *
 * @param {Object} scope - Harper scope object with logger, options, etc.
 */
export async function handleApplication(scope) {
	const logger = scope.logger;
	const options = scope.options.getAll();

	logger.info('[handleApplication] Initializing Edge AI Ops application...');

	// Check if Model Fetch worker should be enabled
	const workerEnabled = options.MODEL_FETCH_WORKER !== 'false';

	if (workerEnabled) {
		try {
			// Initialize Model Fetch Worker
			// Note: We pass tables globally available in Harper, not from scope
			const modelFetchWorker = new ModelFetchWorker();
			await modelFetchWorker.start();

			// Store in globals for access from resources
			globals.set('modelFetchWorker', modelFetchWorker);

			logger.info('[handleApplication] ModelFetchWorker initialized and started');
		} catch (error) {
			logger.error(`[handleApplication] Failed to initialize ModelFetchWorker: ${error.message}`);
			logger.error(error.stack);
			throw error;
		}
	} else {
		logger.info('[handleApplication] ModelFetchWorker disabled (MODEL_FETCH_WORKER=false)');
	}

	logger.info('[handleApplication] Application initialized successfully');
}
