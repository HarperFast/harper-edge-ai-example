import * as ort from 'onnxruntime-node';
import { AutoTokenizer } from '@xenova/transformers';
import { BaseBackend } from './Base.js';

/* global logger */

/**
 * ONNX Runtime Backend - Load and run ONNX models with automatic tokenization
 *
 * Features:
 * - ONNX Runtime Node.js execution (CPU optimized)
 * - Automatic tokenizer loading for sentence-transformers models
 * - Built-in mean pooling and L2 normalization
 * - Support for raw text and pre-tokenized inputs
 *
 * Tokenization:
 * - Automatically loads tokenizer for models with input_ids/attention_mask
 * - Falls back to pre-tokenized inputs if tokenizer unavailable
 * - Uses Hugging Face AutoTokenizer
 *
 * Output Processing:
 * - Mean pooling over token embeddings (weighted by attention mask)
 * - L2 normalization for cosine similarity
 *
 * Cache Strategy:
 * - Uses separate `sessions` and `tokenizers` maps (not inherited this.models)
 * - Allows independent management of ONNX sessions and tokenizer resources
 *
 * @extends BaseBackend
 * @see {@link https://onnxruntime.ai/} - ONNX Runtime documentation
 *
 * @example
 * const backend = new OnnxBackend();
 * await backend.loadModel('model:v1', onnxBuffer, {
 *   modelId: 'sentence-transformers/all-MiniLM-L6-v2',
 *   metadata: JSON.stringify({tokenizerModel: 'sentence-transformers/all-MiniLM-L6-v2'})
 * });
 * const result = await backend.predict('model:v1', {texts: ['hello']});
 * // result.embedding = [0.1, 0.2, ...] (normalized)
 */
export class OnnxBackend extends BaseBackend {
	constructor() {
		super('OnnxBackend');
		this.sessions = new Map(); // Cache loaded sessions
		this.tokenizers = new Map(); // Cache loaded tokenizers
	}

	/**
	 * Load ONNX model from buffer
	 * @param {string} modelKey - Cache key
	 * @param {Buffer} modelBlob - ONNX model binary
	 * @param {Object} modelRecord - Model metadata from Harper
	 * @returns {Object} Loaded session metadata
	 */
	async loadModel(modelKey, modelBlob, modelRecord = null) {
		try {
			// Create ONNX Runtime session from buffer
			// Force CPU execution provider
			const options = {
				executionProviders: [{ name: 'cpu' }],
				graphOptimizationLevel: 'disabled',
			};

			const session = await ort.InferenceSession.create(modelBlob, options);

			// Cache session
			this.sessions.set(modelKey, session);

			// For sentence-transformers models, load tokenizer
			// Check if this is a sentence embedding model that needs tokenization
			const needsTokenization =
				session.inputNames.includes('input_ids') && session.inputNames.includes('attention_mask');

			if (needsTokenization) {
				try {
					// Load tokenizer for the model
					// Use tokenizerModel from metadata if available, otherwise derive from modelName
					let tokenizerModelName;

					if (modelRecord?.metadata) {
						const metadata =
							typeof modelRecord.metadata === 'string' ? JSON.parse(modelRecord.metadata) : modelRecord.metadata;
						tokenizerModelName = metadata.tokenizerModel;
					}

					if (!tokenizerModelName) {
						// Use modelName to derive tokenizer
						const modelName = modelRecord?.modelName || 'all-MiniLM-L6-v2';
						// If it already has a slash, use it as-is, otherwise prepend sentence-transformers/
						tokenizerModelName = modelName.includes('/') ? modelName : `sentence-transformers/${modelName}`;
					}

					const tokenizer = await AutoTokenizer.from_pretrained(tokenizerModelName);
					this.tokenizers.set(modelKey, tokenizer);
				} catch (tokenError) {
					logger.warn(`[OnnxBackend] Failed to load tokenizer for ${modelKey}: ${tokenError.message}`);
					// Continue without tokenizer - caller can still provide pre-tokenized inputs
				}
			}

			return {
				loaded: true,
				inputNames: session.inputNames,
				outputNames: session.outputNames,
				needsTokenization,
			};
		} catch (error) {
			logger.error('Failed to load ONNX model:', error);
			throw new Error(`ONNX model loading failed: ${error.message}`);
		}
	}

	/**
	 * Run inference with ONNX model
	 * @param {string} modelKey - Cache key
	 * @param {Object} inputs - Either {texts: string[]} for text input or tensor inputs
	 * @returns {Object} Output tensors or embeddings
	 */
	async predict(modelKey, inputs) {
		// Validate model is loaded
		if (!this.sessions.has(modelKey)) {
			throw new Error(`Model ${modelKey} not loaded in ${this.name} backend`);
		}

		const session = this.sessions.get(modelKey);
		const tokenizer = this.tokenizers.get(modelKey);

		try {
			let feeds = {};

			// Extract text input from various formats
			let text = null;
			if (inputs.texts && Array.isArray(inputs.texts)) {
				// Array of texts - process first one
				text = inputs.texts[0];
			} else if (inputs.text) {
				// Single text string
				text = inputs.text;
			} else if (inputs.prompt) {
				// Prompt field (common in LLM APIs)
				text = inputs.prompt;
			} else if (inputs.content) {
				// Content field
				text = inputs.content;
			}

			// Check if input is raw text that needs tokenization
			if (text !== null) {
				if (!tokenizer) {
					logger.error(`[OnnxBackend] Text input provided but no tokenizer available for ${modelKey}`);
					logger.error(`[OnnxBackend] Available tokenizers:`, Array.from(this.tokenizers.keys()));
					logger.error(`[OnnxBackend] Session input names:`, session.inputNames);
					throw new Error('Text input provided but no tokenizer available. Provide pre-tokenized inputs instead.');
				}

				// Tokenize the text
				const encoded = await tokenizer(text, {
					padding: true,
					truncation: true,
					return_tensors: 'pt', // Request PyTorch-style tensors
				});

				// Create ONNX tensors from tokenizer output
				// This model requires int64 tensors - use BigInt64Array
				const convertToBigInt64Array = (data) => {
					if (!data) {
						throw new Error('convertToBigInt64Array: data is undefined or null');
					}
					const arr = new BigInt64Array(data.length);
					for (let i = 0; i < data.length; i++) {
						// Handle both regular numbers and BigInt values from tokenizer
						arr[i] = typeof data[i] === 'bigint' ? data[i] : BigInt(data[i]);
					}
					return arr;
				};

				// Extract data from tokenizer output
				// Transformers.js Tensor objects store data in cpuData property
				const getTokenizerData = (tensor) => {
					if (!tensor) {
						throw new Error('Tokenizer output tensor is undefined');
					}
					// If it's already an array, return it
					if (Array.isArray(tensor)) {
						return tensor;
					}
					// Transformers.js Tensor objects have cpuData property
					if (tensor.cpuData) {
						return Array.from(tensor.cpuData);
					}
					// Fallback: check for .data property
					if (tensor.data) {
						return Array.isArray(tensor.data) ? tensor.data : Array.from(tensor.data);
					}
					throw new Error(`Unable to extract data from tokenizer tensor. Keys: ${Object.keys(tensor).join(',')}`);
				};

				const inputIds = convertToBigInt64Array(getTokenizerData(encoded.input_ids));
				const attentionMask = convertToBigInt64Array(getTokenizerData(encoded.attention_mask));

				// Ensure dims are plain arrays (not typed arrays or special objects)
				const dims = Array.isArray(encoded.input_ids.dims)
					? encoded.input_ids.dims
					: Array.from(encoded.input_ids.dims);

				feeds['input_ids'] = new ort.Tensor('int64', inputIds, dims);
				feeds['attention_mask'] = new ort.Tensor('int64', attentionMask, dims);

				if (encoded.token_type_ids) {
					const tokenDims = Array.isArray(encoded.token_type_ids.dims)
						? encoded.token_type_ids.dims
						: Array.from(encoded.token_type_ids.dims);
					feeds['token_type_ids'] = new ort.Tensor(
						'int64',
						convertToBigInt64Array(getTokenizerData(encoded.token_type_ids)),
						tokenDims
					);
				} else if (session.inputNames.includes('token_type_ids')) {
					// Create zeros for token_type_ids if model expects it but tokenizer didn't provide it
					const totalSize = dims.reduce((a, b) => a * b, 1);
					feeds['token_type_ids'] = new ort.Tensor('int64', new BigInt64Array(totalSize), dims);
				}
			} else {
				// Pre-tokenized or tensor inputs
				for (const [name, input] of Object.entries(inputs)) {
					let data, shape;

					if (input && typeof input === 'object' && 'data' in input && 'shape' in input) {
						data = input.data;
						shape = input.shape;
					} else {
						data = input;
						if (data instanceof Float32Array || Array.isArray(data)) {
							shape = [1, data.length];
						} else {
							throw new Error(`Unsupported input type for ${name}`);
						}
					}

					feeds[name] = new ort.Tensor('float32', Float32Array.from(data), shape);
				}
			}

			// Run inference
			const results = await session.run(feeds);

			// Handle sentence-transformers output (mean pooling + normalization)
			if (results.last_hidden_state && feeds.attention_mask) {
				// Extract data arrays from tensors for pooling
				const lastHiddenState = results.last_hidden_state;
				const attentionMaskData = feeds.attention_mask.data;

				const embeddings = this._meanPooling(lastHiddenState, attentionMaskData);
				const normalized = this._normalize(embeddings);

				return {
					embeddings: [normalized], // Wrap in array for consistency with other backends
					embedding: normalized,
				};
			}

			// Return raw output for other models
			const output = {};
			for (const [name, tensor] of Object.entries(results)) {
				output[name] = Array.from(tensor.data);
			}

			return output;
		} catch (error) {
			logger.error('ONNX inference failed:', error);
			throw new Error(`ONNX inference failed: ${error.message}`);
		}
	}

	/**
	 * Mean pooling over token embeddings with attention mask weighting
	 *
	 * Algorithm:
	 * 1. For each dimension in hidden_size:
	 *    - Sum embeddings for all tokens, weighted by attention mask
	 * 2. Divide by sum of attention mask (number of non-padding tokens)
	 *
	 * This produces a single fixed-size embedding from variable-length token sequences.
	 *
	 * @private
	 * @param {Object} lastHiddenState - ONNX tensor with shape [batch_size, seq_length, hidden_size]
	 * @param {BigInt64Array} attentionMaskData - Attention mask (BigInt 0n/1n, length seq_length)
	 * @returns {Array<number>} Pooled embedding vector (length hidden_size)
	 */
	_meanPooling(lastHiddenState, attentionMaskData) {
		const hiddenSize = lastHiddenState.dims[2];
		const seqLength = lastHiddenState.dims[1];
		const embeddings = lastHiddenState.data;

		const pooled = new Array(hiddenSize).fill(0);
		let sumMask = 0;

		for (let i = 0; i < seqLength; i++) {
			// Convert BigInt to number (attention mask values are 0 or 1, safe to convert)
			const maskValue = Number(attentionMaskData[i]);
			sumMask += maskValue;
			for (let j = 0; j < hiddenSize; j++) {
				pooled[j] += embeddings[i * hiddenSize + j] * maskValue;
			}
		}

		// Average
		for (let j = 0; j < hiddenSize; j++) {
			pooled[j] /= Math.max(sumMask, 1);
		}

		return pooled;
	}

	/**
	 * L2 normalization of embedding vector
	 *
	 * Divides each dimension by the L2 norm (Euclidean length) of the vector.
	 * Normalized embeddings have unit length, enabling cosine similarity via dot product.
	 *
	 * @private
	 * @param {Array<number>} vector - Embedding vector
	 * @returns {Array<number>} Normalized embedding (unit length)
	 */
	_normalize(vector) {
		const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
		return vector.map((val) => val / (norm || 1));
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
		// Note: We don't explicitly clear sessions to avoid ONNX Runtime environment errors
		// Sessions will be garbage collected when the Maps are cleared or process exits
		this.sessions.delete(modelKey);
		this.tokenizers.delete(modelKey);
	}

	/**
	 * Cleanup all loaded models
	 *
	 * IMPORTANT: We don't explicitly release ONNX sessions here because:
	 * 1. Multiple OnnxBackend instances share the same global ONNX Runtime environment
	 * 2. Explicit cleanup can cause "OrtEnv::Release() env_ptr == p_instance_.get() was false" errors
	 * 3. ONNX Runtime will clean up automatically when the process exits
	 *
	 * This is safe because:
	 * - For long-running processes, models are unloaded via unload() which removes from cache
	 * - For tests/short-lived processes, OS will reclaim memory on exit
	 * - ONNX sessions don't hold external resources that need explicit cleanup (like file handles)
	 */
	async cleanup() {
		// Do not clear sessions - let process exit handle cleanup
		// Clearing the Maps can trigger ONNX Runtime environment errors
		// this.sessions.clear();
		// this.tokenizers.clear();
	}
}
