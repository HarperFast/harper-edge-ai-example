import { describe, it, before } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

describe('Predict API Integration Tests', () => {
	before(async () => {
		// Verify Harper is running
		const response = await fetch(`${BASE_URL}/Status`);
		assert.ok(response.ok, 'Harper should be running');
	});

	it('should return error for missing parameters', async () => {
		const response = await fetch(`${BASE_URL}/Predict`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});

		const result = await response.json();
		assert.ok(result.error, 'Should return error');
		assert.match(result.error, /modelName.*features.*required/i);
	});

	it('should return error for non-existent model', async () => {
		const response = await fetch(`${BASE_URL}/Predict`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				modelName: 'nonexistent-model',
				modelVersion: 'v1',
				features: { texts: ['test'] },
			}),
		});

		const result = await response.json();
		assert.ok(result.error, 'Should return error');
		assert.match(result.error, /not found/i);
	});

	it('should successfully predict with ONNX model', async () => {
		const response = await fetch(`${BASE_URL}/Predict`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				modelName: 'all-MiniLM-L6-v2',
				modelVersion: 'v1',
				features: { texts: ['test sentence'] },
			}),
		});

		const result = await response.json();

		if (result.error) {
			console.error('ONNX prediction failed:', result.error);
			// This might fail if model isn't loaded properly
			assert.fail(`ONNX prediction should succeed: ${result.error}`);
		}

		assert.ok(result.inferenceId, 'Should return inference ID');
		assert.ok(result.prediction, 'Should return prediction');
		assert.ok(result.latencyMs !== undefined, 'Should return latency');
	});

	it('should successfully predict with TensorFlow model', async () => {
		const response = await fetch(`${BASE_URL}/Predict`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				modelName: 'universal-sentence-encoder',
				modelVersion: 'v1',
				features: { texts: ['test sentence'] },
			}),
		});

		const result = await response.json();

		if (result.error) {
			console.error('TensorFlow prediction failed:', result.error);
			assert.fail(`TensorFlow prediction should succeed: ${result.error}`);
		}

		assert.ok(result.inferenceId, 'Should return inference ID');
		assert.ok(result.prediction, 'Should return prediction');
	});

	it('should successfully predict with Ollama model', async () => {
		const response = await fetch(`${BASE_URL}/Predict`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				modelName: 'nomic-embed-text',
				modelVersion: 'v1',
				features: { texts: ['test sentence'] },
			}),
		});

		const result = await response.json();

		if (result.error) {
			console.error('Ollama prediction failed:', result.error);
			assert.fail(`Ollama prediction should succeed: ${result.error}`);
		}

		assert.ok(result.inferenceId, 'Should return inference ID');
		assert.ok(result.prediction, 'Should return prediction');
	});
});
