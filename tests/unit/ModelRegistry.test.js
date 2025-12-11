import { describe, test, before } from 'node:test';
import assert from 'node:assert';
import { ModelRegistry } from '../../src/core/ModelRegistry.js';

describe('ModelRegistry', () => {
  let registry;

  before(async () => {
    registry = new ModelRegistry();
    await registry.initialize();
  });

  test('should build composite model key from modelId and version', () => {
    const key = registry._buildModelKey('my-model', 'v1.0');
    assert.strictEqual(key, 'my-model:v1.0');
  });

  test('should parse composite key into modelId and version', () => {
    const parsed = registry._parseModelKey('my-model:v1.0');
    assert.deepStrictEqual(parsed, {
      modelId: 'my-model',
      version: 'v1.0'
    });
  });

  test('should handle complex modelIds with hyphens and underscores', () => {
    const key = registry._buildModelKey('my-complex_model-123', 'v2.1.3');
    assert.strictEqual(key, 'my-complex_model-123:v2.1.3');

    const parsed = registry._parseModelKey(key);
    assert.strictEqual(parsed.modelId, 'my-complex_model-123');
    assert.strictEqual(parsed.version, 'v2.1.3');
  });
});
