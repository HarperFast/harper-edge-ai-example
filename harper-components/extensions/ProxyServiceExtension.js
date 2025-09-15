/**
 * ProxyServiceExtension - Harper Extension for AI-powered proxy services
 * Provides intelligent proxy functionality with TensorFlow.js-based personalization
 */

import { PersonalizationEngine } from '../ai/PersonalizationEngine.js';

export class ProxyServiceExtension {
  constructor(options = {}) {
    this.name = 'ProxyServiceExtension';
    this.version = '1.0.0';
    this.personalizationEngine = null;
    this.initialized = false;
  }

  // Harper Extension lifecycle method
  async start(options = {}) {
    console.log('Starting ProxyServiceExtension...');
    
    try {
      // Initialize PersonalizationEngine
      this.personalizationEngine = new PersonalizationEngine({
        modelCachePath: options.modelCachePath || './ai/models',
        inferenceTimeout: options.inferenceTimeout || 100,
        fallbackToCache: options.fallbackToCache !== false
      });

      await this.personalizationEngine.initialize();
      
      this.initialized = true;
      console.log('ProxyServiceExtension started successfully');
      
      return this;
    } catch (error) {
      console.error('Failed to start ProxyServiceExtension:', error);
      throw error;
    }
  }

  // Public API for Resources to use
  async enhanceResponse(response, userContext, tenant, endpoint) {
    if (!this.initialized) {
      console.warn('ProxyServiceExtension not initialized, returning original response');
      return { ...response, enhanced: false };
    }

    try {
      const enhanced = await this.personalizationEngine.personalizeResponse(
        response.data,
        userContext,
        tenant,
        endpoint
      );

      return {
        ...response,
        data: enhanced.data,
        enhanced: true,
        personalizationScore: enhanced.confidence,
        modelVersion: enhanced.modelVersion
      };
    } catch (error) {
      console.error('Response enhancement failed:', error);
      return { ...response, enhanced: false, error: error.message };
    }
  }

  async predictUserIntent(userContext, query) {
    if (!this.initialized) return null;

    try {
      return await this.personalizationEngine.predictIntent(userContext, query);
    } catch (error) {
      console.error('User intent prediction failed:', error);
      return null;
    }
  }

  async generateRecommendations(userContext, tenant, options = {}) {
    if (!this.initialized) return [];

    try {
      return await this.personalizationEngine.generateRecommendations(
        userContext,
        tenant,
        options
      );
    } catch (error) {
      console.error('Recommendation generation failed:', error);
      return [];
    }
  }

  async analyzeUserBehavior(userContext, behaviorData) {
    if (!this.initialized) return null;

    try {
      return await this.personalizationEngine.analyzeUserBehavior(
        userContext,
        behaviorData
      );
    } catch (error) {
      console.error('User behavior analysis failed:', error);
      return null;
    }
  }

  // Health and diagnostics
  async getHealth() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      personalizationEngine: this.personalizationEngine ? 
        await this.personalizationEngine.getHealth() : null,
      timestamp: Date.now()
    };
  }

  isReady() {
    return this.initialized && this.personalizationEngine?.isReady();
  }

  // Configuration
  getConfig() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      modelCachePath: this.personalizationEngine?.modelCachePath,
      loadedModels: this.personalizationEngine?.models?.size || 0
    };
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down ProxyServiceExtension...');
    
    if (this.personalizationEngine) {
      await this.personalizationEngine.shutdown();
    }
    
    this.initialized = false;
    console.log('ProxyServiceExtension shut down');
  }
}

// Harper Extension export pattern
export default ProxyServiceExtension;