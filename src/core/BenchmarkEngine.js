import { v4 as uuidv4 } from 'uuid';

/**
 * BenchmarkEngine - Compares performance of equivalent models across different backends
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
		for await (const model of Model.search()) {
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
	 * Calculate percentile from sorted array
	 * @param {Array<number>} sortedValues - Sorted array of values
	 * @param {number} percentile - Percentile to calculate (0-100)
	 * @returns {number} Calculated percentile value
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
	 * Run benchmark comparison
	 * @param {Array} models - Array of models to compare
	 * @param {Array} testData - Test data samples
	 * @param {Object} options - Benchmark options
	 * @param {number} options.iterations - Number of iterations per sample
	 * @param {string} options.taskType - Task type
	 * @param {string} options.equivalenceGroup - Equivalence group
	 * @param {string} [options.runBy] - User/system identifier
	 * @param {string} [options.notes] - Optional notes
	 * @returns {Promise<Object>} Benchmark results
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
					await this.inferenceEngine.predict(model.modelId, model.version, sample);
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
					modelId: model.id,
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

		await BenchmarkResult.put(benchmarkResult);

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

		for await (const result of BenchmarkResult.search()) {
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
