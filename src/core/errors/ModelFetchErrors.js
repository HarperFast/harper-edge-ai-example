/**
 * Model Fetch Error Classes
 *
 * Typed error hierarchy for model fetch operations with structured error codes
 * and retryability flags. Used by ModelFetchWorker for retry logic and API
 * responses for client error handling.
 */

/**
 * Base error class for all model fetch operations
 * @extends Error
 */
export class ModelFetchError extends Error {
	/**
	 * Create a model fetch error
	 * @param {string} message - Error message
	 * @param {string} code - Error code (e.g., 'MODEL_NOT_FOUND')
	 * @param {boolean} retryable - Whether this error is retryable
	 */
	constructor(message, code, retryable = false) {
		super(message);
		this.name = 'ModelFetchError';
		this.code = code;
		this.retryable = retryable;
	}
}

/**
 * Security violation error (path traversal, symlinks, etc.)
 * Non-retryable - indicates a programming error or malicious input
 */
export class SecurityError extends ModelFetchError {
	constructor(message) {
		super(message, 'SECURITY_VIOLATION', false);
		this.name = 'SecurityError';
	}
}

/**
 * Rate limit exceeded error (HTTP 429)
 * Retryable - should back off and retry later
 */
export class RateLimitError extends ModelFetchError {
	/**
	 * Create a rate limit error
	 * @param {string} message - Error message
	 * @param {number} retryAfterSeconds - Seconds to wait before retry
	 */
	constructor(message, retryAfterSeconds = 60) {
		super(message, 'RATE_LIMITED', true);
		this.name = 'RateLimitError';
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

/**
 * Unsupported framework error
 * Non-retryable - model framework is not supported by this system
 */
export class UnsupportedFrameworkError extends ModelFetchError {
	/**
	 * Create an unsupported framework error
	 * @param {string} framework - The unsupported framework name
	 */
	constructor(framework) {
		super(
			`Unsupported framework: ${framework}. Supported: onnx, tensorflow, transformers, ollama`,
			'UNSUPPORTED_FRAMEWORK',
			false
		);
		this.name = 'UnsupportedFrameworkError';
		this.framework = framework;
	}
}

/**
 * Network error (timeout, connection failed)
 * Retryable - transient network issues may resolve
 */
export class NetworkError extends ModelFetchError {
	constructor(message) {
		super(message, 'NETWORK_TIMEOUT', true);
		this.name = 'NetworkError';
	}
}

/**
 * Model not found error (HTTP 404)
 * Non-retryable - model doesn't exist at source
 */
export class ModelNotFoundError extends ModelFetchError {
	/**
	 * Create a model not found error
	 * @param {string} sourceReference - The source reference that was not found
	 */
	constructor(sourceReference) {
		super(`Model not found: ${sourceReference}`, 'MODEL_NOT_FOUND', false);
		this.name = 'ModelNotFoundError';
		this.sourceReference = sourceReference;
	}
}

/**
 * Storage error (disk full, database write failed)
 * Retryable for temporary issues, but may indicate system problem
 */
export class StorageError extends ModelFetchError {
	constructor(message) {
		super(message, 'STORAGE_FAILED', true);
		this.name = 'StorageError';
	}
}

/**
 * File too large error
 * Non-retryable - file exceeds configured maximum size
 */
export class FileTooLargeError extends ModelFetchError {
	/**
	 * Create a file too large error
	 * @param {number} actualSize - Actual file size in bytes
	 * @param {number} maxSize - Maximum allowed size in bytes
	 */
	constructor(actualSize, maxSize) {
		super(
			`File size ${formatBytes(actualSize)} exceeds maximum ${formatBytes(maxSize)}`,
			'FILE_TOO_LARGE',
			false
		);
		this.name = 'FileTooLargeError';
		this.actualSize = actualSize;
		this.maxSize = maxSize;
	}
}

/**
 * Format bytes for human-readable display
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "5.2 GB")
 */
function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Error code constants for programmatic error handling
 */
export const ERROR_CODES = {
	// Validation errors (non-retryable)
	INVALID_SOURCE: { retryable: false },
	UNSUPPORTED_FRAMEWORK: { retryable: false },
	SECURITY_VIOLATION: { retryable: false },
	MODEL_NAME_CONFLICT: { retryable: false },
	FILE_TOO_LARGE: { retryable: false },

	// Download errors (retryable)
	NETWORK_TIMEOUT: { retryable: true },
	CONNECTION_FAILED: { retryable: true },
	RATE_LIMITED: { retryable: true, backoff: true },
	DOWNLOAD_INCOMPLETE: { retryable: true },

	// Source errors (depends on status code)
	MODEL_NOT_FOUND: { retryable: false }, // 404
	ACCESS_DENIED: { retryable: false }, // 403
	SOURCE_SERVER_ERROR: { retryable: true }, // 500-599

	// Storage errors (retryable but may indicate system issue)
	DISK_FULL: { retryable: false },
	STORAGE_FAILED: { retryable: true }
};
