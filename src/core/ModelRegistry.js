import { tables } from '@harperdb/harperdb';

/**
 * Model Registry - Store and retrieve models from Harper tables
 * Supports both ONNX and TensorFlow models
 */
export class ModelRegistry {
  constructor() {
    this.modelsTable = null;
  }

  async initialize() {
    // Get reference to Harper Model table
    this.modelsTable = tables.get('Model');
  }

  /**
   * Generate composite key for model
   */
  _buildModelKey(modelId, version) {
    return `${modelId}:${version}`;
  }

  /**
   * Parse composite key into modelId and version
   */
  _parseModelKey(key) {
    const [modelId, version] = key.split(':');
    return { modelId, version };
  }

  /**
   * Register a new model
   * @param {Object} registration - Model registration data
   * @returns {Object} Registered model
   */
  async registerModel(registration) {
    const { modelId, version, framework, modelBlob, inputSchema, outputSchema, metadata, stage } = registration;

    const id = this._buildModelKey(modelId, version);

    const record = {
      id,
      modelId,
      version,
      framework,
      modelBlob,
      inputSchema,
      outputSchema,
      metadata,
      stage: stage || 'development'
    };

    // Insert into Harper table
    await this.modelsTable.put(record);

    return {
      id,
      modelId,
      version,
      framework,
      stage: record.stage,
      uploadedAt: new Date()
    };
  }

  /**
   * Get a model by ID and optional version
   * @param {string} modelId - The model identifier
   * @param {string} [version] - Optional version (defaults to latest)
   * @returns {Object} Model record with blob
   */
  async getModel(modelId, version) {
    if (version) {
      // Get specific version
      const id = this._buildModelKey(modelId, version);
      const record = await this.modelsTable.get(id);
      return record || null;
    }

    // Get latest version - query all versions and sort by uploadedAt
    const allVersions = [];
    for await (const record of this.modelsTable.search({ modelId })) {
      allVersions.push(record);
    }

    if (allVersions.length === 0) {
      return null;
    }

    // Sort by uploadedAt descending (most recent first)
    allVersions.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    return allVersions[0];
  }

  /**
   * List all versions of a model
   * @param {string} modelId - The model identifier
   * @returns {Object[]} Array of model versions
   */
  async listVersions(modelId) {
    const versions = [];
    for await (const record of this.modelsTable.search({ modelId })) {
      versions.push({
        id: record.id,
        modelId: record.modelId,
        version: record.version,
        framework: record.framework,
        stage: record.stage,
        uploadedAt: record.uploadedAt
      });
    }
    return versions;
  }

  /**
   * List all models
   * @returns {Object[]} Array of all models
   */
  async listModels() {
    const models = [];
    for await (const record of this.modelsTable.search()) {
      models.push({
        id: record.id,
        modelId: record.modelId,
        version: record.version,
        framework: record.framework,
        stage: record.stage,
        uploadedAt: record.uploadedAt
      });
    }
    return models;
  }

  /**
   * Cleanup test data (for testing only)
   */
  async cleanup() {
    // Delete all test models
    const testModels = [];
    for await (const record of this.modelsTable.search()) {
      if (record.modelId.startsWith('test-')) {
        testModels.push(record.id);
      }
    }

    for (const id of testModels) {
      await this.modelsTable.delete(id);
    }
  }
}
