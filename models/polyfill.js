/**
 * Polyfill for deprecated util.isNullOrUndefined() function
 * This function was removed in Node.js 18+ but is still referenced by older TensorFlow.js packages
 */
import util from 'util';

// Add the deprecated function back if it doesn't exist
if (typeof util.isNullOrUndefined !== 'function') {
	util.isNullOrUndefined = function (arg) {
		return arg === null || arg === undefined;
	};
}
