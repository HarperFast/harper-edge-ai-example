/**
 * Model Fetch Authentication Tests
 *
 * Tests token-based authentication for Model Fetch API endpoints.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifyModelFetchAuth } from '../../src/core/utils/auth.js';

describe('Model Fetch API Authentication', () => {
	let originalToken;

	beforeEach(() => {
		// Save original token
		originalToken = process.env.MODEL_FETCH_TOKEN;

		// Set token for tests
		process.env.MODEL_FETCH_TOKEN = 'test-secret-token-123';
	});

	afterEach(() => {
		// Restore original token
		if (originalToken !== undefined) {
			process.env.MODEL_FETCH_TOKEN = originalToken;
		} else {
			delete process.env.MODEL_FETCH_TOKEN;
		}
	});

	describe('verifyModelFetchAuth', () => {
		it('should reject request without authorization header', () => {
			const request = {
				headers: {}
			};

			const result = verifyModelFetchAuth(request);

			assert.ok(result !== null);
			assert.equal(result.error, 'Unauthorized: MODEL_FETCH_TOKEN required');
			assert.equal(result.code, 'UNAUTHORIZED');
		});

		it('should reject request with invalid token', () => {
			const request = {
				headers: {
					authorization: 'Bearer wrong-token'
				}
			};

			const result = verifyModelFetchAuth(request);

			assert.ok(result !== null);
			assert.equal(result.error, 'Unauthorized: Invalid MODEL_FETCH_TOKEN');
			assert.equal(result.code, 'UNAUTHORIZED');
		});

		it('should allow request with valid token', () => {
			const request = {
				headers: {
					authorization: 'Bearer test-secret-token-123'
				}
			};

			const result = verifyModelFetchAuth(request);

			assert.equal(result, null); // null means authorized
		});

		it('should allow request when MODEL_FETCH_TOKEN is not set (disabled)', () => {
			delete process.env.MODEL_FETCH_TOKEN;

			const request = {
				headers: {}
			};

			const result = verifyModelFetchAuth(request);

			assert.equal(result, null); // null means authorized (auth disabled)
		});

		it('should accept Bearer token format', () => {
			const request = {
				headers: {
					authorization: 'Bearer test-secret-token-123'
				}
			};

			const result = verifyModelFetchAuth(request);
			assert.equal(result, null);
		});

		it('should accept plain token format', () => {
			const request = {
				headers: {
					authorization: 'test-secret-token-123'
				}
			};

			const result = verifyModelFetchAuth(request);
			assert.equal(result, null);
		});

		it('should be case-insensitive for Bearer prefix', () => {
			const request = {
				headers: {
					authorization: 'bearer test-secret-token-123'
				}
			};

			const result = verifyModelFetchAuth(request);
			assert.equal(result, null);
		});

		it('should handle mixed case Bearer prefix', () => {
			const request = {
				headers: {
					authorization: 'BeArEr test-secret-token-123'
				}
			};

			const result = verifyModelFetchAuth(request);
			assert.equal(result, null);
		});

		it('should handle request with no headers object', () => {
			const request = {};

			const result = verifyModelFetchAuth(request);

			assert.ok(result !== null);
			assert.equal(result.error, 'Unauthorized: MODEL_FETCH_TOKEN required');
		});

		it('should handle null request', () => {
			const result = verifyModelFetchAuth(null);

			assert.ok(result !== null);
			assert.equal(result.error, 'Unauthorized: MODEL_FETCH_TOKEN required');
		});
	});
});
