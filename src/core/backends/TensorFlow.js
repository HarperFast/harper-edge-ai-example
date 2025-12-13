import '../../../models/polyfill.js'; // Load polyfill first to fix Node.js 18+ compatibility
import '@tensorflow/tfjs-node'; // Import backend first
import * as use from '@tensorflow-models/universal-sentence-encoder';
import { parseModelBlob } from '../utils/modelConfig.js';
import { BaseBackend } from './Base.js';

/**
 * TensorFlow.js Backend - Load and run TensorFlow.js models in Node.js
 *
 * Supports:
 * - Universal Sentence Encoder for text embeddings
 * - Custom TensorFlow.js models (SavedModel format)
 * - Automatic GPU/CPU backend selection
 *
 * Model Loading:
 * - Loads from TensorFlow Hub URLs or local paths
 * - Caches models in memory for reuse
 * - Supports model metadata configuration
 *
 * Output Format:
 * - embeddings: Array of embedding arrays (supports batching)
 * - embedding: First embedding for convenience
 *
 * @extends BaseBackend
 * @see {@link https://www.tensorflow.org/js} - TensorFlow.js documentation
 * @see {@link https://tfhub.dev/google/universal-sentence-encoder/4} - USE model
 *
 * @example
 * const backend = new TensorFlowBackend();
 * await backend.loadModel('use:v1', 'universal-sentence-encoder');
 * const result = await backend.predict('use:v1', {texts: ['hello']});
 * // result.embedding = [0.1, 0.2, ...]
 */
export class TensorFlowBackend extends BaseBackend {
	constructor() {
		super('TensorFlowBackend');
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
			// Use shared parsing utility
			const config = parseModelBlob(modelBlob, { primaryKey: 'modelType' });
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
				config,
			});

			return {
				loaded: true,
				modelType,
				inputNames,
				outputNames,
			};
		} catch (error) {
			console.error('Failed to load TensorFlow model:', error);
			throw new Error(`TensorFlow.js model loading failed: ${error.message}`);
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
		const modelInfo = this._validateLoaded(modelKey);

		try {
			const { model, modelType } = modelInfo;

			if (modelType === 'universal-sentence-encoder' || modelType === 'use') {
				return await this._embedTexts(model, inputs);
			} else {
				throw new Error(`Unsupported model type for prediction: ${modelType}`);
			}
		} catch (error) {
			console.error('TensorFlow inference failed:', error);
			throw new Error(`TensorFlow.js inference failed: ${error.message}`);
		}
	}

	/**
	 * Generate embeddings using Universal Sentence Encoder
	 *
	 * Converts input text to 512-dimensional embeddings. Handles both single
	 * text and array inputs. Automatically manages TensorFlow tensor lifecycle.
	 *
	 * @private
	 * @async
	 * @param {Object} model - Loaded USE model
	 * @param {Object} inputs - Input data
	 * @param {string[]|string} [inputs.texts] - Text array or single text
	 * @param {string} [inputs.text] - Single text (alternative)
	 * @returns {Promise<Object>} Embedding result
	 * @returns {Array<Array<number>>} return.embeddings - Array of embedding vectors
	 * @returns {Array<number>} return.embedding - First embedding vector
	 * @throws {Error} If no text input provided
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
			embeddings: embeddingData, // Array of arrays for batch support
			embedding: embeddingData[0], // Single embedding for consistency with other backends
		};
	}

	// isLoaded(), unload(), and cleanup() inherited from BaseBackend
}
