/**
 * MetricsCollector - Performance metrics and monitoring
 */

class MetricsCollector {
  constructor(options) {
    this.flushInterval = options.flushInterval || 10000; // 10 seconds
    this.retentionPeriod = options.retentionPeriod || 86400000; // 24 hours
    
    // Metrics storage
    this.metrics = {
      requests: [],
      responses: [],
      upstreamCalls: [],
      cacheOperations: [],
      aiInferences: [],
      errors: []
    };
    
    // Aggregated metrics
    this.aggregated = {
      requestsPerSecond: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      enhancementRate: 0,
      errorRate: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0
    };
    
    // Real-time metrics
    this.realtime = {
      activeRequests: 0,
      requestsLastMinute: 0,
      errorsLastMinute: 0,
      cacheHitsLastMinute: 0,
      enhancementsLastMinute: 0
    };
    
    // Tenant-specific metrics
    this.tenantMetrics = new Map();
    
    // Start aggregation timer
    this.startAggregation();
  }
  
  recordRequest(req) {
    const metric = {
      timestamp: Date.now(),
      tenantId: req.tenantId,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      userId: req.userContext?.userId,
      requestId: req.requestId
    };
    
    this.metrics.requests.push(metric);
    this.realtime.activeRequests++;
    
    // Update tenant metrics
    this.updateTenantMetric(req.tenantId, 'requests', 1);
    
    // Clean old data
    this.cleanOldMetrics();
  }
  
  recordResponse(req, res, proxyResponse) {
    const responseTime = Date.now() - req.startTime;
    
    const metric = {
      timestamp: Date.now(),
      tenantId: req.tenantId,
      requestId: req.requestId,
      statusCode: res.statusCode,
      responseTime,
      cacheHit: proxyResponse.cacheHit,
      enhanced: proxyResponse.enhanced,
      responseSize: JSON.stringify(proxyResponse.data).length
    };
    
    this.metrics.responses.push(metric);
    this.realtime.activeRequests--;
    
    // Update tenant metrics
    this.updateTenantMetric(req.tenantId, 'responses', 1);
    this.updateTenantMetric(req.tenantId, 'totalResponseTime', responseTime);
    
    if (proxyResponse.cacheHit) {
      this.updateTenantMetric(req.tenantId, 'cacheHits', 1);
    }
    
    if (proxyResponse.enhanced) {
      this.updateTenantMetric(req.tenantId, 'enhancements', 1);
    }
  }
  
  recordUpstream(tenantId, path, statusCode, responseTime) {
    const metric = {
      timestamp: Date.now(),
      tenantId,
      path,
      statusCode,
      responseTime
    };
    
    this.metrics.upstreamCalls.push(metric);
    this.updateTenantMetric(tenantId, 'upstreamCalls', 1);
    this.updateTenantMetric(tenantId, 'upstreamResponseTime', responseTime);
  }
  
  recordCacheOperation(operation, key, hit) {
    const metric = {
      timestamp: Date.now(),
      operation,
      key,
      hit
    };
    
    this.metrics.cacheOperations.push(metric);
    
    if (hit) {
      this.realtime.cacheHitsLastMinute++;
    }
  }
  
  recordAIInference(model, latency, success) {
    const metric = {
      timestamp: Date.now(),
      model,
      latency,
      success
    };
    
    this.metrics.aiInferences.push(metric);
    
    if (success) {
      this.realtime.enhancementsLastMinute++;
    }
  }
  
  recordError(error, context) {
    const metric = {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      context,
      tenantId: context.tenantId
    };
    
    this.metrics.errors.push(metric);
    this.realtime.errorsLastMinute++;
    
    if (context.tenantId) {
      this.updateTenantMetric(context.tenantId, 'errors', 1);
    }
  }
  
  recordEnhancementError(tenantId, enhancementType) {
    this.recordError(
      new Error(`Enhancement failed: ${enhancementType}`),
      { tenantId, enhancementType }
    );
  }
  
  updateTenantMetric(tenantId, metric, value) {
    if (!this.tenantMetrics.has(tenantId)) {
      this.tenantMetrics.set(tenantId, {
        requests: 0,
        responses: 0,
        errors: 0,
        cacheHits: 0,
        enhancements: 0,
        upstreamCalls: 0,
        totalResponseTime: 0,
        upstreamResponseTime: 0
      });
    }
    
    const tenantMetric = this.tenantMetrics.get(tenantId);
    tenantMetric[metric] = (tenantMetric[metric] || 0) + value;
  }
  
  startAggregation() {
    setInterval(() => {
      this.aggregate();
    }, this.flushInterval);
    
    // Update real-time metrics every second
    setInterval(() => {
      this.updateRealtimeMetrics();
    }, 1000);
  }
  
  aggregate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate requests per second
    const recentRequests = this.metrics.requests.filter(
      m => m.timestamp > oneMinuteAgo
    );
    this.aggregated.requestsPerSecond = recentRequests.length / 60;
    
    // Calculate average response time
    const recentResponses = this.metrics.responses.filter(
      m => m.timestamp > oneMinuteAgo
    );
    
    if (recentResponses.length > 0) {
      const totalResponseTime = recentResponses.reduce(
        (sum, m) => sum + m.responseTime, 0
      );
      this.aggregated.averageResponseTime = totalResponseTime / recentResponses.length;
      
      // Calculate percentiles
      const responseTimes = recentResponses
        .map(m => m.responseTime)
        .sort((a, b) => a - b);
      
      this.aggregated.p50ResponseTime = this.percentile(responseTimes, 50);
      this.aggregated.p95ResponseTime = this.percentile(responseTimes, 95);
      this.aggregated.p99ResponseTime = this.percentile(responseTimes, 99);
      
      // Calculate cache hit rate
      const cacheHits = recentResponses.filter(m => m.cacheHit).length;
      this.aggregated.cacheHitRate = cacheHits / recentResponses.length;
      
      // Calculate enhancement rate
      const enhanced = recentResponses.filter(m => m.enhanced).length;
      this.aggregated.enhancementRate = enhanced / recentResponses.length;
    }
    
    // Calculate error rate
    const recentErrors = this.metrics.errors.filter(
      m => m.timestamp > oneMinuteAgo
    );
    this.aggregated.errorRate = recentRequests.length > 0 
      ? recentErrors.length / recentRequests.length 
      : 0;
  }
  
  updateRealtimeMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Update requests last minute
    this.realtime.requestsLastMinute = this.metrics.requests.filter(
      m => m.timestamp > oneMinuteAgo
    ).length;
    
    // Update errors last minute
    this.realtime.errorsLastMinute = this.metrics.errors.filter(
      m => m.timestamp > oneMinuteAgo
    ).length;
    
    // Update cache hits last minute
    const recentCacheOps = this.metrics.cacheOperations.filter(
      m => m.timestamp > oneMinuteAgo
    );
    this.realtime.cacheHitsLastMinute = recentCacheOps.filter(m => m.hit).length;
    
    // Update enhancements last minute
    const recentInferences = this.metrics.aiInferences.filter(
      m => m.timestamp > oneMinuteAgo
    );
    this.realtime.enhancementsLastMinute = recentInferences.filter(m => m.success).length;
  }
  
  percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }
  
  cleanOldMetrics() {
    const cutoff = Date.now() - this.retentionPeriod;
    
    // Clean each metric type
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = this.metrics[key].filter(
        m => m.timestamp > cutoff
      );
    });
    
    // Clean tenant metrics older than 1 hour
    const tenantCutoff = Date.now() - 3600000;
    this.tenantMetrics.forEach((metrics, tenantId) => {
      // Reset counters periodically
      if (metrics.lastReset && metrics.lastReset < tenantCutoff) {
        this.tenantMetrics.set(tenantId, {
          requests: 0,
          responses: 0,
          errors: 0,
          cacheHits: 0,
          enhancements: 0,
          upstreamCalls: 0,
          totalResponseTime: 0,
          upstreamResponseTime: 0,
          lastReset: Date.now()
        });
      }
    });
  }
  
  getMetrics(tenantId, period = '1h') {
    const now = Date.now();
    let cutoff;
    
    switch (period) {
      case '1m':
        cutoff = now - 60000;
        break;
      case '5m':
        cutoff = now - 300000;
        break;
      case '1h':
        cutoff = now - 3600000;
        break;
      case '24h':
        cutoff = now - 86400000;
        break;
      default:
        cutoff = now - 3600000;
    }
    
    // Filter metrics by period and tenant
    const filterByPeriod = (metrics) => {
      let filtered = metrics.filter(m => m.timestamp > cutoff);
      if (tenantId) {
        filtered = filtered.filter(m => m.tenantId === tenantId);
      }
      return filtered;
    };
    
    const requests = filterByPeriod(this.metrics.requests);
    const responses = filterByPeriod(this.metrics.responses);
    const errors = filterByPeriod(this.metrics.errors);
    const upstreamCalls = filterByPeriod(this.metrics.upstreamCalls);
    
    // Calculate statistics
    const stats = {
      period,
      tenantId: tenantId || 'all',
      requests: {
        total: requests.length,
        perSecond: requests.length / ((now - cutoff) / 1000)
      },
      responses: {
        total: responses.length,
        averageTime: responses.length > 0
          ? responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length
          : 0,
        cacheHitRate: responses.length > 0
          ? responses.filter(r => r.cacheHit).length / responses.length
          : 0,
        enhancementRate: responses.length > 0
          ? responses.filter(r => r.enhanced).length / responses.length
          : 0
      },
      errors: {
        total: errors.length,
        rate: requests.length > 0 ? errors.length / requests.length : 0,
        byType: this.groupErrors(errors)
      },
      upstream: {
        total: upstreamCalls.length,
        averageTime: upstreamCalls.length > 0
          ? upstreamCalls.reduce((sum, u) => sum + u.responseTime, 0) / upstreamCalls.length
          : 0
      },
      statusCodes: this.groupStatusCodes(responses),
      topPaths: this.getTopPaths(requests),
      userActivity: this.getUserActivity(requests)
    };
    
    // Add tenant-specific metrics if available
    if (tenantId && this.tenantMetrics.has(tenantId)) {
      stats.tenantTotals = this.tenantMetrics.get(tenantId);
    }
    
    return stats;
  }
  
  getRealtimeMetrics() {
    return {
      ...this.realtime,
      ...this.aggregated,
      timestamp: Date.now()
    };
  }
  
  groupErrors(errors) {
    const grouped = {};
    
    errors.forEach(error => {
      const type = error.context?.enhancementType || 'general';
      grouped[type] = (grouped[type] || 0) + 1;
    });
    
    return grouped;
  }
  
  groupStatusCodes(responses) {
    const grouped = {};
    
    responses.forEach(response => {
      const code = response.statusCode;
      grouped[code] = (grouped[code] || 0) + 1;
    });
    
    return grouped;
  }
  
  getTopPaths(requests) {
    const pathCounts = {};
    
    requests.forEach(request => {
      const path = request.path || '/';
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    });
    
    // Sort and return top 10
    return Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));
  }
  
  getUserActivity(requests) {
    const userCounts = {};
    
    requests.forEach(request => {
      const userId = request.userId || 'anonymous';
      userCounts[userId] = (userCounts[userId] || 0) + 1;
    });
    
    return {
      uniqueUsers: Object.keys(userCounts).length,
      anonymousRequests: userCounts.anonymous || 0,
      authenticatedRequests: requests.length - (userCounts.anonymous || 0)
    };
  }
  
  async flush() {
    // Aggregate final metrics
    this.aggregate();
    
    // Could write to external storage here
    console.log('Metrics flushed:', {
      requests: this.metrics.requests.length,
      responses: this.metrics.responses.length,
      errors: this.metrics.errors.length
    });
    
    return true;
  }
  
  reset() {
    // Reset all metrics
    this.metrics = {
      requests: [],
      responses: [],
      upstreamCalls: [],
      cacheOperations: [],
      aiInferences: [],
      errors: []
    };
    
    this.tenantMetrics.clear();
    
    this.realtime = {
      activeRequests: 0,
      requestsLastMinute: 0,
      errorsLastMinute: 0,
      cacheHitsLastMinute: 0,
      enhancementsLastMinute: 0
    };
  }
}

module.exports = MetricsCollector;