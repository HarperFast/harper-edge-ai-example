import { describe, it, before } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';

describe('Model Management Integration Tests', () => {
	before(async () => {
		// Verify Harper is running
		const response = await fetch(`${BASE_URL}/Status`);
		assert.ok(response.ok, 'Harper should be running');
	});

	it('should list all models', async () => {
		const response = await fetch(`${BASE_URL}/Model/`);
		assert.ok(response.ok, 'Should fetch models successfully');

		const models = await response.json();
		assert.ok(Array.isArray(models), 'Should return array of models');
		assert.ok(models.length > 0, 'Should have at least one model');

		// Check model structure
		const model = models[0];
		assert.ok(model.id, 'Model should have id');
		assert.ok(model.modelName, 'Model should have modelName');
		assert.ok(model.modelVersion, 'Model should have modelVersion');
		assert.ok(model.framework, 'Model should have framework');
		assert.ok(model.modelBlob, 'Model should have modelBlob');
		assert.ok(model.metadata, 'Model should have metadata');
	});

	it('should get specific model by ID', async () => {
		const response = await fetch(`${BASE_URL}/Model/all-MiniLM-L6-v2:v1`);
		assert.ok(response.ok, 'Should fetch model successfully');

		const model = await response.json();
		assert.strictEqual(model.modelName, 'all-MiniLM-L6-v2');
		assert.strictEqual(model.modelVersion, 'v1');
		assert.strictEqual(model.framework, 'onnx');
	});

	it('should return 404 for non-existent model', async () => {
		const response = await fetch(`${BASE_URL}/Model/nonexistent:v1`);
		assert.strictEqual(response.status, 404);
	});

	it('should have valid metadata for all models', async () => {
		const response = await fetch(`${BASE_URL}/Model/`);
		const models = await response.json();

		// Only check production models (skip test models created by tests)
		const productionModels = models.filter(m => m.id && !m.id.startsWith('test-'));

		for (const model of productionModels) {
			// Skip if metadata is not set
			if (!model.metadata || model.metadata === 'undefined') {
				console.warn(`Model ${model.id} has no metadata, skipping`);
				continue;
			}

			const metadata = JSON.parse(model.metadata);
			assert.ok(metadata.taskType, `Model ${model.id} should have taskType`);
			assert.ok(metadata.equivalenceGroup, `Model ${model.id} should have equivalenceGroup`);
			assert.ok(metadata.outputDimensions, `Model ${model.id} should have outputDimensions`);
			// description is optional for some models
			if (metadata.description) {
				assert.ok(typeof metadata.description === 'string', `Model ${model.id} description should be string`);
			}
		}
	});

	it('should have properly encoded modelBlob', async () => {
		const response = await fetch(`${BASE_URL}/Model/`);
		const models = await response.json();

		// Only check production models (skip test models created by tests)
		const productionModels = models.filter(m => m.id && !m.id.startsWith('test-'));

		for (const model of productionModels) {
			// Skip if model doesn't have id or blob
			if (!model.id) {
				console.warn('Skipping model without id');
				continue;
			}

			assert.ok(model.modelBlob, `Model ${model.id} should have modelBlob`);
			assert.ok(typeof model.modelBlob === 'string', `Model ${model.id} modelBlob should be string`);

			// Try to decode base64
			try {
				const decoded = Buffer.from(model.modelBlob, 'base64');
				assert.ok(decoded.length > 0, `Model ${model.id} should have non-empty blob`);
			} catch (error) {
				assert.fail(`Model ${model.id} modelBlob should be valid base64: ${error.message}`);
			}
		}
	});
});
