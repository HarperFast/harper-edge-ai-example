import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { getTestOnnxModel } from '../fixtures/test-models.js';
import { setupInferenceEngine, cleanupModels } from '../helpers/setup.js';
import { createRestTable } from '../helpers/rest-api.js';

describe('InferenceEngine', () => {
	let engine;
	let modelsTable;

	before(async () => {
		engine = await setupInferenceEngine();
		modelsTable = createRestTable('Model');
	});

	after(async () => {
		await cleanupModels(['test-onnx-inference:v1']);
		await engine.cleanup();
	});

	test('should load and cache ONNX model', async () => {
		// Register a test ONNX model using REST API
		const modelBlob = await getTestOnnxModel();
		const modelKey = 'test-onnx-inference:v1';

		const modelRecord = await modelsTable.put({
			modelName: 'test-onnx-inference',
			modelVersion: 'v1',
			framework: 'onnx',
			modelBlob,
			inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
			outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
			metadata: '{}',
			stage: 'development',
			uploadedAt: Date.now(),
		});

		// Load model (fetch it first, then load)
		const fetchedModel = await modelsTable.get(modelKey);
		const loaded = await engine.loadModel('test-onnx-inference', 'v1', fetchedModel);

		assert.ok(loaded);
		assert.strictEqual(loaded.modelName, 'test-onnx-inference');
		assert.strictEqual(loaded.framework, 'onnx');

		// Verify it's cached
		const cached = engine.isCached('test-onnx-inference', 'v1');
		assert.strictEqual(cached, true);
	});

	test('should run inference with ONNX model', async () => {
		// Simple inference test with test-model.onnx (expects rank 4: [batch, channel, height, width])
		// Input3 shape: [1, 1, 28, 28] - typical image input
		const inputSize = 1 * 1 * 28 * 28; // 784 floats
		const inputData = new Float32Array(inputSize).fill(0.5);

		// Fetch model record in case it's not cached
		const modelKey = 'test-onnx-inference:v1';
		const modelRecord = await modelsTable.get(modelKey);

		// Use Input3 as the model expects (based on test-model.onnx)
		// Pass with explicit shape to get rank 4 tensor
		const result = await engine.predict('test-onnx-inference', {
			Input3: { data: inputData, shape: [1, 1, 28, 28] },
		}, 'v1', modelRecord);

		assert.ok(result);
		// ONNX models return outputs by tensor name, not a generic "output" field
		// The test model likely has specific output tensor names
		assert.ok(typeof result === 'object');
		// Verify at least one output exists
		const outputKeys = Object.keys(result);
		assert.ok(outputKeys.length > 0, 'Should have at least one output tensor');
	});

	test('should select correct backend based on framework', async () => {
		const backend = engine.getBackend('onnx');
		assert.strictEqual(backend.name, 'OnnxBackend');

		const tfBackend = engine.getBackend('tensorflow');
		assert.strictEqual(tfBackend.name, 'TensorFlowBackend');
	});
});
