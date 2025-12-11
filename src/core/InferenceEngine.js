import { OnnxRuntimeBackend } from './backends/OnnxRuntimeBackend.js';
import { TensorFlowBackend } from './backends/TensorFlowBackend.js';
import { OllamaBackend } from './backends/OllamaBackend.js';

/**
 * Inference Engine - Framework-agnostic model loading and inference
 * Automatically routes to correct backend based on model framework
 */
export class InferenceEngine {
  constructor(modelRegistry) {
    this.registry = modelRegistry;
    this.backends = new Map();
    this.cache = new Map(); // Cache loaded models: modelKey -> { backend, metadata }
    this.maxCacheSize = 10; // LRU cache size
  }

  async initialize() {
    // Initialize backends
    this.backends.set('onnx', new OnnxRuntimeBackend());
    this.backends.set('tensorflow', new TensorFlowBackend());
    this.backends.set('ollama', new OllamaBackend());
  }

  /**
   * Build cache key for model
   */
  _buildCacheKey(modelId, version) {
    return `${modelId}:${version}`;
  }

  /**
   * Get backend by framework name
   */
  getBackend(framework) {
    return this.backends.get(framework);
  }

  /**
   * Check if model is cached
   */
  isCached(modelId, version) {
    const key = this._buildCacheKey(modelId, version);
    return this.cache.has(key);
  }

  /**
   * Load model from registry into appropriate backend
   * @param {string} modelId - Model identifier
   * @param {string} [version] - Optional version (defaults to latest)
   * @returns {Object} Loaded model metadata
   */
  async loadModel(modelId, version) {
    const cacheKey = this._buildCacheKey(modelId, version || 'latest');

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).metadata;
    }

    // Fetch from Harper table directly
    let model;
    if (version) {
      // Get specific version
      const id = this.registry._buildModelKey(modelId, version);
      model = await this.registry.modelsTable.get(id);
    } else {
      // Get latest version - query all versions and sort by uploadedAt
      const allVersions = [];
      for await (const record of this.registry.modelsTable.search({ modelId })) {
        allVersions.push(record);
      }
      if (allVersions.length > 0) {
        allVersions.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
        model = allVersions[0];
      }
    }

    if (!model) {
      throw new Error(`Model ${modelId}:${version || 'latest'} not found`);
    }

    // Get appropriate backend
    const backend = this.backends.get(model.framework);

    if (!backend) {
      throw new Error(`No backend available for framework: ${model.framework}`);
    }

    // Load into backend
    const loadResult = await backend.loadModel(cacheKey, model.modelBlob);

    // Store in cache
    const metadata = {
      modelId: model.modelId,
      version: model.version,
      framework: model.framework,
      ...loadResult
    };

    this.cache.set(cacheKey, {
      backend,
      metadata,
      lastUsed: Date.now()
    });

    // Evict if cache too large (simple LRU)
    if (this.cache.size > this.maxCacheSize) {
      this._evictLRU();
    }

    return metadata;
  }

  /**
   * Run inference with a loaded model
   * @param {string} modelId - Model identifier
   * @param {Object} inputs - Input data
   * @param {string} [version] - Optional version
   * @returns {Object} Prediction results
   */
  async predict(modelId, inputs, version) {
    // Load model if not cached
    if (!this.isCached(modelId, version || 'latest')) {
      await this.loadModel(modelId, version);
    }

    const cacheKey = this._buildCacheKey(modelId, version || 'latest');
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      throw new Error(`Model ${modelId} failed to load`);
    }

    // Update last used time
    cached.lastUsed = Date.now();

    // Run prediction through backend
    const startTime = Date.now();
    const output = await cached.backend.predict(cacheKey, inputs);
    const latencyMs = Date.now() - startTime;

    return {
      output,
      latencyMs,
      modelVersion: cached.metadata.version,
      framework: cached.metadata.framework
    };
  }

  /**
   * Evict least recently used model from cache
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.cache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const cached = this.cache.get(oldestKey);
      cached.backend.unload(oldestKey);
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Cleanup all loaded models and backends
   */
  async cleanup() {
    for (const backend of this.backends.values()) {
      await backend.cleanup();
    }
    this.cache.clear();
  }
}
