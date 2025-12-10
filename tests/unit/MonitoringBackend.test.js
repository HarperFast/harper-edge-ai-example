import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';

describe('MonitoringBackend', () => {
  let monitoring;

  before(async () => {
    monitoring = new MonitoringBackend();
    await monitoring.initialize();
  });

  after(async () => {
    await monitoring.cleanup();
  });

  test('should record and query inference events', async () => {
    const event = {
      modelId: 'test-model',
      modelVersion: 'v1',
      framework: 'onnx',
      requestId: 'req-123',
      userId: 'user-1',
      sessionId: 'session-1',
      featuresIn: JSON.stringify({ x: 1.5, y: 2.5 }),
      prediction: JSON.stringify({ class: 1 }),
      confidence: 0.92,
      latencyMs: 45
    };

    const inferenceId = await monitoring.recordInference(event);

    assert.ok(inferenceId);
    assert.strictEqual(typeof inferenceId, 'string');

    // Query recent events
    const events = await monitoring.queryEvents({
      modelId: 'test-model',
      startTime: new Date(Date.now() - 1000)
    });

    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 1);

    const recorded = events.find(e => e.id === inferenceId);
    assert.ok(recorded);
    assert.strictEqual(recorded.modelId, 'test-model');
    assert.strictEqual(recorded.confidence, 0.92);
  });

  test('should record feedback for inference', async () => {
    // Record inference
    const inferenceId = await monitoring.recordInference({
      modelId: 'test-feedback',
      modelVersion: 'v1',
      framework: 'onnx',
      requestId: 'req-456',
      featuresIn: '{}',
      prediction: JSON.stringify({ class: 1 }),
      confidence: 0.85,
      latencyMs: 30
    });

    // Record feedback
    await monitoring.recordFeedback(inferenceId, {
      actualOutcome: JSON.stringify({ class: 1 }),
      correct: true
    });

    // Query with feedback
    const events = await monitoring.queryEvents({ modelId: 'test-feedback' });
    const withFeedback = events.find(e => e.id === inferenceId);

    assert.ok(withFeedback);
    assert.strictEqual(withFeedback.correct, true);
    assert.ok(withFeedback.feedbackTimestamp);
  });

  test('should calculate aggregate metrics', async () => {
    const metrics = await monitoring.getMetrics('test-model');

    assert.ok(metrics);
    assert.ok(typeof metrics.count === 'number');
    assert.ok(typeof metrics.avgLatency === 'number');
    assert.ok(typeof metrics.avgConfidence === 'number');
  });
});
