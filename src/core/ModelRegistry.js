import { tables } from '@harperdb/harperdb';

/**
 * Model Registry - Helper utilities for model key management
 * Users should use Harper's native @export endpoints for CRUD operations
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
}
