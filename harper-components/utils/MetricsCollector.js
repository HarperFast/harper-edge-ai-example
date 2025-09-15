/**
 * MetricsCollector - Performance and usage metrics collection for Harper-fabric
 */

import { v4 as uuidv4 } from 'uuid';

export class MetricsCollector {
  constructor(harperResource) {
    this.harperdb = harperResource?.harperdb;
    this.flushInterval = 10000; // 10 seconds
    this.retentionPeriod = 86400000; // 24 hours
    this.batchSize = 100;
    
    // In-memory buffer for metrics
    this.metricsBuffer = [];
    this.aiMetricsBuffer = [];
    
    // Real-time stats
    this.realtimeStats = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      enhancements: 0,
      avgResponseTime: 0,
      activeConnections: 0
    };

    // Start background processes
    this.startFlushTimer();
    this.startCleanupTimer();
  }

  /**
   * Record incoming request metrics
   */
  recordRequest(request) {
    this.realtimeStats.requests++;
    this.realtimeStats.activeConnections++;

    const metric = {
      id: uuidv4(),
      type: 'request',
      tenant_id: request.tenantId,
      endpoint: this.extractEndpoint(request.path || request.url),
      method: request.method,
      user_id: request.userContext?.userId || 'anonymous',
      request_id: request.requestId,
      timestamp: Date.now(),
      client_ip: request.clientIp,
      user_agent: request.headers?.['user-agent'],
      device_type: request.userContext?.deviceType,
      session_id: request.userContext?.sessionId
    };

    this.metricsBuffer.push(metric);
  }

  /**
   * Record response metrics
   */
  async recordResponse(request, response) {
    this.realtimeStats.responses++;
    this.realtimeStats.activeConnections = Math.max(0, this.realtimeStats.activeConnections - 1);

    if (response.status >= 400) {
      this.realtimeStats.errors++;
    }

    if (response.cacheHit) {
      this.realtimeStats.cacheHits++;
    }

    if (response.enhanced) {
      this.realtimeStats.enhancements++;
    }

    // Update average response time
    if (response.responseTime) {
      this.realtimeStats.avgResponseTime = 
        (this.realtimeStats.avgResponseTime * (this.realtimeStats.responses - 1) + 
         response.responseTime) / this.realtimeStats.responses;
    }

    const metric = {
      id: uuidv4(),
      type: 'response',
      tenant_id: request.tenantId,
      endpoint: this.extractEndpoint(request.path || request.url),
      method: request.method,
      status_code: response.status,
      response_time: response.responseTime,
      cache_hit: response.cacheHit || false,
      enhanced: response.enhanced || false,
      user_id: request.userContext?.userId || 'anonymous',
      request_id: request.requestId,
      timestamp: Date.now(),
      response_size: this.calculateResponseSize(response.data),
      enhancement_type: response.enhancementType,
      ai_inference_time: response.aiInferenceTime
    };

    this.metricsBuffer.push(metric);

    // Flush if buffer is getting large
    if (this.metricsBuffer.length >= this.batchSize) {
      await this.flushMetrics();
    }
  }

  /**
   * Record error metrics
   */
  async recordError(request, error) {
    this.realtimeStats.errors++;
    this.realtimeStats.activeConnections = Math.max(0, this.realtimeStats.activeConnections - 1);

    const metric = {
      id: uuidv4(),
      type: 'error',
      tenant_id: request.tenantId,
      endpoint: this.extractEndpoint(request.path || request.url),
      method: request.method,
      error_type: error.name || 'UnknownError',
      error_message: error.message,
      status_code: error.statusCode || 500,
      user_id: request.userContext?.userId || 'anonymous',
      request_id: request.requestId,
      timestamp: Date.now(),
      stack_trace: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };

    this.metricsBuffer.push(metric);
  }

  /**
   * Record AI model performance metrics
   */
  recordAIMetrics(modelName, inferenceTime, success, enhancementType, tenantId) {
    const metric = {
      id: uuidv4(),
      model_name: modelName,
      tenant_id: tenantId,
      inference_time: inferenceTime,
      success,
      enhancement_type: enhancementType,
      timestamp: Date.now()
    };

    this.aiMetricsBuffer.push(metric);
  }

  /**
   * Record upstream API metrics
   */
  recordUpstream(tenantId, endpoint, statusCode, responseTime) {
    const metric = {
      id: uuidv4(),
      type: 'upstream',
      tenant_id: tenantId,
      endpoint,
      status_code: statusCode,
      response_time: responseTime,
      timestamp: Date.now()
    };

    this.metricsBuffer.push(metric);
  }

  /**
   * Record enhancement error metrics
   */
  recordEnhancementError(tenantId, enhancementType, error) {
    const metric = {
      id: uuidv4(),
      type: 'enhancement_error',
      tenant_id: tenantId,
      enhancement_type: enhancementType,
      error_message: error?.message || 'Unknown enhancement error',
      timestamp: Date.now()
    };

    this.metricsBuffer.push(metric);
  }

  /**
   * Get real-time metrics
   */
  getRealtimeMetrics() {
    return {
      ...this.realtimeStats,
      timestamp: Date.now(),
      bufferSize: this.metricsBuffer.length + this.aiMetricsBuffer.length
    };
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getMetrics(tenantId, period = '1h') {
    if (!this.harperdb) {
      return { error: 'Database not available' };
    }

    try {
      const periodMs = this.parsePeriod(period);
      const startTime = Date.now() - periodMs;

      // Build search conditions
      let conditions = [
        { search_attribute: 'timestamp', search_type: 'greater_than', search_value: startTime }
      ];

      if (tenantId) {
        conditions.push({ search_attribute: 'tenant_id', search_value: tenantId });
      }

      // Get metrics using Harper-native search
      const metrics = await this.harperdb.searchByConditions('metrics', conditions);
      
      // Sort by timestamp descending
      metrics.sort((a, b) => b.timestamp - a.timestamp);
      
      return {
        metrics,
        aggregated: this.aggregateMetrics(metrics),
        period,
        startTime,
        endTime: Date.now()
      };

    } catch (error) {
      console.error('Failed to get metrics:', error);
      return { error: 'Failed to retrieve metrics' };
    }
  }

  /**
   * Get AI model performance metrics
   */
  async getAIMetrics(modelName, tenantId, period = '1h') {
    if (!this.harperdb) {
      return { error: 'Database not available' };
    }

    try {
      const periodMs = this.parsePeriod(period);
      const startTime = Date.now() - periodMs;

      // Build search conditions
      let conditions = [
        { search_attribute: 'timestamp', search_type: 'greater_than', search_value: startTime }
      ];

      if (modelName) {
        conditions.push({ search_attribute: 'model_name', search_value: modelName });
      }

      if (tenantId) {
        conditions.push({ search_attribute: 'tenant_id', search_value: tenantId });
      }

      // Get AI model metrics using Harper-native search
      const metrics = await this.harperdb.searchByConditions('ai_model_metrics', conditions);
      
      // Sort by timestamp descending
      metrics.sort((a, b) => b.timestamp - a.timestamp);
      
      return {
        metrics,
        aggregated: this.aggregateAIMetrics(metrics),
        period,
        modelName,
        tenantId
      };

    } catch (error) {
      console.error('Failed to get AI metrics:', error);
      return { error: 'Failed to retrieve AI metrics' };
    }
  }

  /**
   * Flush metrics to database
   */
  async flushMetrics() {
    if (!this.harperdb || (this.metricsBuffer.length === 0 && this.aiMetricsBuffer.length === 0)) {
      return;
    }

    try {
      // Flush general metrics
      if (this.metricsBuffer.length > 0) {
        await this.harperdb.insert('metrics', [...this.metricsBuffer]);
        console.log(`Flushed ${this.metricsBuffer.length} metrics to database`);
        this.metricsBuffer = [];
      }

      // Flush AI metrics
      if (this.aiMetricsBuffer.length > 0) {
        await this.harperdb.insert('ai_model_metrics', [...this.aiMetricsBuffer]);
        console.log(`Flushed ${this.aiMetricsBuffer.length} AI metrics to database`);
        this.aiMetricsBuffer = [];
      }

    } catch (error) {
      console.error('Failed to flush metrics:', error);
      // Keep metrics in buffer for retry
    }
  }

  /**
   * Clean up old metrics
   */
  async cleanupOldMetrics() {
    if (!this.harperdb) {
      return;
    }

    try {
      const cutoffTime = Date.now() - this.retentionPeriod;

      // Clean up general metrics
      const deletedMetrics = await this.harperdb.delete('metrics', {
        timestamp: { $lt: cutoffTime }
      });

      // Clean up AI metrics
      const deletedAIMetrics = await this.harperdb.delete('ai_model_metrics', {
        timestamp: { $lt: cutoffTime }
      });

      if (deletedMetrics.deleted_hashes.length > 0 || deletedAIMetrics.deleted_hashes.length > 0) {
        console.log(`Cleaned up ${deletedMetrics.deleted_hashes.length} general metrics and ${deletedAIMetrics.deleted_hashes.length} AI metrics`);
      }

    } catch (error) {
      console.error('Failed to clean up old metrics:', error);
    }
  }

  /**
   * Start background flush timer
   */
  startFlushTimer() {
    this.flushTimer = setInterval(async () => {
      await this.flushMetrics();
    }, this.flushInterval);
  }

  /**
   * Start background cleanup timer
   */
  startCleanupTimer() {
    // Run cleanup every hour
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupOldMetrics();
    }, 3600000);
  }

  /**
   * Stop background timers
   */
  shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Final flush
    return this.flushMetrics();
  }

  // Helper methods

  extractEndpoint(path) {
    if (!path) return 'unknown';
    
    // Remove query parameters and extract the main path
    const cleanPath = path.split('?')[0];
    const segments = cleanPath.split('/').filter(Boolean);
    
    if (segments[0] === 'api' && segments.length > 2) {
      // For /api/tenant/endpoint format
      return segments.slice(2).join('/');
    }
    
    return segments.join('/') || 'root';
  }

  calculateResponseSize(data) {
    if (!data) return 0;
    
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
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

  aggregateMetrics(metrics) {
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        totalResponses: 0,
        totalErrors: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        enhancementRate: 0,
        errorRate: 0
      };
    }

    const responses = metrics.filter(m => m.type === 'response');
    const errors = metrics.filter(m => m.type === 'error');
    const requests = metrics.filter(m => m.type === 'request');
    
    const cacheHits = responses.filter(m => m.cache_hit).length;
    const enhanced = responses.filter(m => m.enhanced).length;
    const responseTimes = responses.map(m => m.response_time).filter(Boolean);

    return {
      totalRequests: requests.length,
      totalResponses: responses.length,
      totalErrors: errors.length,
      avgResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      cacheHitRate: responses.length > 0 ? cacheHits / responses.length : 0,
      enhancementRate: responses.length > 0 ? enhanced / responses.length : 0,
      errorRate: (requests.length + responses.length) > 0 ? 
        errors.length / (requests.length + responses.length) : 0,
      statusCodeDistribution: this.getStatusCodeDistribution(responses),
      topEndpoints: this.getTopEndpoints(metrics),
      topTenants: this.getTopTenants(metrics)
    };
  }

  aggregateAIMetrics(metrics) {
    if (metrics.length === 0) {
      return {
        totalInferences: 0,
        avgInferenceTime: 0,
        successRate: 0,
        modelPerformance: {}
      };
    }

    const successful = metrics.filter(m => m.success).length;
    const inferenceTimes = metrics.map(m => m.inference_time).filter(Boolean);
    
    // Group by model
    const modelPerformance = {};
    metrics.forEach(metric => {
      if (!modelPerformance[metric.model_name]) {
        modelPerformance[metric.model_name] = {
          totalInferences: 0,
          avgInferenceTime: 0,
          successRate: 0,
          successful: 0
        };
      }
      
      const perf = modelPerformance[metric.model_name];
      perf.totalInferences++;
      if (metric.success) perf.successful++;
      
      if (metric.inference_time) {
        perf.avgInferenceTime = 
          (perf.avgInferenceTime * (perf.totalInferences - 1) + metric.inference_time) / 
          perf.totalInferences;
      }
      
      perf.successRate = perf.successful / perf.totalInferences;
    });

    return {
      totalInferences: metrics.length,
      avgInferenceTime: inferenceTimes.length > 0 ?
        inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length : 0,
      successRate: successful / metrics.length,
      modelPerformance
    };
  }

  getStatusCodeDistribution(responses) {
    const distribution = {};
    responses.forEach(response => {
      const code = response.status_code;
      distribution[code] = (distribution[code] || 0) + 1;
    });
    return distribution;
  }

  getTopEndpoints(metrics, limit = 10) {
    const endpointCounts = {};
    metrics.forEach(metric => {
      const endpoint = metric.endpoint;
      endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
    });

    return Object.entries(endpointCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([endpoint, count]) => ({ endpoint, count }));
  }

  getTopTenants(metrics, limit = 10) {
    const tenantCounts = {};
    metrics.forEach(metric => {
      const tenant = metric.tenant_id;
      if (tenant) {
        tenantCounts[tenant] = (tenantCounts[tenant] || 0) + 1;
      }
    });

    return Object.entries(tenantCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([tenant, count]) => ({ tenant, count }));
  }
}