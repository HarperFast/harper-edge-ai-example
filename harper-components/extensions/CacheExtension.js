/**
 * CacheExtension - Enhanced caching extension for Harper-fabric
 * Provides intelligent caching with multi-layer architecture and AI-driven optimization
 */

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CacheExtension {
  constructor(harperResource, options = {}) {
    this.harperdb = harperResource?.harperdb;
    this.maxSize = this.parseSize(options.maxSize || '1GB');
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.personalizationTTL = options.personalizationTTL || 60; // 1 minute for personalized content
    this.compressionEnabled = options.compressionEnabled !== false;
    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB
    this.intelligentEviction = options.intelligentEviction !== false;
    
    // Multi-layer cache architecture
    this.layers = this.initializeCacheLayers();
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      compressionSavings: 0,
      layerHits: { hot: 0, warm: 0, cold: 0, persistent: 0 },
      avgResponseTime: 0,
      totalRequests: 0
    };
    
    // Invalidation patterns for smart cache clearing
    this.invalidationPatterns = new Map();
    
    // TTL overrides by pattern
    this.ttlOverrides = new Map();
    
    // Access frequency tracking for intelligent eviction
    this.accessFrequency = new Map();
    this.accessHistory = new LRUCache({ max: 10000, ttl: 3600000 }); // 1 hour
    
    // Predictive prefetching
    this.prefetchQueue = [];
    this.prefetchPatterns = new Map();
    
    // Background tasks
    this.startMaintenanceTasks();
  }

  initializeCacheLayers() {
    const hotSize = Math.floor(this.maxSize * 0.15); // 15% for hot cache
    const warmSize = Math.floor(this.maxSize * 0.35); // 35% for warm cache
    const coldSize = Math.floor(this.maxSize * 0.25); // 25% for cold cache
    // Remaining 25% is handled by Harper-fabric persistent cache
    
    return {
      hot: new LRUCache({
        maxSize: hotSize,
        ttl: 30 * 1000, // 30 seconds
        updateAgeOnGet: true,
        sizeCalculation: this.calculateSize.bind(this),
        dispose: this.onEviction.bind(this, 'hot')
      }),
      warm: new LRUCache({
        maxSize: warmSize,
        ttl: this.defaultTTL * 1000,
        updateAgeOnGet: true,
        sizeCalculation: this.calculateSize.bind(this),
        dispose: this.onEviction.bind(this, 'warm')
      }),
      cold: new LRUCache({
        maxSize: coldSize,
        ttl: 3600 * 1000, // 1 hour
        updateAgeOnGet: false,
        sizeCalculation: this.calculateSize.bind(this),
        dispose: this.onEviction.bind(this, 'cold')
      })
    };
  }

  async get(key, options = {}) {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      const hashedKey = this.hashKey(key);
      let cached = null;
      let layer = null;

      // Check hot cache first
      cached = this.layers.hot.get(hashedKey);
      if (cached) {
        this.recordHit('hot');
        this.trackAccess(key, 'hot');
        const result = await this.decompress(cached);
        this.updateResponseTime(Date.now() - startTime);
        return result;
      }

      // Check warm cache
      cached = this.layers.warm.get(hashedKey);
      if (cached) {
        this.recordHit('warm');
        this.trackAccess(key, 'warm');
        
        // Promote to hot cache if frequently accessed
        if (this.shouldPromoteToHot(key)) {
          this.layers.hot.set(hashedKey, cached);
        }
        
        const result = await this.decompress(cached);
        this.updateResponseTime(Date.now() - startTime);
        return result;
      }

      // Check cold cache
      cached = this.layers.cold.get(hashedKey);
      if (cached) {
        this.recordHit('cold');
        this.trackAccess(key, 'cold');
        
        // Promote to warm cache if accessed
        if (this.shouldPromoteToWarm(key)) {
          this.layers.warm.set(hashedKey, cached);
        }
        
        const result = await this.decompress(cached);
        this.updateResponseTime(Date.now() - startTime);
        return result;
      }

      // Check Harper-fabric persistent cache
      if (this.harperdb) {
        try {
          const persistent = await this.harperdb.cache.get(hashedKey);
          if (persistent && this.isValidCacheEntry(persistent)) {
            this.recordHit('persistent');
            this.trackAccess(key, 'persistent');
            
            // Load into appropriate memory layer
            const compressed = await this.compress(persistent);
            this.layers.cold.set(hashedKey, compressed);
            
            this.updateResponseTime(Date.now() - startTime);
            return persistent;
          }
        } catch (error) {
          console.warn('Persistent cache access failed:', error);
        }
      }

      // Cache miss
      this.stats.misses++;
      this.updateResponseTime(Date.now() - startTime);
      
      // Check for predictive prefetch opportunity
      this.considerPrefetch(key);
      
      return null;
      
    } catch (error) {
      console.error('Cache get error:', error);
      this.updateResponseTime(Date.now() - startTime);
      return null;
    }
  }

  async set(key, value, ttl = null, options = {}) {
    try {
      const hashedKey = this.hashKey(key);
      ttl = ttl || this.getTTLForKey(key);
      
      const cacheData = {
        data: value,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        ttl,
        key: key,
        metadata: {
          tenant: options.tenant,
          personalized: options.personalized || false,
          endpoint: options.endpoint,
          userSegment: options.userSegment
        }
      };

      // Compress if enabled and data is large enough
      const compressed = await this.compress(cacheData);
      const size = this.calculateSize(compressed);
      
      // Determine which layer to store in
      const layer = this.selectStorageLayer(key, size, options);
      
      // Store in selected layer
      this.layers[layer].set(hashedKey, compressed);
      
      // Also store in Harper-fabric persistent cache for durability
      if (this.harperdb && layer !== 'hot') {
        try {
          await this.harperdb.cache.set(hashedKey, cacheData, ttl);
          
          // Store metadata in database for analytics
          await this.storeCacheMetadata(hashedKey, key, cacheData, options);
          
        } catch (error) {
          console.warn('Persistent cache store failed:', error);
        }
      }
      
      this.stats.sets++;
      this.trackAccess(key, layer, 'set');
      
      // Learn prefetch patterns
      this.learnPrefetchPattern(key, options);
      
      return true;
      
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async delete(key, pattern = false) {
    try {
      if (pattern) {
        return await this.deleteByPattern(key);
      }
      
      const hashedKey = this.hashKey(key);
      let deleted = false;
      
      // Remove from all memory layers
      ['hot', 'warm', 'cold'].forEach(layer => {
        if (this.layers[layer].delete(hashedKey)) {
          deleted = true;
        }
      });
      
      // Remove from persistent cache
      if (this.harperdb) {
        try {
          await this.harperdb.cache.delete(hashedKey);
          deleted = true;
        } catch (error) {
          console.warn('Persistent cache delete failed:', error);
        }
      }
      
      if (deleted) {
        this.stats.deletes++;
        this.accessFrequency.delete(key);
      }
      
      return deleted;
      
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async deleteByPattern(pattern) {
    let deletedCount = 0;
    
    try {
      const regex = new RegExp(pattern);
      
      // Delete from memory layers
      ['hot', 'warm', 'cold'].forEach(layer => {
        const cache = this.layers[layer];
        const keysToDelete = [];
        
        for (const [hashedKey, value] of cache.entries()) {
          if (value?.key && regex.test(value.key)) {
            keysToDelete.push(hashedKey);
          }
        }
        
        keysToDelete.forEach(key => {
          cache.delete(key);
          deletedCount++;
        });
      });
      
      // Delete from persistent cache using database query
      if (this.harperdb) {
        try {
          const result = await this.harperdb.delete('cache_metadata', {
            cache_key: { $regex: pattern }
          });
          
          if (result.deleted_hashes) {
            deletedCount += result.deleted_hashes.length;
          }
        } catch (error) {
          console.warn('Persistent cache pattern delete failed:', error);
        }
      }
      
      this.stats.deletes += deletedCount;
      
      return deletedCount;
      
    } catch (error) {
      console.error('Cache pattern delete error:', error);
      return 0;
    }
  }

  async clear(options = {}) {
    try {
      let clearedCount = 0;
      
      // Clear memory layers
      ['hot', 'warm', 'cold'].forEach(layer => {
        const size = this.layers[layer].size;
        this.layers[layer].clear();
        clearedCount += size;
      });
      
      // Clear persistent cache
      if (this.harperdb && !options.memoryOnly) {
        try {
          const result = await this.harperdb.delete('cache_metadata', {});
          if (result.deleted_hashes) {
            clearedCount += result.deleted_hashes.length;
          }
        } catch (error) {
          console.warn('Persistent cache clear failed:', error);
        }
      }
      
      // Reset statistics
      this.stats.deletes += clearedCount;
      this.accessFrequency.clear();
      this.accessHistory.clear();
      
      return clearedCount;
      
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }

  // Intelligent cache management methods

  selectStorageLayer(key, size, options = {}) {
    // Hot cache for small, frequently accessed items
    if (size < 10000 && this.isFrequentlyAccessed(key)) { // < 10KB
      return 'hot';
    }
    
    // Warm cache for medium-sized items or personalized content
    if (size < 100000 || options.personalized) { // < 100KB
      return 'warm';
    }
    
    // Cold cache for large items
    return 'cold';
  }

  shouldPromoteToHot(key) {
    const frequency = this.getAccessFrequency(key);
    const recentAccesses = this.getRecentAccesses(key);
    
    return frequency > 10 && recentAccesses > 3; // 10 total accesses, 3 recent
  }

  shouldPromoteToWarm(key) {
    const frequency = this.getAccessFrequency(key);
    return frequency > 2;
  }

  isFrequentlyAccessed(key) {
    return this.getAccessFrequency(key) > 5;
  }

  getAccessFrequency(key) {
    return this.accessFrequency.get(key)?.count || 0;
  }

  getRecentAccesses(key) {
    const history = this.accessHistory.get(key) || [];
    const recentThreshold = Date.now() - (5 * 60 * 1000); // 5 minutes
    return history.filter(time => time > recentThreshold).length;
  }

  trackAccess(key, layer, operation = 'get') {
    const now = Date.now();
    
    // Update access frequency
    const current = this.accessFrequency.get(key) || { count: 0, lastAccess: 0 };
    current.count++;
    current.lastAccess = now;
    this.accessFrequency.set(key, current);
    
    // Update access history
    const history = this.accessHistory.get(key) || [];
    history.push(now);
    if (history.length > 100) { // Keep last 100 accesses
      history.shift();
    }
    this.accessHistory.set(key, history);
    
    // Record layer-specific stats
    if (operation === 'get') {
      this.stats.layerHits[layer] = (this.stats.layerHits[layer] || 0) + 1;
    }
  }

  getTTLForKey(key) {
    // Check for pattern-specific TTL overrides
    for (const [pattern, ttl] of this.ttlOverrides) {
      if (new RegExp(pattern).test(key)) {
        return ttl;
      }
    }
    
    // Personalized content gets shorter TTL
    if (key.includes(':user:') || key.includes('personalized')) {
      return this.personalizationTTL;
    }
    
    return this.defaultTTL;
  }

  // Compression utilities
  async compress(data) {
    if (!this.compressionEnabled) {
      return data;
    }
    
    const serialized = JSON.stringify(data);
    
    if (serialized.length < this.compressionThreshold) {
      return data;
    }
    
    try {
      const compressed = await gzip(serialized);
      const savings = serialized.length - compressed.length;
      
      this.stats.compressionSavings += savings;
      
      return {
        _compressed: true,
        data: compressed,
        originalSize: serialized.length,
        compressedSize: compressed.length
      };
      
    } catch (error) {
      console.warn('Compression failed:', error);
      return data;
    }
  }

  async decompress(data) {
    if (!data || !data._compressed) {
      return data;
    }
    
    try {
      const decompressed = await gunzip(data.data);
      return JSON.parse(decompressed.toString());
    } catch (error) {
      console.error('Decompression failed:', error);
      return null;
    }
  }

  // Utility methods
  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  calculateSize(value) {
    if (value?._compressed) {
      return value.compressedSize;
    }
    
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000; // Default size estimate
    }
  }

  parseSize(sizeStr) {
    const units = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3 };
    const match = sizeStr.match(/^(\d+)\s*([A-Z]{1,2})$/i);
    
    if (!match) return 1024**3; // Default 1GB
    
    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  isValidCacheEntry(entry) {
    if (!entry || !entry.expiresAt) return false;
    return Date.now() < entry.expiresAt;
  }

  recordHit(layer) {
    this.stats.hits++;
    this.stats.layerHits[layer] = (this.stats.layerHits[layer] || 0) + 1;
  }

  updateResponseTime(responseTime) {
    this.stats.avgResponseTime = 
      (this.stats.avgResponseTime * (this.stats.totalRequests - 1) + responseTime) / 
      this.stats.totalRequests;
  }

  onEviction(layer, key, value) {
    this.stats.evictions++;
    
    // If intelligent eviction is enabled, try to preserve important data
    if (this.intelligentEviction && this.isImportantData(key, value)) {
      this.promoteOrPersist(key, value, layer);
    }
  }

  isImportantData(key, value) {
    // Check if data is frequently accessed
    return this.getAccessFrequency(key) > 5;
  }

  async promoteOrPersist(key, value, fromLayer) {
    // Try to promote to a longer-lived layer
    if (fromLayer === 'hot') {
      this.layers.warm.set(this.hashKey(key), value);
    } else if (fromLayer === 'warm' && this.harperdb) {
      // Persist to database cache
      try {
        await this.harperdb.cache.set(this.hashKey(key), value, this.defaultTTL);
      } catch (error) {
        console.warn('Failed to persist evicted data:', error);
      }
    }
  }

  async storeCacheMetadata(hashedKey, originalKey, cacheData, options) {
    if (!this.harperdb) return;
    
    try {
      await this.harperdb.insert('cache_metadata', {
        id: crypto.randomUUID(),
        cache_key: hashedKey,
        original_key: originalKey,
        tenant_id: options.tenant,
        endpoint: options.endpoint,
        ttl: cacheData.ttl,
        size_bytes: this.calculateSize(cacheData),
        compression_used: cacheData._compressed || false,
        access_count: 1,
        personalized: cacheData.metadata?.personalized || false,
        created_at: new Date(cacheData.cachedAt),
        expires_at: new Date(cacheData.expiresAt)
      });
    } catch (error) {
      console.warn('Failed to store cache metadata:', error);
    }
  }

  // Predictive prefetching
  considerPrefetch(key) {
    // Simple pattern-based prefetching
    const patterns = this.prefetchPatterns.get(key) || [];
    
    patterns.forEach(pattern => {
      if (!this.prefetchQueue.includes(pattern)) {
        this.prefetchQueue.push(pattern);
      }
    });
  }

  learnPrefetchPattern(key, options) {
    // Learn access patterns for predictive prefetching
    const segments = key.split(':');
    if (segments.length > 2) {
      const basePattern = segments.slice(0, -1).join(':');
      
      if (!this.prefetchPatterns.has(basePattern)) {
        this.prefetchPatterns.set(basePattern, []);
      }
      
      const patterns = this.prefetchPatterns.get(basePattern);
      if (!patterns.includes(key)) {
        patterns.push(key);
      }
    }
  }

  // Background maintenance
  startMaintenanceTasks() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
    
    // Optimize cache layers every 15 minutes
    this.optimizeInterval = setInterval(() => {
      this.optimizeCacheLayers();
    }, 15 * 60 * 1000);
    
    // Process prefetch queue every minute
    this.prefetchInterval = setInterval(() => {
      this.processPrefetchQueue();
    }, 60 * 1000);
  }

  cleanupExpiredEntries() {
    // Memory layers handle TTL automatically, but clean up metadata
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    // Clean up access frequency data
    for (const [key, data] of this.accessFrequency) {
      if (data.lastAccess < cutoffTime) {
        this.accessFrequency.delete(key);
      }
    }
  }

  optimizeCacheLayers() {
    // Analyze access patterns and adjust layer sizes if needed
    const hotUtilization = this.layers.hot.size / this.layers.hot.max;
    const warmUtilization = this.layers.warm.size / this.layers.warm.max;
    const coldUtilization = this.layers.cold.size / this.layers.cold.max;
    
    console.log(`Cache utilization - Hot: ${(hotUtilization*100).toFixed(1)}%, Warm: ${(warmUtilization*100).toFixed(1)}%, Cold: ${(coldUtilization*100).toFixed(1)}%`);
  }

  processPrefetchQueue() {
    // Process a few prefetch patterns
    const batchSize = 5;
    const batch = this.prefetchQueue.splice(0, batchSize);
    
    batch.forEach(pattern => {
      // In a real implementation, this would trigger actual prefetching
      console.log(`Would prefetch pattern: ${pattern}`);
    });
  }

  // Public API
  getStats() {
    const totalSize = Object.values(this.layers).reduce((sum, cache) => sum + cache.size, 0);
    const totalMaxSize = Object.values(this.layers).reduce((sum, cache) => sum + cache.max, 0);
    
    return {
      ...this.stats,
      utilization: totalMaxSize > 0 ? totalSize / totalMaxSize : 0,
      layerStats: {
        hot: { size: this.layers.hot.size, max: this.layers.hot.max },
        warm: { size: this.layers.warm.size, max: this.layers.warm.max },
        cold: { size: this.layers.cold.size, max: this.layers.cold.max }
      },
      hitRate: this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0,
      prefetchQueueSize: this.prefetchQueue.length,
      accessFrequencySize: this.accessFrequency.size
    };
  }

  async getHealth() {
    try {
      const stats = this.getStats();
      const memoryLayers = Object.values(this.layers);
      const allHealthy = memoryLayers.every(cache => cache !== null);
      
      return {
        status: allHealthy ? 'healthy' : 'degraded',
        hitRate: stats.hitRate,
        utilization: stats.utilization,
        avgResponseTime: stats.avgResponseTime,
        layers: stats.layerStats,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  isReady() {
    return this.layers && this.layers.hot && this.layers.warm && this.layers.cold;
  }

  // Configuration methods
  setTTLOverride(pattern, ttl) {
    this.ttlOverrides.set(pattern, ttl);
  }

  addInvalidationPattern(pattern, callback) {
    this.invalidationPatterns.set(pattern, callback);
  }

  // Cleanup
  shutdown() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.optimizeInterval) clearInterval(this.optimizeInterval);
    if (this.prefetchInterval) clearInterval(this.prefetchInterval);
    
    // Clear all caches
    Object.values(this.layers).forEach(cache => cache.clear());
    this.accessFrequency.clear();
    this.accessHistory.clear();
  }
}