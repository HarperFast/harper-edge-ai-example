import { v4 as uuidv4 } from 'uuid';

/**
 * BenchmarkEngine - Performance comparison for equivalent models across backends
 *
 * Enables data-driven model deployment decisions by:
 * - Finding equivalent models by taskType and equivalenceGroup
 * - Running controlled benchmark comparisons
 * - Computing latency metrics (avg, p50, p95, p99, min, max)
 * - Tracking error rates and success counts
 * - Determining the fastest model for production use
 * - Storing historical results for trend analysis
 *
 * Algorithm Overview:
 * 1. Validates models have matching outputDimensions
 * 2. Runs N iterations for each model, cycling through test samples
 * 3. Computes percentile latencies using linear interpolation
 * 4. Identifies winner as lowest avgLatency with <100% error rate
 * 5. Persists results to BenchmarkResult table
 *
 * @class
 * @see {@link ../../../docs/BENCHMARKING.md} - Complete benchmarking guide
 * @see {@link ../../../docs/MODEL_METADATA.md} - Metadata requirements
 *
 * @example
 * const benchmarkEngine = new BenchmarkEngine(inferenceEngine);
 *
 * const models = await benchmarkEngine.findEquivalentModels(
 *   'text-embedding',
 *   'embeddings-384'
 * );
 *
 * const result = await benchmarkEngine.compareBenchmark(models, testData, {
 *   iterations: 100,
 *   taskType: 'text-embedding',
 *   equivalenceGroup: 'embeddings-384'
 * });
 *
 * console.log(`Winner: ${result.winner.modelName}`);
 * console.log(`Latency: ${result.winner.avgLatency}ms`);
 */
export class BenchmarkEngine {
	/**
	 * Create a new BenchmarkEngine instance
	 * @param {InferenceEngine} inferenceEngine - Inference engine for running predictions
	 */
	constructor(inferenceEngine) {
		if (!inferenceEngine) {
			throw new Error('Inference engine is required');
		}
		this.inferenceEngine = inferenceEngine;
	}

	/**
	 * Parse model metadata, optionally throwing on error
	 * @private
	 * @param {Object} model - Model record
	 * @param {boolean} throwOnError - Whether to throw on parse error
	 * @returns {Object|null} Parsed metadata or null if parse fails
	 */
	_parseMetadata(model, throwOnError = false) {
		try {
			return JSON.parse(model.metadata || '{}');
		} catch (err) {
			if (throwOnError) {
				throw new Error(`Invalid metadata for model ${model.id}: ${err.message}`);
			}
			return null;
		}
	}

	/**
	 * Find equivalent models by taskType and equivalenceGroup
	 * @param {string} taskType - Type of ML task (e.g., "text-embedding")
	 * @param {string} equivalenceGroup - Equivalence group identifier
	 * @returns {Promise<Array>} Array of matching models
	 */
	async findEquivalentModels(taskType, equivalenceGroup) {
		const matchingModels = [];

		// Search all models and filter by metadata
		for await (const model of tables.Model.search()) {
			const metadata = this._parseMetadata(model, false);

			if (metadata?.taskType === taskType && metadata.equivalenceGroup === equivalenceGroup) {
				matchingModels.push({
					...model,
					parsedMetadata: metadata,
				});
			}
		}

		return matchingModels;
	}

	/**
	 * Validate that models can be compared
	 * @param {Array} models - Array of model objects to validate
	 * @throws {Error} If validation fails
	 */
	validateModelsForComparison(models) {
		if (!models || models.length < 2) {
			throw new Error('At least 2 models are required for comparison');
		}

		// Extract and validate dimensions for all models
		const dimensions = models.map((m) => {
			const meta = m.parsedMetadata || this._parseMetadata(m, true);
			if (!meta.outputDimensions) {
				throw new Error(`Model ${m.id} is missing outputDimensions in metadata`);
			}
			return JSON.stringify(meta.outputDimensions);
		});

		// Verify all dimensions match
		if (new Set(dimensions).size > 1) {
			throw new Error(`Output dimensions do not match: ${dimensions.join(' vs ')}`);
		}
	}

	/**
	 * Calculate percentile from sorted array using linear interpolation
	 *
	 * Uses the linear interpolation method (R-7 / Excel PERCENTILE function):
	 * - For percentile p in [0, 100] and array of length n:
	 *   - index = p/100 * (n - 1)
	 *   - If index is integer, return value at that index
	 *   - Otherwise, interpolate between floor(index) and ceil(index)
	 *
	 * Edge Cases:
	 * - Empty array returns 0
	 * - Single element array returns that element
	 * - Handles 0th and 100th percentile correctly
	 *
	 * @param {Array<number>} sortedValues - Pre-sorted array of numeric values
	 * @param {number} percentile - Percentile to calculate (0-100)
	 * @returns {number} Calculated percentile value
	 * @example
	 * const latencies = [10, 15, 20, 25, 30].sort((a, b) => a - b);
	 * const p50 = calculatePercentile(latencies, 50); // 20
	 * const p95 = calculatePercentile(latencies, 95); // 29
	 */
	calculatePercentile(sortedValues, percentile) {
		if (sortedValues.length === 0) {
			return 0;
		}

		if (sortedValues.length === 1) {
			return sortedValues[0];
		}

		const index = (percentile / 100) * (sortedValues.length - 1);
		const lower = Math.floor(index);
		const upper = Math.ceil(index);
		const weight = index - lower;

		if (lower === upper) {
			return sortedValues[lower];
		}

		return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
	}

	/**
	 * Run benchmark comparison across multiple models
	 *
	 * Executes a controlled performance comparison by running multiple iterations
	 * of predictions across equivalent models. Computes comprehensive latency metrics
	 * and identifies the best-performing model.
	 *
	 * Benchmark Algorithm:
	 * 1. Validates all models have matching outputDimensions
	 * 2. For each model:
	 *    a. Runs 'iterations' predictions, cycling through testData samples
	 *    b. Records latency for each successful prediction
	 *    c. Counts successes and errors
	 * 3. Computes metrics for each model:
	 *    - Average latency across all successful predictions
	 *    - Percentile latencies (p50, p95, p99) using interpolation
	 *    - Min/max latencies
	 *    - Error rate and counts
	 * 4. Identifies winner with lowest avgLatency (excluding models with 100% errors)
	 * 5. Persists complete results to BenchmarkResult table
	 *
	 * @async
	 * @param {Array<Object>} models - Array of model records to compare (minimum 2)
	 * @param {string} models[].id - Database record ID
	 * @param {string} models[].modelName - Model identifier
	 * @param {string} models[].modelVersion - Model version
	 * @param {string} models[].framework - Backend framework
	 * @param {Object} models[].parsedMetadata - Parsed metadata object
	 * @param {string} models[].parsedMetadata.taskType - Task type
	 * @param {string} models[].parsedMetadata.equivalenceGroup - Equivalence group
	 * @param {Array<number>} models[].parsedMetadata.outputDimensions - Output dimensions
	 * @param {Array<Object>} testData - Test input samples (cycles if iterations > length)
	 * @param {Object} options - Benchmark configuration
	 * @param {number} options.iterations - Number of predictions per model (must be > 0)
	 * @param {string} options.taskType - Task type for filtering
	 * @param {string} options.equivalenceGroup - Equivalence group for filtering
	 * @param {string} [options.runBy='system'] - Identifier for who ran benchmark
	 * @param {string} [options.notes=''] - Optional notes about benchmark run
	 * @returns {Promise<Object>} Benchmark results
	 * @returns {string} return.comparisonId - UUID for this comparison
	 * @returns {string} return.taskType - Task type benchmarked
	 * @returns {string} return.equivalenceGroup - Equivalence group benchmarked
	 * @returns {string[]} return.modelIds - Array of model IDs compared
	 * @returns {Object|null} return.winner - Winning model (null if all failed)
	 * @returns {string} return.winner.modelName - Winner's model name
	 * @returns {string} return.winner.framework - Winner's framework
	 * @returns {number} return.winner.avgLatency - Winner's average latency
	 * @returns {Object} return.results - Per-model metrics (keyed by model ID)
	 * @returns {number} return.results[modelId].avgLatency - Average latency (ms)
	 * @returns {number} return.results[modelId].p50Latency - Median latency (ms)
	 * @returns {number} return.results[modelId].p95Latency - 95th percentile (ms)
	 * @returns {number} return.results[modelId].p99Latency - 99th percentile (ms)
	 * @returns {number} return.results[modelId].minLatency - Minimum latency (ms)
	 * @returns {number} return.results[modelId].maxLatency - Maximum latency (ms)
	 * @returns {number} return.results[modelId].errorRate - Error rate (0.0-1.0)
	 * @returns {number} return.results[modelId].successCount - Number of successes
	 * @returns {number} return.results[modelId].errorCount - Number of errors
	 * @returns {number} return.timestamp - Start timestamp (ms since epoch)
	 * @returns {number} return.completedAt - Completion timestamp (ms since epoch)
	 * @throws {Error} If testData is empty
	 * @throws {Error} If iterations <= 0
	 * @throws {Error} If models array has < 2 models
	 * @throws {Error} If models have mismatched outputDimensions
	 *
	 * @example
	 * const result = await benchmarkEngine.compareBenchmark(
	 *   [onnxModel, tensorflowModel],
	 *   [{texts: ['test 1']}, {texts: ['test 2']}],
	 *   {
	 *     iterations: 100,
	 *     taskType: 'text-embedding',
	 *     equivalenceGroup: 'embeddings-384',
	 *     runBy: 'perf-team',
	 *     notes: 'Production readiness test'
	 *   }
	 * );
	 */
	async compareBenchmark(models, testData, options) {
		const { iterations, taskType, equivalenceGroup, runBy = 'system', notes = '' } = options;

		// Validate inputs
		if (!testData || testData.length === 0) {
			throw new Error('Test data cannot be empty');
		}

		if (!iterations || iterations <= 0) {
			throw new Error('Iterations must be greater than 0');
		}

		this.validateModelsForComparison(models);

		const comparisonId = uuidv4();
		const timestamp = Date.now();
		const modelIds = models.map((m) => m.id);
		const results = {};

		// Run benchmark for each model
		for (const model of models) {
			const latencies = [];
			let successCount = 0;
			let errorCount = 0;

			// Run iterations
			for (let i = 0; i < iterations; i++) {
				// Cycle through test data samples
				const sample = testData[i % testData.length];

				try {
					const startTime = Date.now();
					await this.inferenceEngine.predict(model.modelName, sample, model.modelVersion, model);
					const endTime = Date.now();

					const latency = endTime - startTime;
					latencies.push(latency);
					successCount++;
				} catch (err) {
					errorCount++;
					// Don't include failed predictions in latency metrics
					console.error(`Prediction error for model ${model.id} on sample ${i}:`, err);
				}
			}

			// Compute metrics
			const sortedLatencies = latencies.sort((a, b) => a - b);
			const hasData = sortedLatencies.length > 0;
			const avgLatency = hasData ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;
			const errorRate = errorCount / iterations;

			const metrics = {
				avgLatency,
				p50Latency: hasData ? this.calculatePercentile(sortedLatencies, 50) : 0,
				p95Latency: hasData ? this.calculatePercentile(sortedLatencies, 95) : 0,
				p99Latency: hasData ? this.calculatePercentile(sortedLatencies, 99) : 0,
				minLatency: hasData ? sortedLatencies[0] : 0,
				maxLatency: hasData ? sortedLatencies[sortedLatencies.length - 1] : 0,
				errorRate,
				successCount,
				errorCount,
			};

			results[model.id] = metrics;
		}

		// Determine winner (lowest avgLatency among models with <100% error rate)
		let winner = null;
		let lowestLatency = Infinity;

		for (const [modelId, metrics] of Object.entries(results)) {
			if (metrics.errorRate < 1.0 && metrics.avgLatency < lowestLatency) {
				lowestLatency = metrics.avgLatency;
				const model = models.find((m) => m.id === modelId);
				winner = {
					modelName: model.modelName,
					framework: model.framework,
					avgLatency: metrics.avgLatency,
				};
			}
		}

		const completedAt = Date.now();

		// Store in BenchmarkResult table
		const benchmarkResult = {
			id: comparisonId,
			taskType,
			equivalenceGroup,
			modelIds: JSON.stringify(modelIds),
			results: JSON.stringify(results),
			testDataSummary: JSON.stringify({
				sampleCount: testData.length,
				description: `${iterations} iterations across ${testData.length} samples`,
			}),
			iterations,
			runBy,
			notes,
			timestamp,
			completedAt,
		};

		await tables.BenchmarkResult.put(benchmarkResult);

		// Return formatted result
		return {
			comparisonId,
			taskType,
			equivalenceGroup,
			modelIds,
			winner,
			results,
			timestamp,
			completedAt,
		};
	}

	/**
	 * Get historical benchmark results
	 * @param {Object} filters - Filter criteria
	 * @param {string} [filters.taskType] - Filter by task type
	 * @param {string} [filters.equivalenceGroup] - Filter by equivalence group
	 * @returns {Promise<Array>} Array of historical results
	 */
	async getHistoricalResults(filters = {}) {
		const historical = [];

		for await (const result of tables.BenchmarkResult.search()) {
			// Apply filters
			if (filters.taskType && result.taskType !== filters.taskType) {
				continue;
			}

			if (filters.equivalenceGroup && result.equivalenceGroup !== filters.equivalenceGroup) {
				continue;
			}

			historical.push(result);
		}

		// Sort by timestamp descending (most recent first)
		historical.sort((a, b) => b.timestamp - a.timestamp);

		return historical;
	}
}
