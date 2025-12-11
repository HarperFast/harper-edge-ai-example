/**
 * PersonalizationEngine - Product personalization using embeddings
 *
 * Supports two modes:
 * 1. **New mode (recommended)**: Uses InferenceEngine for backend-agnostic predictions
 *    - Supports ONNX, TensorFlow, and Ollama models
 *    - Enable model selection at runtime
 *
 * 2. **Legacy mode (deprecated)**: Direct TensorFlow.js integration
 *    - Backward compatible with existing code
 *    - Shows deprecation warning
 *
 * Example (new mode):
 *   const engine = new PersonalizationEngine({
 *     inferenceEngine: inferenceEngineInstance,
 *     modelId: 'universal-sentence-encoder',
 *     version: 'v1'
 *   });
 *
 * Example (legacy mode - deprecated):
 *   const engine = new PersonalizationEngine();
 */

import { TensorFlowBackend } from './core/backends/TensorFlow.js';

export class PersonalizationEngine {
  constructor(options = {}) {
    this.options = options;

    // Detect mode based on whether inferenceEngine is provided
    if (options.inferenceEngine) {
      // NEW MODE: Backend-agnostic with InferenceEngine
      this.mode = 'inference-engine';
      this.inferenceEngine = options.inferenceEngine;
      this.modelId = options.modelId || 'universal-sentence-encoder';
      this.version = options.version || 'v1';
    } else {
      // LEGACY MODE: Direct TensorFlow backend (deprecated)
      this.mode = 'legacy';
      this.backend = new TensorFlowBackend();
      this.modelKey = 'personalization-use';

      // Show deprecation warning
      console.warn(
        'DEPRECATED: PersonalizationEngine without inferenceEngine is deprecated. ' +
          'Please use new constructor: new PersonalizationEngine({ inferenceEngine, modelId, version })'
      );
    }

    this.initialized = false;
    this.stats = {
      inferences: 0,
      averageLatency: 0,
      errors: 0,
    };
  }

  async initialize() {
    console.log('Initializing PersonalizationEngine...');

    try {
      if (this.mode === 'inference-engine') {
        // NEW MODE: No model loading needed, InferenceEngine handles it
        console.log(
          `PersonalizationEngine ready (InferenceEngine mode: ${this.modelId}:${this.version})`
        );
        this.initialized = true;
        return true;
      } else {
        // LEGACY MODE: Load TensorFlow model
        console.log(
          'Loading Universal Sentence Encoder (legacy TensorFlow mode)...'
        );
        await this.backend.loadModel(this.modelKey, 'universal-sentence-encoder');
        this.initialized = true;
        console.log('Universal Sentence Encoder loaded successfully');
        return true;
      }
    } catch (error) {
      console.error('Failed to initialize PersonalizationEngine:', error);
      throw error;
    }
  }

  /**
   * Calculate similarity between product descriptions and user preferences
   */
  async calculateSimilarity(texts) {
    if (!this.initialized || texts.length < 2) {
      return [];
    }

    const startTime = Date.now();

    try {
      let embeddingData;

      if (this.mode === 'inference-engine') {
        // NEW MODE: Use InferenceEngine
        const result = await this.inferenceEngine.predict(
          this.modelId,
          this.version,
          { texts }
        );
        embeddingData = result;
      } else {
        // LEGACY MODE: Use TensorFlow backend directly
        const result = await this.backend.predict(this.modelKey, { texts });
        embeddingData = result.embeddings;
      }

      // Calculate cosine similarity between first text (query) and others
      const queryEmbedding = embeddingData[0];
      const similarities = embeddingData
        .slice(1)
        .map((embedding) => this.cosineSimilarity(queryEmbedding, embedding));

      this.recordMetrics(Date.now() - startTime, true);

      return similarities;
    } catch (error) {
      console.error('Similarity calculation failed:', error);
      this.recordMetrics(Date.now() - startTime, false);
      return [];
    }
  }

  cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Enhance products with personalized scores based on user context
   */
  async enhanceProducts(products, userContext) {
    if (!products || products.length === 0) return products;

    try {
      // Build query from user context
      const userQuery = this.buildUserQuery(userContext);

      // Get product descriptions
      const productTexts = products.map(
        (p) =>
          `${p.name || ''} ${p.description || ''} ${p.category || ''}`.trim()
      );

      // Calculate similarities
      const texts = [userQuery, ...productTexts];
      const similarities = await this.calculateSimilarity(texts);

      // Add similarity scores to products
      return products.map((product, idx) => ({
        ...product,
        personalizedScore: similarities[idx] || 0,
        personalized: true,
      }));
    } catch (error) {
      console.error('Product enhancement failed:', error);
      return products;
    }
  }

  buildUserQuery(userContext) {
    const parts = [];

    if (userContext.activityType) {
      parts.push(userContext.activityType);
    }
    if (userContext.experienceLevel) {
      parts.push(userContext.experienceLevel);
    }
    if (userContext.season) {
      parts.push(userContext.season);
    }
    if (userContext.location) {
      parts.push(userContext.location);
    }

    return parts.length > 0 ? parts.join(' ') : 'outdoor gear';
  }

  recordMetrics(latency, success) {
    this.stats.inferences++;
    this.stats.averageLatency =
      (this.stats.averageLatency * (this.stats.inferences - 1) + latency) /
      this.stats.inferences;

    if (!success) {
      this.stats.errors++;
    }
  }

  // Public API
  isReady() {
    return this.initialized;
  }

  getStats() {
    return { ...this.stats };
  }

  getLoadedModels() {
    if (this.mode === 'inference-engine') {
      return [
        {
          name: `${this.modelId}:${this.version}`,
          loaded: this.initialized,
          status: this.isReady() ? 'ready' : 'not loaded',
          mode: 'inference-engine',
        },
      ];
    } else {
      return [
        {
          name: 'universal-sentence-encoder',
          loaded: this.initialized,
          status: this.isReady() ? 'ready' : 'not loaded',
          mode: 'legacy',
        },
      ];
    }
  }
}
