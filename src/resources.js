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
 * Model upload resource - POST /model/upload
 */
export class ModelUpload extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.uploadModel.bind(this)
		};
	}

	async uploadModel(request) {
		try {
			const contentType = request.headers.get('content-type');

			// Handle multipart/form-data
			if (contentType?.includes('multipart/form-data')) {
				const formData = await request.formData();

				const modelId = formData.get('modelId');
				const version = formData.get('version');
				const framework = formData.get('framework');
				const file = formData.get('file');
				const inputSchema = formData.get('inputSchema');
				const outputSchema = formData.get('outputSchema');
				const metadata = formData.get('metadata') || '{}';
				const stage = formData.get('stage') || 'development';

				// Validation
				if (!modelId || !version || !framework || !file) {
					return Response.json({
						error: 'Missing required fields: modelId, version, framework, file'
					}, { status: 400 });
				}

				// Convert file to buffer
				const arrayBuffer = await file.arrayBuffer();
				const modelBlob = Buffer.from(arrayBuffer);

				// Register model
				const registered = await modelRegistry.registerModel({
					modelId,
					version,
					framework,
					modelBlob,
					inputSchema: inputSchema || '{}',
					outputSchema: outputSchema || '{}',
					metadata,
					stage
				});

				return Response.json({
					success: true,
					modelId: registered.modelId,
					version: registered.version,
					uploadedAt: registered.uploadedAt
				});
			}

			// Handle JSON (for metadata only)
			const data = await request.json();

			if (data.modelId && data.version && data.modelBlob) {
				// Direct JSON upload with base64 blob
				const modelBlob = Buffer.from(data.modelBlob, 'base64');

				const registered = await modelRegistry.registerModel({
					modelId: data.modelId,
					version: data.version,
					framework: data.framework || 'onnx',
					modelBlob,
					inputSchema: data.inputSchema || '{}',
					outputSchema: data.outputSchema || '{}',
					metadata: data.metadata || '{}',
					stage: data.stage || 'development'
				});

				return Response.json({
					success: true,
					modelId: registered.modelId,
					version: registered.version,
					uploadedAt: registered.uploadedAt
				});
			}

			return Response.json({
				error: 'Invalid request format'
			}, { status: 400 });

		} catch (error) {
			console.error('Model upload failed:', error);
			return Response.json({
				error: 'Model upload failed',
				details: error.message
			}, { status: 500 });
		}
	}
}

/**
 * Model info resource - GET /model/:modelId/:version
 */
export class ModelInfo extends Resource {
	constructor() {
		super();
		this.rest = {
			GET: this.getModel.bind(this),
			versions: this.getVersions.bind(this)
		};
	}

	async getModel(request) {
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/').filter(Boolean);

		// /model/:modelId/:version
		if (pathParts.length >= 2) {
			const modelId = pathParts[1];
			const version = pathParts[2];

			try {
				const model = await modelRegistry.getModel(modelId, version);

				if (!model) {
					return Response.json({
						error: 'Model not found'
					}, { status: 404 });
				}

				// Return metadata only (not the blob)
				return Response.json({
					id: model.id,
					modelId: model.modelId,
					version: model.version,
					framework: model.framework,
					stage: model.stage,
					inputSchema: model.inputSchema,
					outputSchema: model.outputSchema,
					metadata: model.metadata,
					uploadedAt: model.uploadedAt
				});
			} catch (error) {
				return Response.json({
					error: 'Failed to retrieve model',
					details: error.message
				}, { status: 500 });
			}
		}

		return Response.json({
			error: 'Invalid request'
		}, { status: 400 });
	}

	async getVersions(request) {
		const url = new URL(request.url);
		const modelId = url.searchParams.get('modelId');

		if (!modelId) {
			return Response.json({
				error: 'modelId parameter required'
			}, { status: 400 });
		}

		try {
			const versions = await modelRegistry.listVersions(modelId);

			return Response.json({
				modelId,
				versions
			});
		} catch (error) {
			return Response.json({
				error: 'Failed to list versions',
				details: error.message
			}, { status: 500 });
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
 * Feedback resource - POST /feedback
 * Record actual outcomes for predictions
 */
export class Feedback extends Resource {
	constructor() {
		super();
		this.rest = {
			POST: this.recordFeedback.bind(this)
		};
	}

	async recordFeedback(request) {
		try {
			const data = await request.json();
			const { inferenceId, outcome, correct } = data;

			// Validation
			if (!inferenceId || !outcome) {
				return Response.json({
					error: 'inferenceId and outcome required'
				}, { status: 400 });
			}

			// Record feedback
			await monitoringBackend.recordFeedback(inferenceId, {
				actualOutcome: JSON.stringify(outcome),
				correct: correct !== undefined ? correct : null
			});

			return Response.json({
				success: true,
				inferenceId
			});

		} catch (error) {
			console.error('Feedback recording failed:', error);
			return Response.json({
				error: 'Feedback recording failed',
				details: error.message
			}, { status: 500 });
		}
	}
}

/**
 * Monitoring resource - GET /monitoring/events and /monitoring/metrics
 * Query inference events and aggregate metrics
 */
export class Monitoring extends Resource {
	constructor() {
		super();
		this.rest = {
			events: this.getEvents.bind(this),
			metrics: this.getMetrics.bind(this)
		};
	}

	async getEvents(request) {
		try {
			const url = new URL(request.url);
			const modelId = url.searchParams.get('modelId');
			const userId = url.searchParams.get('userId');
			const limit = parseInt(url.searchParams.get('limit') || '100');

			// Time range
			let startTime = url.searchParams.get('startTime');
			let endTime = url.searchParams.get('endTime');

			if (startTime) {
				startTime = new Date(parseInt(startTime));
			} else {
				// Default to last hour
				startTime = new Date(Date.now() - 3600000);
			}

			if (endTime) {
				endTime = new Date(parseInt(endTime));
			}

			const events = await monitoringBackend.queryEvents({
				modelId,
				userId,
				startTime,
				endTime,
				limit
			});

			return Response.json({
				events,
				count: events.length
			});

		} catch (error) {
			console.error('Query events failed:', error);
			return Response.json({
				error: 'Query events failed',
				details: error.message
			}, { status: 500 });
		}
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
