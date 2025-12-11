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

/**
 * Helper to create consistent error responses
 */
function errorResponse(error, requestId = null, status = 500) {
	const response = {
		error: typeof error === 'string' ? error : error.message,
	};

	if (requestId) {
		response.requestId = requestId;
	}

	return Response.json(response, { status });
}

// Initialize personalization engine (shared across requests)
const personalizationEngineCache = new Map();

async function getPersonalizationEngine(modelId, version) {
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
	 * Query params: modelId, version
	 */
	async personalizeProducts(request) {
		const requestId = uuidv4();
		const startTime = Date.now();

		try {
			// Parse query parameters for model selection
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');
			const version = url.searchParams.get('version');

			if (!modelId || !version) {
				return errorResponse('modelId and version query parameters are required', requestId, 400);
			}

			// Parse request body
			const data = await request.json();
			const { products, userContext } = data;

			if (!products || !Array.isArray(products)) {
				return errorResponse('Missing or invalid products array', requestId, 400);
			}

			// Get AI engine with model selection
			const engine = await getPersonalizationEngine(modelId, version);

			if (!engine.isReady()) {
				return errorResponse('AI engine not ready', requestId, 503);
			}

			// Enhance products with personalization
			const enhancedProducts = await engine.enhanceProducts(products, userContext || {});

			// Sort by personalized score
			const sortedProducts = enhancedProducts.sort((a, b) => (b.personalizedScore || 0) - (a.personalizedScore || 0));

			return Response.json({
				requestId,
				products: sortedProducts,
				personalized: true,
				model: `${modelId}:${version}`,
				responseTime: Date.now() - startTime,
			});
		} catch (error) {
			console.error('Personalization failed:', error);
			return errorResponse(error, requestId, 500);
		}
	}
}

/**
 * Health check resource
 */
export class Status extends Resource {
	async get() {
		return {
			status: 'healthy',
			uptime: process.uptime(),
			memory: process.memoryUsage(),
			components: {
				inferenceEngine: 'ready',
				monitoringBackend: 'ready',
				benchmarkEngine: 'ready',
			},
		};
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
				return errorResponse('modelId and features required', null, 400);
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
			return errorResponse(error, null, 500);
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
				return errorResponse('modelId parameter required', null, 400);
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
			return errorResponse(error, null, 500);
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
				return errorResponse('taskType and equivalenceGroup are required', null, 400);
			}

			if (!testData || !Array.isArray(testData) || testData.length === 0) {
				return errorResponse('testData must be a non-empty array', null, 400);
			}

			// Find equivalent models
			const models = await benchmarkEngine.findEquivalentModels(
				taskType,
				equivalenceGroup
			);

			if (models.length < 2) {
				return errorResponse(
					`Not enough models found. Found ${models.length} models with taskType="${taskType}" and equivalenceGroup="${equivalenceGroup}". At least 2 models are required.`,
					null,
					400
				);
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
			return errorResponse(error, null, 500);
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
			return errorResponse(error, null, 500);
		}
	}
}
