/**
 * Base Source Adapter
 *
 * Abstract base class for all model source adapters (HuggingFace, HTTP, filesystem).
 * Defines the interface for detecting frameworks, downloading models, and inferring metadata.
 *
 * Adapters are responsible for:
 * - Framework detection (validate before download to fail fast)
 * - Listing available variants (e.g., quantized vs full precision)
 * - Downloading model files with progress tracking
 * - Inferring metadata from source (task type, output dimensions, etc.)
 *
 * Pattern follows BaseBackend from src/core/backends/Base.js
 */

export class BaseSourceAdapter {
	/**
	 * Create a source adapter
	 * @param {string} name - Adapter name for logging
	 */
	constructor(name) {
		this.name = name || 'BaseSourceAdapter';
	}

	/**
	 * Detect the framework of a model without downloading it
	 *
	 * Used by ModelFetchWorker to fail fast if framework is unsupported
	 * before wasting bandwidth on download.
	 *
	 * @param {string} sourceReference - Source identifier (model ID, URL, file path)
	 * @param {string|null} variant - Optional variant (e.g., "quantized" for Transformers.js)
	 * @returns {Promise<string>} Framework name: 'onnx' | 'tensorflow' | 'transformers' | 'ollama' | 'unsupported'
	 * @throws {Error} If detection fails
	 */
	async detectFramework(sourceReference, variant = null) {
		throw new Error(`${this.name}.detectFramework() not implemented`);
	}

	/**
	 * List available model variants at the source
	 *
	 * Used by InspectModel API to show user options before fetching.
	 * For example, Transformers.js models may have "default" and "quantized" variants.
	 *
	 * @param {string} sourceReference - Source identifier
	 * @returns {Promise<Array<Object>>} Array of variant objects:
	 *   [
	 *     {
	 *       name: 'default',
	 *       files: ['onnx/model.onnx', 'tokenizer.json'],
	 *       totalSize: 22800000,
	 *       precision: 'fp32'
	 *     },
	 *     ...
	 *   ]
	 * @throws {Error} If listing fails
	 */
	async listVariants(sourceReference) {
		throw new Error(`${this.name}.listVariants() not implemented`);
	}

	/**
	 * Download model from source with progress tracking
	 *
	 * Downloads model binary and returns as Buffer. For multi-file models
	 * (e.g., Transformers.js), packages files into single blob (JSON with base64).
	 *
	 * @param {string} sourceReference - Source identifier
	 * @param {string|null} variant - Variant to download (e.g., "quantized")
	 * @param {Function} onProgress - Progress callback: (downloadedBytes, totalBytes) => void
	 * @returns {Promise<Buffer>} Model blob data
	 * @throws {NetworkError} On network failures
	 * @throws {RateLimitError} On HTTP 429
	 * @throws {ModelNotFoundError} On HTTP 404
	 * @throws {SecurityError} On security violations (filesystem adapter)
	 */
	async download(sourceReference, variant, onProgress) {
		throw new Error(`${this.name}.download() not implemented`);
	}

	/**
	 * Infer metadata from source without downloading full model
	 *
	 * Attempts to extract metadata from model cards, config files, or file inspection.
	 * Returns best-effort metadata; user can override via API.
	 *
	 * @param {string} sourceReference - Source identifier
	 * @param {string|null} variant - Optional variant
	 * @returns {Promise<Object>} Inferred metadata:
	 *   {
	 *     taskType: 'text-embedding' | 'text-classification' | etc.,
	 *     outputDimensions: [384] | [1, 1000] | null,
	 *     description: 'Human-readable description',
	 *     tags: ['semantic-search', 'nlp']
	 *   }
	 * @throws {Error} If inference fails
	 */
	async inferMetadata(sourceReference, variant = null) {
		throw new Error(`${this.name}.inferMetadata() not implemented`);
	}

	/**
	 * Validate that a framework is supported by the system
	 *
	 * Helper method for adapters to check framework support.
	 *
	 * @param {string} framework - Framework name to validate
	 * @returns {boolean} True if supported
	 */
	isSupportedFramework(framework) {
		const supported = ['onnx', 'tensorflow', 'transformers', 'ollama'];
		return supported.includes(framework);
	}
}
