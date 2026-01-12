/**
 * Authentication utilities for Model Fetch API
 *
 * Provides token-based authentication using MODEL_FETCH_TOKEN environment variable.
 */

/**
 * Verify request has valid authentication token
 *
 * @param {Object} request - Harper request object with headers
 * @returns {Object|null} Returns error object if unauthorized, null if authorized
 */
export function verifyModelFetchAuth(request) {
	// Check if authentication is enabled
	const requiredToken = process.env.MODEL_FETCH_TOKEN;

	console.log('[Auth] Verifying authentication');
	console.log('  Required token (from env):', requiredToken ? `${requiredToken.substring(0, 10)}...` : '(not set)');

	// If no token configured, authentication is disabled
	if (!requiredToken) {
		console.log('[Auth] No token required, allowing request');
		return null; // Allow request
	}

	// Get token from custom header (use X-Model-Fetch-Token instead of Authorization
	// to avoid conflicts with Harper's built-in JWT authentication)
	const tokenHeader = request?.headers?.['x-model-fetch-token'];
	console.log('  X-Model-Fetch-Token header:', tokenHeader ? `${tokenHeader.substring(0, 10)}...` : '(none)');

	if (!tokenHeader) {
		console.log('[Auth] No X-Model-Fetch-Token header provided');
		return {
			error: 'Unauthorized: X-Model-Fetch-Token header required',
			code: 'UNAUTHORIZED'
		};
	}

	// Verify token matches
	console.log('  Comparing tokens:');
	console.log('    Received:', tokenHeader ? `${tokenHeader.substring(0, 10)}...` : '(none)');
	console.log('    Required:', requiredToken ? `${requiredToken.substring(0, 10)}...` : '(none)');
	console.log('    Match:', tokenHeader === requiredToken);

	if (tokenHeader !== requiredToken) {
		console.log('[Auth] Token mismatch, rejecting');
		return {
			error: 'invalid token',
			code: 'UNAUTHORIZED'
		};
	}

	// Token is valid
	console.log('[Auth] Token valid, allowing request');
	return null;
}
