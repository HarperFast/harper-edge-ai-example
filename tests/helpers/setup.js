import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';
import { createRestTables } from './rest-api.js';

// Create REST API tables interface for tests running outside Harper process
const tables = createRestTables();

/**
 * Setup monitoring backend for tests
 * @returns {Promise<MonitoringBackend>} Initialized monitoring backend
 */
export async function setupMonitoring() {
	const monitoring = new MonitoringBackend(tables);
	await monitoring.initialize();
	return monitoring;
}

/**
 * Cleanup inference events from tests
 * @param {string} modelName - Model name to filter events by
 */
export async function cleanupInferenceEvents(modelName) {
	const eventsTable = tables.get('InferenceEvent');
	const testEvents = [];

	for await (const record of eventsTable.search({ modelName })) {
		testEvents.push(record);
	}

	for (const event of testEvents) {
		await eventsTable.delete(event.id);
	}
}

/**
 * Setup inference engine for tests
 * @returns {Promise<InferenceEngine>} Initialized inference engine
 */
export async function setupInferenceEngine() {
	const engine = new InferenceEngine();
	await engine.initialize();
	return engine;
}

/**
 * Cleanup models from Harper table
 * @param {string[]} modelKeys - Array of model keys (id:version format)
 */
export async function cleanupModels(modelKeys) {
	const modelsTable = tables.get('Model');

	for (const key of modelKeys) {
		try {
			await modelsTable.delete(key);
		} catch (err) {
			// Ignore if doesn't exist
		}
	}
}
