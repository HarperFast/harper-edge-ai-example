/**
 * Harper Edge AI Proxy Resources
 * Provides intelligent proxy services with AI-powered personalization
 */

import { Component, Resource } from 'harperdb';
import { ResponseEnhancer } from './utils/ResponseEnhancer.js';
import { TenantValidator } from './utils/TenantValidator.js';
import { MetricsCollector } from './utils/MetricsCollector.js';
import { HarperTenantService } from './utils/HarperTenantService.js';
import { initializeComponents } from './init.js';
import { schema } from './schemas/index.js';
import { v4 as uuidv4 } from 'uuid';

// Extensions will be injected by Harper
let proxyServiceExtension = null;
let modelManagerExtension = null;
let trainingManagerExtension = null;
let cacheExtension = null;

// Export the GraphQL schema for Harper to use
export { schema };

/**
 * Main Proxy Resource - Handles all API proxy requests with AI enhancement
 */
export class ProxyResource extends Resource {
  // Configuration from environment variables
  static config = {
    cacheDefaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300,
    cachePersonalizationTTL: parseInt(process.env.CACHE_PERSONALIZATION_TTL) || 60,
    cacheMaxSize: process.env.CACHE_MAX_SIZE || '2GB',
    inferenceTimeout: parseInt(process.env.INFERENCE_TIMEOUT) || 30000,
    fallbackToCache: process.env.FALLBACK_TO_CACHE === 'true',
    personalizeAnonymous: process.env.PERSONALIZE_ANONYMOUS === 'true',
    proxyApiKey: process.env.PROXY_API_KEY || 'demo-alpine-key-2024'
  };

  static routes = [
    // Main proxy endpoints
    { method: 'GET', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    { method: 'POST', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    { method: 'PUT', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    { method: 'DELETE', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    { method: 'PATCH', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    
    // Legacy support for header-based routing
    { method: '*', path: '/api/{proxy+}', handler: 'handleLegacyProxyRequest' },
    
    // Environment test endpoint
    { method: 'GET', path: '/test/env', handler: 'testEnvironmentVariables' }
  ];

  constructor() {
    super();
    this.responseEnhancer = new ResponseEnhancer();
    this.metricsCollector = new MetricsCollector(this);
    this.tenantService = new HarperTenantService(this.harperdb);
    this.pendingRequests = new Map();
    this.initialized = false;
    
    // Initialize components (tenants, etc.) when first request comes in
    this.initPromise = null;
  }

  // Method to inject extensions (called by Harper)
  static setExtensions(extensions) {
    proxyServiceExtension = extensions.proxyService;
    modelManagerExtension = extensions.modelManager;
    trainingManagerExtension = extensions.trainingManager;
    cacheExtension = extensions.cache;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    
    await this.initPromise;
  }

  async initialize() {
    try {
      await initializeComponents(this.harperdb);
      this.initialized = true;
      console.log('Harper Edge AI Proxy initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Harper Edge AI Proxy:', error);
      throw error;
    }
  }

  async handleProxyRequest(request) {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Ensure tenants are loaded from Harper
      await this.ensureInitialized();
      
      const { tenant: tenantId, proxy: proxyPath } = request.pathParameters;
      const userContext = this.extractUserContext(request);
      
      // Get tenant configuration
      const tenant = await this.getTenantConfig(tenantId);
      if (!tenant) {
        return this.errorResponse(400, 'Invalid tenant', requestId);
      }

      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(tenantId, request);
      if (!rateLimitResult.allowed) {
        return this.errorResponse(429, 'Rate limit exceeded', requestId, {
          'Retry-After': rateLimitResult.retryAfter
        });
      }

      // Find matching endpoint configuration
      const endpoint = this.findMatchingEndpoint(tenant, proxyPath);
      
      // Check cache first for GET requests
      if (request.method === 'GET' && endpoint?.cacheable !== false) {
        const cached = await this.getCachedResponse(tenantId, proxyPath, request.query, userContext);
        if (cached) {
          await this.metricsCollector.recordResponse(request, {
            ...cached,
            cacheHit: true,
            responseTime: Date.now() - startTime
          });
          
          return this.successResponse(cached.data, requestId, {
            'X-Proxy-Cache': 'HIT',
            'X-Proxy-Enhanced': cached.enhanced ? 'true' : 'false',
            'X-Proxy-Response-Time': `${Date.now() - startTime}ms`
          });
        }
      }

      // Execute proxy request
      const response = await this.executeProxyRequest(tenant, endpoint, {
        path: proxyPath,
        method: request.method,
        headers: this.prepareHeaders(request.headers, tenant),
        query: request.query,
        body: request.body,
        userContext,
        requestId
      });

      // Cache successful responses
      if (request.method === 'GET' && response.status === 200 && endpoint?.cacheable !== false) {
        await this.cacheResponse(tenantId, proxyPath, request.query, userContext, response, endpoint);
      }

      // Record metrics
      await this.metricsCollector.recordResponse(request, {
        ...response,
        responseTime: Date.now() - startTime
      });

      return this.successResponse(response.data, requestId, {
        'X-Proxy-Cache': 'MISS',
        'X-Proxy-Enhanced': response.enhanced ? 'true' : 'false',
        'X-Proxy-Response-Time': `${Date.now() - startTime}ms`
      });

    } catch (error) {
      console.error('Proxy request failed:', error);
      await this.metricsCollector.recordError(request, error);
      
      return this.errorResponse(
        error.statusCode || 502,
        error.message || 'Bad gateway',
        requestId
      );
    }
  }

  async handleLegacyProxyRequest(request) {
    // Extract tenant from X-Tenant-ID header for backward compatibility
    const tenantId = request.headers['x-tenant-id'] || request.headers['X-Tenant-ID'];
    
    if (!tenantId) {
      return this.errorResponse(400, 'Missing X-Tenant-ID header', uuidv4());
    }

    // Redirect to proper tenant-based routing
    request.pathParameters = {
      tenant: tenantId,
      proxy: request.pathParameters.proxy
    };

    return this.handleProxyRequest(request);
  }

  async getTenantConfig(tenantId) {
    try {
      return await this.tenantService.getTenant(tenantId);
    } catch (error) {
      console.error('Failed to get tenant config:', error);
      return null;
    }
  }

  async executeProxyRequest(tenant, endpoint, requestData) {
    const { path, method, headers, query, body, userContext, requestId } = requestData;
    
    // Build upstream URL
    const upstreamUrl = this.buildUpstreamUrl(tenant.baseUrl, path, query);
    
    // Prepare request configuration
    const axiosConfig = {
      method,
      url: upstreamUrl,
      headers: {
        ...headers,
        [tenant.apiKeyHeader || 'X-API-Key']: tenant.apiKey,
        'X-Request-ID': requestId
      },
      timeout: ProxyResource.config.inferenceTimeout,
      validateStatus: () => true
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      axiosConfig.data = body;
    }

    // Execute request
    const axios = (await import('axios')).default;
    const response = await axios(axiosConfig);
    
    let responseData = response.data;
    let enhanced = false;

    // Apply AI enhancement if configured
    if (endpoint?.personalization?.enabled && 
        response.status === 200 && 
        this.shouldPersonalize(userContext) &&
        proxyServiceExtension) {
      
      try {
        const enhancedResponse = await proxyServiceExtension.enhanceResponse(
          { data: responseData, status: response.status, headers: response.headers },
          userContext,
          tenant,
          endpoint
        );
        responseData = enhancedResponse.data;
        enhanced = enhancedResponse.enhanced;
      } catch (error) {
        console.error('Enhancement failed, using original response:', error);
      }
    }

    return {
      status: response.status,
      headers: response.headers,
      data: responseData,
      enhanced,
      cacheHit: false
    };
  }

  async getCachedResponse(tenantId, path, query, userContext) {
    const cacheKey = this.generateCacheKey(tenantId, path, query, userContext);
    
    try {
      // Check Harper-fabric native cache
      const cached = await this.harperdb.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached;
      }
      
      // Check database cache fallback
      const dbCached = await this.harperdb.searchByConditions('cache_metadata', [
        { search_attribute: 'cache_key', search_value: cacheKey },
        { search_attribute: 'expires_at', search_type: 'greater_than', search_value: new Date() }
      ]);
      
      if (dbCached && dbCached.length > 0) {
        return JSON.parse(dbCached[0].data);
      }
      
      return null;
    } catch (error) {
      console.error('Cache retrieval failed:', error);
      return null;
    }
  }

  async cacheResponse(tenantId, path, query, userContext, response, endpoint) {
    const cacheKey = this.generateCacheKey(tenantId, path, query, userContext);
    const ttl = endpoint?.cacheTTL || (response.enhanced ? ProxyResource.config.cachePersonalizationTTL : ProxyResource.config.cacheDefaultTTL);
    const expiresAt = Date.now() + (ttl * 1000);
    
    const cacheData = {
      data: response.data,
      enhanced: response.enhanced,
      expiresAt,
      cachedAt: Date.now()
    };

    try {
      // Store in Harper-fabric native cache
      await this.harperdb.cache.set(cacheKey, cacheData, ttl);
      
      // Store metadata in database
      await this.harperdb.insert('cache_metadata', {
        id: uuidv4(),
        cache_key: cacheKey,
        tenant_id: tenantId,
        endpoint: path,
        ttl,
        size_bytes: JSON.stringify(cacheData).length,
        compression_used: false,
        access_count: 1,
        expires_at: new Date(expiresAt)
      });
      
    } catch (error) {
      console.error('Cache storage failed:', error);
    }
  }

  extractUserContext(request) {
    return {
      userId: request.headers['x-user-id'] || 
              request.query.userId || 
              'anonymous',
      sessionId: request.headers['x-session-id'] || 
                 request.query.sessionId,
      deviceType: this.detectDeviceType(request.headers['user-agent']),
      location: request.headers['x-user-location'] || 
               request.clientIp,
      preferences: this.parsePreferences(request.headers['x-user-preferences'])
    };
  }

  findMatchingEndpoint(tenant, path) {
    if (!tenant.endpoints) return null;
    
    return tenant.endpoints.find(endpoint => {
      const regex = new RegExp(endpoint.pattern);
      return regex.test(path);
    });
  }

  generateCacheKey(tenantId, path, query, userContext) {
    const queryString = new URLSearchParams(query || {}).toString();
    const userKey = userContext.userId || 'anonymous';
    return `${tenantId}:${path}:${queryString}:${userKey}`;
  }

  buildUpstreamUrl(baseUrl, path, query) {
    const url = new URL(path, baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  prepareHeaders(headers, tenant) {
    const prepared = { ...headers };
    
    // Remove proxy-specific headers
    delete prepared['x-tenant-id'];
    delete prepared['x-user-id'];
    delete prepared['x-session-id'];
    delete prepared['host'];
    
    // Add tenant-specific headers
    if (tenant.headers) {
      Object.assign(prepared, tenant.headers);
    }
    
    return prepared;
  }

  async checkRateLimit(tenantId, request) {
    const tenant = await this.getTenantConfig(tenantId);
    if (!tenant?.rateLimits) {
      return { allowed: true };
    }

    const limits = tenant.rateLimits;
    const now = Date.now();
    
    // Simple in-memory rate limiting (in production, use Redis)
    const key = `rate_limit:${tenantId}:${request.clientIp}`;
    const requests = this.rateLimitStore?.get(key) || [];
    
    // Clean old requests
    const validRequests = requests.filter(time => now - time < 3600000);
    
    // Check limits
    if (limits.requestsPerSecond && 
        validRequests.filter(time => now - time < 1000).length >= limits.requestsPerSecond) {
      return { allowed: false, retryAfter: 1 };
    }
    
    if (limits.requestsPerMinute && 
        validRequests.filter(time => now - time < 60000).length >= limits.requestsPerMinute) {
      return { allowed: false, retryAfter: 60 };
    }
    
    if (limits.requestsPerHour && validRequests.length >= limits.requestsPerHour) {
      return { allowed: false, retryAfter: 3600 };
    }
    
    // Record this request
    validRequests.push(now);
    if (!this.rateLimitStore) this.rateLimitStore = new Map();
    this.rateLimitStore.set(key, validRequests);
    
    return { allowed: true };
  }

  shouldPersonalize(userContext) {
    return userContext.userId !== 'anonymous' && 
           !userContext.preferences?.personalizeOptOut;
  }

  detectDeviceType(userAgent) {
    if (!userAgent) return 'unknown';
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  parsePreferences(prefHeader) {
    if (!prefHeader) return {};
    try {
      return JSON.parse(Buffer.from(prefHeader, 'base64').toString());
    } catch {
      return {};
    }
  }

  successResponse(data, requestId, headers = {}) {
    return {
      statusCode: 200,
      body: data,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...headers
      }
    };
  }

  errorResponse(statusCode, message, requestId, headers = {}) {
    return {
      statusCode,
      body: {
        error: message,
        requestId,
        timestamp: new Date().toISOString()
      },
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...headers
      }
    };
  }

  async testEnvironmentVariables(request) {
    const envVars = {
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      PROXY_API_KEY: process.env.PROXY_API_KEY,
      CACHE_MAX_SIZE: process.env.CACHE_MAX_SIZE,
      CACHE_DEFAULT_TTL: process.env.CACHE_DEFAULT_TTL,
      CACHE_PERSONALIZATION_TTL: process.env.CACHE_PERSONALIZATION_TTL,
      INFERENCE_TIMEOUT: process.env.INFERENCE_TIMEOUT,
      FALLBACK_TO_CACHE: process.env.FALLBACK_TO_CACHE,
      PERSONALIZE_ANONYMOUS: process.env.PERSONALIZE_ANONYMOUS,
      config: ProxyResource.config
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: 'Environment variables test',
        environmentVariables: envVars,
        loadedFromEnv: Object.keys(envVars).filter(key => envVars[key] !== undefined && key !== 'config'),
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Tenant Management Resource
 */
export class TenantResource extends Resource {
  static routes = [
    { method: 'GET', path: '/proxy/tenants', handler: 'getAllTenants' },
    { method: 'GET', path: '/proxy/tenants/{id}', handler: 'getTenant' },
    { method: 'POST', path: '/proxy/tenants', handler: 'createTenant' },
    { method: 'PUT', path: '/proxy/tenants/{id}', handler: 'updateTenant' },
    { method: 'DELETE', path: '/proxy/tenants/{id}', handler: 'deleteTenant' }
  ];

  constructor() {
    super();
    this.tenantValidator = new TenantValidator();
    this.tenantService = new HarperTenantService(this.harperdb);
  }

  async getAllTenants(request) {
    try {
      const tenants = await this.tenantService.getActiveTenants();
      return {
        statusCode: 200,
        body: { tenants }
      };
    } catch (error) {
      return this.errorResponse(500, 'Failed to retrieve tenants');
    }
  }

  async getTenant(request) {
    const { id } = request.pathParameters;
    
    try {
      const tenant = await this.tenantService.getTenant(id);
      if (!tenant) {
        return this.errorResponse(404, 'Tenant not found');
      }
      
      return {
        statusCode: 200,
        body: tenant
      };
    } catch (error) {
      return this.errorResponse(500, 'Failed to retrieve tenant');
    }
  }

  async createTenant(request) {
    const tenantData = request.body;
    
    try {
      // Validate tenant configuration
      const validation = await this.tenantValidator.validate(tenantData);
      if (!validation.valid) {
        return this.errorResponse(400, validation.errors.join(', '));
      }

      // Check for duplicate ID
      const existing = await this.tenantService.getTenant(tenantData.id);
      if (existing) {
        return this.errorResponse(409, 'Tenant ID already exists');
      }

      // Create tenant
      const newTenant = await this.tenantService.createTenant(tenantData);
      
      return {
        statusCode: 201,
        body: newTenant
      };
    } catch (error) {
      console.error('Failed to create tenant:', error);
      return this.errorResponse(500, 'Failed to create tenant');
    }
  }

  async updateTenant(request) {
    const { id } = request.pathParameters;
    const updates = request.body;
    
    try {
      // Check if tenant exists
      const existing = await this.tenantService.getTenant(id);
      if (!existing) {
        return this.errorResponse(404, 'Tenant not found');
      }

      // Validate updates
      const updatedTenant = { ...existing, ...updates };
      const validation = await this.tenantValidator.validate(updatedTenant);
      if (!validation.valid) {
        return this.errorResponse(400, validation.errors.join(', '));
      }

      // Update tenant
      await this.tenantService.updateTenant(id, updates);
      const updated = await this.tenantService.getTenant(id);
      
      return {
        statusCode: 200,
        body: updated
      };
    } catch (error) {
      console.error('Failed to update tenant:', error);
      return this.errorResponse(500, 'Failed to update tenant');
    }
  }

  async deleteTenant(request) {
    const { id } = request.pathParameters;
    
    try {
      const existing = await this.tenantService.getTenant(id);
      if (!existing) {
        return this.errorResponse(404, 'Tenant not found');
      }
      
      await this.tenantService.deactivateTenant(id);
      
      return {
        statusCode: 204,
        body: null
      };
    } catch (error) {
      console.error('Failed to delete tenant:', error);
      return this.errorResponse(500, 'Failed to delete tenant');
    }
  }

  errorResponse(statusCode, message) {
    return {
      statusCode,
      body: {
        error: message,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Metrics and Monitoring Resource
 */
export class MetricsResource extends Resource {
  static routes = [
    { method: 'GET', path: '/proxy/metrics', handler: 'getMetrics' },
    { method: 'GET', path: '/proxy/metrics/realtime', handler: 'getRealtimeMetrics' },
    { method: 'GET', path: '/proxy/health', handler: 'getHealth' },
    { method: 'GET', path: '/proxy/ready', handler: 'getReadiness' }
  ];

  async getMetrics(request) {
    const { tenantId, period = '1h', endpoint } = request.query;
    
    try {
      const minTimestamp = Date.now() - this.parsePeriod(period);
      
      // Build search conditions
      let conditions = [
        { search_attribute: 'timestamp', search_type: 'greater_than', search_value: minTimestamp }
      ];
      
      if (tenantId) {
        conditions.push({ search_attribute: 'tenant_id', search_value: tenantId });
      }
      
      if (endpoint) {
        conditions.push({ search_attribute: 'endpoint', search_value: endpoint });
      }
      
      // Get metrics using Harper-native search
      const metrics = await this.harperdb.searchByConditions('metrics', conditions);
      
      // Sort by timestamp descending (Harper doesn't guarantee order)
      metrics.sort((a, b) => b.timestamp - a.timestamp);
      
      // Calculate aggregated statistics
      const stats = this.calculateMetricStats(metrics);
      
      return {
        statusCode: 200,
        body: {
          metrics,
          statistics: stats,
          period,
          count: metrics.length
        }
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      return {
        statusCode: 500,
        body: { error: 'Failed to retrieve metrics' }
      };
    }
  }

  async getRealtimeMetrics(request) {
    // Harper-fabric Server-Sent Events implementation
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      },
      body: this.createMetricsStream()
    };
  }

  async getHealth(request) {
    try {
      // Check various system components
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        components: {
          database: await this.checkDatabaseHealth(),
          cache: await this.checkCacheHealth(),
          ai_models: await this.checkAIModelsHealth()
        }
      };
      
      // Determine overall health
      const componentStatuses = Object.values(health.components).map(c => c.status);
      const overallHealthy = componentStatuses.every(status => status === 'healthy');
      
      return {
        statusCode: overallHealthy ? 200 : 503,
        body: {
          ...health,
          status: overallHealthy ? 'healthy' : 'unhealthy'
        }
      };
    } catch (error) {
      return {
        statusCode: 503,
        body: {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async getReadiness(request) {
    try {
      // Check if service is ready to accept requests
      const readiness = {
        ready: true,
        timestamp: new Date().toISOString(),
        checks: {
          database_connected: await this.isDatabaseReady(),
          ai_models_loaded: await this.areModelsReady(),
          cache_initialized: await this.isCacheReady()
        }
      };
      
      const allReady = Object.values(readiness.checks).every(check => check);
      
      return {
        statusCode: allReady ? 200 : 503,
        body: {
          ...readiness,
          ready: allReady
        }
      };
    } catch (error) {
      return {
        statusCode: 503,
        body: {
          ready: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  parsePeriod(period) {
    const multipliers = {
      's': 1000,
      'm': 60000,
      'h': 3600000,
      'd': 86400000
    };
    
    const match = period.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // Default 1 hour
    
    const [, value, unit] = match;
    return parseInt(value) * multipliers[unit];
  }

  calculateMetricStats(metrics) {
    if (metrics.length === 0) return {};
    
    const responseTimes = metrics.map(m => m.response_time).filter(Boolean);
    const cacheHits = metrics.filter(m => m.cache_hit).length;
    const enhanced = metrics.filter(m => m.enhanced).length;
    
    return {
      total_requests: metrics.length,
      avg_response_time: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      cache_hit_rate: metrics.length > 0 ? cacheHits / metrics.length : 0,
      enhancement_rate: metrics.length > 0 ? enhanced / metrics.length : 0,
      error_rate: metrics.filter(m => m.status_code >= 400).length / metrics.length
    };
  }

  createMetricsStream() {
    // In a real implementation, this would create an actual SSE stream
    return `data: ${JSON.stringify({
      timestamp: Date.now(),
      active_connections: Math.floor(Math.random() * 100),
      requests_per_second: Math.floor(Math.random() * 50),
      cache_hit_rate: Math.random()
    })}\n\n`;
  }

  async checkDatabaseHealth() {
    try {
      // Use Harper-native describe_all operation for health check
      await this.harperdb.describeAll();
      return { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async checkCacheHealth() {
    try {
      // Test cache operations
      const testKey = 'health_check_' + Date.now();
      await this.harperdb.cache.set(testKey, 'test', 60);
      const result = await this.harperdb.cache.get(testKey);
      await this.harperdb.cache.delete(testKey);
      
      return { 
        status: result === 'test' ? 'healthy' : 'degraded',
        responseTime: Date.now()
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async checkAIModelsHealth() {
    try {
      // Check AI extensions health
      const extensionsHealth = {
        proxyService: proxyServiceExtension ? await proxyServiceExtension.getHealth() : null,
        modelManager: modelManagerExtension ? await modelManagerExtension.getHealth() : null,
        trainingManager: trainingManagerExtension ? await trainingManagerExtension.getHealth() : null
      };
      
      const allHealthy = Object.values(extensionsHealth).every(ext => 
        ext === null || ext.initialized === true
      );
      
      return {
        status: allHealthy ? 'healthy' : 'degraded',
        extensions: extensionsHealth
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async isDatabaseReady() {
    try {
      await this.harperdb.searchByValue('tenants', 'id', '*', { limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async areModelsReady() {
    try {
      // Check if AI extensions are ready
      const proxyServiceReady = proxyServiceExtension ? proxyServiceExtension.isReady() : false;
      const modelManagerReady = modelManagerExtension ? modelManagerExtension.isReady() : false;
      
      return proxyServiceReady && modelManagerReady;
    } catch {
      return false;
    }
  }

  async isCacheReady() {
    try {
      await this.harperdb.cache.get('test');
      return true;
    } catch {
      return false;
    }
  }
}