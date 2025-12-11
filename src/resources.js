/**
 * Harper Edge AI - Product Personalization using Universal Sentence Encoder
 */

import { PersonalizationEngine } from './PersonalizationEngine.js';
import { v4 as uuidv4 } from 'uuid';
import {
	InferenceEngine,
	FeatureStore,
	MonitoringBackend,
	BenchmarkEngine
} from './core/index.js';

// Initialize personalization engine (shared across requests)
let personalizationEngine = null;
const personalizationEngineCache = new Map();

async function getPersonalizationEngine(modelId = null, version = null) {
	// New mode: model selection via parameters
	if (modelId && version) {
		const cacheKey = `${modelId}:${version}`;

		if (!personalizationEngineCache.has(cacheKey)) {
			const engine = new PersonalizationEngine({
				inferenceEngine,
				modelId,
				version
			});
			await engine.initialize();
			personalizationEngineCache.set(cacheKey, engine);
		}

		return personalizationEngineCache.get(cacheKey);
	}

	// Legacy mode: default TensorFlow USE
	if (!personalizationEngine) {
		personalizationEngine = new PersonalizationEngine();
		await personalizationEngine.initialize();
	}
	return personalizationEngine;
}

// Initialize shared instances for MLOps components
const featureStore = new FeatureStore();
const monitoringBackend = new MonitoringBackend();
const inferenceEngine = new InferenceEngine();
const benchmarkEngine = new BenchmarkEngine(inferenceEngine);

// Initialize on module load
(async () => {
	await monitoringBackend.initialize();
	await inferenceEngine.initialize();
	console.log('MLOps components initialized');
})();

/**
 * Main resource for product personalization
 * Supports model selection via query parameters: ?modelId=...&version=...
 */
export class Personalize extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.personalizeProducts.bind(this)
		};
	}

	/**
	 * Personalize product recommendations
	 * POST /personalize
	 * Query params (optional): modelId, version
	 */
	async personalizeProducts(request) {
		const requestId = uuidv4();
		const startTime = Date.now();

		try {
			// Parse query parameters for model selection
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');
			const version = url.searchParams.get('version');

			// Parse request body
			const data = await request.json();
			const { products, userContext } = data;

			if (!products || !Array.isArray(products)) {
				return Response.json({
					error: 'Missing or invalid products array',
					requestId,
				}, { status: 400 });
			}

			// Get AI engine (with optional model selection)
			const engine = await getPersonalizationEngine(modelId, version);

			if (!engine.isReady()) {
				return Response.json({
					error: 'AI engine not ready',
					requestId,
				}, { status: 503 });
			}

			// Enhance products with personalization
			const enhancedProducts = await engine.enhanceProducts(products, userContext || {});

			// Sort by personalized score
			const sortedProducts = enhancedProducts.sort((a, b) => (b.personalizedScore || 0) - (a.personalizedScore || 0));

			const modelInfo = engine.getLoadedModels()[0];

			return Response.json({
				requestId,
				products: sortedProducts,
				personalized: true,
				model: modelId && version ? `${modelId}:${version}` : 'universal-sentence-encoder',
				mode: modelInfo.mode || 'legacy',
				responseTime: Date.now() - startTime,
			});
		} catch (error) {
			console.error('Personalization failed:', error);
			return Response.json({
				error: error.message,
				requestId,
			}, { status: 500 });
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

/**
 * Benchmark resource - POST /benchmark/compare
 * Compare performance of equivalent models across backends
 */
export class Benchmark extends Resource {
	constructor() {
		super();
		this.rest = {
			compare: this.compareBenchmark.bind(this),
			history: this.getHistory.bind(this)
		};
	}

	async compareBenchmark(request) {
		try {
			const data = await request.json();
			const {
				taskType,
				equivalenceGroup,
				testData,
				iterations = 10,
				runBy,
				notes
			} = data;

			// Validation
			if (!taskType || !equivalenceGroup) {
				return Response.json({
					error: 'taskType and equivalenceGroup are required'
				}, { status: 400 });
			}

			if (!testData || !Array.isArray(testData) || testData.length === 0) {
				return Response.json({
					error: 'testData must be a non-empty array'
				}, { status: 400 });
			}

			// Find equivalent models
			const models = await benchmarkEngine.findEquivalentModels(
				taskType,
				equivalenceGroup
			);

			if (models.length < 2) {
				return Response.json({
					error: `Not enough models found. Found ${models.length} models with taskType="${taskType}" and equivalenceGroup="${equivalenceGroup}". At least 2 models are required.`,
					foundModels: models.map(m => m.id)
				}, { status: 400 });
			}

			// Run benchmark
			const result = await benchmarkEngine.compareBenchmark(
				models,
				testData,
				{
					iterations,
					taskType,
					equivalenceGroup,
					runBy: runBy || 'api',
					notes: notes || ''
				}
			);

			return Response.json(result);

		} catch (error) {
			console.error('Benchmark comparison failed:', error);
			return Response.json({
				error: 'Benchmark comparison failed',
				details: error.message
			}, { status: 500 });
		}
	}

	async getHistory(request) {
		try {
			const url = new URL(request.url);
			const taskType = url.searchParams.get('taskType');
			const equivalenceGroup = url.searchParams.get('equivalenceGroup');

			const filters = {};
			if (taskType) filters.taskType = taskType;
			if (equivalenceGroup) filters.equivalenceGroup = equivalenceGroup;

			const history = await benchmarkEngine.getHistoricalResults(filters);

			return Response.json({
				count: history.length,
				results: history
			});

		} catch (error) {
			console.error('Get benchmark history failed:', error);
			return Response.json({
				error: 'Get benchmark history failed',
				details: error.message
			}, { status: 500 });
		}
	}
}
