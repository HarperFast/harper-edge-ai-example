/**
 * Shared utility for parsing model blob configuration
 * Used by TensorFlow, Ollama, and other backends
 */

/**
 * Parse modelBlob into configuration object
 * Handles string (JSON or plain), Buffer, or object inputs
 * @param {string|Buffer|Object} modelBlob - Model configuration blob
 * @param {Object} defaults - Default values to merge with parsed config
 * @returns {Object} Parsed configuration object
 */
export function parseModelBlob(modelBlob, defaults = {}) {
	let config;

	// Parse modelBlob - can be string (JSON or plain), Buffer, or object
	if (typeof modelBlob === 'string') {
		try {
			config = JSON.parse(modelBlob);
		} catch {
			// If not JSON, return as single key based on defaults
			const primaryKey = defaults.primaryKey || 'modelType';
			config = { [primaryKey]: modelBlob };
		}
	} else if (Buffer.isBuffer(modelBlob)) {
		const str = modelBlob.toString('utf-8');
		try {
			config = JSON.parse(str);
		} catch {
			const primaryKey = defaults.primaryKey || 'modelType';
			config = { [primaryKey]: str };
		}
	} else {
		config = modelBlob;
	}

	// Merge with defaults
	return { ...defaults, ...config };
}
