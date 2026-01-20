import { pipeline, env } from '@xenova/transformers';
import { parseModelBlob } from '../utils/modelConfig.js';
import { BaseBackend } from './Base.js';

/* global logger */

// Configure transformers.js for Node.js environment
env.allowLocalModels = false; // Always download from Hugging Face
env.useBrowserCache = false; // Use file system cache instead

/**
 * Transformers.js Backend - High-level API for Hugging Face models
 *
 * Features:
 * - Uses onnxruntime-web under the hood
 * - Compatible with Xenova ONNX models on Hugging Face
 * - Automatic model download and caching
 * - Built-in tokenization, pooling, and normalization
 * - Support for multiple task types
 *
 * Supported Tasks:
 * - feature-extraction (text embeddings)
 * - text-classification
 * - zero-shot-classification
 * - sentiment-analysis
 * - Named entity recognition
 *
 * Configuration:
 * - Downloads models from Hugging Face Hub
 * - Caches to local filesystem
 * - Disables browser cache (Node.js environment)
 *
 * @extends BaseBackend
 * @see {@link https://huggingface.co/docs/transformers.js} - Transformers.js docs
 * @see {@link https://huggingface.co/Xenova} - Xenova ONNX models
 *
 * @example
 * const backend = new TransformersBackend();
 * await backend.loadModel('model:v1', {
 *   modelName: 'Xenova/all-MiniLM-L6-v2',
 *   taskType: 'feature-extraction'
 * });
 * const result = await backend.predict('model:v1', {text: 'hello'});
 */
export class TransformersBackend extends BaseBackend {
	constructor() {
		super('TransformersBackend');
		// Use this.models from BaseBackend (stores pipelines)
	}

	/**
	 * Load model from Hugging Face using transformers.js
	 * @param {string} modelKey - Cache key
	 * @param {string|Buffer|Object} modelBlob - Model name or configuration
	 * @param {Object} modelRecord - Model metadata from Harper
	 * @returns {Object} Loaded model metadata
	 */
	async loadModel(modelKey, modelBlob, modelRecord = null) {
		try {
			// Parse model configuration
			const config = parseModelBlob(modelBlob, {
				primaryKey: 'modelName',
			});

			// Get model name and task type from config
			const modelName = config.modelName || config.model || modelRecord?.modelId || 'Xenova/all-MiniLM-L6-v2';
			const taskType = config.taskType || config.task || 'feature-extraction';

			// Create pipeline (downloads and caches model automatically)
			// Common tasks: 'feature-extraction', 'text-classification', 'zero-shot-classification'
			const pipe = await pipeline(taskType, modelName);

			// Cache pipeline
			this.models.set(modelKey, {
				pipe,
				modelName,
				taskType,
			});

			return {
				loaded: true,
				modelName,
				taskType,
				inputNames: ['text'],
				outputNames: taskType === 'feature-extraction' ? ['embeddings'] : ['output'],
			};
		} catch (error) {
			logger.error('Failed to load Transformers.js model:', error);
			throw new Error(`Transformers.js model loading failed: ${error.message}`);
		}
	}

	/**
	 * Run inference with transformers.js pipeline
	 * @param {string} modelKey - Cache key
	 * @param {Object} inputs - Input data
	 *   For embeddings: { texts: string[] } or { text: string }
	 * @returns {Object} Output from pipeline
	 */
	async predict(modelKey, inputs) {
		const modelInfo = this._validateLoaded(modelKey);

		try {
			const { pipe, taskType } = modelInfo;

			if (taskType === 'feature-extraction') {
				const result = await this._generateEmbeddings(pipe, inputs);
				return result;
			} else {
				// Generic prediction for other task types
				return await this._generatePrediction(pipe, inputs);
			}
		} catch (error) {
			logger.error('[TransformersBackend] Inference error:', {
				message: error.message,
				stack: error.stack,
				errorType: error.constructor.name,
			});
			throw new Error(`Transformers.js inference failed: ${error.message}`);
		}
	}

	/**
	 * Generate embeddings using feature-extraction pipeline
	 * @private
	 */
	async _generateEmbeddings(pipe, inputs) {
		// Handle different input formats
		let text;

		if (inputs.texts && Array.isArray(inputs.texts)) {
			// Process first text (transformers.js pipelines handle one at a time by default)
			text = inputs.texts[0];
		} else if (inputs.text) {
			text = inputs.text;
		} else if (inputs.prompt) {
			text = inputs.prompt;
		} else if (inputs.content) {
			text = inputs.content;
		}

		if (!text) {
			throw new Error('Feature extraction requires "texts" array, "text", "prompt", or "content" field');
		}

		// Run pipeline with mean pooling and normalization
		// The pipeline handles tokenization, inference, pooling, and normalization automatically
		const output = await pipe(text, {
			pooling: 'mean',
			normalize: true,
		});

		// Extract embedding from output tensor
		// Transformers.js returns a Tensor object - use tolist() to get array
		let embedding;
		if (typeof output.tolist === 'function') {
			// tolist() returns nested array for batched output, get first item
			const result = output.tolist();
			embedding = Array.isArray(result[0]) ? result[0] : result;
		} else if (output.data) {
			// onnxruntime-web (WASM) provides data property
			embedding = Array.from(output.data);
		} else {
			embedding = Array.from(output);
		}

		return {
			embeddings: [embedding], // Wrap in array for consistency with other backends
			embedding,
		};
	}

	/**
	 * Generate prediction for other task types
	 * @private
	 */
	async _generatePrediction(pipe, inputs) {
		let text;

		if (inputs.texts && Array.isArray(inputs.texts)) {
			text = inputs.texts[0];
		} else if (inputs.text || inputs.prompt || inputs.content) {
			text = inputs.text || inputs.prompt || inputs.content;
		}

		if (!text) {
			throw new Error('Prediction requires text input');
		}

		const output = await pipe(text);

		return {
			output,
			prediction: output,
		};
	}

	// isLoaded(), unload(), cleanup(), and _validateLoaded() inherited from BaseBackend
}
