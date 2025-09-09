/**
 * E-Commerce Personalization Model Manager
 * Implements collaborative filtering and content-based recommendations using TensorFlow.js
 * Supports real-time personalization with privacy-preserving edge inference
 */

import * as tf from '@tensorflow/tfjs';

class PersonalizationModelManager {
    constructor() {
        // Model configurations
        this.userEmbeddingModel = null;
        this.productEmbeddingModel = null;
        this.recommendationModel = null;
        this.contentModel = null;
        
        // Model parameters
        this.embeddingDim = 64;
        this.numProducts = 10000;
        this.numUsers = 100000;
        this.numCategories = 50;
        
        // State management
        this.isModelLoaded = false;
        this.sessionId = this.generateSessionId();
        this.userProfile = null;
        this.productCatalog = new Map();
        
        // Real-time behavior tracking
        this.behaviorSequence = [];
        this.maxSequenceLength = 50;
        
        // Model performance
        this.inferenceCount = 0;
        this.avgInferenceTime = 0;
    }

    /**
     * Initialize all personalization models
     */
    async loadModels() {
        try {
            console.log('Initializing personalization models...');
            
            // Configure TensorFlow.js for optimal browser performance
            await this.configureBackend();
            
            // Build collaborative filtering model (Matrix Factorization)
            this.userEmbeddingModel = await this.buildUserEmbeddingModel();
            this.productEmbeddingModel = await this.buildProductEmbeddingModel();
            
            // Build neural collaborative filtering model
            this.recommendationModel = await this.buildRecommendationModel();
            
            // Build content-based model for cold start
            this.contentModel = await this.buildContentModel();
            
            // Initialize user profile
            this.userProfile = await this.initializeUserProfile();
            
            // Warm up models
            await this.warmupModels();
            
            this.isModelLoaded = true;
            console.log('Personalization models loaded successfully');
            
            return this.getModelInfo();
        } catch (error) {
            console.error('Error loading models:', error);
            throw new Error(`Failed to load personalization models: ${error.message}`);
        }
    }

    /**
     * Configure TensorFlow.js backend for browser optimization
     */
    async configureBackend() {
        await tf.setBackend('webgl');
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        tf.env().set('WEBGL_PACK', true);
        tf.enableProdMode();
        
        console.log('TensorFlow.js backend configured:', tf.getBackend());
    }

    /**
     * Build user embedding model for collaborative filtering
     */
    async buildUserEmbeddingModel() {
        const model = tf.sequential({
            layers: [
                tf.layers.embedding({
                    inputDim: this.numUsers,
                    outputDim: this.embeddingDim,
                    inputLength: 1,
                    name: 'user_embedding'
                }),
                tf.layers.flatten(),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: this.embeddingDim,
                    activation: 'relu',
                    name: 'user_features'
                })
            ]
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError'
        });
        
        return model;
    }

    /**
     * Build product embedding model
     */
    async buildProductEmbeddingModel() {
        const model = tf.sequential({
            layers: [
                tf.layers.embedding({
                    inputDim: this.numProducts,
                    outputDim: this.embeddingDim,
                    inputLength: 1,
                    name: 'product_embedding'
                }),
                tf.layers.flatten(),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: this.embeddingDim,
                    activation: 'relu',
                    name: 'product_features'
                })
            ]
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError'
        });
        
        return model;
    }

    /**
     * Build neural collaborative filtering model
     */
    async buildRecommendationModel() {
        // Input layers
        const userInput = tf.input({ shape: [this.embeddingDim], name: 'user_input' });
        const productInput = tf.input({ shape: [this.embeddingDim], name: 'product_input' });
        const contextInput = tf.input({ shape: [10], name: 'context_features' });
        
        // Concatenate all inputs
        const concatenated = tf.layers.concatenate().apply([userInput, productInput, contextInput]);
        
        // Deep layers for interaction modeling
        let dense = tf.layers.dense({
            units: 256,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }).apply(concatenated);
        
        dense = tf.layers.dropout({ rate: 0.3 }).apply(dense);
        
        dense = tf.layers.dense({
            units: 128,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }).apply(dense);
        
        dense = tf.layers.dropout({ rate: 0.2 }).apply(dense);
        
        dense = tf.layers.dense({
            units: 64,
            activation: 'relu'
        }).apply(dense);
        
        // Output layer - recommendation score
        const output = tf.layers.dense({
            units: 1,
            activation: 'sigmoid',
            name: 'recommendation_score'
        }).apply(dense);
        
        const model = tf.model({
            inputs: [userInput, productInput, contextInput],
            outputs: output,
            name: 'recommendation_model'
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        
        return model;
    }

    /**
     * Build content-based model for cold start scenarios
     */
    async buildContentModel() {
        const model = tf.sequential({
            layers: [
                // Product features input (category, price range, attributes)
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    inputShape: [30], // Product feature vector size
                    name: 'content_features'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: 64,
                    activation: 'relu'
                }),
                tf.layers.dense({
                    units: 32,
                    activation: 'relu'
                }),
                tf.layers.dense({
                    units: 1,
                    activation: 'sigmoid',
                    name: 'content_score'
                })
            ]
        });
        
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        
        return model;
    }

    /**
     * Initialize user profile with default preferences
     */
    async initializeUserProfile() {
        return {
            userId: this.generateUserId(),
            sessionId: this.sessionId,
            preferences: {
                categories: new Map(),
                priceRange: { min: 0, max: 1000 },
                brands: new Set(),
                attributes: new Map()
            },
            history: {
                views: [],
                purchases: [],
                cartAdditions: [],
                searches: []
            },
            embeddings: tf.randomNormal([1, this.embeddingDim]),
            lastUpdate: Date.now()
        };
    }

    /**
     * Track user behavior in real-time
     */
    async trackBehavior(action, productData, metadata = {}) {
        const behavior = {
            action,
            productId: productData.id,
            category: productData.category,
            price: productData.price,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        // Add to behavior sequence
        this.behaviorSequence.push(behavior);
        if (this.behaviorSequence.length > this.maxSequenceLength) {
            this.behaviorSequence.shift();
        }
        
        // Update user profile
        await this.updateUserProfile(behavior);
        
        // Update embeddings if needed
        if (this.behaviorSequence.length % 5 === 0) {
            await this.updateUserEmbeddings();
        }
        
        return behavior;
    }

    /**
     * Update user profile based on behavior
     */
    async updateUserProfile(behavior) {
        const { action, category, price } = behavior;
        
        // Update category preferences
        const categoryCount = this.userProfile.preferences.categories.get(category) || 0;
        this.userProfile.preferences.categories.set(category, categoryCount + 1);
        
        // Update price range
        if (action === 'purchase' || action === 'cart_add') {
            const { min, max } = this.userProfile.preferences.priceRange;
            this.userProfile.preferences.priceRange = {
                min: Math.min(min, price * 0.8),
                max: Math.max(max, price * 1.2)
            };
        }
        
        // Add to history
        switch (action) {
            case 'view':
                this.userProfile.history.views.push(behavior);
                break;
            case 'purchase':
                this.userProfile.history.purchases.push(behavior);
                break;
            case 'cart_add':
                this.userProfile.history.cartAdditions.push(behavior);
                break;
            case 'search':
                this.userProfile.history.searches.push(behavior);
                break;
        }
        
        this.userProfile.lastUpdate = Date.now();
    }

    /**
     * Update user embeddings based on recent behavior
     */
    async updateUserEmbeddings() {
        return tf.tidy(() => {
            // Create behavior tensor from recent actions
            const behaviorFeatures = this.extractBehaviorFeatures();
            
            // Update embeddings using gradient descent
            const learningRate = 0.01;
            const currentEmbeddings = this.userProfile.embeddings;
            
            // Simple online learning update
            const gradient = tf.randomNormal([1, this.embeddingDim]).mul(learningRate);
            const newEmbeddings = currentEmbeddings.add(gradient);
            
            // Replace old embeddings
            currentEmbeddings.dispose();
            this.userProfile.embeddings = newEmbeddings;
            
            return newEmbeddings;
        });
    }

    /**
     * Generate personalized recommendations
     */
    async getRecommendations(numRecommendations = 10, context = {}) {
        if (!this.isModelLoaded) {
            throw new Error('Models not loaded');
        }
        
        const startTime = performance.now();
        
        try {
            // Get candidate products
            const candidates = await this.getCandidateProducts(context);
            
            // Score each candidate
            const scores = await this.scoreProducts(candidates, context);
            
            // Sort and select top recommendations
            const recommendations = this.selectTopRecommendations(candidates, scores, numRecommendations);
            
            // Add diversity
            const diversifiedRecs = this.diversifyRecommendations(recommendations);
            
            // Calculate metrics
            const inferenceTime = performance.now() - startTime;
            this.inferenceCount++;
            this.avgInferenceTime = (this.avgInferenceTime * (this.inferenceCount - 1) + inferenceTime) / this.inferenceCount;
            
            return {
                recommendations: diversifiedRecs,
                inferenceTime,
                strategy: this.determineStrategy(),
                confidence: this.calculateConfidence(scores),
                context: {
                    sessionId: this.sessionId,
                    behaviorCount: this.behaviorSequence.length,
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            console.error('Recommendation error:', error);
            throw new Error(`Failed to generate recommendations: ${error.message}`);
        }
    }

    /**
     * Get candidate products for scoring
     */
    async getCandidateProducts(context) {
        // In production, this would query a product index
        // For demo, generate synthetic candidates
        const candidates = [];
        const categories = Array.from(this.userProfile.preferences.categories.keys());
        
        for (let i = 0; i < 100; i++) {
            candidates.push({
                id: `product_${i}`,
                name: `Product ${i}`,
                category: categories[Math.floor(Math.random() * categories.length)] || 'general',
                price: Math.random() * 500 + 10,
                features: tf.randomNormal([1, 30]),
                popularity: Math.random(),
                recency: Date.now() - Math.random() * 86400000 * 30
            });
        }
        
        return candidates;
    }

    /**
     * Score products using ensemble of models
     */
    async scoreProducts(candidates, context) {
        return tf.tidy(() => {
            const scores = [];
            
            for (const product of candidates) {
                // Collaborative filtering score
                const cfScore = this.getCollaborativeScore(product);
                
                // Content-based score
                const contentScore = this.getContentScore(product);
                
                // Contextual features
                const contextFeatures = this.extractContextFeatures(context);
                
                // Ensemble score
                const ensembleScore = cfScore * 0.6 + contentScore * 0.3 + product.popularity * 0.1;
                
                scores.push(ensembleScore);
            }
            
            return scores;
        });
    }

    /**
     * Get collaborative filtering score
     */
    getCollaborativeScore(product) {
        // Simplified dot product of user and product embeddings
        return Math.random() * 0.8 + 0.2; // Placeholder
    }

    /**
     * Get content-based score
     */
    getContentScore(product) {
        // Score based on category preferences and price range
        const categoryScore = this.userProfile.preferences.categories.get(product.category) || 0;
        const priceScore = this.isPriceInRange(product.price) ? 1 : 0.5;
        
        return (categoryScore / 10 + priceScore) / 2;
    }

    /**
     * Check if price is in user's preferred range
     */
    isPriceInRange(price) {
        const { min, max } = this.userProfile.preferences.priceRange;
        return price >= min && price <= max;
    }

    /**
     * Select top recommendations
     */
    selectTopRecommendations(candidates, scores, numRecommendations) {
        const scored = candidates.map((product, i) => ({
            ...product,
            score: scores[i]
        }));
        
        scored.sort((a, b) => b.score - a.score);
        
        return scored.slice(0, numRecommendations);
    }

    /**
     * Diversify recommendations
     */
    diversifyRecommendations(recommendations) {
        // Ensure category diversity
        const categorySeen = new Set();
        const diversified = [];
        
        for (const rec of recommendations) {
            if (!categorySeen.has(rec.category) || diversified.length < 5) {
                categorySeen.add(rec.category);
                diversified.push(rec);
            }
        }
        
        // Add remaining if needed
        for (const rec of recommendations) {
            if (!diversified.includes(rec) && diversified.length < recommendations.length) {
                diversified.push(rec);
            }
        }
        
        return diversified;
    }

    /**
     * Determine recommendation strategy
     */
    determineStrategy() {
        if (this.behaviorSequence.length < 5) {
            return 'cold_start';
        } else if (this.behaviorSequence.length < 20) {
            return 'hybrid';
        } else {
            return 'personalized';
        }
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(scores) {
        if (scores.length === 0) return 0;
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        return Math.min(avgScore + this.behaviorSequence.length * 0.01, 1);
    }

    /**
     * Extract behavior features for model input
     */
    extractBehaviorFeatures() {
        const features = tf.zeros([1, 50]);
        // Extract features from behavior sequence
        // This would involve encoding actions, categories, time gaps, etc.
        return features;
    }

    /**
     * Extract context features
     */
    extractContextFeatures(context) {
        return tf.tensor2d([[
            context.timeOfDay || 12,
            context.dayOfWeek || 3,
            context.deviceType || 1,
            context.referrer || 0,
            context.searchQuery ? 1 : 0,
            context.cartValue || 0,
            context.sessionDuration || 0,
            context.pageDepth || 1,
            context.isReturning ? 1 : 0,
            context.lastPurchaseDays || 999
        ]]);
    }

    /**
     * Warm up models for better first inference
     */
    async warmupModels() {
        console.log('Warming up models...');
        
        // Warm up recommendation model
        const dummyUser = tf.randomNormal([1, this.embeddingDim]);
        const dummyProduct = tf.randomNormal([1, this.embeddingDim]);
        const dummyContext = tf.zeros([1, 10]);
        
        await this.recommendationModel.predict([dummyUser, dummyProduct, dummyContext]);
        
        // Clean up
        dummyUser.dispose();
        dummyProduct.dispose();
        dummyContext.dispose();
        
        console.log('Model warmup completed');
    }

    /**
     * Get memory usage statistics
     */
    getMemoryUsage() {
        const memInfo = tf.memory();
        return {
            numTensors: memInfo.numTensors,
            numBytes: memInfo.numBytes,
            numBytesFormatted: this.formatBytes(memInfo.numBytes)
        };
    }

    /**
     * Get model information
     */
    getModelInfo() {
        return {
            type: 'E-Commerce Personalization',
            models: {
                userEmbedding: this.userEmbeddingModel ? 'loaded' : 'not loaded',
                productEmbedding: this.productEmbeddingModel ? 'loaded' : 'not loaded',
                recommendation: this.recommendationModel ? 'loaded' : 'not loaded',
                content: this.contentModel ? 'loaded' : 'not loaded'
            },
            parameters: {
                embeddingDim: this.embeddingDim,
                numProducts: this.numProducts,
                numUsers: this.numUsers,
                numCategories: this.numCategories
            },
            performance: {
                inferenceCount: this.inferenceCount,
                avgInferenceTime: this.avgInferenceTime.toFixed(2) + 'ms'
            },
            backend: tf.getBackend(),
            memoryUsage: this.getMemoryUsage()
        };
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate user ID
     */
    generateUserId() {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Export user behavior for server-side retraining
     */
    exportBehaviorData() {
        return {
            sessionId: this.sessionId,
            userId: this.userProfile.userId,
            behaviors: this.behaviorSequence,
            preferences: Object.fromEntries(this.userProfile.preferences.categories),
            profile: {
                priceRange: this.userProfile.preferences.priceRange,
                historyCount: {
                    views: this.userProfile.history.views.length,
                    purchases: this.userProfile.history.purchases.length,
                    cartAdditions: this.userProfile.history.cartAdditions.length
                }
            },
            timestamp: Date.now()
        };
    }

    /**
     * Dispose of models and free memory
     */
    dispose() {
        if (this.userEmbeddingModel) this.userEmbeddingModel.dispose();
        if (this.productEmbeddingModel) this.productEmbeddingModel.dispose();
        if (this.recommendationModel) this.recommendationModel.dispose();
        if (this.contentModel) this.contentModel.dispose();
        if (this.userProfile && this.userProfile.embeddings) {
            this.userProfile.embeddings.dispose();
        }
        
        // Clear product features
        this.productCatalog.forEach(product => {
            if (product.features) product.features.dispose();
        });
        
        this.productCatalog.clear();
        console.log('Models disposed');
    }
}

export default PersonalizationModelManager;