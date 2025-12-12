import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { InferenceEngine } from '../../src/core/InferenceEngine.js';
import { MonitoringBackend } from '../../src/core/MonitoringBackend.js';
import { getTestOnnxModel } from '../fixtures/test-models.js';

describe('End-to-End ONNX Flow', () => {
	let engine;
	let monitoring;
	let modelsTable;
	let eventsTable;
	let inferenceId;

	before(async () => {
		monitoring = new MonitoringBackend();
		await monitoring.initialize();

		engine = new InferenceEngine();
		await engine.initialize();

		// Get Harper table references for direct operations
		modelsTable = tables.get('Model');
		eventsTable = tables.get('InferenceEvent');
	});

	after(async () => {
		// Clean up test data using Harper native API
		try {
			await modelsTable.delete('test-e2e-onnx:v1');
		} catch (err) {
			// Ignore if doesn't exist
		}

		// Clean up inference events
		const testEvents = [];
		for await (const record of eventsTable.search({ modelId: 'test-e2e-onnx' })) {
			testEvents.push(record);
		}
		for (const event of testEvents) {
			await eventsTable.delete(event.id);
		}

		await engine.cleanup();
	});

	test('complete flow: upload → predict → feedback', async () => {
		// 1. Upload model using Harper native table.put()
		const modelBlob = await getTestOnnxModel();
		const modelKey = `test-e2e-onnx:v1`;

		await modelsTable.put({
			id: modelKey,
			modelId: 'test-e2e-onnx',
			version: 'v1',
			framework: 'onnx',
			modelBlob,
			inputSchema: JSON.stringify({ inputs: [{ name: 'data', shape: [1, 2] }] }),
			outputSchema: JSON.stringify({ outputs: [{ name: 'result', shape: [1, 2] }] }),
			metadata: JSON.stringify({ description: 'E2E test model' }),
			stage: 'development',
			uploadedAt: Date.now(),
		});

		// Verify model was stored using Harper native table.get()
		const storedModel = await modelsTable.get(modelKey);
		assert.ok(storedModel);
		assert.strictEqual(storedModel.modelId, 'test-e2e-onnx');
		assert.strictEqual(storedModel.version, 'v1');

		// 2. Run prediction
		const input = new Float32Array([1.0, 2.0]);
		const result = await engine.predict('test-e2e-onnx', { data: input }, 'v1');

		assert.ok(result);
		assert.ok(result.output);
		assert.ok(result.latencyMs > 0);

		// 3. Record inference using recordInference (which uses table.put internally)
		inferenceId = await monitoring.recordInference({
			modelId: 'test-e2e-onnx',
			modelVersion: 'v1',
			framework: 'onnx',
			requestId: 'test-req-1',
			userId: 'test-user',
			sessionId: 'test-session',
			featuresIn: JSON.stringify({ data: Array.from(input) }),
			prediction: JSON.stringify(result.output),
			confidence: 0.95,
			latencyMs: result.latencyMs,
		});

		assert.ok(inferenceId);

		// 4. Query inference events using Harper native table.search()
		const events = [];
		for await (const record of eventsTable.search({ modelId: 'test-e2e-onnx' })) {
			events.push(record);
		}

		assert.ok(Array.isArray(events));
		assert.ok(events.length >= 1);

		const recorded = events.find((e) => e.id === inferenceId);
		assert.ok(recorded);
		assert.strictEqual(recorded.userId, 'test-user');
		assert.strictEqual(recorded.confidence, 0.95);

		// 5. Record feedback using Harper native table.put() (update operation)
		const eventToUpdate = await eventsTable.get(inferenceId);
		await eventsTable.put({
			...eventToUpdate,
			actualOutcome: JSON.stringify({ result: [1.0, 2.0] }),
			correct: true,
			feedbackTimestamp: Date.now(),
		});

		// 6. Verify feedback recorded using Harper native table.get()
		const updatedEvent = await eventsTable.get(inferenceId);
		assert.ok(updatedEvent);
		assert.strictEqual(updatedEvent.correct, true);
		assert.ok(updatedEvent.feedbackTimestamp);
		assert.ok(updatedEvent.actualOutcome);

		// 7. Check metrics using getMetrics (which aggregates using table.search)
		const metrics = await monitoring.getMetrics('test-e2e-onnx');
		assert.ok(metrics);
		assert.ok(metrics.count >= 1);
		assert.ok(metrics.avgLatency > 0);
		assert.strictEqual(metrics.accuracy, 1.0); // 100% since we marked it correct

		console.log('✅ End-to-end ONNX flow completed successfully');
	});
});
