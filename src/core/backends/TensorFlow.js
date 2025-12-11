import '../../../models/polyfill.js'; // Load polyfill first to fix Node.js 18+ compatibility
import '@tensorflow/tfjs-node'; // Import backend first
import * as use from '@tensorflow-models/universal-sentence-encoder';

/**
 * TensorFlow Backend - Load and run TensorFlow.js models
 * Supports Universal Sentence Encoder and other TensorFlow.js models
 */
export class TensorFlowBackend {
  constructor() {
    this.name = 'TensorFlowBackend';
    this.models = new Map();
  }

  /**
   * Load TensorFlow.js model
   * @param {string} modelKey - Cache key
   * @param {string|Buffer} modelBlob - Model identifier or configuration
   *   For Universal Sentence Encoder: 'universal-sentence-encoder' or JSON config
   *   For other models: URL or model path
   * @returns {Object} Loaded model metadata
   */
  async loadModel(modelKey, modelBlob) {
    try {
      let config;

      // Parse modelBlob - can be string (model name/URL) or JSON config
      if (typeof modelBlob === 'string') {
        try {
          config = JSON.parse(modelBlob);
        } catch {
          // If not JSON, treat as model identifier
          config = { modelType: modelBlob };
        }
      } else if (Buffer.isBuffer(modelBlob)) {
        const str = modelBlob.toString('utf-8');
        try {
          config = JSON.parse(str);
        } catch {
          config = { modelType: str };
        }
      } else {
        config = modelBlob;
      }

      const modelType = config.modelType || config.model || 'universal-sentence-encoder';

      let model;
      let inputNames = ['input'];
      let outputNames = ['output'];

      // Load specific model types
      if (modelType === 'universal-sentence-encoder' || modelType === 'use') {
        console.log('Loading Universal Sentence Encoder...');
        model = await use.load();
        inputNames = ['texts'];
        outputNames = ['embeddings'];
      } else {
        throw new Error(`Unsupported TensorFlow model type: ${modelType}`);
      }

      // Cache the loaded model
      this.models.set(modelKey, {
        model,
        modelType,
        config
      });

      return {
        loaded: true,
        modelType,
        inputNames,
        outputNames
      };
    } catch (error) {
      console.error('Failed to load TensorFlow model:', error);
      throw new Error(`TensorFlow model loading failed: ${error.message}`);
    }
  }

  /**
   * Run inference with TensorFlow.js model
   * @param {string} modelKey - Cache key
   * @param {Object} inputs - Input data
   *   For Universal Sentence Encoder: { texts: string[] } or { text: string }
   * @returns {Object} Output from model
   */
  async predict(modelKey, inputs) {
    const modelInfo = this.models.get(modelKey);

    if (!modelInfo) {
      throw new Error(`Model ${modelKey} not loaded`);
    }

    try {
      const { model, modelType } = modelInfo;

      if (modelType === 'universal-sentence-encoder' || modelType === 'use') {
        return await this._embedTexts(model, inputs);
      } else {
        throw new Error(`Unsupported model type for prediction: ${modelType}`);
      }
    } catch (error) {
      console.error('TensorFlow inference failed:', error);
      throw new Error(`TensorFlow inference failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings using Universal Sentence Encoder
   * @private
   */
  async _embedTexts(model, inputs) {
    // Support both single text and array of texts
    let texts;
    if (inputs.texts) {
      texts = Array.isArray(inputs.texts) ? inputs.texts : [inputs.texts];
    } else if (inputs.text) {
      texts = [inputs.text];
    } else {
      throw new Error('Universal Sentence Encoder requires "texts" or "text" field');
    }

    // Generate embeddings
    const embeddings = await model.embed(texts);
    const embeddingData = await embeddings.array();

    // Clean up tensor
    embeddings.dispose();

    return {
      embeddings: embeddingData,
      shape: embeddings.shape
    };
  }

  /**
   * Check if model is loaded
   */
  isLoaded(modelKey) {
    return this.models.has(modelKey);
  }

  /**
   * Unload model from cache
   */
  async unload(modelKey) {
    const modelInfo = this.models.get(modelKey);
    if (modelInfo && modelInfo.model && modelInfo.model.dispose) {
      // Dispose TensorFlow resources if available
      modelInfo.model.dispose();
    }
    this.models.delete(modelKey);
  }

  /**
   * Cleanup all loaded models
   */
  async cleanup() {
    for (const [key, modelInfo] of this.models.entries()) {
      if (modelInfo.model && modelInfo.model.dispose) {
        modelInfo.model.dispose();
      }
    }
    this.models.clear();
  }
}
