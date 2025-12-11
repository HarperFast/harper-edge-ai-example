/**
 * Harper Edge AI - Product Personalization using Universal Sentence Encoder
 */

import { PersonalizationEngine } from './PersonalizationEngine.js';
import { v4 as uuidv4 } from 'uuid';
import {
	ModelRegistry,
	InferenceEngine,
	FeatureStore,
	MonitoringBackend
} from './core/index.js';

// Initialize personalization engine (shared across requests)
let personalizationEngine = null;

async function getPersonalizationEngine() {
	if (!personalizationEngine) {
		personalizationEngine = new PersonalizationEngine();
		await personalizationEngine.initialize();
	}
	return personalizationEngine;
}

// Initialize shared instances for MLOps components
const modelRegistry = new ModelRegistry();
const featureStore = new FeatureStore();
const monitoringBackend = new MonitoringBackend();
const inferenceEngine = new InferenceEngine(modelRegistry);

// Initialize on module load
(async () => {
	await modelRegistry.initialize();
	await monitoringBackend.initialize();
	await inferenceEngine.initialize();
	console.log('MLOps components initialized');
})();

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



/**
 * Predict resource - POST /predict
 * Run inference with a loaded model
 */
export class Predict extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.predict.bind(this)
		};
	}

	async predict(request) {
		try {
			const data = await request.json();
			const { modelId, version, features, userId, sessionId } = data;

			// Validation
			if (!modelId || !features) {
				return Response.json({
					error: 'modelId and features required'
				}, { status: 400 });
			}

			// Run inference
			const startTime = Date.now();
			const result = await inferenceEngine.predict(modelId, features, version);

			// Record to monitoring
			const inferenceId = await monitoringBackend.recordInference({
				modelId,
				modelVersion: result.modelVersion,
				framework: result.framework,
				requestId: `req-${Date.now()}`,
				userId: userId || null,
				sessionId: sessionId || null,
				featuresIn: JSON.stringify(features),
				prediction: JSON.stringify(result.output),
				confidence: result.confidence || null,
				latencyMs: result.latencyMs
			});

			return Response.json({
				inferenceId,
				prediction: result.output,
				confidence: result.confidence,
				modelVersion: result.modelVersion,
				latencyMs: result.latencyMs
			});

		} catch (error) {
			console.error('Prediction failed:', error);
			return Response.json({
				error: 'Prediction failed',
				details: error.message
			}, { status: 500 });
		}
	}
}


/**
 * Monitoring resource - GET /monitoring/metrics
 * Compute aggregate metrics (use GET /InferenceEvent for raw events)
 */
export class Monitoring extends Resource {
	constructor() {
		super();
		this.rest = {
			metrics: this.getMetrics.bind(this)
		};
	}

	async getMetrics(request) {
		try {
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');

			if (!modelId) {
				return Response.json({
					error: 'modelId parameter required'
				}, { status: 400 });
			}

			// Time range
			let startTime = url.searchParams.get('startTime');
			let endTime = url.searchParams.get('endTime');

			if (startTime) {
				startTime = new Date(parseInt(startTime));
			}
			if (endTime) {
				endTime = new Date(parseInt(endTime));
			}

			const metrics = await monitoringBackend.getMetrics(modelId, {
				startTime,
				endTime
			});

			return Response.json({
				modelId,
				...metrics
			});

		} catch (error) {
			console.error('Get metrics failed:', error);
			return Response.json({
				error: 'Get metrics failed',
				details: error.message
			}, { status: 500 });
		}
	}
}
