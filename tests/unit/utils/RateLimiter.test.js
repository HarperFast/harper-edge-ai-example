/**
 * RateLimiter Unit Tests
 *
 * Tests rate limiting, backoff handling, and 429 response processing.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../../../src/core/utils/RateLimiter.js';

describe('RateLimiter', () => {
	let limiter;

	beforeEach(() => {
		limiter = new RateLimiter({ defaultBackoffSeconds: 1, maxBackoffSeconds: 10 });
	});

	afterEach(() => {
		limiter.stopCleanup();
	});

	describe('constructor', () => {
		it('should create instance with default configuration', () => {
			const defaultLimiter = new RateLimiter();
			assert.ok(defaultLimiter instanceof RateLimiter);
			assert.equal(defaultLimiter.defaultBackoffSeconds, 60);
			assert.equal(defaultLimiter.maxBackoffSeconds, 3600);
			defaultLimiter.stopCleanup();
		});

		it('should accept custom configuration', () => {
			const customLimiter = new RateLimiter({
				defaultBackoffSeconds: 30,
				maxBackoffSeconds: 1800,
			});
			assert.equal(customLimiter.defaultBackoffSeconds, 30);
			assert.equal(customLimiter.maxBackoffSeconds, 1800);
			customLimiter.stopCleanup();
		});

		it('should initialize empty backoff map', () => {
			assert.equal(limiter.backoffMap.size, 0);
		});
	});

	describe('waitIfNeeded', () => {
		it('should not wait if source has no active backoff', async () => {
			const startTime = Date.now();
			await limiter.waitIfNeeded('example.com');
			const elapsed = Date.now() - startTime;

			// Should return immediately (< 50ms)
			assert.ok(elapsed < 50);
		});

		it('should wait if source is rate-limited', async () => {
			// Set backoff for 1 second
			const backoffUntil = Date.now() + 1000;
			limiter.backoffMap.set('example.com', backoffUntil);

			const startTime = Date.now();
			await limiter.waitIfNeeded('example.com');
			const elapsed = Date.now() - startTime;

			// Should wait approximately 1 second (allow 200ms tolerance)
			assert.ok(elapsed >= 900 && elapsed < 1200);

			// Backoff should be cleared after wait
			assert.equal(limiter.backoffMap.has('example.com'), false);
		});

		it('should not wait if backoff already expired', async () => {
			// Set backoff for 1ms ago (already expired)
			const backoffUntil = Date.now() - 1;
			limiter.backoffMap.set('example.com', backoffUntil);

			const startTime = Date.now();
			await limiter.waitIfNeeded('example.com');
			const elapsed = Date.now() - startTime;

			// Should return immediately
			assert.ok(elapsed < 50);

			// Backoff should be cleared
			assert.equal(limiter.backoffMap.has('example.com'), false);
		});

		it('should handle different sources independently', async () => {
			// Set backoff for source A (2 seconds)
			limiter.backoffMap.set('source-a.com', Date.now() + 2000);

			// Source B should not be affected
			const startTime = Date.now();
			await limiter.waitIfNeeded('source-b.com');
			const elapsed = Date.now() - startTime;

			assert.ok(elapsed < 50);
		});
	});

	describe('handle429Response', () => {
		it('should set backoff using Retry-After header (seconds)', () => {
			const response = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? '5' : null),
				},
			};

			limiter.handle429Response('example.com', response);

			// Check backoff was set
			assert.ok(limiter.isRateLimited('example.com'));

			// Check backoff time is approximately 5 seconds
			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining >= 4 && remaining <= 5);
		});

		it('should set backoff using Retry-After header (HTTP date)', () => {
			// Create a date 3 seconds in the future
			const futureDate = new Date(Date.now() + 3000);
			const httpDate = futureDate.toUTCString();

			const response = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? httpDate : null),
				},
			};

			limiter.handle429Response('example.com', response);

			// Check backoff was set
			assert.ok(limiter.isRateLimited('example.com'));

			// Check backoff time is approximately 3 seconds (allow tolerance)
			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining >= 2 && remaining <= 3);
		});

		it('should use default backoff when Retry-After header missing', () => {
			const response = {
				status: 429,
				headers: {
					get: () => null,
				},
			};

			limiter.handle429Response('example.com', response);

			// Check backoff was set to default (1 second in test config)
			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining >= 0 && remaining <= 1);
		});

		it('should accept custom backoff override', () => {
			const response = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? '100' : null), // This should be ignored
				},
			};

			// Override with custom 2 second backoff
			limiter.handle429Response('example.com', response, 2);

			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining >= 1 && remaining <= 2);
		});

		it('should clamp backoff to max limit', () => {
			const response = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? '999999' : null), // Huge backoff
				},
			};

			limiter.handle429Response('example.com', response);

			// Should be clamped to maxBackoffSeconds (10 in test config)
			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining <= 10);
		});

		it('should handle response without headers object', () => {
			const response = {
				status: 429,
				// No headers
			};

			limiter.handle429Response('example.com', response);

			// Should use default backoff
			assert.ok(limiter.isRateLimited('example.com'));
		});

		it('should handle different header accessor patterns', () => {
			// Pattern 1: headers.get() method (fetch API)
			const response1 = {
				headers: {
					get: (key) => (key === 'retry-after' ? '2' : null),
				},
			};
			limiter.handle429Response('source1.com', response1);
			assert.ok(limiter.isRateLimited('source1.com'));

			// Pattern 2: headers object (Node.js http module)
			const response2 = {
				headers: {
					'retry-after': '2',
				},
			};
			limiter.handle429Response('source2.com', response2);
			assert.ok(limiter.isRateLimited('source2.com'));
		});
	});

	describe('isRateLimited', () => {
		it('should return false for non-limited source', () => {
			assert.equal(limiter.isRateLimited('example.com'), false);
		});

		it('should return true for rate-limited source', () => {
			limiter.backoffMap.set('example.com', Date.now() + 1000);
			assert.equal(limiter.isRateLimited('example.com'), true);
		});

		it('should return false for expired backoff', () => {
			limiter.backoffMap.set('example.com', Date.now() - 1);
			assert.equal(limiter.isRateLimited('example.com'), false);

			// Should also clear expired backoff
			assert.equal(limiter.backoffMap.has('example.com'), false);
		});
	});

	describe('getRemainingBackoff', () => {
		it('should return 0 for non-limited source', () => {
			assert.equal(limiter.getRemainingBackoff('example.com'), 0);
		});

		it('should return remaining time for rate-limited source', () => {
			limiter.backoffMap.set('example.com', Date.now() + 2000);

			const remaining = limiter.getRemainingBackoff('example.com');
			assert.ok(remaining >= 1 && remaining <= 2);
		});

		it('should return 0 for expired backoff', () => {
			limiter.backoffMap.set('example.com', Date.now() - 1);
			assert.equal(limiter.getRemainingBackoff('example.com'), 0);
		});
	});

	describe('clearBackoff', () => {
		it('should clear backoff for specific source', () => {
			limiter.backoffMap.set('example.com', Date.now() + 1000);
			limiter.backoffMap.set('other.com', Date.now() + 1000);

			limiter.clearBackoff('example.com');

			assert.equal(limiter.isRateLimited('example.com'), false);
			assert.equal(limiter.isRateLimited('other.com'), true);
		});
	});

	describe('clearAll', () => {
		it('should clear all backoffs', () => {
			limiter.backoffMap.set('example.com', Date.now() + 1000);
			limiter.backoffMap.set('other.com', Date.now() + 1000);
			limiter.backoffMap.set('third.com', Date.now() + 1000);

			limiter.clearAll();

			assert.equal(limiter.backoffMap.size, 0);
			assert.equal(limiter.isRateLimited('example.com'), false);
			assert.equal(limiter.isRateLimited('other.com'), false);
			assert.equal(limiter.isRateLimited('third.com'), false);
		});
	});

	describe('getBackoffMap', () => {
		it('should return copy of backoff map', () => {
			limiter.backoffMap.set('example.com', Date.now() + 1000);

			const map = limiter.getBackoffMap();

			// Should be a copy (different object)
			assert.notEqual(map, limiter.backoffMap);

			// Should have same contents
			assert.ok(map.has('example.com'));
		});
	});

	describe('integration - realistic scenario', () => {
		it('should handle multiple 429 responses with proper backoff', async () => {
			const source = 'api.example.com';

			// Simulate first 429 response
			const response1 = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? '1' : null),
				},
			};
			limiter.handle429Response(source, response1);

			// Should be rate-limited
			assert.ok(limiter.isRateLimited(source));

			// Wait for backoff to expire
			await limiter.waitIfNeeded(source);

			// Should no longer be rate-limited
			assert.equal(limiter.isRateLimited(source), false);

			// Simulate second 429 response with longer backoff
			const response2 = {
				status: 429,
				headers: {
					get: (key) => (key === 'retry-after' ? '2' : null),
				},
			};
			limiter.handle429Response(source, response2);

			// Should be rate-limited again
			assert.ok(limiter.isRateLimited(source));
			const remaining = limiter.getRemainingBackoff(source);
			assert.ok(remaining >= 1 && remaining <= 2);
		});
	});
});
