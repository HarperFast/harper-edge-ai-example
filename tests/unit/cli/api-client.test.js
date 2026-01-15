/**
 * Model Fetch API Client Tests
 *
 * Tests for CLI API client utility that wraps Model Fetch REST endpoints.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('ModelFetchClient', () => {
	let originalFetch;
	let fetchCalls;

	beforeEach(() => {
		// Mock global fetch
		fetchCalls = [];
		originalFetch = global.fetch;
		global.fetch = async (url, options) => {
			fetchCalls.push({ url, options });
			return {
				ok: true,
				status: 200,
				json: async () => ({ mocked: true }),
			};
		};
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	describe('constructor', () => {
		it('should create instance with base URL', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			assert.equal(client.baseUrl, 'http://localhost:9926');
		});

		it('should store auth token when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926', 'test-token');

			assert.equal(client.token, 'test-token');
		});

		it('should work without auth token', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			assert.equal(client.token, undefined);
		});
	});

	describe('inspectModel', () => {
		it('should call InspectModel endpoint with query params', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.inspectModel('filesystem', 'test.onnx');

			assert.equal(fetchCalls.length, 1);
			assert.ok(fetchCalls[0].url.includes('/InspectModel'));
			assert.ok(fetchCalls[0].url.includes('source=filesystem'));
			assert.ok(fetchCalls[0].url.includes('sourceReference=test.onnx'));
		});

		it('should include auth token in query params when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926', 'test-token');

			await client.inspectModel('filesystem', 'test.onnx');

			assert.ok(fetchCalls[0].url.includes('token=test-token'));
		});

		it('should include variant parameter when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.inspectModel('huggingface', 'Xenova/model', 'quantized');

			assert.ok(fetchCalls[0].url.includes('variant=quantized'));
		});
	});

	describe('fetchModel', () => {
		it('should call FetchModel endpoint with POST data', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.fetchModel({
				source: 'filesystem',
				sourceReference: 'test.onnx',
				modelName: 'test-model',
				modelVersion: 'v1',
			});

			assert.equal(fetchCalls.length, 1);
			assert.ok(fetchCalls[0].url.includes('/FetchModel'));
			assert.equal(fetchCalls[0].options.method, 'POST');
			assert.equal(fetchCalls[0].options.headers['Content-Type'], 'application/json');
		});

		it('should include auth token in request body when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926', 'test-token');

			await client.fetchModel({
				source: 'filesystem',
				sourceReference: 'test.onnx',
				modelName: 'test-model',
			});

			const body = JSON.parse(fetchCalls[0].options.body);
			assert.equal(body.token, 'test-token');
		});
	});

	describe('getJob', () => {
		it('should call ModelFetchJob endpoint with job ID', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.getJob('job-123');

			assert.equal(fetchCalls.length, 1);
			assert.ok(fetchCalls[0].url.includes('/ModelFetchJob'));
			assert.ok(fetchCalls[0].url.includes('id=job-123'));
		});
	});

	describe('listJobs', () => {
		it('should call ModelFetchJob endpoint without ID', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.listJobs();

			assert.equal(fetchCalls.length, 1);
			assert.ok(fetchCalls[0].url.includes('/ModelFetchJob'));
			assert.ok(!fetchCalls[0].url.includes('id='));
		});

		it('should include status filter when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.listJobs({ status: 'completed' });

			assert.ok(fetchCalls[0].url.includes('status=completed'));
		});

		it('should include modelName filter when provided', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.listJobs({ modelName: 'test-model' });

			assert.ok(fetchCalls[0].url.includes('modelName=test-model'));
		});
	});

	describe('retryJob', () => {
		it('should call ModelFetchJob endpoint with POST and retry action', async () => {
			const { ModelFetchClient } = await import('../../../scripts/lib/model-fetch-client.js');
			const client = new ModelFetchClient('http://localhost:9926');

			await client.retryJob('job-123');

			assert.equal(fetchCalls.length, 1);
			assert.ok(fetchCalls[0].url.includes('/ModelFetchJob'));
			assert.equal(fetchCalls[0].options.method, 'POST');

			const body = JSON.parse(fetchCalls[0].options.body);
			assert.equal(body.jobId, 'job-123');
			assert.equal(body.action, 'retry');
		});
	});
});
