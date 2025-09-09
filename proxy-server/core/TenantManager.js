/**
 * TenantManager - Multi-tenant configuration management
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class TenantManager extends EventEmitter {
  constructor(options) {
    super();
    
    this.configPath = options.configPath || './config/tenants.json';
    this.autoReload = options.autoReload !== false;
    this.reloadInterval = options.reloadInterval || 60000; // 1 minute
    
    this.tenants = new Map();
    this.lastModified = null;
    this.reloadTimer = null;
  }
  
  async initialize() {
    // Load initial configuration
    await this.loadConfiguration();
    
    // Set up auto-reload if enabled
    if (this.autoReload) {
      this.startAutoReload();
    }
    
    return true;
  }
  
  async loadConfiguration() {
    try {
      // Check if config file exists, create default if not
      try {
        await fs.access(this.configPath);
      } catch {
        await this.createDefaultConfiguration();
      }
      
      // Load configuration
      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Validate and load tenants
      for (const tenant of config.tenants) {
        this.validateTenant(tenant);
        this.tenants.set(tenant.id, this.processTenant(tenant));
      }
      
      // Get file stats for change detection
      const stats = await fs.stat(this.configPath);
      this.lastModified = stats.mtime;
      
      this.emit('configuration-loaded', { tenants: this.tenants.size });
      
    } catch (error) {
      console.error('Failed to load tenant configuration:', error);
      throw error;
    }
  }
  
  async createDefaultConfiguration() {
    const defaultConfig = {
      version: '1.0.0',
      tenants: [
        {
          id: 'demo-store',
          name: 'Demo E-commerce Store',
          baseUrl: 'https://api.demo-store.com',
          apiKey: process.env.DEMO_STORE_API_KEY || '',
          apiKeyHeader: 'X-API-Key',
          responseFormat: 'standard',
          recommendationLimit: 10,
          personalizationBoost: 1.5,
          maxDiscount: 0.2,
          pricingStrategy: 'optimize-conversion',
          categoryWeights: {
            electronics: 1.2,
            clothing: 1.0,
            home: 0.9,
            sports: 1.1,
            books: 0.8
          },
          endpoints: [
            {
              name: 'product-listing',
              pattern: '^products(/.*)?$',
              cacheable: true,
              cacheTTL: 300,
              personalization: {
                enabled: true,
                type: 'product-listing'
              }
            },
            {
              name: 'product-detail',
              pattern: '^product/[^/]+$',
              cacheable: true,
              cacheTTL: 600,
              personalization: {
                enabled: true,
                type: 'product-recommendations'
              }
            },
            {
              name: 'search',
              pattern: '^search\\?',
              cacheable: true,
              cacheTTL: 180,
              personalization: {
                enabled: true,
                type: 'search-results'
              }
            },
            {
              name: 'recommendations',
              pattern: '^recommendations(/.*)?$',
              cacheable: true,
              cacheTTL: 60,
              personalization: {
                enabled: true,
                type: 'product-recommendations'
              }
            },
            {
              name: 'pricing',
              pattern: '^pricing(/.*)?$',
              cacheable: false,
              personalization: {
                enabled: true,
                type: 'dynamic-pricing'
              }
            },
            {
              name: 'content',
              pattern: '^content(/.*)?$',
              cacheable: true,
              cacheTTL: 3600,
              personalization: {
                enabled: true,
                type: 'content-personalization'
              }
            }
          ],
          segmentationRules: {
            purchaseThreshold: 5,
            valueThreshold: 500,
            frequencyThreshold: 0.5
          },
          contentRules: {
            purchaseIntent: {
              callToAction: 'Complete Your Purchase',
              urgency: 'Only a few left in stock!'
            },
            mobile: {
              layout: 'card',
              imageSize: 'medium'
            },
            darkTheme: {
              enabled: true
            }
          },
          rateLimits: {
            requestsPerSecond: 100,
            requestsPerMinute: 1000,
            requestsPerHour: 10000
          },
          headers: {
            'X-Forwarded-By': 'edge-ai-proxy',
            'X-Proxy-Version': '2.0.0'
          }
        },
        {
          id: 'shopify-store',
          name: 'Shopify Store Integration',
          baseUrl: 'https://your-store.myshopify.com/api/2024-01',
          apiKey: process.env.SHOPIFY_API_KEY || '',
          apiKeyHeader: 'X-Shopify-Access-Token',
          responseFormat: 'nested',
          recommendationLimit: 8,
          personalizationBoost: 1.3,
          endpoints: [
            {
              name: 'products',
              pattern: '^products\\.json',
              cacheable: true,
              cacheTTL: 300,
              personalization: {
                enabled: true,
                type: 'product-listing'
              }
            },
            {
              name: 'collections',
              pattern: '^collections/[^/]+/products\\.json',
              cacheable: true,
              cacheTTL: 300,
              personalization: {
                enabled: true,
                type: 'product-listing'
              }
            }
          ]
        },
        {
          id: 'woocommerce',
          name: 'WooCommerce Store',
          baseUrl: 'https://your-store.com/wp-json/wc/v3',
          apiKey: process.env.WOOCOMMERCE_KEY || '',
          apiKeyHeader: 'Authorization',
          responseFormat: 'standard',
          endpoints: [
            {
              name: 'products',
              pattern: '^products(/.*)?$',
              cacheable: true,
              cacheTTL: 300,
              personalization: {
                enabled: true,
                type: 'product-listing'
              }
            }
          ]
        }
      ]
    };
    
    // Create config directory if it doesn't exist
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    
    // Write default configuration
    await fs.writeFile(
      this.configPath,
      JSON.stringify(defaultConfig, null, 2)
    );
    
    console.log('Created default tenant configuration');
  }
  
  validateTenant(tenant) {
    const required = ['id', 'name', 'baseUrl'];
    
    for (const field of required) {
      if (!tenant[field]) {
        throw new Error(`Tenant missing required field: ${field}`);
      }
    }
    
    // Validate URL format
    try {
      new URL(tenant.baseUrl);
    } catch {
      throw new Error(`Invalid baseUrl for tenant ${tenant.id}: ${tenant.baseUrl}`);
    }
    
    // Validate endpoints
    if (tenant.endpoints) {
      for (const endpoint of tenant.endpoints) {
        if (!endpoint.name || !endpoint.pattern) {
          throw new Error(`Invalid endpoint configuration for tenant ${tenant.id}`);
        }
        
        // Validate regex pattern
        try {
          new RegExp(endpoint.pattern);
        } catch {
          throw new Error(`Invalid regex pattern for endpoint ${endpoint.name}: ${endpoint.pattern}`);
        }
      }
    }
    
    return true;
  }
  
  processTenant(tenant) {
    // Process and enhance tenant configuration
    const processed = { ...tenant };
    
    // Compile endpoint patterns for performance
    if (processed.endpoints) {
      processed.endpoints = processed.endpoints.map(endpoint => ({
        ...endpoint,
        compiledPattern: new RegExp(endpoint.pattern),
        cacheKey: `${tenant.id}:${endpoint.name}`
      }));
    }
    
    // Set defaults
    processed.responseFormat = processed.responseFormat || 'standard';
    processed.recommendationLimit = processed.recommendationLimit || 10;
    processed.personalizationBoost = processed.personalizationBoost || 1.5;
    processed.maxDiscount = processed.maxDiscount || 0.2;
    processed.pricingStrategy = processed.pricingStrategy || 'optimize-conversion';
    
    // Initialize rate limiter state
    processed.rateLimiter = {
      requests: [],
      lastReset: Date.now()
    };
    
    return processed;
  }
  
  async addTenant(tenantConfig) {
    // Validate new tenant
    this.validateTenant(tenantConfig);
    
    // Check for duplicate ID
    if (this.tenants.has(tenantConfig.id)) {
      throw new Error(`Tenant with ID ${tenantConfig.id} already exists`);
    }
    
    // Process and add tenant
    const processed = this.processTenant(tenantConfig);
    this.tenants.set(tenantConfig.id, processed);
    
    // Persist to configuration
    await this.saveConfiguration();
    
    this.emit('tenant-added', { tenantId: tenantConfig.id });
    
    return processed;
  }
  
  async updateTenant(tenantId, updates) {
    const existing = this.tenants.get(tenantId);
    
    if (!existing) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    
    // Merge updates
    const updated = { ...existing, ...updates, id: tenantId };
    
    // Validate updated configuration
    this.validateTenant(updated);
    
    // Process and update
    const processed = this.processTenant(updated);
    this.tenants.set(tenantId, processed);
    
    // Persist to configuration
    await this.saveConfiguration();
    
    this.emit('tenant-updated', { tenantId });
    
    return processed;
  }
  
  async removeTenant(tenantId) {
    if (!this.tenants.has(tenantId)) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    
    this.tenants.delete(tenantId);
    
    // Persist to configuration
    await this.saveConfiguration();
    
    this.emit('tenant-removed', { tenantId });
    
    return true;
  }
  
  async saveConfiguration() {
    // Convert tenants map to array for storage
    const config = {
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      tenants: Array.from(this.tenants.values()).map(tenant => {
        // Remove runtime data before saving
        const { rateLimiter, ...tenantConfig } = tenant;
        
        // Unconvert compiled patterns
        if (tenantConfig.endpoints) {
          tenantConfig.endpoints = tenantConfig.endpoints.map(endpoint => {
            const { compiledPattern, cacheKey, ...endpointConfig } = endpoint;
            return endpointConfig;
          });
        }
        
        return tenantConfig;
      })
    };
    
    // Write to file
    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2)
    );
    
    // Update last modified time
    const stats = await fs.stat(this.configPath);
    this.lastModified = stats.mtime;
  }
  
  startAutoReload() {
    this.reloadTimer = setInterval(async () => {
      try {
        // Check if file has been modified
        const stats = await fs.stat(this.configPath);
        
        if (stats.mtime > this.lastModified) {
          console.log('Tenant configuration changed, reloading...');
          await this.loadConfiguration();
        }
      } catch (error) {
        console.error('Auto-reload check failed:', error);
      }
    }, this.reloadInterval);
  }
  
  stopAutoReload() {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
    }
  }
  
  // Rate limiting
  checkRateLimit(tenantId, limits) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || !limits) return true;
    
    const now = Date.now();
    const rateLimiter = tenant.rateLimiter;
    
    // Clean old requests
    rateLimiter.requests = rateLimiter.requests.filter(
      time => now - time < 3600000 // Keep last hour
    );
    
    // Check per-second limit
    if (limits.requestsPerSecond) {
      const recentSecond = rateLimiter.requests.filter(
        time => now - time < 1000
      );
      if (recentSecond.length >= limits.requestsPerSecond) {
        return false;
      }
    }
    
    // Check per-minute limit
    if (limits.requestsPerMinute) {
      const recentMinute = rateLimiter.requests.filter(
        time => now - time < 60000
      );
      if (recentMinute.length >= limits.requestsPerMinute) {
        return false;
      }
    }
    
    // Check per-hour limit
    if (limits.requestsPerHour) {
      if (rateLimiter.requests.length >= limits.requestsPerHour) {
        return false;
      }
    }
    
    // Record this request
    rateLimiter.requests.push(now);
    
    return true;
  }
  
  // Public API
  getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    
    if (tenant && tenant.rateLimits) {
      // Check rate limits
      if (!this.checkRateLimit(tenantId, tenant.rateLimits)) {
        const error = new Error('Rate limit exceeded');
        error.statusCode = 429;
        throw error;
      }
    }
    
    return tenant;
  }
  
  getAllTenants() {
    const tenants = {};
    
    this.tenants.forEach((tenant, id) => {
      const { rateLimiter, ...publicData } = tenant;
      tenants[id] = {
        ...publicData,
        endpointCount: tenant.endpoints ? tenant.endpoints.length : 0
      };
    });
    
    return tenants;
  }
  
  getTenantCount() {
    return this.tenants.size;
  }
  
  getHealth() {
    return {
      status: this.tenants.size > 0 ? 'healthy' : 'no-tenants',
      tenantCount: this.tenants.size,
      autoReload: this.autoReload,
      lastModified: this.lastModified
    };
  }
  
  isReady() {
    return this.tenants.size > 0;
  }
  
  // Event handling
  onTenantChange(callback) {
    this.on('tenant-added', callback);
    this.on('tenant-updated', callback);
    this.on('tenant-removed', callback);
  }
  
  // Cleanup
  async shutdown() {
    this.stopAutoReload();
    this.removeAllListeners();
  }
}

module.exports = TenantManager;