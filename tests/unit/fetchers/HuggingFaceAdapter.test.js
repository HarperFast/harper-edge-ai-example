/**
 * HuggingFaceAdapter Unit Tests
 *
 * Tests HuggingFace Hub integration with Transformers.js support.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HuggingFaceAdapter } from '../../../src/core/fetchers/HuggingFaceAdapter.js';

describe('HuggingFaceAdapter', () => {
	let adapter;

	beforeEach(() => {
		adapter = new HuggingFaceAdapter();
	});

	describe('constructor', () => {
		it('should create instance with HuggingFaceAdapter name', () => {
			assert.equal(adapter.name, 'HuggingFaceAdapter');
		});

		it('should set base URL for HuggingFace Hub', () => {
			assert.ok(adapter.baseUrl);
			assert.ok(adapter.baseUrl.includes('huggingface.co'));
		});
	});

	describe('detectFramework', () => {
		it('should detect transformers framework for Transformers.js model', async () => {
			// Mock fetch to return model files list indicating Transformers.js
			global.fetch = async (url) => {
				if (url.includes('/resolve/main')) {
					// Model has onnx/model.onnx and tokenizer.json
					return {
						ok: true,
						status: 200
					};
				}
				return { ok: false, status: 404 };
			};

			const framework = await adapter.detectFramework('Xenova/all-MiniLM-L6-v2');
			assert.equal(framework, 'transformers');
		});
	});

	describe('listVariants', () => {
		it('should list default and quantized variants for Transformers.js model', async () => {
			// Mock fetch to check which files exist
			global.fetch = async (url) => {
				// Both default and quantized models exist
				if (url.includes('/onnx/model.onnx') || url.includes('/onnx/model_quantized.onnx')) {
					return {
						ok: true,
						headers: {
							get: (name) => {
								if (name === 'content-length') return '1000000'; // 1MB
								return null;
							}
						}
					};
				}
				return { ok: false, status: 404 };
			};

			const variants = await adapter.listVariants('Xenova/all-MiniLM-L6-v2');

			assert.ok(Array.isArray(variants));
			assert.ok(variants.length >= 1);
			assert.ok(variants.some(v => v.name === 'default'));
		});
	});
});
