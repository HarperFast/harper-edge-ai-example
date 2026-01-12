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

	// Get authorization header
	const authHeader = request?.headers?.authorization;
	console.log('  Auth header:', authHeader ? `${authHeader.substring(0, 20)}...` : '(none)');

	if (!authHeader) {
		console.log('[Auth] No authorization header provided');
		return {
			error: 'Unauthorized: MODEL_FETCH_TOKEN required',
			code: 'UNAUTHORIZED'
		};
	}

	// Extract token from header (support both "Bearer TOKEN" and plain "TOKEN")
	let token = authHeader;
	if (authHeader.toLowerCase().startsWith('bearer ')) {
		token = authHeader.substring(7); // Remove "Bearer " prefix
		console.log('  Extracted token (Bearer removed):', token ? `${token.substring(0, 10)}...` : '(none)');
	}

	// Verify token matches
	console.log('  Comparing tokens:');
	console.log('    Received:', token ? `${token.substring(0, 10)}...` : '(none)');
	console.log('    Required:', requiredToken ? `${requiredToken.substring(0, 10)}...` : '(none)');
	console.log('    Match:', token === requiredToken);

	if (token !== requiredToken) {
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
