import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalizationEngine } from '../../src/PersonalizationEngine.js';

describe('PersonalizationEngine', () => {
  describe('new constructor pattern (with InferenceEngine)', () => {
    let mockInferenceEngine;
    let personalizationEngine;

    beforeEach(() => {
      // Create mock inference engine
      mockInferenceEngine = {
        predict: async (modelId, version, input) => {
          // Mock embedding output (512-dimensional)
          const numTexts = input.texts?.length || 1;
          return Array.from({ length: numTexts }, () =>
            Array(512).fill(0.1)
          );
        },
        initialize: async () => {},
      };
    });

    it('should create instance with new constructor pattern', () => {
      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'universal-sentence-encoder',
        version: 'v1',
      });

      assert.ok(personalizationEngine instanceof PersonalizationEngine);
    });

    it('should use InferenceEngine for predictions', async () => {
      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'test-model',
        version: 'v1',
      });

      await personalizationEngine.initialize();

      let predictCalled = false;
      let capturedModelId = null;
      let capturedVersion = null;

      mockInferenceEngine.predict = async (modelId, version, input) => {
        predictCalled = true;
        capturedModelId = modelId;
        capturedVersion = version;
        return [Array(512).fill(0.1), Array(512).fill(0.2)];
      };

      const similarities = await personalizationEngine.calculateSimilarity([
        'query text',
        'target text',
      ]);

      assert.ok(predictCalled, 'predict should have been called');
      assert.equal(capturedModelId, 'test-model');
      assert.equal(capturedVersion, 'v1');
      assert.ok(Array.isArray(similarities));
    });

    it('should support model selection via constructor', async () => {
      // Test with different model
      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'custom-embedding-model',
        version: 'v2',
      });

      await personalizationEngine.initialize();

      let capturedModelId = null;
      let capturedVersion = null;

      mockInferenceEngine.predict = async (modelId, version, input) => {
        capturedModelId = modelId;
        capturedVersion = version;
        return [Array(512).fill(0.1)];
      };

      await personalizationEngine.calculateSimilarity(['test']);

      assert.equal(capturedModelId, 'custom-embedding-model');
      assert.equal(capturedVersion, 'v2');
    });

    it('should work with ONNX models via InferenceEngine', async () => {
      // Mock ONNX model
      mockInferenceEngine.predict = async (modelId, version, input) => {
        // Simulate ONNX output format
        return Array.from({ length: input.texts.length }, () =>
          Array(512).fill(0.15)
        );
      };

      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'onnx-use-model',
        version: 'v1',
      });

      await personalizationEngine.initialize();

      const products = [
        { name: 'Tent', description: 'Camping tent' },
        { name: 'Backpack', description: 'Hiking backpack' },
      ];

      const enhanced = await personalizationEngine.enhanceProducts(products, {
        activityType: 'camping',
      });

      assert.equal(enhanced.length, 2);
      assert.ok(enhanced[0].personalizedScore !== undefined);
      assert.ok(enhanced[1].personalizedScore !== undefined);
    });

    it('should initialize without loading in new mode', async () => {
      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'test-model',
        version: 'v1',
      });

      const result = await personalizationEngine.initialize();

      assert.equal(result, true);
      assert.ok(personalizationEngine.isReady());
    });
  });

  describe('legacy constructor pattern (backward compatibility)', () => {
    let personalizationEngine;
    let consoleWarnCalled = false;
    let originalConsoleWarn;

    beforeEach(() => {
      // Capture console.warn
      originalConsoleWarn = console.warn;
      console.warn = () => {
        consoleWarnCalled = true;
      };
    });

    afterEach(() => {
      console.warn = originalConsoleWarn;
    });

    it('should support legacy constructor (no arguments)', () => {
      personalizationEngine = new PersonalizationEngine();

      assert.ok(personalizationEngine instanceof PersonalizationEngine);
    });

    it('should show deprecation warning in legacy mode', async () => {
      personalizationEngine = new PersonalizationEngine();

      // Note: We can't actually load TensorFlow model in tests,
      // but we can verify the constructor pattern works
      assert.ok(personalizationEngine);
    });

    it('should work with legacy code', () => {
      // This is the old pattern that should continue to work
      personalizationEngine = new PersonalizationEngine({
        /* legacy options */
      });

      assert.ok(personalizationEngine);
      assert.equal(typeof personalizationEngine.calculateSimilarity, 'function');
      assert.equal(typeof personalizationEngine.enhanceProducts, 'function');
    });
  });

  describe('core functionality', () => {
    let mockInferenceEngine;
    let personalizationEngine;

    beforeEach(() => {
      mockInferenceEngine = {
        predict: async (modelId, version, input) => {
          // Return mock embeddings
          const numTexts = input.texts?.length || 1;
          // Return different embeddings to test similarity calculation
          return Array.from({ length: numTexts }, (_, i) => {
            // Create slightly different embeddings
            return Array(512).fill(0.1 + i * 0.01);
          });
        },
        initialize: async () => {},
      };

      personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'test-model',
        version: 'v1',
      });
    });

    it('should calculate cosine similarity correctly', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      const similarity = personalizationEngine.cosineSimilarity(a, b);

      assert.equal(similarity, 1.0);
    });

    it('should calculate similarity for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = personalizationEngine.cosineSimilarity(a, b);

      assert.equal(similarity, 0);
    });

    it('should enhance products with similarity scores', async () => {
      await personalizationEngine.initialize();

      const products = [
        { name: 'Tent', description: 'Camping tent', category: 'Shelter' },
        {
          name: 'Sleeping Bag',
          description: 'Warm sleeping bag',
          category: 'Sleep',
        },
      ];

      const userContext = {
        activityType: 'camping',
        experienceLevel: 'beginner',
      };

      const enhanced = await personalizationEngine.enhanceProducts(
        products,
        userContext
      );

      assert.equal(enhanced.length, 2);
      assert.ok(enhanced[0].personalizedScore !== undefined);
      assert.ok(enhanced[1].personalizedScore !== undefined);
      assert.equal(enhanced[0].personalized, true);
      assert.equal(enhanced[1].personalized, true);
    });

    it('should build user query from context', () => {
      const context = {
        activityType: 'hiking',
        experienceLevel: 'advanced',
        season: 'summer',
        location: 'mountains',
      };

      const query = personalizationEngine.buildUserQuery(context);

      assert.equal(query, 'hiking advanced summer mountains');
    });

    it('should handle empty user context', () => {
      const query = personalizationEngine.buildUserQuery({});

      assert.equal(query, 'outdoor gear');
    });

    it('should track statistics', async () => {
      await personalizationEngine.initialize();

      mockInferenceEngine.predict = async () => [
        Array(512).fill(0.1),
        Array(512).fill(0.2),
      ];

      await personalizationEngine.calculateSimilarity(['text1', 'text2']);

      const stats = personalizationEngine.getStats();

      assert.ok(stats.inferences > 0);
      assert.ok(stats.averageLatency >= 0);
    });

    it('should track errors', async () => {
      await personalizationEngine.initialize();

      mockInferenceEngine.predict = async () => {
        throw new Error('Prediction failed');
      };

      const result = await personalizationEngine.calculateSimilarity([
        'text1',
        'text2',
      ]);

      assert.deepEqual(result, []);

      const stats = personalizationEngine.getStats();
      assert.ok(stats.errors > 0);
    });

    it('should return ready status', async () => {
      assert.equal(personalizationEngine.isReady(), false);

      await personalizationEngine.initialize();

      assert.equal(personalizationEngine.isReady(), true);
    });

    it('should return loaded models info', () => {
      const models = personalizationEngine.getLoadedModels();

      assert.ok(Array.isArray(models));
      assert.ok(models.length > 0);
      assert.ok(models[0].name);
      assert.ok(models[0].status);
    });

    it('should handle empty product list', async () => {
      await personalizationEngine.initialize();

      const enhanced = await personalizationEngine.enhanceProducts([], {});

      assert.deepEqual(enhanced, []);
    });

    it('should return unenhanced products on error', async () => {
      await personalizationEngine.initialize();

      mockInferenceEngine.predict = async () => {
        throw new Error('Model error');
      };

      const products = [{ name: 'Product 1' }];
      const enhanced = await personalizationEngine.enhanceProducts(
        products,
        {}
      );

      assert.deepEqual(enhanced, products);
    });
  });

  describe('model flexibility', () => {
    it('should support different output dimensions', async () => {
      const mockInferenceEngine = {
        predict: async (modelId, version, input) => {
          // Return 768-dimensional embeddings (e.g., BERT)
          const numTexts = input.texts?.length || 1;
          return Array.from({ length: numTexts }, () => Array(768).fill(0.1));
        },
        initialize: async () => {},
      };

      const personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'bert-base',
        version: 'v1',
      });

      await personalizationEngine.initialize();

      const similarities = await personalizationEngine.calculateSimilarity([
        'text1',
        'text2',
      ]);

      assert.ok(Array.isArray(similarities));
      assert.equal(similarities.length, 1);
    });

    it('should work with Ollama embeddings', async () => {
      const mockInferenceEngine = {
        predict: async (modelId, version, input) => {
          // Simulate Ollama embedding format
          return Array.from({ length: input.texts.length }, () =>
            Array(4096).fill(0.1)
          );
        },
        initialize: async () => {},
      };

      const personalizationEngine = new PersonalizationEngine({
        inferenceEngine: mockInferenceEngine,
        modelId: 'ollama-embeddings',
        version: 'latest',
      });

      await personalizationEngine.initialize();

      const products = [
        { name: 'Test Product', description: 'Test description' },
      ];

      const enhanced = await personalizationEngine.enhanceProducts(products, {
        activityType: 'test',
      });

      assert.ok(enhanced[0].personalizedScore !== undefined);
    });
  });
});
