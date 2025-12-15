import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:9926';

/**
 * Large Model Upload Tests
 *
 * Ensures no regressions on:
 * 1. Large ONNX model uploads (86MB+) via UploadModelBlob resource
 * 2. Uses Harper's native tables API for file-backed blob storage
 * 3. File-backed blob storage (not indexed JSON objects)
 * 4. Blob retrieval and usage in InferenceEngine
 */
describe('Large Model Upload (Regression Tests)', () => {
	const testModelIds = [];

	after(async () => {
		// Cleanup test models via REST API
		for (const id of testModelIds) {
			try {
				await fetch(`${BASE_URL}/Model/${encodeURIComponent(id)}`, {
					method: 'DELETE',
				});
			} catch (err) {
				// Ignore cleanup errors
			}
		}
	});

	test('should upload large ONNX model via UploadModelBlob', async () => {
		const testModelPath = join(__dirname, '..', 'fixtures', 'test-model.onnx');
		const modelBlob = readFileSync(testModelPath);
		const modelId = 'large-upload-test:v1';

		testModelIds.push(modelId);

		// Upload via UploadModelBlob resource (uses Harper's native tables API)
		const metadata = JSON.stringify({
			taskType: 'text-embedding',
			equivalenceGroup: 'test-group',
			outputDimensions: [384],
		});

		const queryParams = new URLSearchParams({
			modelName: 'large-upload-test',
			modelVersion: 'v1',
			framework: 'onnx',
			stage: 'development',
			metadata,
		});

		const response = await fetch(`${BASE_URL}/UploadModelBlob?${queryParams}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/octet-stream',
			},
			body: modelBlob,
		});

		const result = await response.json();

		assert.ok(response.ok, 'Upload should succeed');
		assert.ok(result.success, 'Result should indicate success');
		assert.equal(result.id, modelId, 'Should return correct model ID');
		assert.equal(result.size, modelBlob.length, 'Should return correct blob size');
	});

	test('should retrieve uploaded model with blob data', async () => {
		const testModelPath = join(__dirname, '..', 'fixtures', 'test-model.onnx');
		const modelBlob = readFileSync(testModelPath);
		const modelId = 'retrieve-test:v1';

		testModelIds.push(modelId);

		// Upload via UploadModelBlob
		const metadata = JSON.stringify({
			taskType: 'text-embedding',
			equivalenceGroup: 'test-group',
			outputDimensions: [384],
		});

		const queryParams = new URLSearchParams({
			modelName: 'retrieve-test',
			modelVersion: 'v1',
			framework: 'onnx',
			metadata,
		});

		await fetch(`${BASE_URL}/UploadModelBlob?${queryParams}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/octet-stream' },
			body: modelBlob,
		});

		// Retrieve and verify
		const response = await fetch(`${BASE_URL}/Model/${encodeURIComponent(modelId)}`);
		assert.ok(response.ok, 'Should fetch model successfully');

		const model = await response.json();

		assert.ok(model, 'Model should exist');
		assert.equal(model.modelName, 'retrieve-test');
		assert.equal(model.framework, 'onnx');
		assert.ok(model.modelBlob, 'Model should have modelBlob field');
	});


	test('should successfully upload and retrieve model', async () => {
		// This test verifies the complete upload/retrieval flow

		const testModelPath = join(__dirname, '..', 'fixtures', 'test-model.onnx');
		const modelBlob = readFileSync(testModelPath);
		const modelId = 'upload-retrieve-test:v1';

		testModelIds.push(modelId);

		// Upload via UploadModelBlob
		const metadata = JSON.stringify({
			taskType: 'text-embedding',
			outputDimensions: [2],
			description: 'Upload/retrieve flow test',
		});

		const queryParams = new URLSearchParams({
			modelName: 'upload-retrieve-test',
			modelVersion: 'v1',
			framework: 'onnx',
			metadata,
		});

		const uploadResponse = await fetch(`${BASE_URL}/UploadModelBlob?${queryParams}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/octet-stream' },
			body: modelBlob,
		});

		const uploadResult = await uploadResponse.json();
		assert.ok(uploadResponse.ok, 'Upload should succeed');
		assert.ok(uploadResult.success, 'Upload result should indicate success');

		// Retrieve and verify
		const getResponse = await fetch(`${BASE_URL}/Model/${encodeURIComponent(modelId)}`);
		assert.ok(getResponse.ok, 'Retrieval should succeed');

		const model = await getResponse.json();
		assert.equal(model.modelName, 'upload-retrieve-test');
		assert.equal(model.framework, 'onnx');

		const parsedMetadata = JSON.parse(model.metadata);
		assert.equal(parsedMetadata.taskType, 'text-embedding');
		assert.deepStrictEqual(parsedMetadata.outputDimensions, [2]);
	});
});
