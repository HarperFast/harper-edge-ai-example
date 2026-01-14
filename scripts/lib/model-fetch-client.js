/**
 * Model Fetch API Client
 *
 * Client library for interacting with Model Fetch REST API from CLI.
 */

export class ModelFetchClient {
	constructor(baseUrl, token = undefined) {
		this.baseUrl = baseUrl;
		this.token = token;
	}

	/**
	 * Create fetch options (headers only, token goes in query/body)
	 * @private
	 */
	_getFetchOptions(additionalOptions = {}) {
		return {
			...additionalOptions,
			headers: {
				...additionalOptions.headers,
			},
		};
	}

	/**
	 * Inspect a model before downloading
	 *
	 * @param {string} source - Source type (filesystem, url, huggingface)
	 * @param {string} sourceReference - Source reference (path, URL, model ID)
	 * @param {string} variant - Optional variant (for huggingface)
	 * @returns {Promise<Object>} Model information
	 */
	async inspectModel(source, sourceReference, variant = null) {
		const params = new URLSearchParams({ source, sourceReference });
		if (variant) {
			params.append('variant', variant);
		}
		if (this.token) {
			params.append('token', this.token);
		}

		const url = `${this.baseUrl}/InspectModel?${params}`;
		const options = this._getFetchOptions();

		if (global.VERBOSE) {
			console.log('[VERBOSE] Inspect Model Request:');
			console.log('  URL:', url);
			console.log('  Headers:', JSON.stringify(options.headers, null, 2));
		}

		const response = await fetch(url, options);

		if (global.VERBOSE) {
			console.log('[VERBOSE] Response:');
			console.log('  Status:', response.status, response.statusText);
			console.log('  Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
		}

		if (!response.ok) {
			const body = await response.text();
			if (global.VERBOSE) {
				console.log('[VERBOSE] Response Body:', body);
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		if (global.VERBOSE) {
			console.log('[VERBOSE] Response Body:', JSON.stringify(data, null, 2));
		}

		return data;
	}

	/**
	 * Create a model fetch job
	 *
	 * @param {Object} data - Fetch request data
	 * @returns {Promise<Object>} Job information
	 */
	async fetchModel(data) {
		const url = `${this.baseUrl}/FetchModel`;
		const requestData = { ...data };
		if (this.token) {
			requestData.token = this.token;
		}
		const response = await fetch(
			url,
			this._getFetchOptions({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestData),
			})
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * Get a specific job by ID
	 *
	 * @param {string} jobId - Job ID
	 * @returns {Promise<Object>} Job status
	 */
	async getJob(jobId) {
		const params = new URLSearchParams({ id: jobId });
		if (this.token) {
			params.append('token', this.token);
		}
		const url = `${this.baseUrl}/ModelFetchJob?${params}`;
		const response = await fetch(url, this._getFetchOptions());

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * List jobs with optional filters
	 *
	 * @param {Object} filters - Optional filters (status, modelName, limit)
	 * @returns {Promise<Object>} Jobs list
	 */
	async listJobs(filters = {}) {
		const params = new URLSearchParams();
		if (filters.status) params.append('status', filters.status);
		if (filters.modelName) params.append('modelName', filters.modelName);
		if (filters.limit) params.append('limit', filters.limit);
		if (this.token) {
			params.append('token', this.token);
		}

		const url = `${this.baseUrl}/ModelFetchJob?${params}`;
		const response = await fetch(url, this._getFetchOptions());

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * Retry a failed job
	 *
	 * @param {string} jobId - Job ID
	 * @returns {Promise<Object>} Updated job status
	 */
	async retryJob(jobId) {
		const url = `${this.baseUrl}/ModelFetchJob`;
		const requestData = {
			jobId,
			action: 'retry',
		};
		if (this.token) {
			requestData.token = this.token;
		}
		const response = await fetch(
			url,
			this._getFetchOptions({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestData),
			})
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	}
}
