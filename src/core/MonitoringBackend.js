import { tables } from '@harperdb/harperdb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Monitoring Backend - Record and query inference events
 * Stores events in Harper tables
 */
export class MonitoringBackend {
  constructor() {
    this.eventsTable = null;
  }

  async initialize() {
    // Get reference to Harper InferenceEvent table
    this.eventsTable = tables.get('InferenceEvent');
  }

  /**
   * Record an inference event
   * @param {Object} event - Inference event data
   * @returns {string} inferenceId
   */
  async recordInference(event) {
    const inferenceId = uuidv4();

    const record = {
      id: inferenceId,
      timestamp: Date.now(),
      modelId: event.modelId,
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
      correct: null
    };

    await this.eventsTable.put(record);

    return inferenceId;
  }

  /**
   * Record feedback for an inference
   * @param {string} inferenceId - The inference ID
   * @param {Object} feedback - Feedback data
   */
  async recordFeedback(inferenceId, feedback) {
    const event = await this.eventsTable.get(inferenceId);

    if (!event) {
      throw new Error(`Inference ${inferenceId} not found`);
    }

    // Update with feedback
    event.actualOutcome = feedback.actualOutcome;
    event.feedbackTimestamp = Date.now();
    event.correct = feedback.correct;

    await this.eventsTable.put(event);
  }

  /**
   * Query inference events
   * @param {Object} query - Query parameters
   * @returns {Object[]} Filtered events
   */
  async queryEvents(query) {
    const { modelId, startTime, endTime, userId, limit } = query;

    const results = [];

    // Build search criteria
    const searchCriteria = {};
    if (modelId) {
      searchCriteria.modelId = modelId;
    }
    if (userId) {
      searchCriteria.userId = userId;
    }

    // Search events
    for await (const record of this.eventsTable.search(searchCriteria)) {
      // Filter by time range
      if (startTime && record.timestamp < startTime.getTime()) {
        continue;
      }
      if (endTime && record.timestamp > endTime.getTime()) {
        continue;
      }

      results.push(record);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (limit) {
      return results.slice(0, limit);
    }

    return results;
  }

  /**
   * Get aggregate metrics for a model
   * @param {string} modelId - The model identifier
   * @param {Object} [options] - Optional time range
   * @returns {Object} Aggregate metrics
   */
  async getMetrics(modelId, options = {}) {
    const events = await this.queryEvents({
      modelId,
      startTime: options.startTime,
      endTime: options.endTime
    });

    if (events.length === 0) {
      return {
        count: 0,
        avgLatency: 0,
        avgConfidence: 0,
        accuracy: null
      };
    }

    // Calculate aggregates
    const totalLatency = events.reduce((sum, e) => sum + (e.latencyMs || 0), 0);
    const totalConfidence = events.reduce((sum, e) => sum + (e.confidence || 0), 0);

    const withFeedback = events.filter(e => e.correct !== null);
    const correct = withFeedback.filter(e => e.correct === true).length;

    return {
      count: events.length,
      avgLatency: totalLatency / events.length,
      avgConfidence: totalConfidence / events.length,
      accuracy: withFeedback.length > 0 ? correct / withFeedback.length : null
    };
  }

  /**
   * Cleanup test data (for testing only)
   */
  async cleanup() {
    // Delete all test events
    const testEvents = [];
    for await (const record of this.eventsTable.search()) {
      if (record.modelId.startsWith('test-')) {
        testEvents.push(record.id);
      }
    }

    for (const id of testEvents) {
      await this.eventsTable.delete(id);
    }
  }
}
