import { OnnxBackend } from './backends/Onnx.js';
import { TensorFlowBackend } from './backends/TensorFlow.js';
import { OllamaBackend } from './backends/Ollama.js';
import { TransformersBackend } from './backends/Transformers.js';

/**
 * InferenceEngine - Framework-agnostic model loading and inference orchestration
 *
 * Automatically routes model operations to the appropriate backend (ONNX, TensorFlow.js,
 * Transformers.js, Ollama) based on the model's framework field. Provides:
 *
 * - Automatic backend selection and routing
 * - LRU model caching with configurable size
 * - Model lifecycle management
 * - Latency tracking for all predictions
 * - Blob format conversion for different backends
 *
 * @class
 * @example
 * const engine = new InferenceEngine();
 * await engine.initialize();
 *
 * // Load and predict
 * await engine.loadModel('my-model', 'v1', modelRecord);
 * const result = await engine.predict('my-model', {text: 'hello'}, 'v1');
 * console.log(result.output, result.latencyMs);
 *
 * // Cleanup
 * await engine.cleanup();
 */
export class InferenceEngine {
	/**
	 * Create InferenceEngine instance
	 *
	 * Initializes empty backend registry and model cache.
	 * Call initialize() after construction to register backends.
	 *
	 * @constructor
	 * @example
	 * const engine = new InferenceEngine();
	 * await engine.initialize(); // Required before use
	 */
	constructor() {
		this.backends = new Map();
		this.cache = new Map(); // Cache loaded models: modelKey -> { backend, metadata }
		this.maxCacheSize = parseInt(process.env.MODEL_CACHE_SIZE) || 10; // LRU cache size
	}

	/**
	 * Initialize all available backends
	 *
	 * Registers ONNX, TensorFlow.js, Transformers.js, and Ollama backends.
	 * Must be called before any model operations.
	 *
	 * @async
	 * @returns {Promise<void>}
	 * @example
	 * await engine.initialize();
	 */
	async initialize() {
		// Initialize backends
		this.backends.set('onnx', new OnnxBackend());
		this.backends.set('tensorflow', new TensorFlowBackend());
		this.backends.set('transformers', new TransformersBackend());
		this.backends.set('ollama', new OllamaBackend());
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
		const key = `${modelId}:${version}`;
		return this.cache.has(key);
	}

	/**
	 * Load model from registry into appropriate backend
	 *
	 * Routes the model to the correct backend based on modelRecord.framework field.
	 * Handles blob format conversion for each backend type. Caches loaded models
	 * using LRU eviction when cache exceeds maxCacheSize.
	 *
	 * @async
	 * @param {string} modelId - Model identifier (e.g., "all-MiniLM-L6-v2")
	 * @param {string} [version='latest'] - Model version
	 * @param {Object} modelRecord - Model record containing blob and metadata (required)
	 * @param {string} modelRecord.id - Database record ID
	 * @param {string} modelRecord.modelId - Model identifier
	 * @param {string} modelRecord.version - Model version
	 * @param {string} modelRecord.framework - Backend framework ('onnx', 'tensorflow', 'transformers', 'ollama')
	 * @param {Blob|Buffer} modelRecord.modelBlob - Model binary data
	 * @param {string} [modelRecord.inputSchema] - JSON schema for inputs
	 * @param {string} [modelRecord.outputSchema] - JSON schema for outputs
	 * @param {string} [modelRecord.metadata] - JSON metadata with taskType, equivalenceGroup, etc.
	 * @returns {Promise<Object>} Loaded model metadata
	 * @returns {boolean} return.loaded - Always true on success
	 * @returns {string[]} return.inputNames - Expected input field names
	 * @returns {string[]} return.outputNames - Output field names
	 * @throws {Error} If modelRecord not provided
	 * @throws {Error} If no backend available for framework
	 * @throws {Error} If modelBlob missing or invalid format
	 * @example
	 * const metadata = await engine.loadModel('use', 'v1', {
	 *   id: 'use:v1',
	 *   modelId: 'use',
	 *   version: 'v1',
	 *   framework: 'tensorflow',
	 *   modelBlob: stringOrBuffer,
	 *   metadata: '{"taskType":"text-embedding"}'
	 * });
	 */
	async loadModel(modelId, version, modelRecord = null) {
		const cacheKey = `${modelId}:${version || 'latest'}`;

		// Check cache first
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey).metadata;
		}

		// Use provided model data or throw error (caller should fetch)
		const model = modelRecord;

		if (!model) {
			throw new Error(`Model ${modelId}:${version || 'latest'} not provided. Call from Resource with model data.`);
		}

		// Get appropriate backend
		const backend = this.backends.get(model.framework);

		if (!backend) {
			throw new Error(`No backend available for framework: ${model.framework}`);
		}

			// Access blob from model record
		// When stored via createBlob() in a Resource, the blob is attached to the record
		const blob = model.modelBlob;

		if (!blob) {
			throw new Error(`Model ${model.id} has no modelBlob data`);
		}

		// Read blob data into Buffer
		let modelData;
		if (Buffer.isBuffer(blob)) {
			// Already a Buffer
			modelData = blob;
		} else if (typeof blob.arrayBuffer === 'function') {
			// FileBackedBlob or Web Blob - use arrayBuffer() method for binary data
			const arrayBuffer = await blob.arrayBuffer();
			modelData = Buffer.from(arrayBuffer);
		} else if (typeof blob === 'object' && blob !== null) {
			// Try to read as indexed object (for small JSON blobs stored as objects)
			const values = Object.values(blob);
			if (values.length > 0 && typeof values[0] === 'number') {
				modelData = Buffer.from(values);
			} else {
				throw new Error(`Cannot extract data from blob object - no arrayBuffer method and not an indexed array`);
			}
		} else {
			throw new Error(`Unexpected blob type: ${typeof blob}`);
		}

		// Now handle the Buffer based on framework requirements
		if (model.framework === 'onnx') {
			// ONNX needs the Buffer as-is
			// modelData is ready
		} else {
			// Ollama/TensorFlow need JSON object or string
			const decoded = modelData.toString('utf-8');
			if (model.framework === 'ollama') {
				try {
					modelData = JSON.parse(decoded);
				} catch {
					modelData = decoded;
				}
			} else {
				modelData = decoded;
			}
		}

		// Load into backend, pass model metadata for reference
		const loadResult = await backend.loadModel(cacheKey, modelData, model);

		// Store in cache
		const metadata = {
			modelId: model.modelId,
			version: model.version,
			framework: model.framework,
			...loadResult,
		};

		this.cache.set(cacheKey, {
			backend,
			metadata,
			lastUsed: Date.now(),
		});

		// Evict if cache too large (simple LRU)
		if (this.cache.size > this.maxCacheSize) {
			this._evictLRU();
		}

		return metadata;
	}

	/**
	 * Run inference with a loaded model
	 *
	 * Automatically loads model if not already cached. Tracks prediction latency
	 * and updates LRU cache. Returns output along with metadata.
	 *
	 * @async
	 * @param {string} modelId - Model identifier
	 * @param {Object} inputs - Input data (format depends on model backend)
	 * @param {string[]} [inputs.texts] - For text embedding models
	 * @param {string} [inputs.text] - For single text input
	 * @param {string} [inputs.prompt] - For Ollama models
	 * @param {Array} [inputs.messages] - For Ollama chat mode
	 * @param {Tensor} [inputs.input_ids] - For pre-tokenized input
	 * @param {string} [version='latest'] - Model version
	 * @param {Object} [modelRecord=null] - Model record (if already fetched)
	 * @returns {Promise<Object>} Prediction results with metadata
	 * @returns {Object} return.output - Backend-specific output
	 * @returns {number} return.latencyMs - Inference latency in milliseconds
	 * @returns {string} return.modelVersion - Version of model used
	 * @returns {string} return.framework - Backend framework used
	 * @throws {Error} If model fails to load
	 * @example
	 * const result = await engine.predict('my-model', {
	 *   texts: ['hello world']
	 * }, 'v1', modelRecord);
	 *
	 * console.log(result.output.embeddings); // [[0.1, 0.2, ...]]
	 * console.log(result.latencyMs); // 15.2
	 */
	async predict(modelId, inputs, version, modelRecord = null) {
		// Load model if not cached
		if (!this.isCached(modelId, version || 'latest')) {
			await this.loadModel(modelId, version, modelRecord);
		}

		const cacheKey = `${modelId}:${version || 'latest'}`;
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
			framework: cached.metadata.framework,
		};
	}

	/**
	 * Evict least recently used model from cache
	 *
	 * Called automatically when cache size exceeds maxCacheSize.
	 * Finds model with oldest lastUsed timestamp and unloads it.
	 *
	 * @private
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
