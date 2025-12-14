import { parseModelBlob } from '../utils/modelConfig.js';
import { BaseBackend } from './Base.js';

/**
 * Ollama Backend - Local LLM inference via Ollama HTTP API
 *
 * Features:
 * - Chat completion with local LLMs
 * - Text embeddings generation
 * - No external API calls or costs
 * - Support for Llama 2, Mistral, CodeLlama, and more
 *
 * Modes:
 * - embeddings: Generate dense vector representations
 * - chat: Conversational text generation
 *
 * Configuration:
 * - OLLAMA_HOST environment variable (default: http://localhost:11434)
 * - OLLAMA_DEFAULT_MODEL environment variable (default: llama2)
 *
 * Prerequisites:
 * - Ollama must be installed and running
 * - Models must be pulled: `ollama pull llama2`
 *
 * @extends BaseBackend
 * @see {@link https://ollama.ai/} - Ollama documentation
 * @see {@link https://ollama.ai/library} - Available models
 *
 * @example
 * // Embeddings mode
 * const backend = new OllamaBackend();
 * await backend.loadModel('embed:v1', {
 *   modelName: 'nomic-embed-text',
 *   mode: 'embeddings'
 * });
 * const result = await backend.predict('embed:v1', {text: 'hello'});
 *
 * @example
 * // Chat mode
 * await backend.loadModel('chat:v1', {
 *   modelName: 'llama2',
 *   mode: 'chat'
 * });
 * const result = await backend.predict('chat:v1', {
 *   messages: [{role: 'user', content: 'Hello!'}]
 * });
 * console.log(result.response);
 */
export class OllamaBackend extends BaseBackend {
	constructor(baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434') {
		super('OllamaBackend');
		this.baseUrl = baseUrl;
	}

	/**
	 * Load Ollama model (stores model name and validates availability)
	 * @param {string} modelKey - Cache key
	 * @param {string|Buffer|Object} modelBlob - Model name or configuration
	 * @param {Object} modelRecord - Model record from Harper (contains modelId, framework, etc.)
	 * @returns {Object} Loaded model metadata
	 */
	async loadModel(modelKey, modelBlob, modelRecord = null) {
		try {
			// Use shared parsing utility - don't set default mode, let config determine it
			const config = parseModelBlob(modelBlob, {
				primaryKey: 'modelName',
			});

			// Use model name from config, or fall back to modelId from record, then env default
			const modelName = config.modelName || config.model || modelRecord?.modelId || process.env.OLLAMA_DEFAULT_MODEL || 'llama2';
			const mode = config.mode || 'chat'; // Default to chat mode

			// Validate model is available (optional - ping Ollama)
			// For now, just store the config
			this.models.set(modelKey, {
				modelName,
				mode,
				config,
			});

			return {
				loaded: true,
				modelName,
				mode,
				inputNames: mode === 'chat' ? ['messages'] : ['prompt'],
				outputNames: mode === 'chat' ? ['response'] : ['embeddings'],
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
			messages = [
				{
					role: 'user',
					content: inputs.prompt || inputs.content,
				},
			];
		} else {
			throw new Error('Chat mode requires either "messages" array or "prompt" string');
		}

		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: modelName,
				messages,
				stream: false,
			}),
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
			eval_count: result.eval_count,
		};
	}

	/**
	 * Generate embeddings
	 * @private
	 */
	async _generateEmbeddings(modelName, inputs) {
		// Handle different input formats
		let prompt;

		if (inputs.texts && Array.isArray(inputs.texts)) {
			// Handle texts array format (common across backends)
			// For now, process first text (Ollama doesn't support batch embeddings in single call)
			prompt = inputs.texts[0];
		} else if (inputs.prompt) {
			prompt = inputs.prompt;
		} else if (inputs.text) {
			prompt = inputs.text;
		} else if (inputs.content) {
			prompt = inputs.content;
		}

		if (!prompt) {
			throw new Error('Embeddings mode requires "prompt", "text", or "content" field');
		}

		const response = await fetch(`${this.baseUrl}/api/embeddings`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: modelName,
				prompt,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Ollama API error: ${response.status} ${errorText}`);
		}

		const result = await response.json();

		// Return in consistent format
		return {
			embeddings: result.embedding || [], // Raw embedding array
			embedding: result.embedding,
		};
	}

	// isLoaded(), unload(), and cleanup() inherited from BaseBackend
}
