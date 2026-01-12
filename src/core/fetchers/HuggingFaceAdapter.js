/**
 * HuggingFace Hub Source Adapter
 *
 * Downloads models from HuggingFace Hub with support for:
 * - Single-file ONNX models
 * - Multi-file Transformers.js models (default and quantized variants)
 * - Model card and config metadata inference
 */

import { BaseSourceAdapter } from './BaseSourceAdapter.js';
import { UnsupportedFrameworkError, ModelNotFoundError, NetworkError } from '../errors/ModelFetchErrors.js';

export class HuggingFaceAdapter extends BaseSourceAdapter {
	constructor() {
		super('HuggingFaceAdapter');
		this.baseUrl = 'https://huggingface.co';
	}

	async detectFramework(sourceReference, variant = null) {
		// Check if fetch is available
		console.log('[HuggingFaceAdapter] typeof fetch:', typeof fetch);
		console.log('[HuggingFaceAdapter] typeof global.fetch:', typeof global.fetch);
		console.log('[HuggingFaceAdapter] typeof globalThis.fetch:', typeof globalThis.fetch);

		if (typeof fetch === 'undefined') {
			throw new NetworkError('fetch is not available in this environment');
		}

		// Check for Transformers.js model files
		const transformersFiles = [
			'onnx/model.onnx',
			'onnx/model_quantized.onnx',
			'tokenizer.json'
		];

		const errors = [];
		for (const file of transformersFiles) {
			const url = `${this.baseUrl}/${sourceReference}/resolve/main/${file}`;
			try {
				const response = await fetch(url, { method: 'HEAD' });
				if (response && response.ok) {
					return 'transformers';
				}
			} catch (error) {
				// Continue checking other files
				errors.push(`${file}: ${error.message}`);
				console.warn(`[HuggingFaceAdapter] Error checking ${file}:`, error.message);
			}
		}

		// If we got here, no files were found
		if (errors.length > 0) {
			throw new NetworkError(`Failed to check HuggingFace files: ${errors.join('; ')}`);
		}
		throw new UnsupportedFrameworkError('Cannot detect framework from HuggingFace model. Only Transformers.js models are currently supported.');
	}

	async listVariants(sourceReference) {
		const variants = [];

		// Check for default (full precision) model
		const defaultUrl = `${this.baseUrl}/${sourceReference}/resolve/main/onnx/model.onnx`;
		try {
			const response = await fetch(defaultUrl, { method: 'HEAD' });
			if (response && response.ok && response.headers) {
				const contentLength = response.headers.get('content-length');
				const size = contentLength ? parseInt(contentLength, 10) : 0;

				variants.push({
					name: 'default',
					files: ['onnx/model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json'],
					totalSize: size,
					precision: 'fp32'
				});
			}
		} catch (error) {
			// Default variant doesn't exist, continue
			console.warn('[HuggingFaceAdapter] Error checking default variant:', error.message);
		}

		// Check for quantized model
		const quantizedUrl = `${this.baseUrl}/${sourceReference}/resolve/main/onnx/model_quantized.onnx`;
		try {
			const response = await fetch(quantizedUrl, { method: 'HEAD' });
			if (response && response.ok && response.headers) {
				const contentLength = response.headers.get('content-length');
				const size = contentLength ? parseInt(contentLength, 10) : 0;

				variants.push({
					name: 'quantized',
					files: ['onnx/model_quantized.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json'],
					totalSize: size,
					precision: 'int8'
				});
			}
		} catch (error) {
			// Quantized variant doesn't exist, continue
			console.warn('[HuggingFaceAdapter] Error checking quantized variant:', error.message);
		}

		if (variants.length === 0) {
			throw new ModelNotFoundError(`No ONNX models found for ${sourceReference}`);
		}

		return variants;
	}

	async download(sourceReference, variant, onProgress) {
		// Determine which files to download based on variant
		const modelFile = variant === 'quantized' ? 'onnx/model_quantized.onnx' : 'onnx/model.onnx';
		const files = [
			modelFile,
			'tokenizer.json',
			'tokenizer_config.json',
			'config.json'
		];

		// Download all files
		const downloadedFiles = {};
		let totalDownloaded = 0;
		let totalSize = 0;

		// First, get total size
		for (const file of files) {
			const url = `${this.baseUrl}/${sourceReference}/resolve/main/${file}`;
			try {
				const response = await fetch(url, { method: 'HEAD' });
				if (response && response.ok && response.headers) {
					const contentLength = response.headers.get('content-length');
					if (contentLength) {
						totalSize += parseInt(contentLength, 10);
					}
				}
			} catch (error) {
				// Skip files that don't exist
				console.warn(`[HuggingFaceAdapter] Error getting size for ${file}:`, error.message);
			}
		}

		// Download each file
		for (const file of files) {
			const url = `${this.baseUrl}/${sourceReference}/resolve/main/${file}`;

			try {
				const response = await fetch(url);

				if (!response.ok) {
					if (response.status === 404) {
						// Some files are optional, skip them
						console.warn(`[HuggingFaceAdapter] File not found: ${file}`);
						continue;
					}
					throw new NetworkError(`Failed to download ${file}: ${response.status}`);
				}

				// Read response body
				const chunks = [];
				const reader = response.body.getReader();

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						chunks.push(value);
						totalDownloaded += value.length;

						// Report progress
						if (onProgress) {
							onProgress(totalDownloaded, totalSize || totalDownloaded);
						}
					}
				} finally {
					reader.releaseLock();
				}

				const buffer = Buffer.concat(chunks);
				downloadedFiles[file] = buffer.toString('base64');
			} catch (error) {
				if (error instanceof NetworkError) {
					throw error;
				}
				throw new NetworkError(`Failed to download ${file}: ${error.message}`);
			}
		}

		// Package files into single blob (JSON with base64-encoded files)
		const packagedBlob = JSON.stringify({
			type: 'transformers-js',
			variant: variant || 'default',
			files: downloadedFiles
		});

		return Buffer.from(packagedBlob);
	}

	async inferMetadata(sourceReference, variant = null) {
		const metadata = {
			description: '',
			tags: ['transformers', 'huggingface'],
			sourceModel: sourceReference
		};

		// Try to fetch model card (README.md)
		try {
			const readmeUrl = `${this.baseUrl}/${sourceReference}/raw/main/README.md`;
			const response = await fetch(readmeUrl);

			if (response.ok) {
				const content = await response.text();

				// Extract first paragraph as description
				const lines = content.split('\n');
				for (const line of lines) {
					if (line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
						metadata.description = line.trim();
						break;
					}
				}
			}
		} catch (error) {
			console.warn('[HuggingFaceAdapter] Could not fetch model card:', error.message);
		}

		// Try to fetch config.json for additional metadata
		try {
			const configUrl = `${this.baseUrl}/${sourceReference}/raw/main/config.json`;
			const response = await fetch(configUrl);

			if (response.ok) {
				const config = await response.json();

				// Extract task type from architectures
				if (config.architectures && config.architectures.length > 0) {
					const arch = config.architectures[0].toLowerCase();

					if (arch.includes('classification')) {
						metadata.taskType = 'text-classification';
					} else if (arch.includes('embedding') || arch.includes('encoder')) {
						metadata.taskType = 'text-embedding';
					} else if (arch.includes('generation') || arch.includes('lm')) {
						metadata.taskType = 'text-generation';
					}
				}

				// Extract hidden size for embeddings
				if (config.hidden_size) {
					metadata.outputDimensions = [config.hidden_size];
				}
			}
		} catch (error) {
			console.warn('[HuggingFaceAdapter] Could not fetch config:', error.message);
		}

		return metadata;
	}
}
