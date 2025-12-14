/**
 * PersonalizationEngine - Product personalization using embeddings
 *
 * Uses InferenceEngine for backend-agnostic predictions
 * - Supports ONNX, TensorFlow, and Ollama models
 * - Enable model selection at runtime
 *
 * Example:
 *   const engine = new PersonalizationEngine({
 *     inferenceEngine: inferenceEngineInstance,
 *     modelName: 'universal-sentence-encoder',
 *     modelVersion: 'v1'
 *   });
 */

export class PersonalizationEngine {
	constructor(options) {
		if (!options?.inferenceEngine) {
			throw new Error(
				'PersonalizationEngine requires inferenceEngine. ' +
					'Usage: new PersonalizationEngine({ inferenceEngine, modelName, modelVersion })'
			);
		}

		this.inferenceEngine = options.inferenceEngine;
		this.modelName = options.modelName || 'universal-sentence-encoder';
		this.modelVersion = options.modelVersion || 'v1';

		this.initialized = false;
		this.stats = {
			inferences: 0,
			averageLatency: 0,
			errors: 0,
		};
	}

	async initialize() {
		console.log('Initializing PersonalizationEngine...');

		try {
			// No model loading needed, InferenceEngine handles it
			console.log(`PersonalizationEngine ready (model: ${this.modelName}:${this.modelVersion})`);
			this.initialized = true;
			return true;
		} catch (error) {
			console.error('Failed to initialize PersonalizationEngine:', error);
			throw error;
		}
	}

	/**
	 * Calculate similarity between product descriptions and user preferences
	 */
	async calculateSimilarity(texts) {
		if (!this.initialized || texts.length < 2) {
			return [];
		}

		const startTime = Date.now();

		try {
			// Use InferenceEngine for predictions
			const embeddingData = await this.inferenceEngine.predict(this.modelName, { texts }, this.modelVersion);

			// Calculate cosine similarity between first text (query) and others
			const queryEmbedding = embeddingData[0];
			const similarities = embeddingData.slice(1).map((embedding) => this.cosineSimilarity(queryEmbedding, embedding));

			this.recordMetrics(Date.now() - startTime, true);

			return similarities;
		} catch (error) {
			console.error('Similarity calculation failed:', error);
			this.recordMetrics(Date.now() - startTime, false);
			return [];
		}
	}

	cosineSimilarity(a, b) {
		const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
		const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
		const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
		return dotProduct / (magnitudeA * magnitudeB);
	}

	/**
	 * Enhance products with personalized scores based on user context
	 */
	async enhanceProducts(products, userContext) {
		if (!products || products.length === 0) return products;

		try {
			// Build query from user context
			const userQuery = this.buildUserQuery(userContext);

			// Get product descriptions
			const productTexts = products.map((p) => `${p.name || ''} ${p.description || ''} ${p.category || ''}`.trim());

			// Calculate similarities
			const texts = [userQuery, ...productTexts];
			const similarities = await this.calculateSimilarity(texts);

			// Add similarity scores to products
			return products.map((product, idx) => ({
				...product,
				personalizedScore: similarities[idx] || 0,
				personalized: true,
			}));
		} catch (error) {
			console.error('Product enhancement failed:', error);
			return products;
		}
	}

	buildUserQuery(userContext) {
		const parts = [];

		if (userContext.activityType) {
			parts.push(userContext.activityType);
		}
		if (userContext.experienceLevel) {
			parts.push(userContext.experienceLevel);
		}
		if (userContext.season) {
			parts.push(userContext.season);
		}
		if (userContext.location) {
			parts.push(userContext.location);
		}

		return parts.length > 0 ? parts.join(' ') : 'outdoor gear';
	}

	recordMetrics(latency, success) {
		this.stats.inferences++;
		this.stats.averageLatency =
			(this.stats.averageLatency * (this.stats.inferences - 1) + latency) / this.stats.inferences;

		if (!success) {
			this.stats.errors++;
		}
	}

	// Public API
	isReady() {
		return this.initialized;
	}

	getStats() {
		return { ...this.stats };
	}

	getLoadedModels() {
		return [
			{
				name: `${this.modelName}:${this.modelVersion}`,
				loaded: this.initialized,
				status: this.isReady() ? 'ready' : 'not loaded',
				mode: 'inference-engine',
			},
		];
	}
}
