import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { getTestOnnxModel } from '../fixtures/test-models.js';
import { tables } from '@harperdb/harperdb';

describe('InferenceEngine', () => {
  let engine;
  let modelsTable;

  before(async () => {
    engine = new InferenceEngine();
    await engine.initialize();

    // Get Harper table reference for direct operations
    modelsTable = tables.get('Model');
  });

  after(async () => {
    // Clean up test data
    try {
      await modelsTable.delete('test-onnx-inference:v1');
    } catch (err) {
      // Ignore if doesn't exist
    }
    await engine.cleanup();
  });

  test('should load and cache ONNX model', async () => {
    // Register a test ONNX model using Harper native table.put()
    const modelBlob = await getTestOnnxModel();
    const modelKey = 'test-onnx-inference:v1';

    await modelsTable.put({
      id: modelKey,
      modelId: 'test-onnx-inference',
      version: 'v1',
      framework: 'onnx',
      modelBlob,
      inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
      outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
      metadata: '{}',
      stage: 'development',
      uploadedAt: Date.now()
    });

    // Load model
    const loaded = await engine.loadModel('test-onnx-inference', 'v1');

    assert.ok(loaded);
    assert.strictEqual(loaded.modelId, 'test-onnx-inference');
    assert.strictEqual(loaded.framework, 'onnx');

    // Verify it's cached
    const cached = engine.isCached('test-onnx-inference', 'v1');
    assert.strictEqual(cached, true);
  });

  test('should run inference with ONNX model', async () => {
    // Simple inference test with minimal ONNX model
    const input = new Float32Array([1.0, 2.0]);

    const result = await engine.predict('test-onnx-inference', {
      data: input
    });

    assert.ok(result);
    assert.ok(result.output);
    // Minimal model is identity function, so output should equal input
    assert.ok(Array.isArray(result.output) || result.output instanceof Float32Array);
  });

  test('should select correct backend based on framework', async () => {
    const backend = engine.getBackend('onnx');
    assert.strictEqual(backend.name, 'OnnxBackend');

    const tfBackend = engine.getBackend('tensorflow');
    assert.strictEqual(tfBackend.name, 'TensorFlowBackend');
  });
});
