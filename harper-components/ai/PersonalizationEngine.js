/**
 * Harper-fabric PersonalizationEngine
 * TensorFlow.js-based real-time inference for outdoor gear personalization
 */

import * as tf from '@tensorflow/tfjs-node';
import { promises as fs } from 'fs';
import path from 'path';

export class PersonalizationEngine {
  constructor(options = {}) {
    this.modelCachePath = options.modelCachePath || './models';
    this.inferenceTimeout = options.inferenceTimeout || 100;
    this.fallbackToCache = options.fallbackToCache !== false;
    
    // Model registry
    this.models = new Map();
    this.modelMetadata = new Map();
    
    // User and product embeddings cache
    this.userEmbeddings = new Map();
    this.productEmbeddings = new Map();
    this.maxCacheSize = 10000;
    
    // Performance statistics
    this.stats = {
      inferences: 0,
      averageLatency: 0,
      errors: 0,
      cacheHits: 0,
      modelReloads: 0,
      enhancementSuccess: 0
    };
    
    // Model configurations
    this.modelConfigs = {
      'collaborative-filtering': {
        path: 'collaborative-filtering',
        inputShape: [1, 100],
        outputShape: [1, 50],
        preprocessing: 'userProductMatrix',
        postprocessing: 'topKProducts',
        timeout: 100
      },
      'content-based': {
        path: 'content-based',
        inputShape: [1, 512],
        outputShape: [1, 128],
        preprocessing: 'productFeatures',
        postprocessing: 'similarityScores',
        timeout: 100
      },
      'hybrid-recommender': {
        path: 'hybrid',
        inputShape: [1, 256],
        outputShape: [1, 100],
        preprocessing: 'combinedFeatures',
        postprocessing: 'weightedRecommendations',
        timeout: 150
      },
      'user-segmentation': {
        path: 'user-segmentation',
        inputShape: [1, 50],
        outputShape: [1, 10],
        preprocessing: 'userBehaviorVector',
        postprocessing: 'segmentProbabilities',
        timeout: 120
      },
      'price-elasticity': {
        path: 'price-elasticity',
        inputShape: [1, 20],
        outputShape: [1, 1],
        preprocessing: 'priceFeatures',
        postprocessing: 'optimalPrice',
        timeout: 80
      }
    };
    
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing PersonalizationEngine...');
    
    try {
      // Ensure model directory exists
      await this.ensureModelDirectory();
      
      // Load pre-configured models
      const modelsToLoad = ['collaborative-filtering', 'content-based', 'hybrid-recommender'];
      
      for (const modelName of modelsToLoad) {
        try {
          await this.loadModel(modelName);
          console.log(`Loaded model: ${modelName}`);
        } catch (error) {
          console.warn(`Failed to load model ${modelName}:`, error.message);
          // Create mock model for development
          await this.createMockModel(modelName);
        }
      }
      
      // Initialize feature extractors
      await this.initializeFeatureExtractors();
      
      this.initialized = true;
      console.log(`PersonalizationEngine initialized with ${this.models.size} models`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize PersonalizationEngine:', error);
      throw error;
    }
  }

  async loadModel(modelName) {
    const config = this.modelConfigs[modelName];
    if (!config) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const modelPath = path.join(this.modelCachePath, config.path);
    
    try {
      // Try to load from file system
      const modelUrl = `file://${modelPath}/model.json`;
      const model = await tf.loadLayersModel(modelUrl);
      
      this.models.set(modelName, model);
      this.modelMetadata.set(modelName, {
        ...config,
        loadedAt: Date.now(),
        inputShape: model.inputs[0].shape,
        outputShape: model.outputs[0].shape
      });
      
      console.log(`Model ${modelName} loaded successfully`);
      return model;
      
    } catch (error) {
      console.warn(`Failed to load model from ${modelPath}:`, error.message);
      throw error;
    }
  }

  async createMockModel(modelName) {
    const config = this.modelConfigs[modelName];
    console.log(`Creating mock model for ${modelName}`);
    
    // Create a simple sequential model for development/demo
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: config.inputShape.slice(1) // Remove batch dimension
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: config.outputShape[1], // Output dimension
          activation: 'sigmoid'
        })
      ]
    });

    // Compile the model
    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError',
      metrics: ['accuracy']
    });

    this.models.set(modelName, model);
    this.modelMetadata.set(modelName, {
      ...config,
      loadedAt: Date.now(),
      isMock: true
    });

    return model;
  }

  async ensureModelDirectory() {
    try {
      await fs.access(this.modelCachePath);
    } catch {
      await fs.mkdir(this.modelCachePath, { recursive: true });
    }
  }

  async initializeFeatureExtractors() {
    // Initialize text and image feature extractors
    // In a production environment, these would be more sophisticated
    this.featureExtractors = {
      text: this.createTextEmbedder(),
      image: this.createImageEmbedder()
    };
  }

  createTextEmbedder() {
    // Simple text feature extraction (in production, use pre-trained embeddings)
    return {
      embed: (text) => {
        if (!text) return new Array(100).fill(0);
        
        const words = text.toLowerCase().split(/\s+/);
        const features = new Array(100).fill(0);
        
        words.forEach((word, idx) => {
          if (idx < 100) {
            features[idx] = word.length / 10; // Simple feature
          }
        });
        
        return features;
      }
    };
  }

  createImageEmbedder() {
    return {
      embed: (imageUrl) => {
        // Mock image features (in production, use CNN features)
        return new Array(512).fill(Math.random());
      }
    };
  }

  /**
   * Enhanced product recommendations using collaborative filtering
   */
  async enhanceProductRecommendations(data, userContext, tenant) {
    const startTime = Date.now();
    
    try {
      const products = this.extractProducts(data, tenant.responseFormat);
      if (!products || products.length === 0) {
        return data;
      }

      // Get user preferences and history
      const userProfile = await this.getUserProfile(userContext.userId, tenant.id);
      
      // Generate recommendations using collaborative filtering
      const model = this.models.get('collaborative-filtering');
      if (!model) {
        console.warn('Collaborative filtering model not available');
        return data;
      }

      const inputTensor = this.prepareCollaborativeInput(userProfile, products);
      const predictions = await this.runInference(model, inputTensor, 'collaborative-filtering');
      
      // Get top-k recommendations
      const recommendations = await this.getTopKRecommendations(
        predictions,
        products,
        tenant.recommendationLimit || 10
      );

      // Dispose tensors
      inputTensor.dispose();
      predictions.dispose();

      // Record performance metrics
      this.recordInferenceMetrics('collaborative-filtering', Date.now() - startTime, true);

      return this.mergeRecommendations(data, recommendations, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance product recommendations:', error);
      this.recordInferenceMetrics('collaborative-filtering', Date.now() - startTime, false);
      return data;
    }
  }

  /**
   * Enhanced search results with personalized ranking
   */
  async enhanceSearchResults(data, userContext, tenant) {
    const startTime = Date.now();
    
    try {
      const results = this.extractSearchResults(data, tenant.responseFormat);
      if (!results || results.length === 0) {
        return data;
      }

      const userProfile = await this.getUserProfile(userContext.userId, tenant.id);
      
      // Re-rank results based on user preferences
      const rankedResults = await this.rerankSearchResults(results, userProfile, tenant);
      
      this.recordInferenceMetrics('search-ranking', Date.now() - startTime, true);
      
      return this.mergeSearchResults(data, rankedResults, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance search results:', error);
      this.recordInferenceMetrics('search-ranking', Date.now() - startTime, false);
      return data;
    }
  }

  /**
   * Enhanced product listing with personalized scoring
   */
  async enhanceProductListing(data, userContext, tenant) {
    const startTime = Date.now();
    
    try {
      const products = this.extractProducts(data, tenant.responseFormat);
      if (!products || products.length === 0) {
        return data;
      }

      const userProfile = await this.getUserProfile(userContext.userId, tenant.id);
      
      // Score products using hybrid model
      const scoredProducts = await this.scoreProducts(products, userProfile, tenant);
      
      // Sort by personalized score
      const sortedProducts = scoredProducts.sort((a, b) => b.personalizedScore - a.personalizedScore);
      
      // Add personalization metadata
      const enhancedProducts = sortedProducts.map(product => ({
        ...product,
        personalized: true,
        affinityScore: product.personalizedScore,
        personalizedTags: this.generatePersonalizedTags(product, userProfile)
      }));

      this.recordInferenceMetrics('product-scoring', Date.now() - startTime, true);
      
      return this.mergeProducts(data, enhancedProducts, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance product listing:', error);
      this.recordInferenceMetrics('product-scoring', Date.now() - startTime, false);
      return data;
    }
  }

  /**
   * Dynamic pricing optimization
   */
  async enhanceDynamicPricing(data, userContext, tenant) {
    const startTime = Date.now();
    
    try {
      const products = this.extractProducts(data, tenant.responseFormat);
      if (!products || products.length === 0) {
        return data;
      }

      const userProfile = await this.getUserProfile(userContext.userId, tenant.id);
      const userSegment = await this.getUserSegment(userProfile, tenant);
      
      // Calculate personalized pricing
      const pricedProducts = await this.calculateDynamicPricing(
        products,
        userProfile,
        userSegment,
        tenant
      );

      this.recordInferenceMetrics('dynamic-pricing', Date.now() - startTime, true);
      
      return this.mergePricing(data, pricedProducts, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance pricing:', error);
      this.recordInferenceMetrics('dynamic-pricing', Date.now() - startTime, false);
      return data;
    }
  }

  async getUserProfile(userId, tenantId) {
    // Check cache first
    const cacheKey = `${tenantId}:${userId}`;
    if (this.userEmbeddings.has(cacheKey)) {
      return this.userEmbeddings.get(cacheKey);
    }

    // Create default profile for new users
    const defaultProfile = {
      userId,
      tenantId,
      preferences: {},
      behaviorData: {},
      segments: [],
      purchaseHistory: [],
      categoryAffinity: {},
      priceElasticity: 0.5,
      embeddings: new Array(100).fill(Math.random() * 0.1) // Random initialization
    };

    // Cache the profile
    if (this.userEmbeddings.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.userEmbeddings.keys().next().value;
      this.userEmbeddings.delete(firstKey);
    }
    
    this.userEmbeddings.set(cacheKey, defaultProfile);
    
    return defaultProfile;
  }

  async getUserSegment(userProfile, tenant) {
    const model = this.models.get('user-segmentation');
    if (!model) {
      return 'general'; // Default segment
    }

    try {
      const inputTensor = this.prepareUserSegmentationInput(userProfile);
      const predictions = await this.runInference(model, inputTensor, 'user-segmentation');
      
      const segmentProbs = await predictions.data();
      const maxIndex = segmentProbs.indexOf(Math.max(...segmentProbs));
      
      inputTensor.dispose();
      predictions.dispose();
      
      const segments = ['premium', 'price-sensitive', 'brand-loyal', 'impulse', 'researcher'];
      return segments[maxIndex] || 'general';
      
    } catch (error) {
      console.error('User segmentation failed:', error);
      return 'general';
    }
  }

  async runInference(model, inputTensor, modelName) {
    const startTime = Date.now();
    const config = this.modelConfigs[modelName];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Inference timeout for ${modelName}`));
      }, config?.timeout || this.inferenceTimeout);

      model.predict(inputTensor).then(predictions => {
        clearTimeout(timeout);
        const inferenceTime = Date.now() - startTime;
        
        // Update statistics
        this.stats.inferences++;
        this.stats.averageLatency = 
          (this.stats.averageLatency * (this.stats.inferences - 1) + inferenceTime) / 
          this.stats.inferences;
          
        resolve(predictions);
      }).catch(error => {
        clearTimeout(timeout);
        this.stats.errors++;
        reject(error);
      });
    });
  }

  prepareCollaborativeInput(userProfile, products) {
    // Create user-product interaction matrix
    const features = new Array(100).fill(0);
    
    // User features
    features.fill(userProfile.embeddings || 0, 0, 50);
    
    // Product features (aggregated)
    if (products.length > 0) {
      const productFeatures = products.slice(0, 10).map(p => 
        this.extractProductFeatures(p)
      );
      
      productFeatures.forEach((pf, idx) => {
        if (idx < 50) {
          features[50 + idx] = pf.reduce((a, b) => a + b, 0) / pf.length;
        }
      });
    }
    
    return tf.tensor2d([features]);
  }

  prepareUserSegmentationInput(userProfile) {
    const features = [
      userProfile.behaviorData?.pageViews || 0,
      userProfile.behaviorData?.sessionDuration || 0,
      userProfile.purchaseHistory?.length || 0,
      userProfile.behaviorData?.cartAbandonment || 0,
      userProfile.priceElasticity || 0.5,
      // Add more behavioral features...
    ];
    
    // Pad to expected input size
    while (features.length < 50) {
      features.push(0);
    }
    
    return tf.tensor2d([features.slice(0, 50)]);
  }

  extractProductFeatures(product) {
    return [
      product.price || 0,
      product.rating || 0,
      product.reviewCount || 0,
      product.category?.length || 0,
      product.brand?.length || 0
    ];
  }

  async getTopKRecommendations(predictions, products, k) {
    const scores = await predictions.data();
    
    // Create product-score pairs
    const scoredProducts = products.map((product, idx) => ({
      ...product,
      recommendationScore: scores[idx] || Math.random()
    }));
    
    // Sort by score and take top-k
    return scoredProducts
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, k);
  }

  async scoreProducts(products, userProfile, tenant) {
    const model = this.models.get('hybrid-recommender');
    if (!model) {
      // Fallback to simple scoring
      return products.map(product => ({
        ...product,
        personalizedScore: Math.random() * 0.5 + 0.5 // 0.5-1.0
      }));
    }

    try {
      const batchSize = 10;
      const scoredProducts = [];
      
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const inputTensor = this.prepareBatchInput(userProfile, batch);
        const predictions = await this.runInference(model, inputTensor, 'hybrid-recommender');
        
        const scores = await predictions.data();
        
        batch.forEach((product, idx) => {
          scoredProducts.push({
            ...product,
            personalizedScore: scores[idx] || Math.random()
          });
        });
        
        inputTensor.dispose();
        predictions.dispose();
      }
      
      return scoredProducts;
      
    } catch (error) {
      console.error('Product scoring failed:', error);
      return products.map(product => ({
        ...product,
        personalizedScore: Math.random() * 0.5 + 0.5
      }));
    }
  }

  prepareBatchInput(userProfile, products) {
    const features = products.map(product => {
      const userFeats = userProfile.embeddings?.slice(0, 128) || new Array(128).fill(0);
      const prodFeats = this.extractProductFeatures(product);
      
      // Pad product features to 128
      while (prodFeats.length < 128) {
        prodFeats.push(0);
      }
      
      return [...userFeats, ...prodFeats.slice(0, 128)];
    });
    
    return tf.tensor2d(features);
  }

  async calculateDynamicPricing(products, userProfile, userSegment, tenant) {
    const priceModel = this.models.get('price-elasticity');
    const maxDiscount = tenant.maxDiscount || 0.2;
    
    return products.map(product => {
      const originalPrice = product.price || 0;
      let discount = 0;
      
      // Simple rule-based pricing for demo
      switch (userSegment) {
        case 'price-sensitive':
          discount = maxDiscount * 0.8; // 80% of max discount
          break;
        case 'premium':
          discount = maxDiscount * 0.2; // 20% of max discount
          break;
        case 'impulse':
          discount = maxDiscount * 0.6; // 60% of max discount
          break;
        default:
          discount = maxDiscount * 0.5; // 50% of max discount
      }
      
      const personalizedPrice = originalPrice * (1 - discount);
      const savingsAmount = originalPrice - personalizedPrice;
      
      return {
        ...product,
        originalPrice,
        personalizedPrice,
        discount,
        savingsAmount,
        personalizedPricing: discount > 0
      };
    });
  }

  generatePersonalizedTags(product, userProfile) {
    const tags = [];
    
    if (product.personalizedScore > 0.8) {
      tags.push('Recommended for you');
    }
    
    if (userProfile.categoryAffinity?.[product.category] > 0.7) {
      tags.push('Your favorite category');
    }
    
    if (product.discount > 0.1) {
      tags.push('Special price');
    }
    
    return tags;
  }

  recordInferenceMetrics(modelName, latency, success) {
    this.stats.inferences++;
    this.stats.averageLatency = 
      (this.stats.averageLatency * (this.stats.inferences - 1) + latency) / 
      this.stats.inferences;
      
    if (success) {
      this.stats.enhancementSuccess++;
    } else {
      this.stats.errors++;
    }
  }

  // Utility methods for data extraction and merging
  extractProducts(data, format) {
    if (format === 'standard') {
      return data.products || data.items || data.results || [];
    } else if (format === 'nested') {
      return data.data?.products || data.data?.items || [];
    }
    return data.products || data.items || data.results || data.data?.products || [];
  }

  extractSearchResults(data, format) {
    if (format === 'standard') {
      return data.results || data.hits || data.items || [];
    }
    return data.results || data.hits || data.data?.results || [];
  }

  mergeRecommendations(originalData, recommendations, format) {
    if (format === 'standard') {
      return {
        ...originalData,
        recommendations,
        enhanced: true,
        personalizationApplied: true
      };
    } else {
      return {
        ...originalData,
        data: {
          ...originalData.data,
          recommendations
        },
        metadata: {
          ...originalData.metadata,
          enhanced: true,
          personalizationApplied: true
        }
      };
    }
  }

  mergeProducts(originalData, enhancedProducts, format) {
    if (format === 'standard') {
      return {
        ...originalData,
        products: enhancedProducts,
        personalizationApplied: true
      };
    } else {
      return {
        ...originalData,
        data: {
          ...originalData.data,
          products: enhancedProducts
        }
      };
    }
  }

  mergeSearchResults(originalData, rankedResults, format) {
    if (format === 'standard') {
      return {
        ...originalData,
        results: rankedResults,
        personalizationApplied: true
      };
    } else {
      return {
        ...originalData,
        data: {
          ...originalData.data,
          results: rankedResults
        }
      };
    }
  }

  mergePricing(originalData, pricedProducts, format) {
    return this.mergeProducts(originalData, pricedProducts, format);
  }

  // Public API methods
  async healthCheck() {
    try {
      const loadedModels = this.models.size;
      const totalModels = Object.keys(this.modelConfigs).length;
      
      return loadedModels > 0 && this.initialized;
    } catch {
      return false;
    }
  }

  async isReady() {
    return this.initialized && this.models.size > 0;
  }

  getLoadedModels() {
    const models = {};
    this.models.forEach((model, name) => {
      const metadata = this.modelMetadata.get(name);
      models[name] = {
        loaded: true,
        loadedAt: metadata?.loadedAt,
        isMock: metadata?.isMock || false,
        inputShape: metadata?.inputShape,
        outputShape: metadata?.outputShape
      };
    });
    return models;
  }

  getStats() {
    return { ...this.stats };
  }

  async reloadModel(modelName) {
    try {
      if (this.models.has(modelName)) {
        const oldModel = this.models.get(modelName);
        oldModel.dispose();
        this.models.delete(modelName);
        this.modelMetadata.delete(modelName);
      }
      
      await this.loadModel(modelName);
      this.stats.modelReloads++;
      
      return { success: true, modelName };
    } catch (error) {
      return { success: false, modelName, error: error.message };
    }
  }

  getModelCount() {
    return this.models.size;
  }
}