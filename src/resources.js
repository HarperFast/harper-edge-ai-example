/**
 * Harper Edge AI - Product Personalization using Universal Sentence Encoder
 */

import { PersonalizationEngine } from './PersonalizationEngine.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize personalization engine (shared across requests)
let personalizationEngine = null;

async function getPersonalizationEngine() {
	if (!personalizationEngine) {
		personalizationEngine = new PersonalizationEngine();
		await personalizationEngine.initialize();
	}
	return personalizationEngine;
}

/**
 * Main resource for product personalization
 */
export class Personalize extends Resource {
	/**
	 * Personalize product recommendations using Universal Sentence Encoder
	 */
	async post(data) {
		const requestId = uuidv4();
		const startTime = Date.now();

		try {
			const { products, userContext } = data;

			if (!products || !Array.isArray(products)) {
				return {
					error: 'Missing or invalid products array',
					requestId,
				};
			}

			// Get AI engine
			const engine = await getPersonalizationEngine();

			if (!engine.isReady()) {
				return {
					error: 'AI engine not ready',
					requestId,
				};
			}

			// Enhance products with personalization
			const enhancedProducts = await engine.enhanceProducts(products, userContext || {});

			// Sort by personalized score
			const sortedProducts = enhancedProducts.sort((a, b) => (b.personalizedScore || 0) - (a.personalizedScore || 0));

			return {
				requestId,
				products: sortedProducts,
				personalized: true,
				model: 'universal-sentence-encoder',
				responseTime: Date.now() - startTime,
			};
		} catch (error) {
			console.error('Personalization failed:', error);
			return {
				error: error.message,
				requestId,
			};
		}
	}
}

/**
 * Health check resource
 */
export class Status extends Resource {
	async get() {
		try {
			const engine = await getPersonalizationEngine();
			const models = engine.getLoadedModels();
			const stats = engine.getStats();

			return {
				status: engine.isReady() ? 'healthy' : 'initializing',
				models,
				stats,
				uptime: process.uptime(),
				memory: process.memoryUsage(),
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				error: error.message,
			};
		}
	}
}
