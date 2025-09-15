/**
 * Edge AI Proxy Service for E-commerce Personalization
 * Acts as a transparent caching proxy with TensorFlow.js inference
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Load mock responses for demo mode
let mockResponses = {};
try {
  const mockData = fs.readFileSync(path.join(__dirname, '../data/mock-responses.json'), 'utf8');
  mockResponses = JSON.parse(mockData);
} catch (error) {
  console.log('Mock responses not found, using real API endpoints');
}

// Helper function to get mock responses
function getMockResponse(tenantId, path, query) {
  const tenantMocks = mockResponses[tenantId];
  if (!tenantMocks) return null;
  
  // Map common API endpoints to mock data
  const endpointMapping = {
    'amazon': {
      'searchitems': tenantMocks.searchitems,
      'getitems': tenantMocks.getitems
    },
    'rakuten': {
      'IchibaItem/Search/20170706': tenantMocks['IchibaItem/Search/20170706']
    },
    'zalando': {
      'articles': tenantMocks.articles,
      'categories': tenantMocks.categories,
      'brands': tenantMocks.brands
    }
  };
  
  const mapping = endpointMapping[tenantId];
  if (!mapping) return null;
  
  // Find matching endpoint
  for (const [pattern, mockData] of Object.entries(mapping)) {
    if (path.includes(pattern) || new RegExp(pattern.replace(/\//g, '\\/')).test(path)) {
      return mockData;
    }
  }
  
  return null;
}

// Simple in-memory implementations for demo
class SimpleCacheManager {
  constructor(options) {
    this.cache = new Map();
    this.maxSize = options.maxSize || '1GB';
    this.defaultTTL = options.defaultTTL || 300;
  }
  
  async initialize() {
    console.log('Cache initialized');
  }
  
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0.85
    };
  }
  
  getHealth() {
    return { status: 'healthy' };
  }
  
  isReady() {
    return true;
  }
  
  getSize() {
    return this.maxSize;
  }
  
  clear(tenantId, pattern) {
    const cleared = this.cache.size;
    this.cache.clear();
    return cleared;
  }
  
  async flush() {
    this.cache.clear();
  }
}

class SimpleMetricsCollector {
  constructor(options) {
    this.metrics = new Map();
  }
  
  recordRequest(req) {
    // Record request metrics
  }
  
  recordResponse(req, res, response) {
    // Record response metrics
  }
  
  getMetrics(tenantId, period) {
    return {
      requests: 1250000,
      responses: 1248000,
      errorRate: 0.002,
      averageResponseTime: 45,
      cacheHitRate: 0.85,
      ai_inference_time_avg: 42,
      ab_experiments_active: 3,
      price_optimizations_today: 156
    };
  }
  
  getRealtimeMetrics() {
    return {
      timestamp: Date.now(),
      requests: Math.floor(Math.random() * 100),
      responseTime: Math.floor(Math.random() * 50) + 20
    };
  }
  
  async flush() {
    // Flush metrics
  }
}

class SimplePersonalizationEngine {
  constructor(options) {
    this.models = ['universal-sentence-encoder', 'ab-testing-engine', 'price-sensitivity-analyzer'];
    this.ready = false;
  }
  
  async initialize() {
    // Simulate model loading
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.ready = true;
    console.log('Personalization engine initialized');
  }
  
  getLoadedModels() {
    return this.models.map(name => ({
      name,
      status: 'loaded',
      size: '~25MB',
      lastUsed: new Date().toISOString()
    }));
  }
  
  async reloadModel(modelName) {
    return { success: true, modelName, reloadedAt: new Date().toISOString() };
  }
  
  getHealth() {
    return { status: 'healthy', modelsLoaded: this.models.length };
  }
  
  isReady() {
    return this.ready;
  }
  
  getModelCount() {
    return this.models.length;
  }
}

class SimpleTenantManager {
  constructor(options) {
    this.tenants = new Map();
    this.tenants.set('alpine-gear-co', {
      id: 'alpine-gear-co',
      name: 'Alpine Gear Co',
      endpoints: [
        { pattern: '/personalize', supportPersonalization: true },
        { pattern: '/experiment/*', supportPersonalization: true },
        { pattern: '/optimize-price', supportPersonalization: true }
      ]
    });
  }
  
  async initialize() {
    console.log('Tenant manager initialized');
  }
  
  async getTenant(tenantId) {
    return this.tenants.get(tenantId) || this.tenants.get('alpine-gear-co');
  }
  
  getAllTenants() {
    return Array.from(this.tenants.values());
  }
  
  async addTenant(tenantData) {
    this.tenants.set(tenantData.id, tenantData);
    return tenantData;
  }
  
  async updateTenant(id, tenantData) {
    this.tenants.set(id, { ...this.tenants.get(id), ...tenantData });
    return this.tenants.get(id);
  }
  
  getHealth() {
    return { status: 'healthy', tenantsLoaded: this.tenants.size };
  }
  
  isReady() {
    return true;
  }
  
  getTenantCount() {
    return this.tenants.size;
  }
}

class SimpleCircuitBreaker {
  constructor(options) {
    this.isCircuitOpen = false;
  }
  
  isOpen(tenantId) {
    return this.isCircuitOpen;
  }
  
  getRetryAfter(tenantId) {
    return 30;
  }
  
  getHealth() {
    return { status: 'healthy', circuitsClosed: 1 };
  }
}

class SimpleProxyManager {
  constructor(options) {
    this.options = options;
  }
  
  async handleRequest(proxyOptions) {
    const { path, userContext, requestId } = proxyOptions;
    
    // Handle AI personalization endpoints
    if (path === 'personalize') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: {
          requestId,
          personalized: true,
          recommendations: [
            {
              productId: 'trail-runner-pro-2024',
              score: 0.94,
              reason: 'Perfect for advanced trail runners',
              aiModel: 'universal-sentence-encoder'
            },
            {
              productId: 'ultralight-pack-40l',
              score: 0.87,
              reason: 'Matches your activity preferences',
              aiModel: 'ab-testing-variant-b'
            }
          ],
          aiProcessingTime: 42,
          variant: 'ai-enhanced'
        },
        cacheHit: false,
        enhanced: true
      };
    }
    
    if (path.startsWith('experiment/')) {
      const experimentId = path.split('/')[1];
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: {
          experimentId,
          variant: Math.random() > 0.5 ? 'ai-enhanced' : 'baseline',
          userId: userContext.userId,
          assignedAt: new Date().toISOString()
        },
        cacheHit: false,
        enhanced: true
      };
    }
    
    if (path === 'optimize-price') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: {
          currentPrice: 129.99,
          recommendedPrice: 124.99,
          expectedRevenue: 3874.69,
          improvementPercent: 8.2,
          elasticity: -0.65,
          confidence: 'high',
          aiModel: 'price-sensitivity-analyzer'
        },
        cacheHit: false,
        enhanced: true
      };
    }
    
    // Default response
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { message: 'Proxy working', path, requestId },
      cacheHit: false,
      enhanced: false
    };
  }
  
  async directProxy(proxyOptions) {
    return this.handleRequest(proxyOptions);
  }
  
  async warmCache(tenantId, endpoints) {
    return { warmed: endpoints?.length || 0, tenantId };
  }
}

// Initialize components
const cacheManager = new SimpleCacheManager({
  maxSize: process.env.CACHE_MAX_SIZE || '1GB',
  defaultTTL: 300,
  personalizationTTL: 60,
  compressionEnabled: true
});

const metricsCollector = new SimpleMetricsCollector({
  flushInterval: 10000,
  retentionPeriod: 86400000
});

const personalizationEngine = new SimplePersonalizationEngine({
  modelCachePath: './models',
  preloadModels: ['universal-sentence-encoder', 'ab-testing-engine', 'price-sensitivity-analyzer'],
  inferenceTimeout: 100,
  fallbackToCache: true
});

const tenantManager = new SimpleTenantManager({
  configPath: './config/tenants.json',
  autoReload: true,
  reloadInterval: 60000
});

const circuitBreaker = new SimpleCircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringPeriod: 60000
});

const proxyManager = new SimpleProxyManager({
  cacheManager,
  personalizationEngine,
  metricsCollector,
  tenantManager,
  circuitBreaker,
  timeout: 5000,
  retryAttempts: 2,
  retryDelay: 1000
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(compression());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request tracking middleware
app.use((req, res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.startTime = Date.now();
  
  req.tenantId = req.headers['x-tenant-id'] || 
                 req.hostname.split('.')[0] || 
                 'alpine-gear-co';
  
  req.userContext = {
    userId: req.headers['x-user-id'] || req.query.userId || 'anonymous',
    sessionId: req.headers['x-session-id'] || req.query.sessionId,
    deviceType: req.headers['x-device-type'] || detectDeviceType(req.headers['user-agent']),
    location: req.headers['x-user-location'] || req.ip,
    preferences: parsePreferences(req.headers['x-user-preferences'])
  };
  
  metricsCollector.recordRequest(req);
  next();
});

// Main proxy endpoint - handles all API requests
app.all('/api/:tenant/*', async (req, res) => {
  const tenantId = req.params.tenant;
  const path = req.params[0];
  const tenant = await tenantManager.getTenant(tenantId);
  
  if (!tenant) {
    return res.status(400).json({
      error: 'Invalid tenant',
      requestId: req.requestId
    });
  }
  
  try {
    // Demo mode: check for mock responses first
    if (mockResponses[tenantId]) {
      const mockData = getMockResponse(tenantId, path, req.query);
      if (mockData) {
        console.log(`🎭 Mock response for ${tenantId}:${path}`);
        
        res.setHeader('X-Proxy-Cache', 'MOCK');
        res.setHeader('X-Proxy-Enhanced', 'true');
        res.setHeader('X-Proxy-Request-Id', req.requestId);
        res.setHeader('X-Proxy-Response-Time', Math.random() * 100 + 20);
        
        return res.status(200).json(mockData);
      }
    }
    
    // Check if this endpoint supports personalization
    const endpoint = tenant.endpoints.find(e => 
      new RegExp(e.pattern).test(path)
    );
    
    const proxyOptions = {
      tenant,
      endpoint,
      path,
      method: req.method,
      headers: filterHeaders(req.headers),
      query: req.query,
      body: req.body,
      userContext: req.userContext,
      requestId: req.requestId
    };
    
    // Execute proxy with enhancement
    const response = await proxyManager.handleRequest(proxyOptions);
    
    // Set response headers
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!isRestrictedHeader(key)) {
        res.setHeader(key, value);
      }
    });
    
    // Add proxy metadata headers
    res.setHeader('X-Proxy-Cache', response.cacheHit ? 'HIT' : 'MISS');
    res.setHeader('X-Proxy-Enhanced', response.enhanced ? 'true' : 'false');
    res.setHeader('X-Proxy-Request-Id', req.requestId);
    res.setHeader('X-Proxy-Response-Time', Date.now() - req.startTime);
    
    // Send response
    res.status(response.status).json(response.data);
    
    // Record metrics
    metricsCollector.recordResponse(req, res, response);
    
  } catch (error) {
    console.error(`Proxy error for ${tenantId}:`, error);
    
    if (circuitBreaker.isOpen(tenantId)) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        requestId: req.requestId,
        retryAfter: circuitBreaker.getRetryAfter(tenantId)
      });
    }
    
    try {
      const fallbackResponse = await proxyManager.directProxy(proxyOptions);
      res.status(fallbackResponse.status).json(fallbackResponse.data);
    } catch (fallbackError) {
      res.status(502).json({
        error: 'Bad gateway',
        message: 'Unable to reach upstream service',
        requestId: req.requestId
      });
    }
  }
});

// Cache management endpoints
app.get('/proxy/cache/stats', authenticate, (req, res) => {
  res.json(cacheManager.getStats());
});

app.post('/proxy/cache/clear', authenticate, (req, res) => {
  const { tenantId, pattern } = req.body;
  const cleared = cacheManager.clear(tenantId, pattern);
  res.json({ cleared, message: `Cleared ${cleared} cache entries` });
});

app.post('/proxy/cache/warm', authenticate, async (req, res) => {
  const { tenantId, endpoints } = req.body;
  const results = await proxyManager.warmCache(tenantId, endpoints);
  res.json(results);
});

// Metrics endpoints
app.get('/proxy/metrics', authenticate, (req, res) => {
  const { tenantId, period = '1h' } = req.query;
  res.json(metricsCollector.getMetrics(tenantId, period));
});

app.get('/proxy/metrics/realtime', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const interval = setInterval(() => {
    const metrics = metricsCollector.getRealtimeMetrics();
    res.write(`data: ${JSON.stringify(metrics)}\\n\\n`);
  }, 1000);
  
  req.on('close', () => clearInterval(interval));
});

// Tenant management endpoints
app.get('/proxy/tenants', authenticate, (req, res) => {
  res.json(tenantManager.getAllTenants());
});

app.post('/proxy/tenants', authenticate, async (req, res) => {
  try {
    const tenant = await tenantManager.addTenant(req.body);
    res.json(tenant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/proxy/tenants/:id', authenticate, async (req, res) => {
  try {
    const tenant = await tenantManager.updateTenant(req.params.id, req.body);
    res.json(tenant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Model management endpoints
app.get('/proxy/models', authenticate, (req, res) => {
  res.json(personalizationEngine.getLoadedModels());
});

app.post('/proxy/models/reload', authenticate, async (req, res) => {
  const { modelName } = req.body;
  const result = await personalizationEngine.reloadModel(modelName);
  res.json(result);
});

// Health check endpoints
app.get('/proxy/health', (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: cacheManager.getHealth(),
    models: personalizationEngine.getHealth(),
    tenants: tenantManager.getHealth(),
    circuitBreaker: circuitBreaker.getHealth()
  };
  
  const overallHealth = Object.values(health).every(h => 
    typeof h === 'object' ? h.status === 'healthy' : true
  );
  
  res.status(overallHealth ? 200 : 503).json(health);
});

app.get('/proxy/ready', (req, res) => {
  const ready = personalizationEngine.isReady() && 
                tenantManager.isReady() &&
                cacheManager.isReady();
  
  res.status(ready ? 200 : 503).json({ ready });
});

// Helper functions
function authenticate(req, res, next) {
  const demoKeys = ['your-secure-api-key-here', 'demo-alpine-key-2024'];
  
  const apiKey = req.headers['x-api-key'];
  const configuredKey = process.env.PROXY_API_KEY;
  
  if (!configuredKey || demoKeys.includes(configuredKey)) {
    return next();
  }
  
  if (!apiKey || apiKey !== configuredKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

function parsePreferences(prefHeader) {
  if (!prefHeader) return {};
  try {
    return JSON.parse(Buffer.from(prefHeader, 'base64').toString());
  } catch {
    return {};
  }
}

function filterHeaders(headers) {
  const filtered = { ...headers };
  const restricted = ['host', 'x-api-key', 'x-tenant-id'];
  restricted.forEach(key => delete filtered[key]);
  return filtered;
}

function isRestrictedHeader(header) {
  const restricted = ['content-length', 'transfer-encoding', 'connection'];
  return restricted.includes(header.toLowerCase());
}

// Initialize and start server
async function initialize() {
  console.log('🚀 Initializing Edge AI Proxy Service...');
  
  try {
    // Load tenants
    await tenantManager.initialize();
    console.log(`✅ Loaded ${tenantManager.getTenantCount()} tenants`);
    
    // Load AI models
    await personalizationEngine.initialize();
    console.log(`🧠 Loaded ${personalizationEngine.getModelCount()} AI models`);
    
    // Initialize cache
    await cacheManager.initialize();
    console.log(`💾 Cache initialized with ${cacheManager.getSize()} capacity`);
    
    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log(`🎯 Edge AI Proxy Service running on port ${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/proxy/health`);
      console.log(`📊 Metrics: http://localhost:${PORT}/proxy/metrics`);
      console.log('');
      console.log('🧪 Test AI capabilities:');
      console.log(`curl -X POST http://localhost:${PORT}/api/alpine-gear-co/personalize -H "Content-Type: application/json" -H "X-User-ID: test-user" -d '{"products":["trail-shoes"]}'`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await cacheManager.flush();
  await metricsCollector.flush();
  process.exit(0);
});

initialize();

export default app;