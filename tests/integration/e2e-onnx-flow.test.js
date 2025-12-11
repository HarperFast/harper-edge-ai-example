import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';
import { getTestOnnxModel } from '../fixtures/test-models.js';

describe('End-to-End ONNX Flow', () => {
  let registry;
  let engine;
  let monitoring;
  let inferenceId;

  before(async () => {
    registry = new ModelRegistry();
    await registry.initialize();

    monitoring = new MonitoringBackend();
    await monitoring.initialize();

    engine = new InferenceEngine(registry);
    await engine.initialize();
  });

  after(async () => {
    await registry.cleanup();
    await monitoring.cleanup();
    await engine.cleanup();
  });

  test('complete flow: upload → predict → feedback', async () => {
    // 1. Upload model
    const modelBlob = await getTestOnnxModel();

    const registered = await registry.registerModel({
      modelId: 'test-e2e-onnx',
      version: 'v1',
      framework: 'onnx',
      modelBlob,
      inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
      outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
      metadata: JSON.stringify({ description: 'E2E test model' }),
      stage: 'development'
    });

    assert.ok(registered);
    assert.strictEqual(registered.modelId, 'test-e2e-onnx');

    // 2. Run prediction
    const input = new Float32Array([1.0, 2.0]);
    const result = await engine.predict('test-e2e-onnx', { data: input }, 'v1');

    assert.ok(result);
    assert.ok(result.output);
    assert.ok(result.latencyMs > 0);

    // 3. Record inference to monitoring
    inferenceId = await monitoring.recordInference({
      modelId: 'test-e2e-onnx',
      modelVersion: 'v1',
      framework: 'onnx',
      requestId: 'test-req-1',
      userId: 'test-user',
      sessionId: 'test-session',
      featuresIn: JSON.stringify({ data: Array.from(input) }),
      prediction: JSON.stringify(result.output),
      confidence: 0.95,
      latencyMs: result.latencyMs
    });

    assert.ok(inferenceId);

    // 4. Query inference events
    const events = await monitoring.queryEvents({
      modelId: 'test-e2e-onnx',
      startTime: new Date(Date.now() - 1000)
    });

    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 1);

    const recorded = events.find(e => e.id === inferenceId);
    assert.ok(recorded);
    assert.strictEqual(recorded.userId, 'test-user');

    // 5. Record feedback
    await monitoring.recordFeedback(inferenceId, {
      actualOutcome: JSON.stringify({ result: [1.0, 2.0] }),
      correct: true
    });

    // 6. Verify feedback recorded
    const withFeedback = await monitoring.queryEvents({
      modelId: 'test-e2e-onnx'
    });

    const feedbackEvent = withFeedback.find(e => e.id === inferenceId);
    assert.ok(feedbackEvent);
    assert.strictEqual(feedbackEvent.correct, true);
    assert.ok(feedbackEvent.feedbackTimestamp);

    // 7. Check metrics
    const metrics = await monitoring.getMetrics('test-e2e-onnx');
    assert.ok(metrics);
    assert.ok(metrics.count >= 1);
    assert.ok(metrics.avgLatency > 0);
    assert.strictEqual(metrics.accuracy, 1.0); // 100% since we marked it correct

    console.log('✅ End-to-end ONNX flow completed successfully');
  });
});
