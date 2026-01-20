/**
 * Rate Limiter Utility
 *
 * Manages rate limiting and backoff for HTTP requests to external sources.
 * Handles 429 (Too Many Requests) responses with proper backoff timing.
 *
 * Features:
 * - Per-source backoff tracking (independent limits for HuggingFace, different HTTP hosts)
 * - Respects Retry-After header from 429 responses
 * - Automatic backoff cleanup after expiry
 * - Thread-safe for concurrent job processing
 *
 * Usage:
 *   const limiter = new RateLimiter();
 *   await limiter.waitIfNeeded('huggingface.co');
 *   // ... make request ...
 *   if (response.status === 429) {
 *     limiter.handle429Response('huggingface.co', response);
 *   }
 */

export class RateLimiter {
	/**
	 * Create a rate limiter
	 * @param {Object} options - Configuration options
	 * @param {number} options.defaultBackoffSeconds - Default backoff time when Retry-After not provided (default: 60)
	 * @param {number} options.maxBackoffSeconds - Maximum backoff time to prevent excessive waits (default: 3600)
	 */
	constructor(options = {}) {
		// Map of source -> backoff expiry timestamp (milliseconds)
		this.backoffMap = new Map();

		// Configuration
		this.defaultBackoffSeconds = options.defaultBackoffSeconds || 60;
		this.maxBackoffSeconds = options.maxBackoffSeconds || 3600; // 1 hour max

		// Cleanup interval (remove expired backoffs every 5 minutes)
		this.cleanupIntervalMs = 5 * 60 * 1000;
		this.cleanupTimer = null;
		this.startCleanup();
	}

	/**
	 * Wait if the source is currently rate-limited
	 *
	 * This should be called BEFORE making a request to the source.
	 * If the source has an active backoff, this will sleep until the backoff expires.
	 *
	 * @param {string} source - Source identifier (e.g., 'huggingface.co', 'example.com')
	 * @returns {Promise<void>}
	 */
	async waitIfNeeded(source) {
		const backoffUntil = this.backoffMap.get(source);

		if (!backoffUntil) {
			// No active backoff
			return;
		}

		const now = Date.now();
		if (now >= backoffUntil) {
			// Backoff expired
			this.backoffMap.delete(source);
			return;
		}

		// Calculate wait time
		const waitMs = backoffUntil - now;
		const waitSeconds = Math.ceil(waitMs / 1000);

		console.log(
			`[RateLimiter] Rate limited for ${source}. Waiting ${waitSeconds}s before retry...`
		);

		// Sleep until backoff expires
		await new Promise((resolve) => setTimeout(resolve, waitMs));

		// Remove expired backoff
		this.backoffMap.delete(source);
	}

	/**
	 * Handle a 429 (Too Many Requests) response
	 *
	 * Extracts the Retry-After header (if present) and sets a backoff for the source.
	 * Future requests to this source will wait until the backoff expires.
	 *
	 * @param {string} source - Source identifier (e.g., 'huggingface.co')
	 * @param {Response|Object} response - HTTP response object with headers
	 * @param {number} [customBackoffSeconds] - Optional custom backoff time (overrides header)
	 */
	handle429Response(source, response, customBackoffSeconds = null) {
		let backoffSeconds;

		if (customBackoffSeconds !== null) {
			// Use custom backoff
			backoffSeconds = customBackoffSeconds;
		} else if (response.headers) {
			// Try to extract Retry-After header
			// Can be either seconds (integer) or HTTP date
			const retryAfterHeader = response.headers.get
				? response.headers.get('retry-after')
				: response.headers['retry-after'];

			if (retryAfterHeader) {
				// Check if it's a number (seconds) or a date
				const asNumber = parseInt(retryAfterHeader, 10);
				if (!isNaN(asNumber)) {
					backoffSeconds = asNumber;
				} else {
					// Try to parse as HTTP date
					try {
						const retryDate = new Date(retryAfterHeader);
						const nowDate = new Date();
						backoffSeconds = Math.ceil((retryDate - nowDate) / 1000);
					} catch (error) {
						console.warn(
							`[RateLimiter] Failed to parse Retry-After header: ${retryAfterHeader}`
						);
						backoffSeconds = this.defaultBackoffSeconds;
					}
				}
			} else {
				// No Retry-After header, use default
				backoffSeconds = this.defaultBackoffSeconds;
			}
		} else {
			// No headers object, use default
			backoffSeconds = this.defaultBackoffSeconds;
		}

		// Clamp backoff to max limit
		if (backoffSeconds > this.maxBackoffSeconds) {
			console.warn(
				`[RateLimiter] Backoff ${backoffSeconds}s exceeds max ${this.maxBackoffSeconds}s, clamping`
			);
			backoffSeconds = this.maxBackoffSeconds;
		}

		// Set backoff expiry time
		const backoffUntil = Date.now() + backoffSeconds * 1000;
		this.backoffMap.set(source, backoffUntil);

		console.log(`[RateLimiter] Rate limit activated for ${source}: ${backoffSeconds}s backoff`);
	}

	/**
	 * Check if a source is currently rate-limited
	 *
	 * @param {string} source - Source identifier
	 * @returns {boolean} True if source is rate-limited
	 */
	isRateLimited(source) {
		const backoffUntil = this.backoffMap.get(source);
		if (!backoffUntil) {
			return false;
		}

		const now = Date.now();
		if (now >= backoffUntil) {
			// Backoff expired
			this.backoffMap.delete(source);
			return false;
		}

		return true;
	}

	/**
	 * Get remaining backoff time for a source
	 *
	 * @param {string} source - Source identifier
	 * @returns {number} Remaining backoff time in seconds, or 0 if not rate-limited
	 */
	getRemainingBackoff(source) {
		const backoffUntil = this.backoffMap.get(source);
		if (!backoffUntil) {
			return 0;
		}

		const now = Date.now();
		if (now >= backoffUntil) {
			this.backoffMap.delete(source);
			return 0;
		}

		return Math.ceil((backoffUntil - now) / 1000);
	}

	/**
	 * Clear backoff for a specific source
	 *
	 * Useful for testing or manual override.
	 *
	 * @param {string} source - Source identifier
	 */
	clearBackoff(source) {
		this.backoffMap.delete(source);
	}

	/**
	 * Clear all backoffs
	 *
	 * Useful for testing or manual override.
	 */
	clearAll() {
		this.backoffMap.clear();
	}

	/**
	 * Start periodic cleanup of expired backoffs
	 * @private
	 */
	startCleanup() {
		if (this.cleanupTimer) {
			return;
		}

		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			for (const [source, backoffUntil] of this.backoffMap.entries()) {
				if (now >= backoffUntil) {
					this.backoffMap.delete(source);
				}
			}
		}, this.cleanupIntervalMs);

		// Don't prevent Node.js from exiting
		if (this.cleanupTimer.unref) {
			this.cleanupTimer.unref();
		}
	}

	/**
	 * Stop periodic cleanup
	 * @private
	 */
	stopCleanup() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/**
	 * Get current backoff map (for debugging)
	 * @returns {Map<string, number>} Map of source -> backoff expiry timestamp
	 */
	getBackoffMap() {
		return new Map(this.backoffMap);
	}
}
