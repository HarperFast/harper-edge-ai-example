/**
 * Authentication utilities for Model Fetch API
 *
 * Provides token-based authentication using MODEL_FETCH_TOKEN environment variable.
 */

/* global logger */

/**
 * Verify request has valid authentication token
 *
 * @param {Object} data - Harper data object with search params (for GET) or body (for POST)
 * @returns {Object|null} Returns error object if unauthorized, null if authorized
 */
export function verifyModelFetchAuth(data) {
	// Check if authentication is enabled
	const requiredToken = process.env.MODEL_FETCH_TOKEN;

	// If no token configured, authentication is disabled
	if (!requiredToken) {
		return null; // Allow request
	}

	// Get token from query parameter (for GET) or body (for POST)
	let clientToken = null;

	// Try query parameter first (for GET requests)
	if (data?.search) {
		const searchParams = new URLSearchParams(data.search);
		clientToken = searchParams.get('token');
	}

	// Try body field (for POST requests)
	if (!clientToken && data?.token) {
		clientToken = data.token;
	}

	if (!clientToken) {
		return {
			error: 'Unauthorized: token parameter required (query string or body)',
			code: 'UNAUTHORIZED'
		};
	}

	// Verify token matches
	if (clientToken !== requiredToken) {
		return {
			error: 'Unauthorized',
			code: 'UNAUTHORIZED'
		};
	}

	// Token is valid
	return null;
}
