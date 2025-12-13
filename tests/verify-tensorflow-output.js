#!/usr/bin/env node
/**
 * Verification script for TensorFlow.js output format change
 *
 * Verifies that TensorFlow.js backend now returns both 'embeddings' and 'embedding'
 * fields to match other backends (Onnx, Transformers, Ollama).
 *
 * Usage: node tests/verify-tensorflow-output.js
 */

import { TensorFlowBackend } from '../src/core/backends/TensorFlow.js';

async function verifyOutputFormat() {
	console.log('Verifying TensorFlow.js output format...\n');

	const backend = new TensorFlowBackend();

	try {
		// Load model
		console.log('1. Loading Universal Sentence Encoder...');
		await backend.loadModel('test:v1', 'universal-sentence-encoder');
		console.log('   ✓ Model loaded\n');

		// Generate embedding
		console.log('2. Generating embedding...');
		const result = await backend.predict('test:v1', {
			texts: ['Test sentence for verification'],
		});
		console.log('   ✓ Embedding generated\n');

		// Verify format
		console.log('3. Verifying output format:');

		// Check embeddings field
		if (!result.embeddings) {
			throw new Error('Missing "embeddings" field');
		}
		console.log('   ✓ Has "embeddings" field');

		if (!Array.isArray(result.embeddings)) {
			throw new Error('"embeddings" is not an array');
		}
		console.log('   ✓ "embeddings" is array');

		// Check embedding field (new)
		if (!result.embedding) {
			throw new Error('Missing "embedding" field (BREAKING CHANGE NOT APPLIED)');
		}
		console.log('   ✓ Has "embedding" field');

		if (!Array.isArray(result.embedding)) {
			throw new Error('"embedding" is not an array');
		}
		console.log('   ✓ "embedding" is array');

		// Verify consistency
		if (result.embeddings[0] !== result.embedding) {
			throw new Error('embeddings[0] !== embedding (inconsistent)');
		}
		console.log('   ✓ embeddings[0] === embedding');

		// Verify dimension
		if (result.embedding.length !== 512) {
			throw new Error(`Expected 512 dimensions, got ${result.embedding.length}`);
		}
		console.log('   ✓ Correct dimension (512)\n');

		console.log('✓ TensorFlow.js output format verification PASSED\n');
		console.log('Format matches Onnx, Transformers, and Ollama backends.');

		process.exit(0);
	} catch (error) {
		console.error('\n✗ Verification FAILED:', error.message);
		process.exit(1);
	} finally {
		await backend.cleanup();
	}
}

verifyOutputFormat();
