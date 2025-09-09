/**
 * ProxyManager - Handles request proxying with AI enhancement
 */

const axios = require('axios');
const { URL } = require('url');

class ProxyManager {
  constructor(options) {
    this.cacheManager = options.cacheManager;
    this.personalizationEngine = options.personalizationEngine;
    this.metricsCollector = options.metricsCollector;
    this.tenantManager = options.tenantManager;
    this.circuitBreaker = options.circuitBreaker;
    this.timeout = options.timeout || 5000;
    this.retryAttempts = options.retryAttempts || 2;
    this.retryDelay = options.retryDelay || 1000;
    
    // Request deduplication
    this.pendingRequests = new Map();
  }
  
  async handleRequest(options) {
    const {
      tenant,
      endpoint,
      path,
      method,
      headers,
      query,
      body,
      userContext,
      requestId
    } = options;
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(tenant.id, path, method, query, userContext);
    
    // Check cache first for GET requests
    if (method === 'GET' && endpoint?.cacheable !== false) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        // Check if personalization should be applied to cached data
        if (endpoint?.personalization && this.shouldPersonalize(userContext)) {
          const enhanced = await this.enhanceResponse(
            cached.data,
            endpoint,
            userContext,
            tenant
          );
          
          return {
            ...cached,
            data: enhanced,
            enhanced: true,
            cacheHit: true
          };
        }
        
        return {
          ...cached,
          cacheHit: true,
          enhanced: false
        };
      }
    }
    
    // Check for pending duplicate requests
    const dedupeKey = `${tenant.id}:${method}:${path}`;
    if (this.pendingRequests.has(dedupeKey)) {
      return await this.pendingRequests.get(dedupeKey);
    }
    
    // Create request promise
    const requestPromise = this.executeRequest(
      tenant,
      endpoint,
      path,
      method,
      headers,
      query,
      body,
      userContext,
      requestId
    );
    
    // Store for deduplication
    this.pendingRequests.set(dedupeKey, requestPromise);
    
    try {
      const response = await requestPromise;
      
      // Cache successful GET responses
      if (method === 'GET' && response.status === 200 && endpoint?.cacheable !== false) {
        const ttl = endpoint?.cacheTTL || (response.enhanced ? 60 : 300);
        await this.cacheManager.set(cacheKey, response, ttl);
      }
      
      return response;
      
    } finally {
      this.pendingRequests.delete(dedupeKey);
    }
  }
  
  async executeRequest(tenant, endpoint, path, method, headers, query, body, userContext, requestId) {
    const upstreamUrl = this.buildUpstreamUrl(tenant.baseUrl, path, query);
    
    // Prepare request config
    const requestConfig = {
      method,
      url: upstreamUrl,
      headers: this.prepareHeaders(headers, tenant, requestId),
      timeout: this.timeout,
      validateStatus: () => true // Handle all status codes
    };
    
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      requestConfig.data = body;
    }
    
    // Execute request with retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const response = await axios(requestConfig);
        const responseTime = Date.now() - startTime;
        
        // Record upstream metrics
        this.metricsCollector.recordUpstream(tenant.id, path, response.status, responseTime);
        
        // Process response
        let responseData = response.data;
        let enhanced = false;
        
        // Apply AI enhancement if configured
        if (endpoint?.personalization && 
            response.status === 200 && 
            this.shouldPersonalize(userContext)) {
          try {
            responseData = await this.enhanceResponse(
              responseData,
              endpoint,
              userContext,
              tenant
            );
            enhanced = true;
          } catch (error) {
            console.error('Enhancement failed, using original response:', error);
            this.circuitBreaker.recordFailure(`${tenant.id}:ai`);
          }
        }
        
        return {
          status: response.status,
          headers: response.headers,
          data: responseData,
          enhanced,
          cacheHit: false,
          responseTime
        };
        
      } catch (error) {
        lastError = error;
        console.error(`Request attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }
    
    // All retries failed
    this.circuitBreaker.recordFailure(tenant.id);
    throw lastError;
  }
  
  async enhanceResponse(data, endpoint, userContext, tenant) {
    // Skip enhancement if circuit breaker is open for AI
    if (this.circuitBreaker.isOpen(`${tenant.id}:ai`)) {
      return data;
    }
    
    const enhancementType = endpoint.personalization.type;
    
    switch (enhancementType) {
      case 'product-recommendations':
        return await this.enhanceProductRecommendations(data, userContext, tenant);
        
      case 'search-results':
        return await this.enhanceSearchResults(data, userContext, tenant);
        
      case 'product-listing':
        return await this.enhanceProductListing(data, userContext, tenant);
        
      case 'dynamic-pricing':
        return await this.enhanceDynamicPricing(data, userContext, tenant);
        
      case 'content-personalization':
        return await this.enhanceContent(data, userContext, tenant);
        
      default:
        return data;
    }
  }
  
  async enhanceProductRecommendations(data, userContext, tenant) {
    try {
      // Extract products from response (handle different formats)
      const products = this.extractProducts(data, tenant.responseFormat);
      
      if (!products || products.length === 0) {
        return data;
      }
      
      // Get personalized recommendations
      const recommendations = await this.personalizationEngine.getRecommendations({
        userId: userContext.userId,
        products,
        userPreferences: userContext.preferences,
        deviceType: userContext.deviceType,
        limit: tenant.recommendationLimit || 10
      });
      
      // Merge personalized recommendations
      return this.mergeRecommendations(data, recommendations, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance recommendations:', error);
      this.metricsCollector.recordEnhancementError(tenant.id, 'recommendations');
      return data;
    }
  }
  
  async enhanceSearchResults(data, userContext, tenant) {
    try {
      const results = this.extractSearchResults(data, tenant.responseFormat);
      
      if (!results || results.length === 0) {
        return data;
      }
      
      // Re-rank search results based on user preferences
      const reranked = await this.personalizationEngine.rerankResults({
        userId: userContext.userId,
        results,
        query: data.query || '',
        userPreferences: userContext.preferences,
        boostPersonalized: tenant.personalizationBoost || 1.5
      });
      
      return this.mergeSearchResults(data, reranked, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance search results:', error);
      return data;
    }
  }
  
  async enhanceProductListing(data, userContext, tenant) {
    try {
      const products = this.extractProducts(data, tenant.responseFormat);
      
      if (!products || products.length === 0) {
        return data;
      }
      
      // Score and sort products based on user affinity
      const scored = await this.personalizationEngine.scoreProducts({
        userId: userContext.userId,
        products,
        userPreferences: userContext.preferences,
        categoryWeights: tenant.categoryWeights
      });
      
      // Apply personalized sorting
      const sorted = scored.sort((a, b) => b.personalizedScore - a.personalizedScore);
      
      // Inject personalized badges/tags
      const enhanced = sorted.map(product => ({
        ...product,
        personalized: true,
        affinityScore: product.personalizedScore,
        tags: this.generatePersonalizedTags(product, userContext)
      }));
      
      return this.mergeProducts(data, enhanced, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance product listing:', error);
      return data;
    }
  }
  
  async enhanceDynamicPricing(data, userContext, tenant) {
    try {
      const products = this.extractProducts(data, tenant.responseFormat);
      
      if (!products || products.length === 0) {
        return data;
      }
      
      // Calculate personalized pricing
      const priced = await this.personalizationEngine.calculateDynamicPricing({
        userId: userContext.userId,
        products,
        userSegment: await this.getUserSegment(userContext, tenant),
        pricingStrategy: tenant.pricingStrategy,
        maxDiscount: tenant.maxDiscount || 0.2
      });
      
      return this.mergePricing(data, priced, tenant.responseFormat);
      
    } catch (error) {
      console.error('Failed to enhance pricing:', error);
      return data;
    }
  }
  
  async enhanceContent(data, userContext, tenant) {
    try {
      // Personalize content blocks
      const personalized = await this.personalizationEngine.personalizeContent({
        userId: userContext.userId,
        content: data,
        userPreferences: userContext.preferences,
        deviceType: userContext.deviceType,
        contentRules: tenant.contentRules
      });
      
      return personalized;
      
    } catch (error) {
      console.error('Failed to enhance content:', error);
      return data;
    }
  }
  
  // Direct proxy without enhancement (fallback)
  async directProxy(options) {
    const { tenant, path, method, headers, query, body } = options;
    const upstreamUrl = this.buildUpstreamUrl(tenant.baseUrl, path, query);
    
    const response = await axios({
      method,
      url: upstreamUrl,
      headers: this.prepareHeaders(headers, tenant),
      data: body,
      timeout: this.timeout,
      validateStatus: () => true
    });
    
    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
      enhanced: false,
      cacheHit: false
    };
  }
  
  // Cache warming
  async warmCache(tenantId, endpoints) {
    const tenant = await this.tenantManager.getTenant(tenantId);
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        const response = await this.handleRequest({
          tenant,
          endpoint: tenant.endpoints.find(e => e.name === endpoint.name),
          path: endpoint.path,
          method: 'GET',
          headers: {},
          query: endpoint.query || {},
          userContext: { userId: 'cache-warmer' }
        });
        
        results.push({
          endpoint: endpoint.name,
          path: endpoint.path,
          status: 'success',
          cached: true
        });
        
      } catch (error) {
        results.push({
          endpoint: endpoint.name,
          path: endpoint.path,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  // Helper methods
  generateCacheKey(tenantId, path, method, query, userContext) {
    const queryString = new URLSearchParams(query).toString();
    const userKey = userContext.userId || 'anonymous';
    return `${tenantId}:${method}:${path}:${queryString}:${userKey}`;
  }
  
  buildUpstreamUrl(baseUrl, path, query) {
    const url = new URL(path, baseUrl);
    Object.entries(query || {}).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    return url.toString();
  }
  
  prepareHeaders(headers, tenant, requestId) {
    const prepared = { ...headers };
    
    // Add tenant headers
    if (tenant.headers) {
      Object.assign(prepared, tenant.headers);
    }
    
    // Add tracking headers
    if (requestId) {
      prepared['X-Request-ID'] = requestId;
    }
    
    // Add API key if configured
    if (tenant.apiKey) {
      prepared[tenant.apiKeyHeader || 'X-API-Key'] = tenant.apiKey;
    }
    
    return prepared;
  }
  
  shouldPersonalize(userContext) {
    // Don't personalize for anonymous users unless configured
    if (userContext.userId === 'anonymous' && !process.env.PERSONALIZE_ANONYMOUS) {
      return false;
    }
    
    // Check if user has opted out
    if (userContext.preferences?.personalizeOptOut) {
      return false;
    }
    
    return true;
  }
  
  extractProducts(data, format) {
    // Handle different response formats
    if (format === 'standard') {
      return data.products || data.items || data.results || [];
    } else if (format === 'nested') {
      return data.data?.products || data.data?.items || [];
    } else {
      // Try to auto-detect
      return data.products || data.items || data.results || data.data?.products || [];
    }
  }
  
  extractSearchResults(data, format) {
    if (format === 'standard') {
      return data.results || data.hits || data.items || [];
    } else {
      return data.results || data.hits || data.data?.results || [];
    }
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
  
  mergeSearchResults(originalData, rerankedResults, format) {
    if (format === 'standard') {
      return {
        ...originalData,
        results: rerankedResults,
        originalOrder: originalData.results,
        personalizationApplied: true
      };
    } else {
      return {
        ...originalData,
        data: {
          ...originalData.data,
          results: rerankedResults
        },
        metadata: {
          ...originalData.metadata,
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
  
  mergePricing(originalData, pricedProducts, format) {
    const products = this.extractProducts(originalData, format);
    
    // Map personalized prices
    const enhancedProducts = products.map(product => {
      const priced = pricedProducts.find(p => p.id === product.id);
      if (priced) {
        return {
          ...product,
          originalPrice: product.price,
          price: priced.personalizedPrice,
          discount: priced.discount,
          savingsAmount: priced.savingsAmount,
          personalizedPricing: true
        };
      }
      return product;
    });
    
    return this.mergeProducts(originalData, enhancedProducts, format);
  }
  
  generatePersonalizedTags(product, userContext) {
    const tags = [];
    
    if (product.personalizedScore > 0.8) {
      tags.push('Recommended for you');
    }
    
    if (product.category === userContext.preferences?.favoriteCategory) {
      tags.push('Your favorite category');
    }
    
    if (product.recentlyViewed) {
      tags.push('Recently viewed');
    }
    
    return tags;
  }
  
  async getUserSegment(userContext, tenant) {
    // Determine user segment for pricing/personalization
    return await this.personalizationEngine.getUserSegment({
      userId: userContext.userId,
      preferences: userContext.preferences,
      segmentationRules: tenant.segmentationRules
    });
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProxyManager;