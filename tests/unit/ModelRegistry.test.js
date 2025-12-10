import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';

describe('ModelRegistry', () => {
  let registry;

  before(async () => {
    registry = new ModelRegistry();
    await registry.initialize();
  });

  after(async () => {
    // Cleanup test data
    await registry.cleanup();
  });

  test('should store and retrieve ONNX model blob', async () => {
    // Create a minimal test blob (fake ONNX model)
    const modelBlob = Buffer.from('fake onnx model data');

    const registration = {
      modelId: 'test-onnx',
      version: 'v1',
      framework: 'onnx',
      modelBlob,
      inputSchema: JSON.stringify({ shape: [1, 10] }),
      outputSchema: JSON.stringify({ shape: [1, 2] }),
      metadata: JSON.stringify({ description: 'Test ONNX model' }),
      stage: 'development'
    };

    // Register model
    const registered = await registry.registerModel(registration);

    // Verify registration
    assert.strictEqual(registered.modelId, 'test-onnx');
    assert.strictEqual(registered.version, 'v1');
    assert.strictEqual(registered.framework, 'onnx');

    // Retrieve model
    const retrieved = await registry.getModel('test-onnx', 'v1');

    // Verify retrieval
    assert.strictEqual(retrieved.modelId, 'test-onnx');
    assert.strictEqual(retrieved.framework, 'onnx');
    assert.ok(Buffer.isBuffer(retrieved.modelBlob));
    assert.strictEqual(retrieved.modelBlob.toString(), 'fake onnx model data');
  });

  test('should get latest version when version not specified', async () => {
    const blob1 = Buffer.from('v1 data');
    const blob2 = Buffer.from('v2 data');

    // Register two versions
    await registry.registerModel({
      modelId: 'test-versions',
      version: 'v1',
      framework: 'onnx',
      modelBlob: blob1,
      inputSchema: '{}',
      outputSchema: '{}',
      metadata: '{}',
      stage: 'development'
    });

    await registry.registerModel({
      modelId: 'test-versions',
      version: 'v2',
      framework: 'onnx',
      modelBlob: blob2,
      inputSchema: '{}',
      outputSchema: '{}',
      metadata: '{}',
      stage: 'development'
    });

    // Get without version should return latest
    const latest = await registry.getModel('test-versions');
    assert.strictEqual(latest.version, 'v2');
    assert.strictEqual(latest.modelBlob.toString(), 'v2 data');
  });

  test('should list all versions of a model', async () => {
    const versions = await registry.listVersions('test-versions');

    assert.ok(Array.isArray(versions));
    assert.strictEqual(versions.length, 2);
    assert.ok(versions.some(v => v.version === 'v1'));
    assert.ok(versions.some(v => v.version === 'v2'));
  });
});
