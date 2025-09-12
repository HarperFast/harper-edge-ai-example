/**
 * Metrics Schema Definitions for Harper-fabric
 * Performance monitoring and analytics data structures
 */

export const metricsSchema = {
  name: 'metrics',
  description: 'System performance and usage metrics',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique metric identifier'
    },
    
    type: {
      type: 'string',
      enum: ['request', 'response', 'error', 'upstream', 'enhancement_error'],
      required: true,
      description: 'Type of metric event'
    },
    
    tenant_id: {
      type: 'string',
      required: true,
      description: 'Associated tenant identifier',
      reference: {
        table: 'tenants',
        field: 'id'
      }
    },
    
    endpoint: {
      type: 'string',
      required: true,
      description: 'API endpoint being measured'
    },
    
    method: {
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      description: 'HTTP method'
    },
    
    status_code: {
      type: 'number',
      description: 'HTTP status code',
      validation: {
        min: 100,
        max: 599
      }
    },
    
    response_time: {
      type: 'number',
      description: 'Response time in milliseconds',
      validation: {
        min: 0
      }
    },
    
    cache_hit: {
      type: 'boolean',
      default: false,
      description: 'Whether response was served from cache'
    },
    
    enhanced: {
      type: 'boolean',
      default: false,
      description: 'Whether AI enhancement was applied'
    },
    
    user_id: {
      type: 'string',
      description: 'User identifier (if available)'
    },
    
    request_id: {
      type: 'string',
      description: 'Unique request identifier for tracing'
    },
    
    client_ip: {
      type: 'string',
      description: 'Client IP address'
    },
    
    user_agent: {
      type: 'string',
      description: 'User agent string'
    },
    
    device_type: {
      type: 'string',
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      description: 'Device type classification'
    },
    
    session_id: {
      type: 'string',
      description: 'User session identifier'
    },
    
    response_size: {
      type: 'number',
      description: 'Response size in bytes',
      validation: {
        min: 0
      }
    },
    
    enhancement_type: {
      type: 'string',
      enum: ['product-listing', 'product-recommendations', 'search-results', 'dynamic-pricing', 'content-personalization'],
      description: 'Type of AI enhancement applied'
    },
    
    ai_inference_time: {
      type: 'number',
      description: 'AI inference time in milliseconds',
      validation: {
        min: 0
      }
    },
    
    error_type: {
      type: 'string',
      description: 'Error type for error metrics'
    },
    
    error_message: {
      type: 'string',
      description: 'Error message for debugging'
    },
    
    stack_trace: {
      type: 'string',
      description: 'Stack trace for error debugging (dev only)'
    },
    
    timestamp: {
      type: 'timestamp',
      default: 'now',
      required: true,
      description: 'When the metric was recorded'
    }
  },
  
  indexes: [
    {
      name: 'idx_metrics_tenant_time',
      fields: ['tenant_id', 'timestamp'],
      type: 'btree',
      description: 'Query metrics by tenant and time range'
    },
    {
      name: 'idx_metrics_endpoint_time',
      fields: ['endpoint', 'timestamp'],
      type: 'btree',
      description: 'Query metrics by endpoint and time'
    },
    {
      name: 'idx_metrics_type_time',
      fields: ['type', 'timestamp'],
      type: 'btree',
      description: 'Query metrics by type and time'
    },
    {
      name: 'idx_metrics_user_time',
      fields: ['user_id', 'timestamp'],
      type: 'btree',
      description: 'Query user-specific metrics'
    },
    {
      name: 'idx_metrics_request_id',
      fields: ['request_id'],
      type: 'hash',
      description: 'Fast lookup by request ID for tracing'
    },
    {
      name: 'idx_metrics_status_code',
      fields: ['status_code', 'timestamp'],
      type: 'btree',
      description: 'Query by HTTP status codes'
    },
    {
      name: 'idx_metrics_enhancement',
      fields: ['enhanced', 'enhancement_type', 'timestamp'],
      type: 'btree',
      description: 'Query enhanced responses'
    }
  ],
  
  partitioning: {
    type: 'range',
    field: 'timestamp',
    intervals: 'daily',
    retention: '30 days',
    description: 'Partition by day for efficient time-series queries'
  },
  
  constraints: [
    {
      name: 'valid_response_time',
      type: 'check',
      expression: 'response_time >= 0'
    },
    {
      name: 'valid_status_code',
      type: 'check',
      expression: 'status_code BETWEEN 100 AND 599'
    }
  ],
  
  permissions: {
    read: ['admin', 'operator', 'analytics', 'monitoring'],
    write: ['system', 'admin'],
    delete: ['admin']
  }
};

export const aiModelMetricsSchema = {
  name: 'ai_model_metrics',
  description: 'AI model performance and inference metrics',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique AI metric identifier'
    },
    
    model_name: {
      type: 'string',
      required: true,
      enum: [
        'collaborative-filtering',
        'content-based',
        'hybrid-recommender',
        'user-segmentation',
        'price-elasticity',
        'click-prediction',
        'session-intent'
      ],
      description: 'Name of the AI model'
    },
    
    tenant_id: {
      type: 'string',
      required: true,
      description: 'Associated tenant identifier',
      reference: {
        table: 'tenants',
        field: 'id'
      }
    },
    
    inference_time: {
      type: 'number',
      required: true,
      description: 'Inference time in milliseconds',
      validation: {
        min: 0,
        max: 30000 // 30 second max
      }
    },
    
    accuracy_score: {
      type: 'number',
      description: 'Model accuracy score (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    prediction_confidence: {
      type: 'number',
      description: 'Confidence in prediction (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    enhancement_type: {
      type: 'string',
      enum: ['product-listing', 'product-recommendations', 'search-results', 'dynamic-pricing', 'content-personalization', 'user-segmentation'],
      description: 'Type of enhancement performed'
    },
    
    input_features: {
      type: 'json',
      description: 'Input features used for inference',
      schema: {
        type: 'object',
        properties: {
          feature_count: { type: 'number' },
          feature_types: { type: 'array', items: { type: 'string' } },
          input_shape: { type: 'array', items: { type: 'number' } }
        }
      }
    },
    
    output_results: {
      type: 'json',
      description: 'Model output results summary',
      schema: {
        type: 'object',
        properties: {
          output_shape: { type: 'array', items: { type: 'number' } },
          top_predictions: { type: 'array', items: { type: 'number' } },
          result_count: { type: 'number' }
        }
      }
    },
    
    user_feedback: {
      type: 'json',
      description: 'User feedback on recommendations/predictions',
      schema: {
        type: 'object',
        properties: {
          rating: { type: 'number', minimum: 1, maximum: 5 },
          clicked: { type: 'boolean' },
          purchased: { type: 'boolean' },
          time_to_action: { type: 'number' },
          feedback_type: { 
            type: 'string', 
            enum: ['implicit', 'explicit', 'conversion', 'abandonment'] 
          }
        }
      }
    },
    
    success: {
      type: 'boolean',
      default: true,
      description: 'Whether inference completed successfully'
    },
    
    error_message: {
      type: 'string',
      description: 'Error message if inference failed'
    },
    
    model_version: {
      type: 'string',
      description: 'Version of the model used'
    },
    
    batch_size: {
      type: 'number',
      default: 1,
      description: 'Inference batch size'
    },
    
    memory_usage: {
      type: 'number',
      description: 'Memory usage in MB during inference'
    },
    
    timestamp: {
      type: 'timestamp',
      default: 'now',
      required: true,
      description: 'When the inference was performed'
    }
  },
  
  indexes: [
    {
      name: 'idx_ai_model_time',
      fields: ['model_name', 'timestamp'],
      type: 'btree',
      description: 'Query AI metrics by model and time'
    },
    {
      name: 'idx_ai_tenant_model',
      fields: ['tenant_id', 'model_name', 'timestamp'],
      type: 'btree',
      description: 'Query AI metrics by tenant and model'
    },
    {
      name: 'idx_ai_success',
      fields: ['success', 'timestamp'],
      type: 'btree',
      description: 'Query successful vs failed inferences'
    },
    {
      name: 'idx_ai_inference_time',
      fields: ['inference_time', 'timestamp'],
      type: 'btree',
      description: 'Query by inference performance'
    },
    {
      name: 'idx_ai_enhancement_type',
      fields: ['enhancement_type', 'timestamp'],
      type: 'btree',
      description: 'Query by enhancement type'
    }
  ],
  
  partitioning: {
    type: 'range',
    field: 'timestamp',
    intervals: 'daily',
    retention: '90 days',
    description: 'Partition by day, keep for 90 days for ML analysis'
  },
  
  permissions: {
    read: ['admin', 'operator', 'ai-team', 'analytics'],
    write: ['system', 'admin', 'ai-team'],
    delete: ['admin']
  }
};

export const cacheMetadataSchema = {
  name: 'cache_metadata',
  description: 'Cache performance and metadata tracking',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique cache entry identifier'
    },
    
    cache_key: {
      type: 'string',
      required: true,
      unique: true,
      description: 'Cache key for the entry',
      validation: {
        maxLength: 500
      }
    },
    
    tenant_id: {
      type: 'string',
      required: true,
      description: 'Associated tenant identifier',
      reference: {
        table: 'tenants',
        field: 'id'
      }
    },
    
    endpoint: {
      type: 'string',
      required: true,
      description: 'API endpoint cached'
    },
    
    ttl: {
      type: 'number',
      required: true,
      description: 'Time to live in seconds',
      validation: {
        min: 1
      }
    },
    
    size_bytes: {
      type: 'number',
      required: true,
      description: 'Size of cached data in bytes',
      validation: {
        min: 0
      }
    },
    
    compression_used: {
      type: 'boolean',
      default: false,
      description: 'Whether compression was applied'
    },
    
    compression_ratio: {
      type: 'number',
      description: 'Compression ratio if compression used',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    access_count: {
      type: 'number',
      default: 0,
      description: 'Number of times cache entry was accessed'
    },
    
    hit_rate: {
      type: 'number',
      description: 'Cache hit rate for this key',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    personalized: {
      type: 'boolean',
      default: false,
      description: 'Whether cached data is personalized'
    },
    
    cache_layer: {
      type: 'string',
      enum: ['hot', 'warm', 'cold'],
      description: 'Which cache layer the data is stored in'
    },
    
    invalidation_reason: {
      type: 'string',
      enum: ['expired', 'manual', 'pattern', 'memory_pressure', 'update'],
      description: 'Reason for cache invalidation'
    },
    
    last_accessed: {
      type: 'timestamp',
      default: 'now',
      description: 'When cache entry was last accessed'
    },
    
    created_at: {
      type: 'timestamp',
      default: 'now',
      description: 'When cache entry was created'
    },
    
    expires_at: {
      type: 'timestamp',
      required: true,
      description: 'When cache entry expires'
    },
    
    invalidated_at: {
      type: 'timestamp',
      description: 'When cache entry was invalidated'
    }
  },
  
  indexes: [
    {
      name: 'idx_cache_key',
      fields: ['cache_key'],
      unique: true,
      description: 'Fast lookup by cache key'
    },
    {
      name: 'idx_cache_tenant_endpoint',
      fields: ['tenant_id', 'endpoint'],
      type: 'btree',
      description: 'Query cache by tenant and endpoint'
    },
    {
      name: 'idx_cache_expires',
      fields: ['expires_at'],
      type: 'btree',
      description: 'Query expiring cache entries'
    },
    {
      name: 'idx_cache_size',
      fields: ['size_bytes', 'created_at'],
      type: 'btree',
      description: 'Query by cache entry size'
    },
    {
      name: 'idx_cache_access',
      fields: ['access_count', 'last_accessed'],
      type: 'btree',
      description: 'Query by access frequency'
    }
  ],
  
  constraints: [
    {
      name: 'valid_ttl',
      type: 'check',
      expression: 'ttl > 0'
    },
    {
      name: 'valid_expires_at',
      type: 'check',
      expression: 'expires_at > created_at'
    }
  ],
  
  permissions: {
    read: ['admin', 'operator', 'monitoring'],
    write: ['system', 'admin'],
    delete: ['system', 'admin']
  }
};

/**
 * Analytics aggregation views
 */
export const analyticsViews = {
  hourlyMetrics: {
    name: 'hourly_metrics',
    query: `
      SELECT 
        tenant_id,
        endpoint,
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) as request_count,
        AVG(response_time) as avg_response_time,
        COUNT(CASE WHEN cache_hit = true THEN 1 END) as cache_hits,
        COUNT(CASE WHEN enhanced = true THEN 1 END) as enhanced_count,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM metrics 
      WHERE type = 'response'
      GROUP BY tenant_id, endpoint, DATE_TRUNC('hour', timestamp)
    `,
    refreshInterval: '5 minutes',
    description: 'Hourly aggregated metrics for performance monitoring'
  },
  
  aiPerformanceSummary: {
    name: 'ai_performance_summary',
    query: `
      SELECT 
        model_name,
        tenant_id,
        enhancement_type,
        DATE_TRUNC('day', timestamp) as day,
        COUNT(*) as inference_count,
        AVG(inference_time) as avg_inference_time,
        AVG(accuracy_score) as avg_accuracy,
        COUNT(CASE WHEN success = true THEN 1 END) as success_count,
        AVG(prediction_confidence) as avg_confidence
      FROM ai_model_metrics 
      GROUP BY model_name, tenant_id, enhancement_type, DATE_TRUNC('day', timestamp)
    `,
    refreshInterval: '1 hour',
    description: 'Daily AI model performance summary'
  },
  
  cacheEfficiency: {
    name: 'cache_efficiency',
    query: `
      SELECT 
        tenant_id,
        endpoint,
        cache_layer,
        COUNT(*) as entry_count,
        AVG(access_count) as avg_access_count,
        AVG(size_bytes) as avg_size_bytes,
        AVG(hit_rate) as avg_hit_rate,
        SUM(size_bytes) as total_size_bytes
      FROM cache_metadata 
      WHERE expires_at > NOW()
      GROUP BY tenant_id, endpoint, cache_layer
    `,
    refreshInterval: '15 minutes',
    description: 'Cache efficiency and usage statistics'
  }
};