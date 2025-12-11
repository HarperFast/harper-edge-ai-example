import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';
import { tables } from '@harperdb/harperdb';

describe('MonitoringBackend', () => {
  let monitoring;
  let eventsTable;

  before(async () => {
    monitoring = new MonitoringBackend();
    await monitoring.initialize();
    eventsTable = tables.get('InferenceEvent');
  });

  after(async () => {
    // Clean up test data
    const testEvents = [];
    for await (const record of eventsTable.search({ modelId: 'test-metrics-model' })) {
      testEvents.push(record);
    }
    for (const event of testEvents) {
      await eventsTable.delete(event.id);
    }
  });

  test('should calculate aggregate metrics with no events', async () => {
    const metrics = await monitoring.getMetrics('nonexistent-model');

    assert.ok(metrics);
    assert.strictEqual(metrics.count, 0);
    assert.strictEqual(metrics.avgLatency, 0);
    assert.strictEqual(metrics.avgConfidence, 0);
    assert.strictEqual(metrics.accuracy, null);
  });

  test('should calculate aggregate metrics for multiple events', async () => {
    // Insert test events directly using Harper table API
    const events = [
      {
        id: 'test-1',
        timestamp: Date.now(),
        modelId: 'test-metrics-model',
        modelVersion: 'v1',
        framework: 'onnx',
        requestId: 'req-1',
        featuresIn: '{}',
        prediction: '{}',
        confidence: 0.9,
        latencyMs: 100,
        actualOutcome: null,
        feedbackTimestamp: null,
        correct: null
      },
      {
        id: 'test-2',
        timestamp: Date.now(),
        modelId: 'test-metrics-model',
        modelVersion: 'v1',
        framework: 'onnx',
        requestId: 'req-2',
        featuresIn: '{}',
        prediction: '{}',
        confidence: 0.8,
        latencyMs: 150,
        actualOutcome: null,
        feedbackTimestamp: null,
        correct: null
      },
      {
        id: 'test-3',
        timestamp: Date.now(),
        modelId: 'test-metrics-model',
        modelVersion: 'v1',
        framework: 'onnx',
        requestId: 'req-3',
        featuresIn: '{}',
        prediction: '{}',
        confidence: 0.95,
        latencyMs: 120,
        actualOutcome: '{}',
        feedbackTimestamp: Date.now(),
        correct: true
      }
    ];

    for (const event of events) {
      await eventsTable.put(event);
    }

    const metrics = await monitoring.getMetrics('test-metrics-model');

    assert.ok(metrics);
    assert.strictEqual(metrics.count, 3);
    assert.strictEqual(metrics.avgLatency, (100 + 150 + 120) / 3);
    assert.strictEqual(metrics.avgConfidence, (0.9 + 0.8 + 0.95) / 3);
    assert.strictEqual(metrics.accuracy, 1.0); // Only one event has feedback, and it's correct
  });

  test('should calculate accuracy based on feedback', async () => {
    // Add more events with mixed feedback
    const feedbackEvents = [
      {
        id: 'test-4',
        timestamp: Date.now(),
        modelId: 'test-metrics-model',
        modelVersion: 'v1',
        framework: 'onnx',
        requestId: 'req-4',
        featuresIn: '{}',
        prediction: '{}',
        confidence: 0.85,
        latencyMs: 110,
        actualOutcome: '{}',
        feedbackTimestamp: Date.now(),
        correct: false
      },
      {
        id: 'test-5',
        timestamp: Date.now(),
        modelId: 'test-metrics-model',
        modelVersion: 'v1',
        framework: 'onnx',
        requestId: 'req-5',
        featuresIn: '{}',
        prediction: '{}',
        confidence: 0.92,
        latencyMs: 105,
        actualOutcome: '{}',
        feedbackTimestamp: Date.now(),
        correct: true
      }
    ];

    for (const event of feedbackEvents) {
      await eventsTable.put(event);
    }

    const metrics = await monitoring.getMetrics('test-metrics-model');

    assert.ok(metrics);
    assert.strictEqual(metrics.count, 5); // 3 from previous test + 2 new
    // 3 events with feedback: 2 correct, 1 incorrect
    assert.strictEqual(metrics.accuracy, 2 / 3);
  });

  test('should filter metrics by time range', async () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 3600000);
    const twoHoursAgo = new Date(now - 7200000);

    // Add an old event
    await eventsTable.put({
      id: 'test-old',
      timestamp: twoHoursAgo.getTime(),
      modelId: 'test-metrics-model',
      modelVersion: 'v1',
      framework: 'onnx',
      requestId: 'req-old',
      featuresIn: '{}',
      prediction: '{}',
      confidence: 0.5,
      latencyMs: 200,
      actualOutcome: null,
      feedbackTimestamp: null,
      correct: null
    });

    // Get metrics for last hour only (should exclude the old event)
    const metrics = await monitoring.getMetrics('test-metrics-model', {
      startTime: oneHourAgo
    });

    // Should not include the old event in calculations
    assert.ok(metrics.count >= 5); // At least the 5 recent events
    assert.ok(metrics.avgLatency < 200); // Should not be affected by the 200ms old event
  });
});
