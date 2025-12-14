/**
 * REST API Helper for Tests
 *
 * Provides REST API access to Harper tables for tests running outside Harper's process.
 * Tests run with `node --test` don't have access to Harper's `tables` global,
 * so we use REST API instead.
 *
 * Harper REST API Endpoints:
 * - GET /{table}/{id}          - Get single record by ID
 * - GET /{table}/?property=val - Query records by property
 * - PUT /{table}/{id}          - Create or replace record with known ID
 * - POST /{table}/             - Create record with auto-assigned ID
 * - DELETE /{table}/{id}       - Delete record by ID
 * - PUT /{table}/{id}/{field}  - Upload blob to specific field
 *
 * @see https://docs.harperdb.io/docs/developers/rest
 *
 * Usage:
 *   import { createRestTable } from './helpers/rest-api.js';
 *   const Feature = createRestTable('Feature');
 *   await Feature.put({ entityId: 'test', featureName: 'score', ... });
 *   const record = await Feature.get('test:score');
 */

const BASE_URL = process.env.HARPER_URL || 'http://localhost:9926';
const USERNAME = process.env.HARPER_USERNAME || process.env.CLI_TARGET_USERNAME || null;
const PASSWORD = process.env.HARPER_PASSWORD || process.env.CLI_TARGET_PASSWORD || null;

/**
 * Create Basic Auth header (optional)
 */
function getAuthHeader() {
	if (!USERNAME || !PASSWORD) {
		return null; // No authentication
	}
	const credentials = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
	return `Basic ${credentials}`;
}

/**
 * Make a REST API request to Harper
 */
async function harperFetch(path, options = {}) {
	const url = `${BASE_URL}${path}`;
	const headers = {
		...options.headers,
	};

	// Add auth header only if credentials are provided
	const authHeader = getAuthHeader();
	if (authHeader) {
		headers.Authorization = authHeader;
	}

	const response = await fetch(url, {
		...options,
		headers,
	});

	// For DELETE, return success boolean
	if (options.method === 'DELETE') {
		return response.ok;
	}

	// For GET that returns 404, return undefined
	if (response.status === 404) {
		return undefined;
	}

	if (!response.ok) {
		const error = await response.text();
		console.error(`[REST API Error] ${options.method || 'GET'} ${path}: ${response.status} ${error}`);
		throw new Error(`Harper REST API error: ${response.status} ${error}`);
	}

	// Parse JSON response
	const text = await response.text();
	if (!text) return null;
	return JSON.parse(text);
}

/**
 * Create a REST API interface for a Harper table
 *
 * Mimics the `tables.get(name)` interface but uses REST API
 */
export function createRestTable(tableName) {
	return {
		/**
		 * Put (create or update) a record
		 * @param {Object} record - Record to create/update
		 * @returns {Promise<Object>} Created record
		 */
		async put(record) {
			let id = record.id;

			// Compute composite IDs if not provided
			if (!id) {
				if (tableName === 'Model' && record.modelName && record.modelVersion) {
					id = `${record.modelName}:${record.modelVersion}`;
				} else if (tableName === 'Feature' && record.entityId && record.featureName) {
					id = `${record.entityId}:${record.featureName}`;
				} else if (tableName === 'InferenceEvent') {
					// InferenceEvent without ID - use POST for auto-generated UUID
					const result = await harperFetch(`/${tableName}/`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(record),
					});
					// POST returns just the ID string, fetch the full record
					if (typeof result === 'string') {
						return await harperFetch(`/${tableName}/${encodeURIComponent(result)}`);
					}
					return result;
				}
			}

			if (!id) {
				throw new Error(`Cannot determine id for ${tableName} record`);
			}

			// For Model table, handle blob separately (like preload-models script)
			let modelBlob = null;
			let recordToSend = record;

			if (tableName === 'Model' && record.modelBlob) {
				// Extract blob for separate upload
				modelBlob = record.modelBlob;
				const { id: _unused, modelBlob: _blob, ...rest } = record;
				recordToSend = rest;
			} else {
				// Use PUT with ID in URL, don't include id in body
				const { id: _unused, ...rest } = record;
				recordToSend = rest;
			}

			// Step 1: Create/update the record (without blob for Model table)
			await harperFetch(`/${tableName}/${encodeURIComponent(id)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(recordToSend),
			});

			// Step 2: Upload blob separately if it exists (Model table only)
			if (modelBlob && tableName === 'Model') {
				// Convert Buffer to Uint8Array for fetch body
				const blobData = Buffer.isBuffer(modelBlob) ? modelBlob : Buffer.from(JSON.stringify(modelBlob));

				await harperFetch(`/${tableName}/${encodeURIComponent(id)}/modelBlob`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Length': blobData.length.toString(),
					},
					body: blobData,
				});
			}

			// Fetch the created record
			const created = await harperFetch(`/${tableName}/${encodeURIComponent(id)}`);
			return created;
		},

		/**
		 * Get a single record by id
		 * @param {string} id - Record id
		 * @returns {Promise<Object|undefined>} Record or undefined if not found
		 */
		async get(id) {
			const record = await harperFetch(`/${tableName}/${encodeURIComponent(id)}`);

			// For Model table, fetch blob separately if record exists
			if (record && tableName === 'Model') {
				try {
					// Fetch blob (Harper returns as JSON with numeric keys)
					const headers = {};
					const authHeader = getAuthHeader();
					if (authHeader) {
						headers.Authorization = authHeader;
					}

					const blobResponse = await fetch(`${BASE_URL}/${tableName}/${encodeURIComponent(id)}/modelBlob`, {
						method: 'GET',
						headers,
					});

					if (blobResponse.ok) {
						// Harper returns blobs as JSON with Content-Type: application/json
						// The format is {"0": byte0, "1": byte1, "2": byte2, ...}
						const blobJson = await blobResponse.json();

						// Convert numeric-keyed object to Buffer
						const byteArray = Object.keys(blobJson).sort((a, b) => parseInt(a) - parseInt(b)).map(k => blobJson[k]);
						record.modelBlob = Buffer.from(byteArray);
					}
				} catch (err) {
					// Blob fetch failed, but record is valid - continue without blob
					console.warn(`Failed to fetch blob for ${id}:`, err.message);
				}
			}

			return record;
		},

		/**
		 * Search/query records
		 * @param {Object} query - Query parameters (e.g., { entityId: 'user_123' })
		 * @returns {AsyncIterator<Object>} Async iterator over matching records
		 */
		async *search(query = {}) {
			let records;

			if (Object.keys(query).length === 0) {
				// No query params - get all records (trailing slash)
				records = await harperFetch(`/${tableName}/`);
			} else {
				// Use Harper's native query parameters: GET /table/?property=value
				const queryString = new URLSearchParams(query).toString();
				records = await harperFetch(`/${tableName}/?${queryString}`);
			}

			if (!Array.isArray(records)) {
				return;
			}

			// Yield all matching records
			for (const record of records) {
				yield record;
			}
		},

		/**
		 * Delete a record by id
		 * @param {string} id - Record id
		 * @returns {Promise<boolean>} True if deleted
		 */
		async delete(id) {
			return harperFetch(`/${tableName}/${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
		},
	};
}

/**
 * Create a mock of Harper's tables global using REST API
 *
 * Supports both syntaxes:
 *   tables.get('Model') - traditional way
 *   tables.Model - property access (uses Proxy)
 *
 * Usage:
 *   import { createRestTables } from './helpers/rest-api.js';
 *   const tables = createRestTables();
 *   const Model = tables.get('Model');  // or tables.Model
 */
export function createRestTables() {
	const cache = new Map();

	const tablesObj = {
		get(tableName) {
			if (!cache.has(tableName)) {
				cache.set(tableName, createRestTable(tableName));
			}
			return cache.get(tableName);
		},
	};

	// Use Proxy to support property access (tables.Model, tables.InferenceEvent, etc.)
	return new Proxy(tablesObj, {
		get(target, prop) {
			// If it's a method on the object itself, return it
			if (prop in target) {
				return target[prop];
			}
			// Otherwise treat it as a table name
			return target.get(prop);
		},
	});
}
