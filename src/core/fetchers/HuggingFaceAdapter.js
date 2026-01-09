/**
 * HuggingFace Hub Source Adapter
 *
 * Downloads models from HuggingFace Hub with support for:
 * - Single-file ONNX models
 * - Multi-file Transformers.js models (default and quantized variants)
 * - Model card and config metadata inference
 *
 * TODO: Full implementation
 */

import { BaseSourceAdapter } from './BaseSourceAdapter.js';

export class HuggingFaceAdapter extends BaseSourceAdapter {
	constructor() {
		super('HuggingFaceAdapter');
	}

	async detectFramework(sourceReference, variant = null) {
		throw new Error('HuggingFaceAdapter not yet implemented');
	}

	async listVariants(sourceReference) {
		throw new Error('HuggingFaceAdapter not yet implemented');
	}

	async download(sourceReference, variant, onProgress) {
		throw new Error('HuggingFaceAdapter not yet implemented');
	}

	async inferMetadata(sourceReference, variant = null) {
		throw new Error('HuggingFaceAdapter not yet implemented');
	}
}
