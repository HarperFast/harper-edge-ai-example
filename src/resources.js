/**
 * Harper Edge AI - Product Personalization using Universal Sentence Encoder
 */

import { PersonalizationEngine } from './PersonalizationEngine.js';
import { v4 as uuidv4 } from 'uuid';
import {
	InferenceEngine,
	MonitoringBackend,
	BenchmarkEngine
} from './core/index.js';

// Initialize personalization engine (shared across requests)
const personalizationEngineCache = new Map();

async function getPersonalizationEngine(modelName, modelVersion) {
	const cacheKey = `${modelName}:${modelVersion}`;

	if (!personalizationEngineCache.has(cacheKey)) {
		const engine = new PersonalizationEngine({
			inferenceEngine,
			modelName,
			modelVersion
		});
		await engine.initialize();
		personalizationEngineCache.set(cacheKey, engine);
	}

	return personalizationEngineCache.get(cacheKey);
}

// Shared instances
let monitoringBackend;
let inferenceEngine;
let benchmarkEngine;

async function ensureInitialized() {
	if (!inferenceEngine) {
		inferenceEngine = new InferenceEngine();
		await inferenceEngine.initialize();
	}
	if (!monitoringBackend) {
		monitoringBackend = new MonitoringBackend();
		await monitoringBackend.initialize();
	}
	if (!benchmarkEngine) {
		benchmarkEngine = new BenchmarkEngine(inferenceEngine);
	}
}

/**
 * Main resource for product personalization
 * Supports model selection via query parameters: ?modelId=...&version=... (or modelName/modelVersion)
 */
export class Personalize extends Resource {
	async post(data, request) {
		const requestId = uuidv4();
		const startTime = Date.now();

		try {
			// Parse query parameters for model selection
			const url = new URL(request.url);
			const modelName = url.searchParams.get('modelName') || url.searchParams.get('modelId');
			const modelVersion = url.searchParams.get('modelVersion') || url.searchParams.get('version');

			if (!modelName || !modelVersion) {
				return {
					error: 'modelName and modelVersion query parameters are required',
					requestId
				};
			}

			const { products, userContext } = data;

			if (!products || !Array.isArray(products)) {
				return {
					error: 'Missing or invalid products array',
					requestId
				};
			}

			// Get AI engine with model selection
			const engine = await getPersonalizationEngine(modelName, modelVersion);

			if (!engine.isReady()) {
				return {
					error: 'AI engine not ready',
					requestId
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
				model: `${modelName}:${modelVersion}`,
				responseTime: Date.now() - startTime
			};
		} catch (error) {
			console.error('Personalization failed:', error);
			return {
				error: error.message,
				requestId
			};
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
				benchmarkEngine: 'ready'
			}
		};
	}
}

/**
 * Predict resource - POST /predict
 * Run inference with a loaded model
 */
export class Predict extends Resource {
	async post(data) {
		try {
			await ensureInitialized();

			// Support both old (modelId/version) and new (modelName/modelVersion) parameter names
			const modelName = data.modelName || data.modelId;
			const modelVersion = data.modelVersion || data.version || 'v1';
			const { features, userId, sessionId } = data;

			// Validation
			if (!modelName || !features) {
				return {
					error: 'modelName and features required'
				};
			}

			// Fetch model from table
			const id = `${modelName}:${modelVersion}`;

			// Check if Model table is available
			if (!tables.Model) {
				return {
					error: 'Model table not available. Check schema configuration.'
				};
			}

			const model = await tables.Model.get(id);

			if (!model) {
				return {
					error: `Model ${id} not found`
				};
			}

			// Run inference
			const result = await inferenceEngine.predict(modelName, features, modelVersion, model);

			// Record to monitoring
			const inferenceId = await monitoringBackend.recordInference({
				modelName,
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

			return {
				inferenceId,
				prediction: result.output,
				confidence: result.confidence,
				modelVersion: result.modelVersion,
				latencyMs: result.latencyMs
			};
		} catch (error) {
			console.error('Prediction failed:', error);
			return {
				error: error.message
			};
		}
	}
}

/**
 * Monitoring resource - GET /monitoring/metrics
 * Compute aggregate metrics (use GET /InferenceEvent for raw events)
 */
export class Monitoring extends Resource {
	async get(data, request) {
		try {
			await ensureInitialized();

			if (!request || !request.url) {
				return {
					error: 'Invalid request'
				};
			}

			const url = new URL(request.url);
			const modelName = url.searchParams.get('modelName') || url.searchParams.get('modelId');

			if (!modelName) {
				return {
					error: 'modelName parameter required'
				};
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

			const metrics = await monitoringBackend.getMetrics(modelName, {
				startTime,
				endTime
			});

			return {
				modelName,
				...metrics
			};
		} catch (error) {
			console.error('Get metrics failed:', error);
			return {
				error: error.message
			};
		}
	}
}

/**
 * Benchmark resource
 * POST /benchmark/compare - Compare performance of equivalent models
 * GET /benchmark/history - Get historical benchmark results
 */
export class Benchmark extends Resource {
	async post(data) {
		try {
			await ensureInitialized();

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
				return {
					error: 'taskType and equivalenceGroup are required'
				};
			}

			if (!testData || !Array.isArray(testData) || testData.length === 0) {
				return {
					error: 'testData must be a non-empty array'
				};
			}

			// Find equivalent models
			const models = await benchmarkEngine.findEquivalentModels(
				taskType,
				equivalenceGroup
			);

			if (models.length < 2) {
				return {
					error: `Not enough models found. Found ${models.length} models with taskType="${taskType}" and equivalenceGroup="${equivalenceGroup}". At least 2 models are required.`
				};
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

			return result;
		} catch (error) {
			console.error('Benchmark comparison failed:', error);
			return {
				error: error.message
			};
		}
	}

	async get(data, request) {
		try {
			await ensureInitialized();

			const url = new URL(request.url);
			const taskType = url.searchParams.get('taskType');
			const equivalenceGroup = url.searchParams.get('equivalenceGroup');

			const filters = {};
			if (taskType) filters.taskType = taskType;
			if (equivalenceGroup) filters.equivalenceGroup = equivalenceGroup;

			const history = await benchmarkEngine.getHistoricalResults(filters);

			return {
				count: history.length,
				results: history
			};
		} catch (error) {
			console.error('Get benchmark history failed:', error);
			return {
				error: error.message
			};
		}
	}
}
