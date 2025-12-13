import { OnnxBackend } from './backends/Onnx.js';
import { TensorFlowBackend } from './backends/TensorFlow.js';
import { OllamaBackend } from './backends/Ollama.js';

/**
 * Inference Engine - Framework-agnostic model loading and inference
 * Automatically routes to correct backend based on model framework
 */
export class InferenceEngine {
	constructor() {
		this.backends = new Map();
		this.cache = new Map(); // Cache loaded models: modelKey -> { backend, metadata }
		this.maxCacheSize = parseInt(process.env.MODEL_CACHE_SIZE) || 10; // LRU cache size
	}

	async initialize() {
		// Initialize backends
		this.backends.set('onnx', new OnnxBackend());
		this.backends.set('tensorflow', new TensorFlowBackend());
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
	 * @param {string} modelId - Model identifier
	 * @param {string} [version] - Optional version (defaults to latest)
	 * @param {Object} [modelRecord] - Optional model record (if already fetched)
	 * @returns {Object} Loaded model metadata
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

			// Fetch blob data separately - Harper Blob fields are not returned with the record
		// Access via property path: id + '/propertyName'
		const blobData = await tables.Model.get(`${model.id}/modelBlob`);

		if (!blobData) {
			throw new Error(`Model ${model.id} has no modelBlob data`);
		}

		// Harper returns blob as indexed object like {"0":123,"1":34,...}
		// Convert to Buffer
		let modelData;
		if (Buffer.isBuffer(blobData)) {
			// Already a Buffer
			modelData = blobData;
		} else if (typeof blobData === 'object' && blobData !== null) {
			// Indexed object - convert to Buffer
			const values = Object.values(blobData);
			modelData = Buffer.from(values);
		} else {
			throw new Error(`Unexpected blob data type: ${typeof blobData}`);
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
	 * @param {string} modelId - Model identifier
	 * @param {Object} inputs - Input data
	 * @param {string} [version] - Optional version
	 * @param {Object} [modelRecord] - Optional model record (if already fetched)
	 * @returns {Object} Prediction results
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
