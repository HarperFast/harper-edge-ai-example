/**
 * ModelManager - Manages AI model lifecycle and deployment for Harper-fabric
 */

import * as tf from '@tensorflow/tfjs-node';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class ModelManager {
  constructor(options = {}) {
    this.modelPath = options.modelPath || './models';
    this.maxModels = options.maxModels || 10;
    this.modelTimeout = options.modelTimeout || 300000; // 5 minutes
    
    // Model registry with metadata
    this.models = new Map();
    this.modelConfigs = new Map();
    this.modelMetrics = new Map();
    this.loadingPromises = new Map();
    
    // Model lifecycle events
    this.eventHandlers = new Map();
    
    // Supported model types
    this.supportedTypes = [
      'collaborative-filtering',
      'content-based', 
      'hybrid-recommender',
      'user-segmentation',
      'price-elasticity',
      'click-prediction',
      'session-intent',
      'image-classification',
      'text-embeddings'
    ];
  }

  async initialize() {
    console.log('Initializing ModelManager...');
    
    try {
      // Ensure models directory exists
      await this.ensureModelDirectory();
      
      // Load model configurations
      await this.loadModelConfigurations();
      
      // Auto-discover models
      await this.discoverModels();
      
      // Start model health monitoring
      this.startHealthMonitoring();
      
      console.log(`ModelManager initialized with ${this.models.size} models`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize ModelManager:', error);
      throw error;
    }
  }

  async ensureModelDirectory() {
    try {
      await fs.access(this.modelPath);
    } catch {
      await fs.mkdir(this.modelPath, { recursive: true });
      console.log(`Created models directory: ${this.modelPath}`);
    }
  }

  async loadModelConfigurations() {
    const configPath = path.join(this.modelPath, 'model-configs.json');
    
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      const configs = JSON.parse(configData);
      
      Object.entries(configs).forEach(([name, config]) => {
        this.modelConfigs.set(name, {
          ...config,
          name,
          configuredAt: Date.now()
        });
      });
      
      console.log(`Loaded ${this.modelConfigs.size} model configurations`);
      
    } catch (error) {
      console.warn('No model configurations found, using defaults');
      await this.createDefaultConfigurations();
    }
  }

  async createDefaultConfigurations() {
    const defaultConfigs = {
      'collaborative-filtering': {
        path: 'collaborative-filtering',
        inputShape: [1, 100],
        outputShape: [1, 50],
        version: '1.0.0',
        description: 'Collaborative filtering for product recommendations',
        preprocessing: 'userProductMatrix',
        postprocessing: 'topKProducts',
        timeout: 100,
        memoryRequirement: '256MB',
        cpuRequirement: 'medium',
        batchSize: 32,
        warmupRequired: true
      },
      'content-based': {
        path: 'content-based',
        inputShape: [1, 512],
        outputShape: [1, 128],
        version: '1.0.0',
        description: 'Content-based filtering using product features',
        preprocessing: 'productFeatures',
        postprocessing: 'similarityScores',
        timeout: 100,
        memoryRequirement: '512MB',
        cpuRequirement: 'medium',
        batchSize: 16,
        warmupRequired: true
      },
      'hybrid-recommender': {
        path: 'hybrid',
        inputShape: [1, 256],
        outputShape: [1, 100],
        version: '1.0.0',
        description: 'Hybrid recommendation system combining multiple signals',
        preprocessing: 'combinedFeatures',
        postprocessing: 'weightedRecommendations',
        timeout: 150,
        memoryRequirement: '1GB',
        cpuRequirement: 'high',
        batchSize: 8,
        warmupRequired: true
      }
    };

    const configPath = path.join(this.modelPath, 'model-configs.json');
    await fs.writeFile(configPath, JSON.stringify(defaultConfigs, null, 2));
    
    Object.entries(defaultConfigs).forEach(([name, config]) => {
      this.modelConfigs.set(name, {
        ...config,
        name,
        configuredAt: Date.now()
      });
    });
  }

  async discoverModels() {
    try {
      const entries = await fs.readdir(this.modelPath, { withFileTypes: true });
      const directories = entries.filter(entry => entry.isDirectory());
      
      for (const dir of directories) {
        const modelName = dir.name;
        const modelDir = path.join(this.modelPath, modelName);
        
        // Check if model.json exists
        const modelFile = path.join(modelDir, 'model.json');
        
        try {
          await fs.access(modelFile);
          console.log(`Discovered model: ${modelName}`);
          
          // Optionally auto-load critical models
          if (this.shouldAutoLoad(modelName)) {
            await this.loadModel(modelName);
          }
          
        } catch {
          console.warn(`Model directory ${modelName} found but no model.json`);
        }
      }
      
    } catch (error) {
      console.error('Model discovery failed:', error);
    }
  }

  shouldAutoLoad(modelName) {
    const autoLoadModels = [
      'collaborative-filtering',
      'content-based',
      'hybrid-recommender'
    ];
    
    return autoLoadModels.includes(modelName);
  }

  async loadModel(modelName, options = {}) {
    // Check if already loaded
    if (this.models.has(modelName)) {
      console.log(`Model ${modelName} already loaded`);
      return this.models.get(modelName);
    }

    // Check if loading is in progress
    if (this.loadingPromises.has(modelName)) {
      console.log(`Model ${modelName} loading in progress, waiting...`);
      return await this.loadingPromises.get(modelName);
    }

    // Start loading
    const loadingPromise = this._performModelLoad(modelName, options);
    this.loadingPromises.set(modelName, loadingPromise);

    try {
      const result = await loadingPromise;
      this.loadingPromises.delete(modelName);
      return result;
    } catch (error) {
      this.loadingPromises.delete(modelName);
      throw error;
    }
  }

  async _performModelLoad(modelName, options = {}) {
    console.log(`Loading model: ${modelName}`);
    const startTime = Date.now();

    try {
      const config = this.modelConfigs.get(modelName);
      if (!config) {
        throw new Error(`No configuration found for model: ${modelName}`);
      }

      const modelDir = path.join(this.modelPath, config.path);
      const modelUrl = `file://${modelDir}/model.json`;

      // Check if model files exist
      await fs.access(path.join(modelDir, 'model.json'));

      // Load the TensorFlow.js model
      const model = await tf.loadLayersModel(modelUrl);

      // Validate model structure
      this.validateModel(model, config);

      // Perform warmup if required
      if (config.warmupRequired) {
        await this.warmupModel(model, config);
      }

      // Create model metadata
      const metadata = {
        model,
        config,
        loadedAt: Date.now(),
        loadTime: Date.now() - startTime,
        inferenceCount: 0,
        totalInferenceTime: 0,
        lastUsed: Date.now(),
        memoryUsage: this.estimateMemoryUsage(model),
        version: config.version,
        status: 'loaded'
      };

      // Store model and metadata
      this.models.set(modelName, metadata);
      this.modelMetrics.set(modelName, {
        loadTime: metadata.loadTime,
        inferences: 0,
        errors: 0,
        avgInferenceTime: 0
      });

      // Emit load event
      this.emit('model-loaded', { modelName, loadTime: metadata.loadTime });

      console.log(`Model ${modelName} loaded successfully in ${metadata.loadTime}ms`);
      return metadata;

    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      this.emit('model-load-failed', { modelName, error: error.message });
      
      // Try to create a mock model for development
      if (options.createMock !== false) {
        return await this.createMockModel(modelName);
      }
      
      throw error;
    }
  }

  validateModel(model, config) {
    // Check input/output shapes match configuration
    const inputShape = model.inputs[0].shape;
    const outputShape = model.outputs[0].shape;

    if (config.inputShape && !this.shapesMatch(inputShape, config.inputShape)) {
      console.warn(`Input shape mismatch for model. Expected: ${config.inputShape}, Got: ${inputShape}`);
    }

    if (config.outputShape && !this.shapesMatch(outputShape, config.outputShape)) {
      console.warn(`Output shape mismatch for model. Expected: ${config.outputShape}, Got: ${outputShape}`);
    }
  }

  shapesMatch(actual, expected) {
    if (actual.length !== expected.length) return false;
    
    for (let i = 0; i < actual.length; i++) {
      // Allow null/undefined for batch dimension
      if (actual[i] !== expected[i] && !(i === 0 && (actual[i] === null || expected[i] === null))) {
        return false;
      }
    }
    
    return true;
  }

  async warmupModel(model, config) {
    console.log(`Warming up model: ${config.name}`);
    
    try {
      // Create dummy input matching the expected shape
      const inputShape = config.inputShape.slice(); // Copy array
      if (inputShape[0] === null || inputShape[0] === undefined) {
        inputShape[0] = 1; // Set batch size to 1
      }
      
      const dummyInput = tf.randomNormal(inputShape);
      
      // Perform a few warmup inferences
      for (let i = 0; i < 3; i++) {
        const prediction = model.predict(dummyInput);
        if (Array.isArray(prediction)) {
          prediction.forEach(p => p.dispose());
        } else {
          prediction.dispose();
        }
      }
      
      dummyInput.dispose();
      console.log(`Model ${config.name} warmed up successfully`);
      
    } catch (error) {
      console.warn(`Model warmup failed for ${config.name}:`, error);
      // Continue anyway - warmup is optional
    }
  }

  async createMockModel(modelName) {
    console.log(`Creating mock model for ${modelName}`);
    
    const config = this.modelConfigs.get(modelName) || {
      inputShape: [1, 100],
      outputShape: [1, 10],
      name: modelName
    };

    // Create a simple sequential model
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          inputShape: config.inputShape.slice(1) // Remove batch dimension
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: config.outputShape[1] || 10,
          activation: 'sigmoid'
        })
      ]
    });

    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });

    const metadata = {
      model,
      config: { ...config, isMock: true },
      loadedAt: Date.now(),
      loadTime: 50, // Mock load time
      inferenceCount: 0,
      totalInferenceTime: 0,
      lastUsed: Date.now(),
      memoryUsage: this.estimateMemoryUsage(model),
      version: '0.0.1-mock',
      status: 'mock'
    };

    this.models.set(modelName, metadata);
    this.modelMetrics.set(modelName, {
      loadTime: metadata.loadTime,
      inferences: 0,
      errors: 0,
      avgInferenceTime: 0
    });

    console.log(`Mock model ${modelName} created successfully`);
    return metadata;
  }

  estimateMemoryUsage(model) {
    try {
      // Rough estimation based on model parameters
      const paramCount = model.countParams();
      const bytesPerParam = 4; // Float32
      return Math.round(paramCount * bytesPerParam / (1024 * 1024)); // MB
    } catch {
      return 0;
    }
  }

  async unloadModel(modelName) {
    const metadata = this.models.get(modelName);
    if (!metadata) {
      console.warn(`Model ${modelName} not loaded`);
      return false;
    }

    try {
      // Dispose TensorFlow.js model
      metadata.model.dispose();
      
      // Remove from registry
      this.models.delete(modelName);
      this.modelMetrics.delete(modelName);
      
      this.emit('model-unloaded', { modelName });
      console.log(`Model ${modelName} unloaded successfully`);
      
      return true;
    } catch (error) {
      console.error(`Failed to unload model ${modelName}:`, error);
      return false;
    }
  }

  async reloadModel(modelName) {
    console.log(`Reloading model: ${modelName}`);
    
    try {
      // Unload if currently loaded
      if (this.models.has(modelName)) {
        await this.unloadModel(modelName);
      }
      
      // Load fresh copy
      const result = await this.loadModel(modelName);
      
      this.emit('model-reloaded', { modelName });
      return result;
      
    } catch (error) {
      console.error(`Failed to reload model ${modelName}:`, error);
      throw error;
    }
  }

  getModel(modelName) {
    const metadata = this.models.get(modelName);
    if (!metadata) {
      console.warn(`Model ${modelName} not loaded`);
      return null;
    }

    // Update last used timestamp
    metadata.lastUsed = Date.now();
    
    return metadata.model;
  }

  getModelMetadata(modelName) {
    return this.models.get(modelName);
  }

  getAllModels() {
    const models = {};
    
    this.models.forEach((metadata, name) => {
      models[name] = {
        name,
        status: metadata.status,
        version: metadata.version,
        loadedAt: metadata.loadedAt,
        loadTime: metadata.loadTime,
        inferenceCount: metadata.inferenceCount,
        memoryUsage: metadata.memoryUsage,
        lastUsed: metadata.lastUsed,
        isMock: metadata.config?.isMock || false
      };
    });
    
    return models;
  }

  getModelMetrics(modelName) {
    if (modelName) {
      return this.modelMetrics.get(modelName);
    }
    
    // Return all metrics
    const allMetrics = {};
    this.modelMetrics.forEach((metrics, name) => {
      allMetrics[name] = metrics;
    });
    
    return allMetrics;
  }

  recordInference(modelName, inferenceTime, success = true) {
    const metadata = this.models.get(modelName);
    const metrics = this.modelMetrics.get(modelName);
    
    if (metadata) {
      metadata.inferenceCount++;
      metadata.totalInferenceTime += inferenceTime;
      metadata.lastUsed = Date.now();
    }
    
    if (metrics) {
      metrics.inferences++;
      if (success) {
        metrics.avgInferenceTime = 
          (metrics.avgInferenceTime * (metrics.inferences - 1) + inferenceTime) / 
          metrics.inferences;
      } else {
        metrics.errors++;
      }
    }
  }

  startHealthMonitoring() {
    // Monitor model health every 5 minutes
    this.healthMonitorInterval = setInterval(() => {
      this.checkModelHealth();
    }, 5 * 60 * 1000);
  }

  async checkModelHealth() {
    for (const [modelName, metadata] of this.models) {
      try {
        // Check if model is stale (not used in 30 minutes)
        const staleThreshold = 30 * 60 * 1000; // 30 minutes
        const isStale = Date.now() - metadata.lastUsed > staleThreshold;
        
        if (isStale && this.models.size > 3) {
          console.log(`Model ${modelName} is stale, considering unloading`);
          this.emit('model-stale', { modelName, lastUsed: metadata.lastUsed });
        }
        
        // Check memory usage
        const currentMemory = this.estimateMemoryUsage(metadata.model);
        if (currentMemory > metadata.memoryUsage * 1.5) {
          console.warn(`Model ${modelName} memory usage increased significantly`);
          this.emit('model-memory-warning', { modelName, currentMemory, originalMemory: metadata.memoryUsage });
        }
        
      } catch (error) {
        console.error(`Health check failed for model ${modelName}:`, error);
        this.emit('model-health-error', { modelName, error: error.message });
      }
    }
  }

  // Event system
  on(event, callback) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(callback);
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Event handler error for ${event}:`, error);
      }
    });
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down ModelManager...');
    
    // Stop health monitoring
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
    }
    
    // Unload all models
    const modelNames = Array.from(this.models.keys());
    for (const modelName of modelNames) {
      await this.unloadModel(modelName);
    }
    
    console.log('ModelManager shutdown complete');
  }

  // Utility methods
  isModelLoaded(modelName) {
    return this.models.has(modelName);
  }

  getLoadedModelCount() {
    return this.models.size;
  }

  getTotalMemoryUsage() {
    let total = 0;
    this.models.forEach(metadata => {
      total += metadata.memoryUsage || 0;
    });
    return total;
  }

  async healthCheck() {
    try {
      const loadedModels = this.models.size;
      const totalMemory = this.getTotalMemoryUsage();
      const avgLoadTime = this.getAverageLoadTime();
      
      return {
        healthy: loadedModels > 0,
        loadedModels,
        totalMemoryMB: totalMemory,
        avgLoadTimeMs: avgLoadTime,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  getAverageLoadTime() {
    if (this.models.size === 0) return 0;
    
    let total = 0;
    this.models.forEach(metadata => {
      total += metadata.loadTime || 0;
    });
    
    return Math.round(total / this.models.size);
  }
}