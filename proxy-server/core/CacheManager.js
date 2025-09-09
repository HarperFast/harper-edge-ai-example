/**
 * CacheManager - Intelligent caching with TTL and invalidation strategies
 */

const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class CacheManager {
  constructor(options) {
    this.maxSize = this.parseSize(options.maxSize || '1GB');
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.personalizationTTL = options.personalizationTTL || 60; // 1 minute
    this.compressionEnabled = options.compressionEnabled !== false;
    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB
    
    // Multi-layer cache architecture
    this.layers = {
      hot: new LRUCache({
        maxSize: Math.floor(this.maxSize * 0.2), // 20% for hot cache
        ttl: 60 * 1000, // 1 minute
        updateAgeOnGet: true,
        sizeCalculation: this.calculateSize.bind(this)
      }),
      warm: new LRUCache({
        maxSize: Math.floor(this.maxSize * 0.5), // 50% for warm cache
        ttl: this.defaultTTL * 1000,
        updateAgeOnGet: true,
        sizeCalculation: this.calculateSize.bind(this)
      }),
      cold: new LRUCache({
        maxSize: Math.floor(this.maxSize * 0.3), // 30% for cold cache
        ttl: 3600 * 1000, // 1 hour
        updateAgeOnGet: false,
        sizeCalculation: this.calculateSize.bind(this)
      })
    };
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      compressionSavings: 0,
      layerHits: { hot: 0, warm: 0, cold: 0 }
    };
    
    // Invalidation patterns
    this.invalidationPatterns = new Map();
    
    // TTL overrides by pattern
    this.ttlOverrides = new Map();
    
    // Access frequency tracking for adaptive caching
    this.accessFrequency = new Map();
    
    // Predictive prefetching queue
    this.prefetchQueue = [];
  }
  
  async initialize() {
    // Start background tasks
    this.startMaintenanceTasks();
    
    return true;
  }
  
  async get(key) {
    const hashedKey = this.hashKey(key);
    
    // Check hot cache first
    let cached = this.layers.hot.get(hashedKey);
    if (cached) {
      this.stats.hits++;
      this.stats.layerHits.hot++;
      this.trackAccess(key, 'hot');
      return await this.decompress(cached);
    }
    
    // Check warm cache
    cached = this.layers.warm.get(hashedKey);
    if (cached) {
      this.stats.hits++;
      this.stats.layerHits.warm++;
      this.trackAccess(key, 'warm');
      
      // Promote to hot cache if frequently accessed
      if (this.shouldPromote(key)) {
        this.layers.hot.set(hashedKey, cached);
      }
      
      return await this.decompress(cached);
    }
    
    // Check cold cache
    cached = this.layers.cold.get(hashedKey);
    if (cached) {
      this.stats.hits++;
      this.stats.layerHits.cold++;
      this.trackAccess(key, 'cold');
      
      // Promote to warm cache
      this.layers.warm.set(hashedKey, cached);
      
      return await this.decompress(cached);
    }
    
    this.stats.misses++;
    return null;
  }
  
  async set(key, value, ttl) {
    const hashedKey = this.hashKey(key);
    const compressed = await this.compress(value);
    const effectiveTTL = this.getEffectiveTTL(key, ttl);
    
    this.stats.sets++;
    
    // Determine cache layer based on TTL and access pattern
    const layer = this.determineLayer(key, effectiveTTL);
    
    // Store in appropriate layer
    this.layers[layer].set(hashedKey, compressed, {
      ttl: effectiveTTL * 1000
    });
    
    // Track for invalidation
    this.trackInvalidation(key, value);
    
    // Trigger predictive prefetching if applicable
    this.analyzePrefetchOpportunity(key, value);
    
    return true;
  }
  
  delete(key) {
    const hashedKey = this.hashKey(key);
    let deleted = false;
    
    // Delete from all layers
    Object.values(this.layers).forEach(cache => {
      if (cache.delete(hashedKey)) {
        deleted = true;
      }
    });
    
    if (deleted) {
      this.stats.deletes++;
    }
    
    return deleted;
  }
  
  clear(tenantId, pattern) {
    let cleared = 0;
    
    // Create regex pattern if provided
    const regex = pattern ? new RegExp(pattern) : null;
    
    Object.values(this.layers).forEach(cache => {
      const keys = Array.from(cache.keys());
      
      keys.forEach(hashedKey => {
        const originalKey = this.reverseHashLookup.get(hashedKey);
        
        if (originalKey && originalKey.startsWith(tenantId)) {
          if (!regex || regex.test(originalKey)) {
            cache.delete(hashedKey);
            cleared++;
          }
        }
      });
    });
    
    return cleared;
  }
  
  // Intelligent invalidation
  invalidate(pattern, options = {}) {
    const { cascade = true, related = true } = options;
    const invalidated = new Set();
    
    // Direct pattern matching
    Object.values(this.layers).forEach(cache => {
      const keys = Array.from(cache.keys());
      
      keys.forEach(hashedKey => {
        const originalKey = this.reverseHashLookup.get(hashedKey);
        
        if (originalKey && this.matchesPattern(originalKey, pattern)) {
          cache.delete(hashedKey);
          invalidated.add(originalKey);
        }
      });
    });
    
    // Cascade invalidation
    if (cascade) {
      invalidated.forEach(key => {
        const related = this.findRelatedKeys(key);
        related.forEach(relatedKey => {
          this.delete(relatedKey);
          invalidated.add(relatedKey);
        });
      });
    }
    
    // Invalidate related content
    if (related) {
      const relatedPatterns = this.getRelatedPatterns(pattern);
      relatedPatterns.forEach(relatedPattern => {
        this.invalidate(relatedPattern, { cascade: false, related: false });
      });
    }
    
    return Array.from(invalidated);
  }
  
  // Predictive prefetching
  async prefetch(predictions) {
    const results = [];
    
    for (const prediction of predictions) {
      const { key, probability, generator } = prediction;
      
      // Only prefetch if probability is high enough
      if (probability > 0.7) {
        try {
          const value = await generator();
          await this.set(key, value, this.defaultTTL);
          results.push({ key, status: 'prefetched' });
        } catch (error) {
          results.push({ key, status: 'failed', error: error.message });
        }
      }
    }
    
    return results;
  }
  
  // Adaptive TTL based on access patterns
  getEffectiveTTL(key, requestedTTL) {
    // Check for TTL overrides
    for (const [pattern, ttl] of this.ttlOverrides) {
      if (this.matchesPattern(key, pattern)) {
        return ttl;
      }
    }
    
    // Adaptive TTL based on access frequency
    const frequency = this.accessFrequency.get(key);
    if (frequency) {
      const accessRate = frequency.count / ((Date.now() - frequency.firstAccess) / 1000);
      
      if (accessRate > 1) { // More than 1 access per second
        return Math.min(requestedTTL * 2, 3600); // Double TTL, max 1 hour
      } else if (accessRate < 0.01) { // Less than 1 access per 100 seconds
        return Math.max(requestedTTL / 2, 30); // Half TTL, min 30 seconds
      }
    }
    
    return requestedTTL || this.defaultTTL;
  }
  
  // Compression helpers
  async compress(data) {
    if (!this.compressionEnabled) {
      return data;
    }
    
    const serialized = JSON.stringify(data);
    
    if (serialized.length < this.compressionThreshold) {
      return { compressed: false, data: serialized };
    }
    
    const compressed = await gzip(serialized);
    const savings = serialized.length - compressed.length;
    this.stats.compressionSavings += savings;
    
    return { compressed: true, data: compressed };
  }
  
  async decompress(cached) {
    if (!cached.compressed) {
      return JSON.parse(cached.data);
    }
    
    const decompressed = await gunzip(cached.data);
    return JSON.parse(decompressed.toString());
  }
  
  // Cache layer determination
  determineLayer(key, ttl) {
    // Short TTL -> hot cache
    if (ttl <= 60) {
      return 'hot';
    }
    
    // Personalized content -> hot/warm cache
    if (key.includes(':personalized:') || key.includes(':user:')) {
      return ttl <= 300 ? 'hot' : 'warm';
    }
    
    // Static content -> cold cache
    if (key.includes(':static:') || key.includes(':catalog:')) {
      return 'cold';
    }
    
    // Default based on TTL
    if (ttl <= 300) {
      return 'warm';
    }
    
    return 'cold';
  }
  
  // Access tracking
  trackAccess(key, layer) {
    const now = Date.now();
    const frequency = this.accessFrequency.get(key) || {
      count: 0,
      firstAccess: now,
      lastAccess: now,
      layers: { hot: 0, warm: 0, cold: 0 }
    };
    
    frequency.count++;
    frequency.lastAccess = now;
    frequency.layers[layer]++;
    
    this.accessFrequency.set(key, frequency);
    
    // Clean up old entries periodically
    if (this.accessFrequency.size > 10000) {
      this.cleanupAccessTracking();
    }
  }
  
  shouldPromote(key) {
    const frequency = this.accessFrequency.get(key);
    if (!frequency) return false;
    
    // Promote if accessed more than 3 times in last minute
    const recentAccesses = frequency.count;
    const timeSinceFirst = (Date.now() - frequency.firstAccess) / 1000;
    
    return recentAccesses > 3 && timeSinceFirst < 60;
  }
  
  // Pattern matching
  matchesPattern(key, pattern) {
    if (typeof pattern === 'string') {
      return key.includes(pattern);
    } else if (pattern instanceof RegExp) {
      return pattern.test(key);
    }
    return false;
  }
  
  findRelatedKeys(key) {
    const related = new Set();
    
    // Extract identifiers from key
    const parts = key.split(':');
    const tenantId = parts[0];
    const entityType = parts[2]; // e.g., product, category
    const entityId = parts[3];
    
    // Find related keys based on entity relationships
    if (entityType === 'product') {
      // Invalidate product listings containing this product
      related.add(`${tenantId}:GET:products:list`);
      related.add(`${tenantId}:GET:category:${entityId}`);
      related.add(`${tenantId}:GET:recommendations:product:${entityId}`);
    } else if (entityType === 'category') {
      // Invalidate category listings
      related.add(`${tenantId}:GET:categories:list`);
      related.add(`${tenantId}:GET:products:category:${entityId}`);
    }
    
    return related;
  }
  
  getRelatedPatterns(pattern) {
    const related = [];
    
    // Define relationships between patterns
    if (pattern.includes('product')) {
      related.push(pattern.replace('product', 'recommendation'));
      related.push(pattern.replace('product', 'review'));
    }
    
    if (pattern.includes('user')) {
      related.push(pattern.replace('user', 'session'));
      related.push(pattern.replace('user', 'preference'));
    }
    
    return related;
  }
  
  // Maintenance tasks
  startMaintenanceTasks() {
    // Cleanup old access tracking data
    setInterval(() => {
      this.cleanupAccessTracking();
    }, 60000); // Every minute
    
    // Analyze and optimize cache distribution
    setInterval(() => {
      this.optimizeCacheDistribution();
    }, 300000); // Every 5 minutes
    
    // Process prefetch queue
    setInterval(() => {
      this.processPrefetchQueue();
    }, 10000); // Every 10 seconds
  }
  
  cleanupAccessTracking() {
    const cutoff = Date.now() - 3600000; // 1 hour ago
    const toDelete = [];
    
    this.accessFrequency.forEach((frequency, key) => {
      if (frequency.lastAccess < cutoff) {
        toDelete.push(key);
      }
    });
    
    toDelete.forEach(key => this.accessFrequency.delete(key));
  }
  
  optimizeCacheDistribution() {
    const stats = this.getLayerStats();
    
    // Rebalance cache sizes based on usage patterns
    if (stats.hot.hitRate > 0.8 && stats.warm.hitRate < 0.3) {
      // Increase hot cache size
      this.rebalanceCaches('hot', 'warm', 0.05);
    } else if (stats.warm.hitRate > 0.7 && stats.hot.hitRate < 0.4) {
      // Increase warm cache size
      this.rebalanceCaches('warm', 'hot', 0.05);
    }
  }
  
  async processPrefetchQueue() {
    if (this.prefetchQueue.length === 0) return;
    
    const batch = this.prefetchQueue.splice(0, 10);
    await this.prefetch(batch);
  }
  
  analyzePrefetchOpportunity(key, value) {
    // Analyze access patterns to predict future requests
    const parts = key.split(':');
    const entityType = parts[2];
    
    if (entityType === 'product' && value.relatedProducts) {
      // Queue related products for prefetching
      value.relatedProducts.forEach(productId => {
        this.prefetchQueue.push({
          key: `${parts[0]}:GET:product:${productId}`,
          probability: 0.6,
          generator: async () => {
            // Fetch product data
            return { id: productId, prefetched: true };
          }
        });
      });
    }
  }
  
  // Statistics and monitoring
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    return {
      ...this.stats,
      hitRate: (hitRate * 100).toFixed(2) + '%',
      totalRequests,
      cacheSize: this.getCurrentSize(),
      layerStats: this.getLayerStats(),
      compressionSavingsGB: (this.stats.compressionSavings / 1073741824).toFixed(3)
    };
  }
  
  getLayerStats() {
    const stats = {};
    
    Object.entries(this.layers).forEach(([layer, cache]) => {
      const layerHits = this.stats.layerHits[layer];
      const totalHits = this.stats.hits;
      
      stats[layer] = {
        size: cache.size,
        maxSize: cache.max,
        utilization: ((cache.size / cache.max) * 100).toFixed(2) + '%',
        hits: layerHits,
        hitRate: totalHits > 0 ? ((layerHits / totalHits) * 100).toFixed(2) + '%' : '0%'
      };
    });
    
    return stats;
  }
  
  getCurrentSize() {
    let totalSize = 0;
    Object.values(this.layers).forEach(cache => {
      totalSize += cache.calculatedSize || 0;
    });
    return this.formatSize(totalSize);
  }
  
  getHealth() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses);
    const utilizationRate = this.getCurrentUtilization();
    
    return {
      status: hitRate > 0.3 && utilizationRate < 0.95 ? 'healthy' : 'degraded',
      hitRate,
      utilization: utilizationRate,
      evictionRate: this.stats.evictions / this.stats.sets
    };
  }
  
  getCurrentUtilization() {
    let totalUsed = 0;
    let totalMax = 0;
    
    Object.values(this.layers).forEach(cache => {
      totalUsed += cache.calculatedSize || 0;
      totalMax += cache.max;
    });
    
    return totalMax > 0 ? totalUsed / totalMax : 0;
  }
  
  isReady() {
    return true;
  }
  
  async flush() {
    // Flush any pending operations
    await this.processPrefetchQueue();
    return true;
  }
  
  // Utility methods
  hashKey(key) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    
    // Store reverse lookup for debugging and management
    if (!this.reverseHashLookup) {
      this.reverseHashLookup = new Map();
    }
    this.reverseHashLookup.set(hash, key);
    
    return hash;
  }
  
  calculateSize(value) {
    if (value.compressed && value.data instanceof Buffer) {
      return value.data.length;
    }
    return JSON.stringify(value).length;
  }
  
  parseSize(sizeStr) {
    const units = { KB: 1024, MB: 1048576, GB: 1073741824 };
    const match = sizeStr.match(/^(\d+)(KB|MB|GB)$/i);
    
    if (match) {
      return parseInt(match[1]) * units[match[2].toUpperCase()];
    }
    
    return parseInt(sizeStr) || 1073741824; // Default 1GB
  }
  
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }
  
  rebalanceCaches(increase, decrease, percentage) {
    const increaseCache = this.layers[increase];
    const decreaseCache = this.layers[decrease];
    
    const transferSize = Math.floor(this.maxSize * percentage);
    
    increaseCache.max += transferSize;
    decreaseCache.max = Math.max(decreaseCache.max - transferSize, this.maxSize * 0.1);
  }
  
  handleEviction(layer, key, value) {
    // Move to next layer if applicable
    if (layer === 'hot') {
      this.layers.warm.set(key, value);
    } else if (layer === 'warm') {
      this.layers.cold.set(key, value);
    }
  }
  
  trackInvalidation(key, value) {
    // Track patterns for automatic invalidation
    const parts = key.split(':');
    const pattern = parts.slice(0, 3).join(':');
    
    if (!this.invalidationPatterns.has(pattern)) {
      this.invalidationPatterns.set(pattern, new Set());
    }
    
    this.invalidationPatterns.get(pattern).add(key);
  }
  
  getSize() {
    return this.formatSize(this.maxSize);
  }
}

module.exports = CacheManager;