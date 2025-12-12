import * as ort from 'onnxruntime-node';
import { BaseBackend } from './Base.js';

/**
 * ONNX Runtime Backend - Load and run ONNX models
 */
export class OnnxBackend extends BaseBackend {
  constructor() {
    super('OnnxBackend');
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
   * @param {Object} inputs - Input tensors { inputName: Float32Array | {data: Float32Array, shape: number[]} }
   * @returns {Object} Output tensors
   */
  async predict(modelKey, inputs) {
    // Validate model is loaded (sessions map is separate from base models map)
    if (!this.sessions.has(modelKey)) {
      throw new Error(`Model ${modelKey} not loaded in ${this.name} backend`);
    }

    const session = this.sessions.get(modelKey);

    try {
      // Convert inputs to ONNX tensors
      const feeds = {};
      for (const [name, input] of Object.entries(inputs)) {
        let data, shape;

        // Check if input is an object with explicit shape
        if (input && typeof input === 'object' && 'data' in input && 'shape' in input) {
          data = input.data;
          shape = input.shape;
        } else {
          // Simple data without explicit shape - infer shape
          data = input;
          if (data instanceof Float32Array || Array.isArray(data)) {
            shape = [1, data.length]; // Assume batch size 1, flat array
          } else {
            throw new Error(`Unsupported input type for ${name}`);
          }
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
    // ONNX Runtime sessions don't need explicit disposal in Node.js
    this.sessions.delete(modelKey);
  }

  /**
   * Cleanup all loaded models
   */
  async cleanup() {
    this.sessions.clear();
  }
}
