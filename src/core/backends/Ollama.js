import { parseModelBlob } from '../utils/modelConfig.js';
import { BaseBackend } from './Base.js';

/**
 * Ollama Backend - Load and run local LLM models via Ollama HTTP API
 */
export class OllamaBackend extends BaseBackend {
  constructor(baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434') {
    super('OllamaBackend');
    this.baseUrl = baseUrl;
  }

  /**
   * Load Ollama model (stores model name and validates availability)
   * @param {string} modelKey - Cache key
   * @param {string|Buffer} modelBlob - Model name or configuration
   * @returns {Object} Loaded model metadata
   */
  async loadModel(modelKey, modelBlob) {
    try {
      // Use shared parsing utility
      const config = parseModelBlob(modelBlob, {
        primaryKey: 'modelName',
        mode: 'chat'
      });

      const modelName = config.modelName || config.model || process.env.OLLAMA_DEFAULT_MODEL || 'llama2';
      const mode = config.mode || 'chat'; // 'chat' or 'embeddings'

      // Validate model is available (optional - ping Ollama)
      // For now, just store the config
      this.models.set(modelKey, {
        modelName,
        mode,
        config
      });

      return {
        loaded: true,
        modelName,
        mode,
        inputNames: mode === 'chat' ? ['messages'] : ['prompt'],
        outputNames: mode === 'chat' ? ['response'] : ['embeddings']
      };
    } catch (error) {
      console.error('Failed to load Ollama model:', error);
      throw new Error(`Ollama model loading failed: ${error.message}`);
    }
  }

  /**
   * Run inference with Ollama model
   * @param {string} modelKey - Cache key
   * @param {Object} inputs - Input data
   *   For chat mode: { messages: [{role: 'user', content: 'text'}] } or { prompt: 'text' }
   *   For embeddings mode: { prompt: 'text' }
   * @returns {Object} Output from Ollama
   */
  async predict(modelKey, inputs) {
    const modelInfo = this._validateLoaded(modelKey);

    try {
      const { modelName, mode } = modelInfo;

      if (mode === 'embeddings') {
        return await this._generateEmbeddings(modelName, inputs);
      } else {
        return await this._generateChat(modelName, inputs);
      }
    } catch (error) {
      console.error('Ollama inference failed:', error);
      throw new Error(`Ollama inference failed: ${error.message}`);
    }
  }

  /**
   * Generate chat completion
   * @private
   */
  async _generateChat(modelName, inputs) {
    let messages;

    // Support both messages array and simple prompt
    if (inputs.messages) {
      messages = inputs.messages;
    } else if (inputs.prompt || inputs.content) {
      messages = [{
        role: 'user',
        content: inputs.prompt || inputs.content
      }];
    } else {
      throw new Error('Chat mode requires either "messages" array or "prompt" string');
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return {
      response: result.message?.content || '',
      message: result.message,
      done: result.done,
      total_duration: result.total_duration,
      load_duration: result.load_duration,
      prompt_eval_count: result.prompt_eval_count,
      eval_count: result.eval_count
    };
  }

  /**
   * Generate embeddings
   * @private
   */
  async _generateEmbeddings(modelName, inputs) {
    const prompt = inputs.prompt || inputs.text || inputs.content;

    if (!prompt) {
      throw new Error('Embeddings mode requires "prompt", "text", or "content" field');
    }

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        prompt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return {
      embeddings: result.embedding || result.embeddings || [],
      embedding: result.embedding
    };
  }

  // isLoaded(), unload(), and cleanup() inherited from BaseBackend
}
