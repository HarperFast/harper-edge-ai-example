/**
 * Feature Store - Store entity features for inference
 * In-memory implementation for MVP (will migrate to Harper tables later)
 */
export class FeatureStore {
  constructor() {
    // In-memory storage: Map<entityId, Map<featureName, value>>
    this.features = new Map();
  }

  /**
   * Write features for an entity
   * @param {string} entityId - The entity identifier
   * @param {Object} features - Feature name-value pairs
   * @param {Date} [timestamp] - Optional timestamp (unused in minimal version)
   */
  async writeFeatures(entityId, features, timestamp) {
    // Store features
    this.features.set(entityId, { ...features });
  }

  /**
   * Get features for an entity
   * @param {string} entityId - The entity identifier
   * @param {string[]} featureNames - List of feature names to retrieve
   * @returns {Object} Feature name-value pairs
   */
  async getFeatures(entityId, featureNames) {
    const allFeatures = this.features.get(entityId);

    if (!allFeatures) {
      return {};
    }

    // Return only requested features
    const result = {};
    for (const name of featureNames) {
      if (name in allFeatures) {
        result[name] = allFeatures[name];
      }
    }

    return result;
  }

  /**
   * Get all features for an entity
   * @param {string} entityId - The entity identifier
   * @returns {Object} All features
   */
  async getAllFeatures(entityId) {
    return this.features.get(entityId) || {};
  }
}
