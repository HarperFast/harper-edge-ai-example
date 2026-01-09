/**
 * HTTP URL Source Adapter
 *
 * Downloads models from HTTP/HTTPS URLs with progress tracking.
 *
 * TODO: Full implementation
 */

import { BaseSourceAdapter } from './BaseSourceAdapter.js';
import { UnsupportedFrameworkError } from '../errors/ModelFetchErrors.js';

export class HttpUrlAdapter extends BaseSourceAdapter {
	constructor() {
		super('HttpUrlAdapter');
	}

	async detectFramework(sourceReference, variant = null) {
		throw new Error('HttpUrlAdapter not yet implemented');
	}

	async listVariants(sourceReference) {
		throw new Error('HttpUrlAdapter not yet implemented');
	}

	async download(sourceReference, variant, onProgress) {
		throw new Error('HttpUrlAdapter not yet implemented');
	}

	async inferMetadata(sourceReference, variant = null) {
		throw new Error('HttpUrlAdapter not yet implemented');
	}
}
