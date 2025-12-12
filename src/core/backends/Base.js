/**
 * BaseBackend - Abstract base class for all ML backends
 * Provides common functionality and interface
 */
export class BaseBackend {
  constructor(name) {
    this.name = name;
    this.models = new Map(); // Generic model storage
  }

  /**
   * Load model - must be implemented by subclasses
   * @param {string} modelKey - Cache key
   * @param {any} modelBlob - Model data
   * @returns {Promise<Object>} Loaded model metadata
   */
  async loadModel(modelKey, modelBlob) {
    throw new Error(`${this.name}.loadModel() must be implemented`);
  }

  /**
   * Run prediction - must be implemented by subclasses
   * @param {string} modelKey - Cache key
   * @param {Object} inputs - Input data
   * @returns {Promise<Object>} Prediction results
   */
  async predict(modelKey, inputs) {
    throw new Error(`${this.name}.predict() must be implemented`);
  }

  /**
   * Check if model is loaded
   * @param {string} modelKey - Cache key
   * @returns {boolean} True if model is loaded
   */
  isLoaded(modelKey) {
    return this.models.has(modelKey);
  }

  /**
   * Unload model from cache
   * @param {string} modelKey - Cache key
   */
  async unload(modelKey) {
    const modelInfo = this.models.get(modelKey);
    if (modelInfo) {
      // Call custom cleanup if available
      if (modelInfo.model && typeof modelInfo.model.dispose === 'function') {
        modelInfo.model.dispose();
      }
      this.models.delete(modelKey);
    }
  }

  /**
   * Cleanup all loaded models
   */
  async cleanup() {
    for (const [key] of this.models.entries()) {
      await this.unload(key);
    }
    this.models.clear();
  }

  /**
   * Validate that model is loaded
   * @param {string} modelKey - Model key
   * @throws {Error} If model not loaded
   * @returns {*} The loaded model
   */
  _validateLoaded(modelKey) {
    if (!this.isLoaded(modelKey)) {
      throw new Error(`Model ${modelKey} not loaded in ${this.name} backend`);
    }
    return this.models.get(modelKey);
  }

  /**
   * Safe error wrapper for abstract methods
   * @param {string} method - Method name
   */
  _notImplemented(method) {
    throw new Error(`${method} must be implemented by ${this.name} backend`);
  }

  /**
   * Log backend operation
   * @param {string} operation - Operation name
   * @param {string} modelKey - Model key
   */
  _log(operation, modelKey) {
    if (process.env.DEBUG === 'true') {
      console.log(`[${this.name}] ${operation}: ${modelKey}`);
    }
  }
}
