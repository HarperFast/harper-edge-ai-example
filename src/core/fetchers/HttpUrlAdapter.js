/**
 * HTTP URL Source Adapter
 *
 * Downloads models from HTTP/HTTPS URLs with progress tracking.
 *
 * Features:
 * - Supports HTTP and HTTPS protocols
 * - Framework detection from URL extension
 * - Streaming download with progress callbacks
 * - Handles common HTTP errors (404, 429, 500, etc.)
 * - Respects Content-Length for progress tracking
 *
 * Security:
 * - Only allows http:// and https:// protocols
 * - Rejects file://, ftp://, and other protocols
 */

import path from 'path';
import { BaseSourceAdapter } from './BaseSourceAdapter.js';
import {
	UnsupportedFrameworkError,
	NetworkError,
	RateLimitError,
	ModelNotFoundError,
} from '../errors/ModelFetchErrors.js';

export class HttpUrlAdapter extends BaseSourceAdapter {
	constructor() {
		super('HttpUrlAdapter');
	}

	/**
	 * Validate URL is http or https only
	 * @param {string} urlString - URL to validate
	 * @throws {Error} If URL is invalid or uses unsupported protocol
	 * @private
	 */
	validateUrl(urlString) {
		let url;
		try {
			url = new URL(urlString);
		} catch (error) {
			throw new Error(`Invalid URL: ${urlString}`);
		}

		// Only allow http and https protocols
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error(
				`Unsupported protocol: ${url.protocol}. Only http:// and https:// are supported.`
			);
		}

		return url;
	}

	/**
	 * Detect framework from URL file extension
	 *
	 * @param {string} sourceReference - HTTP/HTTPS URL
	 * @param {string|null} variant - Not used for HTTP URLs
	 * @returns {Promise<string>} Framework: 'onnx' | 'tensorflow' | 'unsupported'
	 */
	async detectFramework(sourceReference, variant = null) {
		// Validate URL first
		this.validateUrl(sourceReference);

		// Infer from URL path extension
		const url = new URL(sourceReference);
		const pathname = url.pathname;
		const ext = path.extname(pathname).toLowerCase();

		if (ext === '.onnx') return 'onnx';
		if (ext === '.pb' || ext === '.pbtxt') return 'tensorflow';

		// Cannot detect from extension
		throw new UnsupportedFrameworkError(
			`Cannot detect framework from URL extension '${ext}'. ` +
				'Please specify framework explicitly when fetching.'
		);
	}

	/**
	 * List available variants
	 *
	 * HTTP URLs only have a single "default" variant.
	 *
	 * @param {string} sourceReference - HTTP/HTTPS URL
	 * @returns {Promise<Array<Object>>} Single variant
	 */
	async listVariants(sourceReference) {
		// Validate URL
		this.validateUrl(sourceReference);

		// Get file size from HEAD request
		let totalSize = 0;
		try {
			const response = await fetch(sourceReference, { method: 'HEAD' });

			if (!response.ok) {
				// Don't fail on HEAD errors, just return unknown size
				console.warn(`[HttpUrlAdapter] HEAD request failed: ${response.status}`);
			} else {
				const contentLength = response.headers.get('content-length');
				if (contentLength) {
					totalSize = parseInt(contentLength, 10);
				}
			}
		} catch (error) {
			console.warn(`[HttpUrlAdapter] HEAD request error: ${error.message}`);
		}

		// Extract filename from URL
		const url = new URL(sourceReference);
		const filename = path.basename(url.pathname);

		return [
			{
				name: 'default',
				files: [filename || 'model'],
				totalSize,
				precision: 'unknown',
			},
		];
	}

	/**
	 * Download model from HTTP/HTTPS URL
	 *
	 * Streams file from URL with progress tracking.
	 * Handles HTTP errors (404, 429, 500, etc.) with appropriate error types.
	 *
	 * @param {string} sourceReference - HTTP/HTTPS URL
	 * @param {string|null} variant - Not used for HTTP URLs
	 * @param {Function} onProgress - Progress callback: (downloadedBytes, totalBytes) => void
	 * @returns {Promise<Buffer>} Model file contents
	 */
	async download(sourceReference, variant, onProgress) {
		// Validate URL
		this.validateUrl(sourceReference);

		try {
			// Make GET request
			const response = await fetch(sourceReference);

			// Handle HTTP errors
			if (!response.ok) {
				if (response.status === 404) {
					throw new ModelNotFoundError(sourceReference);
				} else if (response.status === 429) {
					// Rate limited
					const retryAfter = response.headers.get('retry-after');
					const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
					throw new RateLimitError(`Rate limited by server`, retrySeconds);
				} else if (response.status >= 500) {
					// Server error (retryable)
					throw new NetworkError(
						`Server error: ${response.status} ${response.statusText}`
					);
				} else {
					// Other error (non-retryable)
					throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
				}
			}

			// Get total size from Content-Length header
			const contentLength = response.headers.get('content-length');
			const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

			// Stream response body
			const chunks = [];
			let downloadedBytes = 0;

			// Get reader from response body
			const reader = response.body.getReader();

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) break;

					chunks.push(value);
					downloadedBytes += value.length;

					// Report progress
					if (onProgress) {
						onProgress(downloadedBytes, totalBytes || downloadedBytes);
					}
				}
			} finally {
				reader.releaseLock();
			}

			// Concatenate chunks into single buffer
			return Buffer.concat(chunks);
		} catch (error) {
			// Re-throw our typed errors
			if (
				error instanceof ModelNotFoundError ||
				error instanceof RateLimitError ||
				error instanceof NetworkError
			) {
				throw error;
			}

			// Wrap other errors as NetworkError (retryable)
			throw new NetworkError(`Download failed: ${error.message}`);
		}
	}

	/**
	 * Infer metadata from HTTP URL
	 *
	 * Limited metadata available from URLs - just filename.
	 * User should provide metadata explicitly when fetching.
	 *
	 * @param {string} sourceReference - HTTP/HTTPS URL
	 * @param {string|null} variant - Not used
	 * @returns {Promise<Object>} Basic metadata
	 */
	async inferMetadata(sourceReference, variant = null) {
		// Validate URL
		this.validateUrl(sourceReference);

		// Extract filename from URL
		const url = new URL(sourceReference);
		const filename = path.basename(url.pathname);

		return {
			description: `Model downloaded from ${url.hostname}`,
			tags: ['http', 'remote'],
			sourceFilename: filename,
		};
	}
}

