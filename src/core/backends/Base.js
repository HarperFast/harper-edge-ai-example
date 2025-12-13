/**
 * BaseBackend - Abstract base class for all ML inference backends
 *
 * Provides common functionality for model lifecycle management including:
 * - Model loading and caching
 * - Model validation and error handling
 * - Resource cleanup and disposal
 * - Debug logging support
 *
 * @abstract
 * @class
 * @example
 * class MyBackend extends BaseBackend {
 *   constructor() {
 *     super('MyBackend');
 *   }
 *
 *   async loadModel(modelKey, modelBlob, modelRecord) {
 *     // Load and cache model
 *     this.models.set(modelKey, {model, config});
 *     return {loaded: true, inputNames: [...], outputNames: [...]};
 *   }
 *
 *   async predict(modelKey, inputs) {
 *     const modelInfo = this._validateLoaded(modelKey);
 *     // Run inference
 *     return {output: result};
 *   }
 * }
 */
export class BaseBackend {
	constructor(name) {
		this.name = name;
		this.models = new Map(); // Generic model storage
	}

	/**
	 * Load model - must be implemented by subclasses
	 *
	 * @abstract
	 * @async
	 * @param {string} modelKey - Unique cache key for the model (format: "modelId:version")
	 * @param {Buffer|string|Object} modelBlob - Model data in backend-specific format
	 *   - ONNX: Buffer containing .onnx binary
	 *   - TensorFlow.js: String (model type identifier like "universal-sentence-encoder")
	 *   - Transformers.js: String or Object (Hugging Face model identifier or config)
	 *   - Ollama: String or Object (model name or config with mode)
	 * @param {Object} [modelRecord=null] - Optional model metadata from Harper
	 * @param {string} modelRecord.id - Harper database record ID
	 * @param {string} modelRecord.modelId - Model identifier
	 * @param {string} modelRecord.version - Model version
	 * @param {string} modelRecord.framework - Framework name (onnx, tensorflow, transformers, ollama)
	 * @param {string|Object} modelRecord.metadata - JSON string or object with model metadata
	 * @returns {Promise<Object>} Loaded model metadata
	 * @returns {boolean} return.loaded - Always true on success
	 * @returns {string[]} return.inputNames - Names of expected input fields
	 * @returns {string[]} return.outputNames - Names of output fields
	 * @throws {Error} Must be implemented by subclass
	 * @example
	 * async loadModel(modelKey, modelBlob, modelRecord) {
	 *   const model = await loadFromBlob(modelBlob);
	 *   this.models.set(modelKey, {model, config: modelRecord?.metadata});
	 *   return {loaded: true, inputNames: ['input'], outputNames: ['output']};
	 * }
	 */
	async loadModel(modelKey, modelBlob) {
		throw new Error(`${this.name}.loadModel() must be implemented`);
	}

	/**
	 * Run prediction - must be implemented by subclasses
	 *
	 * @abstract
	 * @async
	 * @param {string} modelKey - Cache key for loaded model
	 * @param {Object} inputs - Input data in backend-specific format
	 *   - Text embeddings: {texts: string[]} or {text: string}
	 *   - Ollama chat: {messages: Array} or {prompt: string}
	 *   - Pre-tokenized: {input_ids: Tensor, attention_mask: Tensor}
	 * @returns {Promise<Object>} Prediction results in backend-specific format
	 * @throws {Error} Must be implemented by subclass
	 * @throws {Error} If model not loaded (use _validateLoaded to check)
	 * @example
	 * async predict(modelKey, inputs) {
	 *   const modelInfo = this._validateLoaded(modelKey);
	 *   const result = await modelInfo.model.run(inputs);
	 *   return {output: result};
	 * }
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
	 * Validate that model is loaded and return model info
	 *
	 * Helper method for subclasses to validate model state before prediction.
	 *
	 * @protected
	 * @param {string} modelKey - Model cache key
	 * @returns {*} The loaded model info object (structure varies by backend)
	 * @throws {Error} If model not loaded with descriptive message
	 * @example
	 * async predict(modelKey, inputs) {
	 *   const modelInfo = this._validateLoaded(modelKey);
	 *   // Use modelInfo for prediction
	 * }
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
	 * Log backend operation (only when DEBUG=true)
	 *
	 * @protected
	 * @param {string} operation - Operation name (e.g., "loadModel", "predict")
	 * @param {string} modelKey - Model cache key
	 * @example
	 * this._log('loadModel', 'my-model:v1');
	 * // Output: [MyBackend] loadModel: my-model:v1
	 */
	_log(operation, modelKey) {
		if (process.env.DEBUG === 'true') {
			console.log(`[${this.name}] ${operation}: ${modelKey}`);
		}
	}
}
