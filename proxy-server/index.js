/**
 * Edge AI Proxy Service for E-commerce Personalization
 * Acts as a transparent caching proxy with TensorFlow.js inference
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const ProxyManager = require('./core/ProxyManager');
const CacheManager = require('./core/CacheManager');
const PersonalizationEngine = require('./ai/PersonalizationEngine');
const MetricsCollector = require('./monitoring/MetricsCollector');
const TenantManager = require('./core/TenantManager');
const CircuitBreaker = require('./utils/CircuitBreaker');

const app = express();
const PORT = process.env.PORT || 3000;

// Load mock responses for demo mode
const fs = require('fs');
const path = require('path');
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

// Initialize core components
const cacheManager = new CacheManager({
  maxSize: process.env.CACHE_MAX_SIZE || '1GB',
  defaultTTL: 300, // 5 minutes
  personalizationTTL: 60, // 1 minute for personalized content
  compressionEnabled: true
});

const metricsCollector = new MetricsCollector({
  flushInterval: 10000, // 10 seconds
  retentionPeriod: 86400000 // 24 hours
});

const personalizationEngine = new PersonalizationEngine({
  modelCachePath: './models',
  preloadModels: ['collaborative-filtering', 'content-based', 'hybrid'],
  inferenceTimeout: 100, // 100ms max inference time
  fallbackToCache: true
});

const tenantManager = new TenantManager({
  configPath: './config/tenants.json',
  autoReload: true,
  reloadInterval: 60000 // 1 minute
});

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  monitoringPeriod: 60000 // 1 minute
});

const proxyManager = new ProxyManager({
  cacheManager,
  personalizationEngine,
  metricsCollector,
  tenantManager,
  circuitBreaker,
  timeout: 5000, // 5 second timeout for upstream requests
  retryAttempts: 2,
  retryDelay: 1000
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow proxied content
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
  
  // Extract tenant from header or subdomain
  req.tenantId = req.headers['x-tenant-id'] || 
                 req.hostname.split('.')[0] || 
                 'default';
  
  // Extract user context for personalization
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
app.all('/api/*', async (req, res) => {
  const path = req.params[0];
  const tenant = await tenantManager.getTenant(req.tenantId);
  
  if (!tenant) {
    return res.status(400).json({
      error: 'Invalid tenant',
      requestId: req.requestId
    });
  }
  
  try {
    // Demo mode: check for mock responses first
    if (mockResponses[req.tenantId]) {
      const mockData = getMockResponse(req.tenantId, path, req.query);
      if (mockData) {
        console.log(`🎭 Mock response for ${req.tenantId}:${path}`);
        
        // Add proxy metadata headers for mock responses
        res.setHeader('X-Proxy-Cache', 'MOCK');
        res.setHeader('X-Proxy-Enhanced', 'true');
        res.setHeader('X-Proxy-Request-Id', req.requestId);
        res.setHeader('X-Proxy-Response-Time', Math.random() * 100 + 20); // Simulate 20-120ms
        
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
    console.error(`Proxy error for ${req.tenantId}:`, error);
    
    // Attempt fallback to direct proxy without enhancement
    if (circuitBreaker.isOpen(req.tenantId)) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        requestId: req.requestId,
        retryAfter: circuitBreaker.getRetryAfter(req.tenantId)
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
    res.write(`data: ${JSON.stringify(metrics)}\n\n`);
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
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.PROXY_API_KEY) {
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
  console.log('Initializing Edge AI Proxy Service...');
  
  try {
    // Load tenants
    await tenantManager.initialize();
    console.log(`Loaded ${tenantManager.getTenantCount()} tenants`);
    
    // Load AI models
    await personalizationEngine.initialize();
    console.log(`Loaded ${personalizationEngine.getModelCount()} models`);
    
    // Initialize cache
    await cacheManager.initialize();
    console.log(`Cache initialized with ${cacheManager.getSize()} capacity`);
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Edge AI Proxy Service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/proxy/health`);
      console.log(`Metrics: http://localhost:${PORT}/proxy/metrics`);
    });
    
  } catch (error) {
    console.error('Failed to initialize:', error);
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

module.exports = app;