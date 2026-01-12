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
import { ModelFetchWorker } from './core/ModelFetchWorker.js';
import { LocalFilesystemAdapter } from './core/fetchers/LocalFilesystemAdapter.js';
import { HttpUrlAdapter } from './core/fetchers/HttpUrlAdapter.js';
import { HuggingFaceAdapter } from './core/fetchers/HuggingFaceAdapter.js';
import { verifyModelFetchAuth } from './core/utils/auth.js';

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
let modelFetchWorker;

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
	if (!modelFetchWorker) {
		// Initialize ModelFetchWorker if enabled (default: enabled)
		const workerEnabled = process.env.MODEL_FETCH_WORKER_ENABLED !== 'false';
		if (workerEnabled) {
			modelFetchWorker = new ModelFetchWorker(tables);
			await modelFetchWorker.start();
			console.log('[resources] ModelFetchWorker started');
		}
	}
}

/**
 * Main resource for product personalization
 * Supports model selection via query parameters: ?modelName=...&modelVersion=...
 */
export class Personalize extends Resource {
	async post(data, request) {
		const requestId = uuidv4();
		const startTime = Date.now();

		try {
			// Parse query parameters for model selection
			const url = new URL(request.url);
			const modelName = url.searchParams.get('modelName');
			const modelVersion = url.searchParams.get('modelVersion');

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

			const { modelName, modelVersion = 'v1', features, userId, sessionId } = data;

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
			const modelName = url.searchParams.get('modelName');

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

/**
 * Upload Model Blob Resource
 *
 * Uses Harper's native tables API to store large model blobs with proper file-backed storage.
 * This avoids the REST API limitation where blobs are stored as indexed JSON objects.
 *
 * Usage:
 *   PUT /UploadModelBlob?modelName={name}&modelVersion={version}&framework={framework}&stage={stage}&metadata={json}
 *   Headers:
 *     Content-Type: application/octet-stream
 *   Body: binary blob data
 *
 * Query Parameters:
 *   - modelName (required): Model name
 *   - modelVersion (optional): Model version (default: v1)
 *   - framework (required): onnx|tensorflow|ollama
 *   - stage (optional): development|staging|production (default: development)
 *   - metadata (optional): URL-encoded JSON string with taskType, equivalenceGroup, etc.
 */
export class UploadModelBlob extends Resource {
	async put(data, request) {
		try {
			// Parse query parameters for metadata
			const searchParams = new URLSearchParams(request.search || '');
			const modelName = searchParams.get('modelName');
			const modelVersion = searchParams.get('modelVersion') || 'v1';
			const framework = searchParams.get('framework');
			const stage = searchParams.get('stage') || 'development';
			const metadata = searchParams.get('metadata') || '{}';

			if (!modelName || !framework) {
				return {
					success: false,
					error: 'Missing required query parameters: modelName, framework'
				};
			}

			// Binary blob data is in the data parameter as a Buffer
			const blobBuffer = data;
			const id = `${modelName}:${modelVersion}`;

			// Use Harper's native tables API - triggers file-backed blob storage for large files
			await tables.Model.put({
				id,
				modelName,
				modelVersion,
				framework,
				stage,
				metadata,
				modelBlob: blobBuffer,
			});

			return {
				success: true,
				id,
				size: blobBuffer.length
			};
		} catch (error) {
			console.error('UploadModelBlob failed:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
}

/**
 * InspectModel Resource
 *
 * GET /InspectModel?source={source}&sourceReference={reference}&variant={variant}
 *
 * Inspect a model at a source without downloading it.
 * Returns framework, available variants, and inferred metadata.
 *
 * Query Parameters:
 *   - source (required): "filesystem" | "url" | "huggingface"
 *   - sourceReference (required): file path, URL, or HuggingFace model ID
 *   - variant (optional): variant name (for HuggingFace: "default" | "quantized")
 */
export class InspectModel extends Resource {
	async get(data, request) {
		try {
			console.log('[InspectModel] ===== Request Debug =====');
			console.log('[InspectModel] Request keys:', request ? Object.keys(request).join(', ') : 'request is undefined');
			console.log('[InspectModel] Request:', JSON.stringify(request, null, 2));
			console.log('[InspectModel] Data keys:', data ? Object.keys(data).join(', ') : 'data is undefined');
			console.log('[InspectModel] Data:', JSON.stringify(data, null, 2));
			console.log('[InspectModel] ===========================');

			// Check authentication
			const authError = verifyModelFetchAuth(request);
			if (authError) {
				console.log('[InspectModel] Authentication failed:', authError);
				return authError;
			}
			console.log('[InspectModel] Authentication passed');

			await ensureInitialized();

			// Parse query parameters from data.search
			const searchParams = new URLSearchParams(data?.search || '');
			const source = searchParams.get('source');
			const sourceReference = searchParams.get('sourceReference');
			const variant = searchParams.get('variant');

			// Validation
			if (!source || !sourceReference) {
				return {
					error: 'Missing required query parameters: source, sourceReference'
				};
			}

			// Get adapter
			console.log('[InspectModel] Creating adapters');
			const adapters = {
				filesystem: new LocalFilesystemAdapter(),
				url: new HttpUrlAdapter(),
				huggingface: new HuggingFaceAdapter()
			};

			const adapter = adapters[source];
			if (!adapter) {
				return {
					error: `Unsupported source: ${source}. Supported: filesystem, url, huggingface`
				};
			}

			// Detect framework
			let framework;
			try {
				console.log('[InspectModel] Calling detectFramework');
				framework = await adapter.detectFramework(sourceReference, variant);
				console.log('[InspectModel] Framework detected:', framework);
			} catch (error) {
				console.error('[InspectModel] detectFramework failed:', error);
				return {
					error: `Failed to detect framework: ${error.message}`,
					code: error.code || 'DETECTION_FAILED'
				};
			}

			// List variants
			let variants;
			try {
				console.log('[InspectModel] Calling listVariants');
				variants = await adapter.listVariants(sourceReference);
				console.log('[InspectModel] Variants found:', variants.length);
			} catch (error) {
				console.error('[InspectModel] listVariants failed:', error);
				return {
					error: `Failed to list variants: ${error.message}`,
					code: error.code || 'LIST_VARIANTS_FAILED'
				};
			}

			// Infer metadata
			let inferredMetadata;
			try {
				inferredMetadata = await adapter.inferMetadata(sourceReference, variant);
			} catch (error) {
				console.warn('[InspectModel] Failed to infer metadata:', error.message);
				inferredMetadata = {};
			}

			// Suggest model name from source reference
			let suggestedModelName = sourceReference.split('/').pop().replace(/\.[^.]+$/, '');
			if (source === 'huggingface') {
				// For HuggingFace, use the repo name
				const parts = sourceReference.split('/');
				suggestedModelName = parts[parts.length - 1];
			}

			return {
				source,
				sourceReference,
				framework,
				variants,
				inferredMetadata,
				suggestedModelName
			};
		} catch (error) {
			console.error('[InspectModel] Error:', error);
			return {
				error: error.message,
				code: error.code || 'INSPECT_FAILED'
			};
		}
	}
}

/**
 * FetchModel Resource
 *
 * POST /FetchModel
 *
 * Create a job to fetch a model from a source and store it in the Model table.
 * Returns jobId for tracking progress.
 *
 * Request Body:
 *   {
 *     source: "filesystem" | "url" | "huggingface",
 *     sourceReference: "path/to/model.onnx" | "https://..." | "Xenova/all-MiniLM-L6-v2",
 *     variant: "default" | "quantized" (optional, for HuggingFace),
 *     modelName: "my-model" (required),
 *     modelVersion: "v1" (optional, default: "v1"),
 *     framework: "onnx" | "tensorflow" | "transformers" (optional, auto-detected if omitted),
 *     stage: "development" | "staging" | "production" (optional, default: "development"),
 *     metadata: { taskType, equivalenceGroup, ... } (optional, merged with inferred metadata),
 *     webhookUrl: "https://..." (optional, called on completion/failure),
 *     maxRetries: 3 (optional, default: 3)
 *   }
 */
export class FetchModel extends Resource {
	async post(data, request) {
		try {
			// Check authentication
			const authError = verifyModelFetchAuth(request);
			if (authError) {
				return authError;
			}

			await ensureInitialized();

			const {
				source,
				sourceReference,
				variant = null,
				modelName,
				modelVersion = 'v1',
				framework,
				stage = 'development',
				metadata = {},
				webhookUrl = null,
				maxRetries = 3
			} = data;

			// Validation
			if (!source || !sourceReference || !modelName) {
				return {
					error: 'Missing required fields: source, sourceReference, modelName'
				};
			}

			const supportedSources = ['filesystem', 'url', 'huggingface'];
			if (!supportedSources.includes(source)) {
				return {
					error: `Unsupported source: ${source}. Supported: ${supportedSources.join(', ')}`
				};
			}

			const modelId = `${modelName}:${modelVersion}`;

			// Check if model already exists
			const existingModel = await tables.Model.get(modelId);
			if (existingModel) {
				// Check if it's the same source (idempotent) or different source (error)
				const existingMetadata = JSON.parse(existingModel.metadata || '{}');
				const existingSource = existingMetadata.fetchSource;
				const existingReference = existingMetadata.fetchReference;

				if (existingSource === source && existingReference === sourceReference) {
					// Same source, return success (idempotent)
					return {
						message: 'Model already exists with same source',
						modelId,
						existing: true
					};
				} else {
					// Different source, error
					return {
						error: `Model ${modelId} already exists from a different source (${existingSource}:${existingReference}). Delete it first or use a different modelName/modelVersion.`
					};
				}
			}

			// Check for active job with same modelId
			const activeJobs = await tables.ModelFetchJob.findMany({
				where: { modelName, modelVersion, status: 'queued' }
			});
			if (activeJobs.length > 0) {
				return {
					error: `A job is already queued for model ${modelId}`,
					existingJobId: activeJobs[0].id
				};
			}

			// Detect framework if not provided
			let detectedFramework = framework;
			if (!detectedFramework) {
				const adapters = {
					filesystem: new LocalFilesystemAdapter(),
					url: new HttpUrlAdapter(),
					huggingface: new HuggingFaceAdapter()
				};

				const adapter = adapters[source];
				try {
					detectedFramework = await adapter.detectFramework(sourceReference, variant);
				} catch (error) {
					return {
						error: `Failed to detect framework: ${error.message}. Please specify framework explicitly.`,
						code: error.code || 'DETECTION_FAILED'
					};
				}
			}

			// Validate framework
			const supportedFrameworks = ['onnx', 'tensorflow', 'transformers', 'ollama'];
			if (!supportedFrameworks.includes(detectedFramework)) {
				return {
					error: `Unsupported framework: ${detectedFramework}. Supported: ${supportedFrameworks.join(', ')}`
				};
			}

			// Infer metadata (best effort, failures are ignored)
			let inferredMetadata = {};
			try {
				const adapters = {
					filesystem: new LocalFilesystemAdapter(),
					url: new HttpUrlAdapter(),
					huggingface: new HuggingFaceAdapter()
				};
				const adapter = adapters[source];
				inferredMetadata = await adapter.inferMetadata(sourceReference, variant);
			} catch (error) {
				console.warn('[FetchModel] Failed to infer metadata:', error.message);
			}

			// Create job
			const jobId = uuidv4();
			const job = {
				id: jobId,
				jobId, // Indexed field for queries
				source,
				sourceReference,
				variant,
				modelName,
				modelVersion,
				framework: detectedFramework,
				stage,
				status: 'queued',
				progress: 0,
				downloadedBytes: 0,
				totalBytes: 0,
				retryCount: 0,
				maxRetries,
				lastError: null,
				errorCode: null,
				retryable: true,
				inferredMetadata: JSON.stringify(inferredMetadata),
				userMetadata: JSON.stringify(metadata),
				webhookUrl,
				createdAt: Date.now(),
				startedAt: null,
				completedAt: null,
				resultModelId: null
			};

			await tables.ModelFetchJob.create(job);

			return {
				jobId,
				status: 'queued',
				message: 'Job created successfully. Use GET /ModelFetchJob?id={jobId} to track progress.',
				modelId
			};
		} catch (error) {
			console.error('[FetchModel] Error:', error);
			return {
				error: error.message,
				code: error.code || 'FETCH_FAILED'
			};
		}
	}
}

/**
 * ModelFetchJob Resource
 *
 * GET /ModelFetchJob?id={jobId} - Get job status by ID
 * GET /ModelFetchJob?status={status} - List jobs by status
 * GET /ModelFetchJob?modelName={name} - List jobs by model name
 * POST /ModelFetchJob - Retry a failed job
 */
export class ModelFetchJobResource extends Resource {
	async get(data, request) {
		try {
			// Check authentication
			const authError = verifyModelFetchAuth(request);
			if (authError) {
				return authError;
			}

			await ensureInitialized();

			// Parse query parameters
			const searchParams = new URLSearchParams(request.search || '');
			const jobId = searchParams.get('id');
			const status = searchParams.get('status');
			const modelName = searchParams.get('modelName');
			const limit = parseInt(searchParams.get('limit') || '50');

			// Get single job by ID
			if (jobId) {
				const job = await tables.ModelFetchJob.get(jobId);
				if (!job) {
					return {
						error: `Job ${jobId} not found`
					};
				}
				return job;
			}

			// List jobs with filters
			const where = {};
			if (status) {
				where.status = status;
			}
			if (modelName) {
				where.modelName = modelName;
			}

			const jobs = await tables.ModelFetchJob.findMany({
				where: Object.keys(where).length > 0 ? where : undefined,
				orderBy: { createdAt: 'desc' },
				limit
			});

			return {
				jobs,
				count: jobs.length
			};
		} catch (error) {
			console.error('[ModelFetchJob] GET Error:', error);
			return {
				error: error.message
			};
		}
	}

	async post(data, request) {
		try {
			// Check authentication
			const authError = verifyModelFetchAuth(request);
			if (authError) {
				return authError;
			}

			await ensureInitialized();

			const { jobId, action = 'retry' } = data;

			// Validation
			if (!jobId) {
				return {
					error: 'Missing required field: jobId'
				};
			}

			// Get job
			const job = await tables.ModelFetchJob.get(jobId);
			if (!job) {
				return {
					error: `Job ${jobId} not found`
				};
			}

			// Handle actions
			if (action === 'retry') {
				// Only retry failed jobs
				if (job.status !== 'failed') {
					return {
						error: `Job ${jobId} is not in failed state (current status: ${job.status})`
					};
				}

				// Reset job to queued
				await tables.ModelFetchJob.update({
					where: { id: jobId },
					data: {
						status: 'queued',
						retryCount: 0,
						lastError: null,
						errorCode: null
					}
				});

				return {
					jobId,
					status: 'queued',
					message: 'Job reset to queued for retry'
				};
			}

			return {
				error: `Unknown action: ${action}. Supported: retry`
			};
		} catch (error) {
			console.error('[ModelFetchJob] POST Error:', error);
			return {
				error: error.message
			};
		}
	}
}
