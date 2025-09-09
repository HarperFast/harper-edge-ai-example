/**
 * PersonalizationEngine - TensorFlow.js-based real-time inference engine
 */

const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const fs = require('fs').promises;

class PersonalizationEngine {
  constructor(options) {
    this.modelCachePath = options.modelCachePath || './models';
    this.preloadModels = options.preloadModels || [];
    this.inferenceTimeout = options.inferenceTimeout || 100;
    this.fallbackToCache = options.fallbackToCache !== false;
    
    // Model registry
    this.models = new Map();
    
    // User embeddings cache
    this.userEmbeddings = new Map();
    this.maxEmbeddingsCacheSize = 10000;
    
    // Product embeddings cache
    this.productEmbeddings = new Map();
    
    // Inference statistics
    this.stats = {
      inferences: 0,
      averageLatency: 0,
      errors: 0,
      cacheHits: 0,
      modelReloads: 0
    };
    
    // Model configurations
    this.modelConfigs = {
      'collaborative-filtering': {
        path: 'collaborative-filtering',
        inputShape: [1, 100],
        outputShape: [1, 50],
        preprocessing: 'userProductMatrix',
        postprocessing: 'topKProducts'
      },
      'content-based': {
        path: 'content-based',
        inputShape: [1, 512],
        outputShape: [1, 128],
        preprocessing: 'productFeatures',
        postprocessing: 'similarityScores'
      },
      'hybrid': {
        path: 'hybrid-recommender',
        inputShape: [1, 256],
        outputShape: [1, 100],
        preprocessing: 'combinedFeatures',
        postprocessing: 'weightedRecommendations'
      },
      'user-segmentation': {
        path: 'user-segmentation',
        inputShape: [1, 50],
        outputShape: [1, 10],
        preprocessing: 'userBehaviorVector',
        postprocessing: 'segmentProbabilities'
      },
      'price-elasticity': {
        path: 'price-elasticity',
        inputShape: [1, 20],
        outputShape: [1, 1],
        preprocessing: 'priceFeatures',
        postprocessing: 'optimalPrice'
      },
      'click-prediction': {
        path: 'click-prediction',
        inputShape: [1, 128],
        outputShape: [1, 1],
        preprocessing: 'contextFeatures',
        postprocessing: 'clickProbability'
      },
      'session-intent': {
        path: 'session-intent',
        inputShape: [1, 256],
        outputShape: [1, 5],
        preprocessing: 'sessionSequence',
        postprocessing: 'intentClassification'
      }
    };
    
    // Feature extractors
    this.featureExtractors = {
      textEmbedding: null,
      imageEmbedding: null
    };
  }
  
  async initialize() {
    // Create model cache directory
    await this.ensureModelDirectory();
    
    // Load pre-configured models
    for (const modelName of this.preloadModels) {
      await this.loadModel(modelName);
    }
    
    // Initialize feature extractors
    await this.initializeFeatureExtractors();
    
    // Start model health monitoring
    this.startHealthMonitoring();
    
    console.log(`PersonalizationEngine initialized with ${this.models.size} models`);
    return true;
  }
  
  async loadModel(modelName) {
    try {
      const config = this.modelConfigs[modelName];
      if (!config) {
        throw new Error(`Unknown model: ${modelName}`);
      }
      
      // Try to load from local cache first
      const modelPath = path.join(this.modelCachePath, config.path);
      let model;
      
      try {
        // Load pre-trained model or create a simple one for demo
        model = await this.loadOrCreateModel(modelPath, config);
      } catch (error) {
        console.log(`Creating new model for ${modelName}`);
        model = await this.createDefaultModel(config);
      }
      
      // Warm up the model
      await this.warmupModel(model, config);
      
      // Store in registry
      this.models.set(modelName, {
        model,
        config,
        loadedAt: Date.now(),
        inferenceCount: 0,
        averageLatency: 0
      });
      
      console.log(`Loaded model: ${modelName}`);
      return true;
      
    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      return false;
    }
  }
  
  async loadOrCreateModel(modelPath, config) {
    try {
      // Try to load existing model
      const model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
      return model;
    } catch (error) {
      // Create a new model if not found
      return await this.createDefaultModel(config);
    }
  }
  
  async createDefaultModel(config) {
    // Create a simple neural network for demonstration
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: config.inputShape.slice(1),
          units: 128,
          activation: 'relu',
          kernelInitializer: 'glorotUniform'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelInitializer: 'glorotUniform'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: config.outputShape[1],
          activation: config.outputShape[1] === 1 ? 'sigmoid' : 'softmax',
          kernelInitializer: 'glorotUniform'
        })
      ]
    });
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: config.outputShape[1] === 1 ? 'binaryCrossentropy' : 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    return model;
  }
  
  async warmupModel(model, config) {
    // Run a dummy inference to warm up the model
    const dummyInput = tf.randomNormal(config.inputShape);
    const prediction = model.predict(dummyInput);
    
    // Clean up tensors
    dummyInput.dispose();
    prediction.dispose();
  }
  
  async initializeFeatureExtractors() {
    // Initialize Universal Sentence Encoder for text embeddings
    try {
      const use = await tf.loadGraphModel(
        'https://tfhub.dev/google/tfjs-model/universal-sentence-encoder-lite/1/default/1',
        { fromTFHub: true }
      );
      this.featureExtractors.textEmbedding = use;
    } catch (error) {
      console.log('Text embedding model not loaded, using fallback');
      this.featureExtractors.textEmbedding = this.createFallbackTextEmbedding();
    }
  }
  
  createFallbackTextEmbedding() {
    // Simple bag-of-words embedding as fallback
    return {
      embed: (texts) => {
        // Simple hash-based embedding
        const embeddings = texts.map(text => {
          const words = text.toLowerCase().split(/\s+/);
          const vector = new Array(128).fill(0);
          
          words.forEach(word => {
            const hash = this.hashString(word);
            vector[hash % 128] += 1;
          });
          
          // Normalize
          const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
          if (norm > 0) {
            return vector.map(val => val / norm);
          }
          return vector;
        });
        
        return tf.tensor2d(embeddings);
      }
    };
  }
  
  // Main recommendation method
  async getRecommendations(params) {
    const startTime = Date.now();
    
    try {
      const {
        userId,
        products,
        userPreferences,
        deviceType,
        limit = 10
      } = params;
      
      // Get or compute user embedding
      const userEmbedding = await this.getUserEmbedding(userId, userPreferences);
      
      // Get product embeddings
      const productEmbeddings = await this.getProductEmbeddings(products);
      
      // Use hybrid model for recommendations
      const model = this.models.get('hybrid');
      if (!model) {
        return this.fallbackRecommendations(products, limit);
      }
      
      // Prepare input features
      const inputFeatures = await this.prepareHybridFeatures(
        userEmbedding,
        productEmbeddings,
        deviceType
      );
      
      // Run inference
      const predictions = await this.runInference(model, inputFeatures);
      
      // Post-process and rank
      const recommendations = await this.processRecommendations(
        predictions,
        products,
        limit
      );
      
      // Update stats
      this.updateStats(Date.now() - startTime);
      
      return recommendations;
      
    } catch (error) {
      console.error('Recommendation error:', error);
      this.stats.errors++;
      
      if (this.fallbackToCache) {
        return this.fallbackRecommendations(params.products, params.limit);
      }
      
      throw error;
    }
  }
  
  // Re-ranking for search results
  async rerankResults(params) {
    const {
      userId,
      results,
      query,
      userPreferences,
      boostPersonalized = 1.5
    } = params;
    
    try {
      // Get user embedding
      const userEmbedding = await this.getUserEmbedding(userId, userPreferences);
      
      // Get query embedding
      const queryEmbedding = await this.getTextEmbedding(query);
      
      // Score each result
      const scoredResults = await Promise.all(
        results.map(async (result) => {
          const score = await this.scoreResult(
            result,
            userEmbedding,
            queryEmbedding,
            boostPersonalized
          );
          
          return { ...result, personalizedScore: score };
        })
      );
      
      // Sort by personalized score
      return scoredResults.sort((a, b) => b.personalizedScore - a.personalizedScore);
      
    } catch (error) {
      console.error('Reranking error:', error);
      return results; // Return original order on error
    }
  }
  
  // Product scoring for personalized listings
  async scoreProducts(params) {
    const {
      userId,
      products,
      userPreferences,
      categoryWeights = {}
    } = params;
    
    try {
      const userEmbedding = await this.getUserEmbedding(userId, userPreferences);
      
      // Use click prediction model
      const model = this.models.get('click-prediction');
      if (!model) {
        return this.fallbackScoring(products);
      }
      
      // Score each product
      const scoredProducts = await Promise.all(
        products.map(async (product) => {
          const features = await this.prepareClickFeatures(
            product,
            userEmbedding,
            categoryWeights
          );
          
          const prediction = await this.runInference(model, features);
          const score = prediction.dataSync()[0];
          
          return {
            ...product,
            personalizedScore: score,
            scoreConfidence: this.calculateConfidence(score)
          };
        })
      );
      
      return scoredProducts;
      
    } catch (error) {
      console.error('Scoring error:', error);
      return this.fallbackScoring(products);
    }
  }
  
  // Dynamic pricing calculation
  async calculateDynamicPricing(params) {
    const {
      userId,
      products,
      userSegment,
      pricingStrategy = 'optimize-conversion',
      maxDiscount = 0.2
    } = params;
    
    try {
      const model = this.models.get('price-elasticity');
      if (!model) {
        return products; // Return original prices
      }
      
      // Calculate personalized prices
      const pricedProducts = await Promise.all(
        products.map(async (product) => {
          const features = await this.preparePriceFeatures(
            product,
            userSegment,
            pricingStrategy
          );
          
          const prediction = await this.runInference(model, features);
          const elasticity = prediction.dataSync()[0];
          
          // Calculate optimal price
          const optimalPrice = this.calculateOptimalPrice(
            product.price,
            elasticity,
            maxDiscount,
            pricingStrategy
          );
          
          return {
            ...product,
            personalizedPrice: optimalPrice,
            discount: (product.price - optimalPrice) / product.price,
            savingsAmount: product.price - optimalPrice
          };
        })
      );
      
      return pricedProducts;
      
    } catch (error) {
      console.error('Pricing error:', error);
      return products;
    }
  }
  
  // Content personalization
  async personalizeContent(params) {
    const {
      userId,
      content,
      userPreferences,
      deviceType,
      contentRules = {}
    } = params;
    
    try {
      // Detect user intent
      const intent = await this.detectUserIntent(userId, userPreferences);
      
      // Apply content rules based on intent and preferences
      const personalized = this.applyContentRules(
        content,
        intent,
        userPreferences,
        deviceType,
        contentRules
      );
      
      return personalized;
      
    } catch (error) {
      console.error('Content personalization error:', error);
      return content;
    }
  }
  
  // User segmentation
  async getUserSegment(params) {
    const {
      userId,
      preferences,
      segmentationRules = {}
    } = params;
    
    try {
      const model = this.models.get('user-segmentation');
      if (!model) {
        return 'default';
      }
      
      const features = await this.prepareSegmentationFeatures(userId, preferences);
      const prediction = await this.runInference(model, features);
      const probabilities = prediction.dataSync();
      
      // Map to segment names
      const segments = ['budget', 'premium', 'frequent', 'occasional', 'new', 
                       'loyal', 'browser', 'buyer', 'influencer', 'default'];
      
      const maxIndex = probabilities.indexOf(Math.max(...probabilities));
      return segments[maxIndex] || 'default';
      
    } catch (error) {
      console.error('Segmentation error:', error);
      return 'default';
    }
  }
  
  // Helper methods
  async getUserEmbedding(userId, preferences) {
    // Check cache
    if (this.userEmbeddings.has(userId)) {
      this.stats.cacheHits++;
      return this.userEmbeddings.get(userId);
    }
    
    // Generate embedding
    const embedding = await this.generateUserEmbedding(userId, preferences);
    
    // Cache with size limit
    if (this.userEmbeddings.size >= this.maxEmbeddingsCacheSize) {
      const firstKey = this.userEmbeddings.keys().next().value;
      this.userEmbeddings.delete(firstKey);
    }
    
    this.userEmbeddings.set(userId, embedding);
    return embedding;
  }
  
  async generateUserEmbedding(userId, preferences) {
    // Create user feature vector
    const features = [];
    
    // Add preference features
    features.push(preferences?.priceRange === 'high' ? 1 : 0);
    features.push(preferences?.priceRange === 'medium' ? 1 : 0);
    features.push(preferences?.priceRange === 'low' ? 1 : 0);
    
    // Add behavioral features (would come from database in production)
    features.push(Math.random()); // Purchase frequency
    features.push(Math.random()); // Average order value
    features.push(Math.random()); // Category diversity
    
    // Pad to expected size
    while (features.length < 50) {
      features.push(0);
    }
    
    return tf.tensor2d([features], [1, 50]);
  }
  
  async getProductEmbeddings(products) {
    const embeddings = await Promise.all(
      products.map(async (product) => {
        if (this.productEmbeddings.has(product.id)) {
          return this.productEmbeddings.get(product.id);
        }
        
        const embedding = await this.generateProductEmbedding(product);
        this.productEmbeddings.set(product.id, embedding);
        return embedding;
      })
    );
    
    return tf.stack(embeddings);
  }
  
  async generateProductEmbedding(product) {
    const features = [];
    
    // Price features
    features.push(product.price ? product.price / 1000 : 0); // Normalized price
    features.push(product.discount || 0);
    
    // Category features (one-hot encoding)
    const categories = ['electronics', 'clothing', 'home', 'sports', 'books'];
    categories.forEach(cat => {
      features.push(product.category === cat ? 1 : 0);
    });
    
    // Popularity features
    features.push(product.rating || 0);
    features.push(product.reviewCount ? Math.log(product.reviewCount + 1) : 0);
    
    // Text features (if available)
    if (product.description && this.featureExtractors.textEmbedding) {
      const textEmbedding = await this.getTextEmbedding(product.description);
      const textFeatures = await textEmbedding.array();
      features.push(...textFeatures[0].slice(0, 20)); // Use first 20 dimensions
    } else {
      // Pad with zeros
      for (let i = 0; i < 20; i++) {
        features.push(0);
      }
    }
    
    // Ensure correct size
    while (features.length < 128) {
      features.push(0);
    }
    
    return tf.tensor2d([features.slice(0, 128)], [1, 128]);
  }
  
  async getTextEmbedding(text) {
    if (!this.featureExtractors.textEmbedding) {
      // Return random embedding as fallback
      return tf.randomNormal([1, 128]);
    }
    
    return await this.featureExtractors.textEmbedding.embed([text]);
  }
  
  async prepareHybridFeatures(userEmbedding, productEmbeddings, deviceType) {
    // Combine user and product features
    const userFeatures = await userEmbedding.array();
    const productFeatures = await productEmbeddings.mean(0).array();
    
    const combined = [
      ...userFeatures[0],
      ...productFeatures,
      deviceType === 'mobile' ? 1 : 0,
      deviceType === 'tablet' ? 1 : 0,
      deviceType === 'desktop' ? 1 : 0
    ];
    
    // Ensure correct input size
    while (combined.length < 256) {
      combined.push(0);
    }
    
    return tf.tensor2d([combined.slice(0, 256)], [1, 256]);
  }
  
  async prepareClickFeatures(product, userEmbedding, categoryWeights) {
    const productEmbedding = await this.generateProductEmbedding(product);
    const userFeatures = await userEmbedding.array();
    const productFeatures = await productEmbedding.array();
    
    // Calculate similarity
    const similarity = this.cosineSimilarity(userFeatures[0], productFeatures[0]);
    
    // Category weight
    const categoryWeight = categoryWeights[product.category] || 1.0;
    
    const features = [
      similarity,
      categoryWeight,
      product.price ? Math.log(product.price + 1) : 0,
      product.rating || 0,
      ...userFeatures[0].slice(0, 20),
      ...productFeatures[0].slice(0, 20)
    ];
    
    // Pad to expected size
    while (features.length < 128) {
      features.push(0);
    }
    
    return tf.tensor2d([features.slice(0, 128)], [1, 128]);
  }
  
  async preparePriceFeatures(product, userSegment, strategy) {
    const features = [
      product.price / 1000, // Normalized price
      product.cost ? (product.price - product.cost) / product.price : 0.3, // Margin
      userSegment === 'premium' ? 1 : 0,
      userSegment === 'budget' ? 1 : 0,
      strategy === 'maximize-revenue' ? 1 : 0,
      strategy === 'optimize-conversion' ? 1 : 0,
      product.inventory ? Math.log(product.inventory + 1) : 0,
      product.daysSinceRelease ? product.daysSinceRelease / 365 : 0
    ];
    
    // Add historical data (would come from database)
    for (let i = 0; i < 12; i++) {
      features.push(Math.random()); // Historical price elasticity
    }
    
    return tf.tensor2d([features.slice(0, 20)], [1, 20]);
  }
  
  async prepareSegmentationFeatures(userId, preferences) {
    const features = [];
    
    // User behavior features (would come from database)
    features.push(Math.random()); // Purchase frequency
    features.push(Math.random()); // Average order value
    features.push(Math.random()); // Days since first purchase
    features.push(Math.random()); // Total lifetime value
    
    // Preference features
    Object.values(preferences || {}).forEach(pref => {
      if (typeof pref === 'boolean') {
        features.push(pref ? 1 : 0);
      } else if (typeof pref === 'number') {
        features.push(pref);
      }
    });
    
    // Pad to expected size
    while (features.length < 50) {
      features.push(0);
    }
    
    return tf.tensor2d([features.slice(0, 50)], [1, 50]);
  }
  
  async runInference(modelEntry, input) {
    const startTime = Date.now();
    
    try {
      // Set timeout for inference
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Inference timeout')), this.inferenceTimeout);
      });
      
      const inferencePromise = modelEntry.model.predict(input);
      
      const prediction = await Promise.race([inferencePromise, timeoutPromise]);
      
      // Update model stats
      const latency = Date.now() - startTime;
      modelEntry.inferenceCount++;
      modelEntry.averageLatency = 
        (modelEntry.averageLatency * (modelEntry.inferenceCount - 1) + latency) / 
        modelEntry.inferenceCount;
      
      return prediction;
      
    } catch (error) {
      console.error('Inference error:', error);
      throw error;
    } finally {
      // Clean up input tensor
      input.dispose();
    }
  }
  
  async processRecommendations(predictions, products, limit) {
    const scores = await predictions.array();
    predictions.dispose();
    
    // Map scores to products
    const scored = products.map((product, index) => ({
      ...product,
      recommendationScore: scores[0][index % scores[0].length] || 0
    }));
    
    // Sort by score and return top K
    return scored
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit)
      .map(({ recommendationScore, ...product }) => ({
        ...product,
        reason: this.generateRecommendationReason(recommendationScore)
      }));
  }
  
  generateRecommendationReason(score) {
    if (score > 0.8) return 'Highly recommended for you';
    if (score > 0.6) return 'Recommended based on your preferences';
    if (score > 0.4) return 'You might also like';
    return 'Popular item';
  }
  
  async scoreResult(result, userEmbedding, queryEmbedding, boost) {
    // Calculate relevance score
    const textSimilarity = await this.calculateTextSimilarity(
      result.title || result.name,
      queryEmbedding
    );
    
    // Calculate personalization score
    const userAffinity = await this.calculateUserAffinity(result, userEmbedding);
    
    // Combine scores
    return textSimilarity + (userAffinity * boost);
  }
  
  async calculateTextSimilarity(text, queryEmbedding) {
    const textEmbedding = await this.getTextEmbedding(text);
    const textArray = await textEmbedding.array();
    const queryArray = await queryEmbedding.array();
    
    const similarity = this.cosineSimilarity(textArray[0], queryArray[0]);
    
    textEmbedding.dispose();
    
    return similarity;
  }
  
  async calculateUserAffinity(item, userEmbedding) {
    const itemEmbedding = await this.generateProductEmbedding(item);
    const itemArray = await itemEmbedding.array();
    const userArray = await userEmbedding.array();
    
    const affinity = this.cosineSimilarity(itemArray[0], userArray[0]);
    
    itemEmbedding.dispose();
    
    return affinity;
  }
  
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }
  
  calculateOptimalPrice(originalPrice, elasticity, maxDiscount, strategy) {
    let discountFactor = 0;
    
    if (strategy === 'optimize-conversion') {
      // Higher elasticity means more price sensitive
      discountFactor = Math.min(elasticity * 0.3, maxDiscount);
    } else if (strategy === 'maximize-revenue') {
      // Find sweet spot between volume and margin
      discountFactor = Math.min(elasticity * 0.15, maxDiscount);
    } else {
      // Default strategy
      discountFactor = Math.min(elasticity * 0.2, maxDiscount);
    }
    
    const optimalPrice = originalPrice * (1 - discountFactor);
    
    // Round to nearest 0.99
    return Math.floor(optimalPrice) + 0.99;
  }
  
  calculateConfidence(score) {
    // Map score to confidence level
    if (score > 0.8) return 'high';
    if (score > 0.5) return 'medium';
    return 'low';
  }
  
  async detectUserIntent(userId, preferences) {
    try {
      const model = this.models.get('session-intent');
      if (!model) {
        return 'browse'; // Default intent
      }
      
      // Prepare session features
      const features = await this.prepareSessionFeatures(userId, preferences);
      const prediction = await this.runInference(model, features);
      const probabilities = await prediction.array();
      
      prediction.dispose();
      
      // Map to intent
      const intents = ['browse', 'search', 'compare', 'purchase', 'support'];
      const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
      
      return intents[maxIndex] || 'browse';
      
    } catch (error) {
      console.error('Intent detection error:', error);
      return 'browse';
    }
  }
  
  async prepareSessionFeatures(userId, preferences) {
    // Session features (would come from session tracking)
    const features = [
      Math.random(), // Pages viewed
      Math.random(), // Time on site
      Math.random(), // Search queries
      Math.random(), // Cart additions
      Math.random()  // Previous purchases
    ];
    
    // Add preference features
    Object.values(preferences || {}).slice(0, 10).forEach(pref => {
      if (typeof pref === 'boolean') {
        features.push(pref ? 1 : 0);
      } else if (typeof pref === 'number') {
        features.push(pref);
      }
    });
    
    // Pad to expected size
    while (features.length < 256) {
      features.push(0);
    }
    
    return tf.tensor2d([features.slice(0, 256)], [1, 256]);
  }
  
  applyContentRules(content, intent, preferences, deviceType, rules) {
    const personalized = { ...content };
    
    // Apply intent-based rules
    if (intent === 'purchase' && rules.purchaseIntent) {
      personalized.callToAction = rules.purchaseIntent.callToAction || 'Buy Now';
      personalized.urgency = rules.purchaseIntent.urgency || 'Limited time offer';
    }
    
    // Apply device-based rules
    if (deviceType === 'mobile' && rules.mobile) {
      personalized.layout = rules.mobile.layout || 'simplified';
      personalized.imageSize = rules.mobile.imageSize || 'small';
    }
    
    // Apply preference-based rules
    if (preferences?.theme === 'dark' && rules.darkTheme) {
      personalized.theme = 'dark';
    }
    
    return personalized;
  }
  
  // Fallback methods
  fallbackRecommendations(products, limit) {
    // Simple popularity-based fallback
    return products
      .sort((a, b) => (b.rating || 0) * (b.reviewCount || 0) - 
                      (a.rating || 0) * (a.reviewCount || 0))
      .slice(0, limit)
      .map(product => ({
        ...product,
        reason: 'Popular item'
      }));
  }
  
  fallbackScoring(products) {
    // Random scoring as fallback
    return products.map(product => ({
      ...product,
      personalizedScore: Math.random(),
      scoreConfidence: 'low'
    }));
  }
  
  // Utility methods
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  async ensureModelDirectory() {
    try {
      await fs.mkdir(this.modelCachePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create model directory:', error);
    }
  }
  
  startHealthMonitoring() {
    setInterval(() => {
      this.checkModelHealth();
    }, 60000); // Every minute
  }
  
  checkModelHealth() {
    this.models.forEach((modelEntry, name) => {
      if (modelEntry.averageLatency > this.inferenceTimeout * 0.8) {
        console.warn(`Model ${name} approaching timeout threshold: ${modelEntry.averageLatency}ms`);
      }
      
      // Reload model if it's been too long
      const hoursSinceLoad = (Date.now() - modelEntry.loadedAt) / 3600000;
      if (hoursSinceLoad > 24) {
        this.reloadModel(name);
      }
    });
  }
  
  async reloadModel(modelName) {
    console.log(`Reloading model: ${modelName}`);
    
    try {
      // Dispose old model
      const oldModel = this.models.get(modelName);
      if (oldModel) {
        oldModel.model.dispose();
      }
      
      // Load fresh model
      await this.loadModel(modelName);
      this.stats.modelReloads++;
      
      return { status: 'success', model: modelName };
      
    } catch (error) {
      console.error(`Failed to reload model ${modelName}:`, error);
      return { status: 'error', model: modelName, error: error.message };
    }
  }
  
  updateStats(latency) {
    this.stats.inferences++;
    this.stats.averageLatency = 
      (this.stats.averageLatency * (this.stats.inferences - 1) + latency) / 
      this.stats.inferences;
  }
  
  // Public API methods
  getLoadedModels() {
    const models = {};
    
    this.models.forEach((entry, name) => {
      models[name] = {
        loadedAt: new Date(entry.loadedAt).toISOString(),
        inferenceCount: entry.inferenceCount,
        averageLatency: entry.averageLatency.toFixed(2) + 'ms',
        inputShape: entry.config.inputShape,
        outputShape: entry.config.outputShape
      };
    });
    
    return models;
  }
  
  getHealth() {
    const totalInferences = this.stats.inferences;
    const errorRate = totalInferences > 0 ? this.stats.errors / totalInferences : 0;
    
    return {
      status: errorRate < 0.05 ? 'healthy' : 'degraded',
      models: this.models.size,
      inferences: totalInferences,
      averageLatency: this.stats.averageLatency.toFixed(2) + 'ms',
      errorRate: (errorRate * 100).toFixed(2) + '%',
      cacheHitRate: 
        totalInferences > 0 ? 
        ((this.stats.cacheHits / totalInferences) * 100).toFixed(2) + '%' : 
        '0%'
    };
  }
  
  isReady() {
    return this.models.size > 0;
  }
  
  getModelCount() {
    return this.models.size;
  }
}

module.exports = PersonalizationEngine;