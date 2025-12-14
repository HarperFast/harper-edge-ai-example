import { v4 as uuidv4 } from 'uuid';

/**
 * Monitoring Backend - Record inference events and compute metrics
 * Users should use PUT /InferenceEvent/:id for feedback updates
 */
export class MonitoringBackend {
	async initialize() {
		// No initialization needed - InferenceEvent is a global
	}

	/**
	 * Record an inference event (simplified - direct table.put)
	 * @param {Object} event - Inference event data
	 * @returns {string} inferenceId
	 */
	async recordInference(event) {
		const inferenceId = uuidv4();

		const record = {
			id: inferenceId,
			timestamp: Date.now(),
			modelName: event.modelName,
			modelVersion: event.modelVersion,
			framework: event.framework,
			requestId: event.requestId || inferenceId,
			userId: event.userId || null,
			sessionId: event.sessionId || null,
			featuresIn: event.featuresIn,
			prediction: event.prediction,
			confidence: event.confidence || null,
			latencyMs: event.latencyMs,
			actualOutcome: null,
			feedbackTimestamp: null,
			correct: null,
		};

		await tables.InferenceEvent.put(record);

		return inferenceId;
	}

	/**
	 * Get aggregate metrics for a model
	 * @param {string} modelName - The model identifier
	 * @param {Object} [options] - Optional time range
	 * @returns {Object} Aggregate metrics
	 */
	async getMetrics(modelName, options = {}) {
		// Use Harper search directly
		const results = [];
		for await (const record of tables.InferenceEvent.search({ modelName })) {
			// Filter by time range if provided
			if (options.startTime && record.timestamp < options.startTime.getTime()) {
				continue;
			}
			if (options.endTime && record.timestamp > options.endTime.getTime()) {
				continue;
			}
			results.push(record);
		}

		if (results.length === 0) {
			return {
				count: 0,
				avgLatency: 0,
				avgConfidence: 0,
				accuracy: null,
			};
		}

		// Calculate aggregates
		const totalLatency = results.reduce((sum, e) => sum + (e.latencyMs || 0), 0);
		const totalConfidence = results.reduce((sum, e) => sum + (e.confidence || 0), 0);

		const withFeedback = results.filter((e) => e.correct !== null);
		const correct = withFeedback.filter((e) => e.correct === true).length;

		return {
			count: results.length,
			avgLatency: totalLatency / results.length,
			avgConfidence: totalConfidence / results.length,
			accuracy: withFeedback.length > 0 ? correct / withFeedback.length : null,
		};
	}
}
