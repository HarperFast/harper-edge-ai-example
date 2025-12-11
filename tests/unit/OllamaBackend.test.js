import { describe, test, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { OllamaBackend } from '../../src/core/backends/Ollama.js';

describe('OllamaBackend', () => {
  let backend;
  let originalFetch;

  before(() => {
    backend = new OllamaBackend();
    // Save original fetch
    originalFetch = global.fetch;
  });

  after(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('loadModel', () => {
    test('should load model with string model name', async () => {
      const result = await backend.loadModel('test-chat', 'llama2');

      assert.ok(result.loaded);
      assert.strictEqual(result.modelName, 'llama2');
      assert.strictEqual(result.mode, 'chat');
      assert.ok(backend.isLoaded('test-chat'));
    });

    test('should load model with JSON config', async () => {
      const config = JSON.stringify({
        modelName: 'mistral',
        mode: 'embeddings'
      });

      const result = await backend.loadModel('test-embed', config);

      assert.ok(result.loaded);
      assert.strictEqual(result.modelName, 'mistral');
      assert.strictEqual(result.mode, 'embeddings');
      assert.deepStrictEqual(result.inputNames, ['prompt']);
      assert.deepStrictEqual(result.outputNames, ['embeddings']);
    });

    test('should load model with Buffer', async () => {
      const config = Buffer.from('llama2');

      const result = await backend.loadModel('test-buffer', config);

      assert.ok(result.loaded);
      assert.strictEqual(result.modelName, 'llama2');
    });

    test('should load model with object config', async () => {
      const config = {
        modelName: 'codellama',
        mode: 'chat'
      };

      const result = await backend.loadModel('test-object', config);

      assert.ok(result.loaded);
      assert.strictEqual(result.modelName, 'codellama');
      assert.strictEqual(result.mode, 'chat');
    });

    test('should default to chat mode if not specified', async () => {
      const result = await backend.loadModel('test-default', 'llama2');

      assert.strictEqual(result.mode, 'chat');
    });
  });

  describe('predict - chat mode', () => {
    test('should generate chat completion with messages array', async () => {
      // Mock fetch for chat API
      global.fetch = mock.fn(async (url, options) => {
        assert.strictEqual(url, 'http://localhost:11434/api/chat');
        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'llama2');
        assert.strictEqual(body.stream, false);
        assert.ok(Array.isArray(body.messages));

        return {
          ok: true,
          json: async () => ({
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?'
            },
            done: true,
            total_duration: 1000000,
            load_duration: 500000,
            prompt_eval_count: 10,
            eval_count: 15
          })
        };
      });

      await backend.loadModel('chat-model', 'llama2');

      const result = await backend.predict('chat-model', {
        messages: [
          { role: 'user', content: 'Hello!' }
        ]
      });

      assert.strictEqual(result.response, 'Hello! How can I help you?');
      assert.ok(result.done);
      assert.ok(result.message);
      assert.strictEqual(global.fetch.mock.calls.length, 1);
    });

    test('should generate chat completion with simple prompt', async () => {
      global.fetch = mock.fn(async (url, options) => {
        const body = JSON.parse(options.body);
        // Should convert prompt to messages array
        assert.ok(Array.isArray(body.messages));
        assert.strictEqual(body.messages[0].role, 'user');
        assert.strictEqual(body.messages[0].content, 'Tell me a joke');

        return {
          ok: true,
          json: async () => ({
            message: {
              role: 'assistant',
              content: 'Why did the chicken cross the road?'
            },
            done: true
          })
        };
      });

      await backend.loadModel('chat-model2', 'llama2');

      const result = await backend.predict('chat-model2', {
        prompt: 'Tell me a joke'
      });

      assert.strictEqual(result.response, 'Why did the chicken cross the road?');
    });

    test('should handle chat API errors', async () => {
      global.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      }));

      await backend.loadModel('error-model', 'llama2');

      await assert.rejects(
        async () => backend.predict('error-model', { prompt: 'test' }),
        /Ollama API error: 500/
      );
    });

    test('should throw error if no prompt or messages provided', async () => {
      await backend.loadModel('empty-model', 'llama2');

      await assert.rejects(
        async () => backend.predict('empty-model', {}),
        /Chat mode requires either "messages" array or "prompt" string/
      );
    });
  });

  describe('predict - embeddings mode', () => {
    test('should generate embeddings', async () => {
      global.fetch = mock.fn(async (url, options) => {
        assert.strictEqual(url, 'http://localhost:11434/api/embeddings');
        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'llama2');
        assert.strictEqual(body.prompt, 'Hello world');

        return {
          ok: true,
          json: async () => ({
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
          })
        };
      });

      await backend.loadModel('embed-model', JSON.stringify({
        modelName: 'llama2',
        mode: 'embeddings'
      }));

      const result = await backend.predict('embed-model', {
        prompt: 'Hello world'
      });

      assert.ok(Array.isArray(result.embeddings));
      assert.strictEqual(result.embeddings.length, 5);
      assert.strictEqual(result.embeddings[0], 0.1);
      assert.strictEqual(global.fetch.mock.calls.length, 1);
    });

    test('should support text field for embeddings', async () => {
      global.fetch = mock.fn(async (url, options) => {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.prompt, 'Test text');

        return {
          ok: true,
          json: async () => ({
            embedding: [0.1, 0.2]
          })
        };
      });

      await backend.loadModel('embed-model2', JSON.stringify({
        modelName: 'llama2',
        mode: 'embeddings'
      }));

      const result = await backend.predict('embed-model2', {
        text: 'Test text'
      });

      assert.ok(result.embeddings);
    });

    test('should handle embeddings API errors', async () => {
      global.fetch = mock.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => 'Model not found'
      }));

      await backend.loadModel('missing-model', JSON.stringify({
        modelName: 'nonexistent',
        mode: 'embeddings'
      }));

      await assert.rejects(
        async () => backend.predict('missing-model', { prompt: 'test' }),
        /Ollama API error: 404/
      );
    });

    test('should throw error if no prompt provided for embeddings', async () => {
      await backend.loadModel('empty-embed', JSON.stringify({
        modelName: 'llama2',
        mode: 'embeddings'
      }));

      await assert.rejects(
        async () => backend.predict('empty-embed', {}),
        /Embeddings mode requires "prompt", "text", or "content" field/
      );
    });
  });

  describe('model management', () => {
    test('should check if model is loaded', async () => {
      assert.strictEqual(backend.isLoaded('nonexistent'), false);

      await backend.loadModel('loaded-model', 'llama2');
      assert.strictEqual(backend.isLoaded('loaded-model'), true);
    });

    test('should unload model', async () => {
      await backend.loadModel('unload-test', 'llama2');
      assert.strictEqual(backend.isLoaded('unload-test'), true);

      await backend.unload('unload-test');
      assert.strictEqual(backend.isLoaded('unload-test'), false);
    });

    test('should cleanup all models', async () => {
      await backend.loadModel('cleanup-1', 'llama2');
      await backend.loadModel('cleanup-2', 'mistral');

      assert.strictEqual(backend.isLoaded('cleanup-1'), true);
      assert.strictEqual(backend.isLoaded('cleanup-2'), true);

      await backend.cleanup();

      assert.strictEqual(backend.isLoaded('cleanup-1'), false);
      assert.strictEqual(backend.isLoaded('cleanup-2'), false);
    });

    test('should throw error when predicting with unloaded model', async () => {
      await assert.rejects(
        async () => backend.predict('never-loaded', { prompt: 'test' }),
        /Model never-loaded not loaded/
      );
    });
  });

  describe('custom base URL', () => {
    test('should use custom base URL', async () => {
      const customBackend = new OllamaBackend('http://custom-host:8080');
      assert.strictEqual(customBackend.baseUrl, 'http://custom-host:8080');

      global.fetch = mock.fn(async (url) => {
        assert.ok(url.startsWith('http://custom-host:8080'));
        return {
          ok: true,
          json: async () => ({
            message: { content: 'response' },
            done: true
          })
        };
      });

      await customBackend.loadModel('custom-test', 'llama2');
      await customBackend.predict('custom-test', { prompt: 'test' });

      assert.strictEqual(global.fetch.mock.calls.length, 1);
    });
  });
});
