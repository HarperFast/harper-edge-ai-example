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

	// If no token configured, authentication is disabled
	if (!requiredToken) {
		return null; // Allow request
	}

	// Get authorization header
	const authHeader = request?.headers?.authorization;

	if (!authHeader) {
		return {
			error: 'Unauthorized: MODEL_FETCH_TOKEN required',
			code: 'UNAUTHORIZED'
		};
	}

	// Extract token from header (support both "Bearer TOKEN" and plain "TOKEN")
	let token = authHeader;
	if (authHeader.toLowerCase().startsWith('bearer ')) {
		token = authHeader.substring(7); // Remove "Bearer " prefix
	}

	// Verify token matches
	if (token !== requiredToken) {
		return {
			error: 'Unauthorized: Invalid MODEL_FETCH_TOKEN',
			code: 'UNAUTHORIZED'
		};
	}

	// Token is valid
	return null;
}
