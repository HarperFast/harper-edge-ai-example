import * as ort from 'onnxruntime-node';

/**
 * ONNX Runtime Backend - Load and run ONNX models
 */
export class OnnxRuntimeBackend {
  constructor() {
    this.name = 'OnnxRuntimeBackend';
    this.sessions = new Map(); // Cache loaded sessions
  }

  /**
   * Load ONNX model from buffer
   * @param {string} modelKey - Cache key
   * @param {Buffer} modelBlob - ONNX model binary
   * @returns {Object} Loaded session metadata
   */
  async loadModel(modelKey, modelBlob) {
    try {
      // Create ONNX Runtime session from buffer
      const session = await ort.InferenceSession.create(modelBlob);

      // Cache session
      this.sessions.set(modelKey, session);

      return {
        loaded: true,
        inputNames: session.inputNames,
        outputNames: session.outputNames
      };
    } catch (error) {
      console.error('Failed to load ONNX model:', error);
      throw new Error(`ONNX model loading failed: ${error.message}`);
    }
  }

  /**
   * Run inference with ONNX model
   * @param {string} modelKey - Cache key
   * @param {Object} inputs - Input tensors { inputName: Float32Array }
   * @returns {Object} Output tensors
   */
  async predict(modelKey, inputs) {
    const session = this.sessions.get(modelKey);

    if (!session) {
      throw new Error(`Model ${modelKey} not loaded`);
    }

    try {
      // Convert inputs to ONNX tensors
      const feeds = {};
      for (const [name, data] of Object.entries(inputs)) {
        // Determine shape from data
        let shape;
        if (data instanceof Float32Array || Array.isArray(data)) {
          shape = [1, data.length]; // Assume batch size 1
        } else {
          throw new Error(`Unsupported input type for ${name}`);
        }

        feeds[name] = new ort.Tensor('float32', Float32Array.from(data), shape);
      }

      // Run inference
      const results = await session.run(feeds);

      // Convert output tensors to plain objects
      const output = {};
      for (const [name, tensor] of Object.entries(results)) {
        output[name] = Array.from(tensor.data);
      }

      return output;
    } catch (error) {
      console.error('ONNX inference failed:', error);
      throw new Error(`ONNX inference failed: ${error.message}`);
    }
  }

  /**
   * Check if model is loaded
   */
  isLoaded(modelKey) {
    return this.sessions.has(modelKey);
  }

  /**
   * Unload model from cache
   */
  async unload(modelKey) {
    const session = this.sessions.get(modelKey);
    if (session) {
      // ONNX Runtime sessions don't need explicit disposal in Node.js
      this.sessions.delete(modelKey);
    }
  }

  /**
   * Cleanup all loaded models
   */
  async cleanup() {
    this.sessions.clear();
  }
}
