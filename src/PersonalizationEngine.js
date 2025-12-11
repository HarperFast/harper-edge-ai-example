/**
 * Simplified PersonalizationEngine - Universal Sentence Encoder only
 * Single-tenant, single-model implementation for Harper Edge AI
 *
 * Now uses TensorFlowBackend for model loading and inference.
 * The backend abstracts away the TensorFlow.js implementation details.
 *
 * TODO: Future refactoring to integrate with InferenceEngine + ModelRegistry
 * This would enable:
 * 1. Load Universal Sentence Encoder into ModelRegistry (support both TF.js and ONNX versions)
 * 2. Use InferenceEngine for framework-agnostic inference
 * 3. Support swapping between TensorFlow.js and ONNX implementations without code changes
 * 4. Enable performance comparison between different backend implementations
 * 5. Migrate embedding cache to shared FeatureStore
 * 6. Integrate with MonitoringBackend for inference tracking
 *
 * Current implementation is a thin wrapper over TensorFlowBackend, which works well for MVP.
 */

import { TensorFlowBackend } from './core/backends/TensorFlow.js';

export class PersonalizationEngine {
	constructor(options = {}) {
		this.options = options;
		this.backend = new TensorFlowBackend();
		this.modelKey = 'personalization-use';
		this.initialized = false;
		this.stats = {
			inferences: 0,
			averageLatency: 0,
			errors: 0,
		};
	}

	async initialize() {
		console.log('Initializing PersonalizationEngine with Universal Sentence Encoder...');

		try {
			await this.backend.loadModel(this.modelKey, 'universal-sentence-encoder');
			this.initialized = true;
			console.log('Universal Sentence Encoder loaded successfully');
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
			// Use backend to generate embeddings
			const result = await this.backend.predict(this.modelKey, { texts });
			const embeddingData = result.embeddings;

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
			const productTexts = products.map((p) => `${p.name || ''} ${p.description || ''} ${p.category || ''}`);

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
		return this.initialized && this.model !== null;
	}

	getStats() {
		return { ...this.stats };
	}

	getLoadedModels() {
		return [
			{
				name: 'universal-sentence-encoder',
				loaded: this.initialized,
				status: this.isReady() ? 'ready' : 'not loaded',
			},
		];
	}
}
