/**
 * ModelManagerExtension - Harper Extension for AI model lifecycle management
 * Manages TensorFlow.js models, deployment, and monitoring for Harper-fabric
 */

import { ModelManager } from '../ai/ModelManager.js';

export class ModelManagerExtension {
  constructor(options = {}) {
    this.name = 'ModelManagerExtension';
    this.version = '1.0.0';
    this.modelManager = null;
    this.initialized = false;
    this.harperdb = null;
  }

  // Harper Extension lifecycle method
  async start(options = {}) {
    console.log('Starting ModelManagerExtension...');
    
    try {
      // Store HarperDB instance for database operations
      this.harperdb = options.harperdb;
      
      // Initialize ModelManager
      this.modelManager = new ModelManager({
        modelPath: options.modelPath || './ai/models',
        maxModels: options.maxModels || 10,
        modelTimeout: options.modelTimeout || 300000
      });

      await this.modelManager.initialize();
      
      this.initialized = true;
      console.log('ModelManagerExtension started successfully');
      
      return this;
    } catch (error) {
      console.error('Failed to start ModelManagerExtension:', error);
      throw error;
    }
  }

  // Public API for Resources to use
  async loadModel(modelName, modelPath, options = {}) {
    if (!this.initialized) {
      throw new Error('ModelManagerExtension not initialized');
    }

    try {
      const result = await this.modelManager.loadModel(modelName, modelPath, options);
      
      // Store model metadata in Harper database
      if (this.harperdb && result.success) {
        await this.storeModelMetadata(modelName, result.metadata);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      throw error;
    }
  }

  async unloadModel(modelName) {
    if (!this.initialized) {
      throw new Error('ModelManagerExtension not initialized');
    }

    try {
      const result = await this.modelManager.unloadModel(modelName);
      
      // Update model metadata in Harper database
      if (this.harperdb && result.success) {
        await this.updateModelStatus(modelName, 'unloaded');
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to unload model ${modelName}:`, error);
      throw error;
    }
  }

  async getModel(modelName) {
    if (!this.initialized) return null;

    try {
      return await this.modelManager.getModel(modelName);
    } catch (error) {
      console.error(`Failed to get model ${modelName}:`, error);
      return null;
    }
  }

  async listModels() {
    if (!this.initialized) return [];

    try {
      return await this.modelManager.listModels();
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  async deployModel(modelName, config = {}) {
    if (!this.initialized) {
      throw new Error('ModelManagerExtension not initialized');
    }

    try {
      const result = await this.modelManager.deployModel(modelName, config);
      
      // Update deployment status in Harper database
      if (this.harperdb && result.success) {
        await this.updateModelDeployment(modelName, 'deployed', config);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to deploy model ${modelName}:`, error);
      throw error;
    }
  }

  async rollbackModel(modelName, version) {
    if (!this.initialized) {
      throw new Error('ModelManagerExtension not initialized');
    }

    try {
      const result = await this.modelManager.rollbackModel(modelName, version);
      
      // Update rollback status in Harper database
      if (this.harperdb && result.success) {
        await this.recordModelRollback(modelName, version);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to rollback model ${modelName} to version ${version}:`, error);
      throw error;
    }
  }

  async getModelMetrics(modelName) {
    if (!this.initialized) return null;

    try {
      const metrics = await this.modelManager.getModelMetrics(modelName);
      
      // Enrich with Harper database metrics if available
      if (this.harperdb) {
        const dbMetrics = await this.getModelMetricsFromDB(modelName);
        return { ...metrics, ...dbMetrics };
      }
      
      return metrics;
    } catch (error) {
      console.error(`Failed to get metrics for model ${modelName}:`, error);
      return null;
    }
  }

  async updateModelMetrics(modelName, metrics) {
    if (!this.initialized) return false;

    try {
      const result = await this.modelManager.updateModelMetrics(modelName, metrics);
      
      // Store metrics in Harper database
      if (this.harperdb && result) {
        await this.storeModelMetrics(modelName, metrics);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to update metrics for model ${modelName}:`, error);
      return false;
    }
  }

  // Harper database integration methods
  async storeModelMetadata(modelName, metadata) {
    if (!this.harperdb) return;

    try {
      await this.harperdb.insert('ai_model_metadata', {
        id: `model_${modelName}_${Date.now()}`,
        model_name: modelName,
        metadata: metadata,
        status: 'loaded',
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      console.warn('Failed to store model metadata:', error);
    }
  }

  async updateModelStatus(modelName, status) {
    if (!this.harperdb) return;

    try {
      await this.harperdb.update('ai_model_metadata', 
        { model_name: modelName },
        { status: status, updated_at: new Date() }
      );
    } catch (error) {
      console.warn('Failed to update model status:', error);
    }
  }

  async updateModelDeployment(modelName, status, config) {
    if (!this.harperdb) return;

    try {
      await this.harperdb.insert('ai_model_deployments', {
        id: `deployment_${modelName}_${Date.now()}`,
        model_name: modelName,
        status: status,
        config: config,
        deployed_at: new Date()
      });
    } catch (error) {
      console.warn('Failed to record model deployment:', error);
    }
  }

  async recordModelRollback(modelName, version) {
    if (!this.harperdb) return;

    try {
      await this.harperdb.insert('ai_model_rollbacks', {
        id: `rollback_${modelName}_${Date.now()}`,
        model_name: modelName,
        target_version: version,
        rolled_back_at: new Date()
      });
    } catch (error) {
      console.warn('Failed to record model rollback:', error);
    }
  }

  async storeModelMetrics(modelName, metrics) {
    if (!this.harperdb) return;

    try {
      await this.harperdb.insert('ai_model_metrics', {
        id: `metrics_${modelName}_${Date.now()}`,
        model_name: modelName,
        metrics: metrics,
        recorded_at: new Date()
      });
    } catch (error) {
      console.warn('Failed to store model metrics:', error);
    }
  }

  async getModelMetricsFromDB(modelName) {
    if (!this.harperdb) return {};

    try {
      const results = await this.harperdb.searchByConditions('ai_model_metrics', [
        { search_attribute: 'model_name', search_value: modelName }
      ]);
      
      if (results && results.length > 0) {
        return results[results.length - 1].metrics; // Return latest metrics
      }
      
      return {};
    } catch (error) {
      console.warn('Failed to get model metrics from database:', error);
      return {};
    }
  }

  // Health and diagnostics
  async getHealth() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      modelManager: this.modelManager ? await this.modelManager.getHealth() : null,
      loadedModels: this.modelManager?.models?.size || 0,
      timestamp: Date.now()
    };
  }

  isReady() {
    return this.initialized && this.modelManager?.isReady();
  }

  // Configuration
  getConfig() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      modelPath: this.modelManager?.modelPath,
      maxModels: this.modelManager?.maxModels,
      loadedModels: this.modelManager?.models?.size || 0
    };
  }

  // Resource management
  async optimizeMemoryUsage() {
    if (!this.initialized) return false;

    try {
      return await this.modelManager.optimizeMemoryUsage();
    } catch (error) {
      console.error('Failed to optimize memory usage:', error);
      return false;
    }
  }

  async cleanupUnusedModels() {
    if (!this.initialized) return 0;

    try {
      return await this.modelManager.cleanupUnusedModels();
    } catch (error) {
      console.error('Failed to cleanup unused models:', error);
      return 0;
    }
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down ModelManagerExtension...');
    
    if (this.modelManager) {
      await this.modelManager.shutdown();
    }
    
    this.initialized = false;
    this.harperdb = null;
    console.log('ModelManagerExtension shut down');
  }
}

// Harper Extension export pattern
export default ModelManagerExtension;