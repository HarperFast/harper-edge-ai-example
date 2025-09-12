/**
 * Environment Configuration for Harper-fabric Edge AI Proxy
 * Environment-specific settings and variable management
 */

import { readFileSync } from 'fs';
import path from 'path';

export class EnvironmentConfig {
  constructor(environment = process.env.NODE_ENV || 'development') {
    this.environment = environment;
    this.config = this.loadConfiguration();
  }

  loadConfiguration() {
    const baseConfig = this.getBaseConfig();
    const envConfig = this.getEnvironmentConfig(this.environment);
    
    return this.mergeConfigs(baseConfig, envConfig);
  }

  getBaseConfig() {
    return {
      // Application Settings
      app: {
        name: process.env.APP_NAME || 'edge-ai-proxy',
        version: this.getPackageVersion(),
        port: this.getIntEnv('PORT', 3000),
        host: process.env.HOST || '0.0.0.0',
        baseUrl: process.env.BASE_URL || `http://localhost:${this.getIntEnv('PORT', 3000)}`,
        timezone: process.env.TZ || 'UTC'
      },

      // Harper-fabric Database Configuration
      database: {
        host: process.env.HARPERDB_HOST || 'localhost',
        port: this.getIntEnv('HARPERDB_PORT', 9925),
        username: process.env.HARPERDB_USERNAME || 'HDB_ADMIN',
        password: process.env.HARPERDB_PASSWORD,
        schema: process.env.HARPERDB_SCHEMA || 'edge_ai_proxy',
        
        // Connection settings
        connectionTimeout: this.getIntEnv('DB_CONNECTION_TIMEOUT', 30000),
        queryTimeout: this.getIntEnv('DB_QUERY_TIMEOUT', 60000),
        maxRetries: this.getIntEnv('DB_MAX_RETRIES', 3),
        retryDelay: this.getIntEnv('DB_RETRY_DELAY', 1000),
        
        // SSL settings
        ssl: {
          enabled: this.getBoolEnv('HARPERDB_SSL_ENABLED', false),
          rejectUnauthorized: this.getBoolEnv('HARPERDB_SSL_REJECT_UNAUTHORIZED', true),
          cert: process.env.HARPERDB_SSL_CERT,
          key: process.env.HARPERDB_SSL_KEY,
          ca: process.env.HARPERDB_SSL_CA
        },
        
        // Connection pooling
        pool: {
          min: this.getIntEnv('DB_POOL_MIN', 2),
          max: this.getIntEnv('DB_POOL_MAX', 20),
          acquireTimeoutMillis: this.getIntEnv('DB_POOL_ACQUIRE_TIMEOUT', 60000),
          idleTimeoutMillis: this.getIntEnv('DB_POOL_IDLE_TIMEOUT', 30000)
        }
      },

      // Caching Configuration
      cache: {
        enabled: this.getBoolEnv('CACHE_ENABLED', true),
        maxSize: process.env.CACHE_MAX_SIZE || '1GB',
        defaultTTL: this.getIntEnv('CACHE_DEFAULT_TTL', 300),
        personalizationTTL: this.getIntEnv('CACHE_PERSONALIZATION_TTL', 60),
        
        // Redis configuration (optional external cache)
        redis: {
          enabled: this.getBoolEnv('REDIS_ENABLED', false),
          url: process.env.REDIS_URL,
          host: process.env.REDIS_HOST || 'localhost',
          port: this.getIntEnv('REDIS_PORT', 6379),
          password: process.env.REDIS_PASSWORD,
          database: this.getIntEnv('REDIS_DATABASE', 0),
          keyPrefix: process.env.REDIS_KEY_PREFIX || 'edge-ai-proxy:',
          
          // Connection settings
          connectTimeout: this.getIntEnv('REDIS_CONNECT_TIMEOUT', 10000),
          commandTimeout: this.getIntEnv('REDIS_COMMAND_TIMEOUT', 5000),
          retryDelayOnFailover: this.getIntEnv('REDIS_RETRY_DELAY', 100),
          maxRetriesPerRequest: this.getIntEnv('REDIS_MAX_RETRIES', 3)
        },
        
        // Compression settings
        compression: {
          enabled: this.getBoolEnv('CACHE_COMPRESSION_ENABLED', true),
          threshold: this.getIntEnv('CACHE_COMPRESSION_THRESHOLD', 1024),
          algorithm: process.env.CACHE_COMPRESSION_ALGORITHM || 'gzip'
        }
      },

      // AI/ML Model Configuration
      ai: {
        modelsPath: process.env.AI_MODELS_PATH || './models',
        inferenceTimeout: this.getIntEnv('AI_INFERENCE_TIMEOUT', 100),
        maxConcurrentInferences: this.getIntEnv('AI_MAX_CONCURRENT_INFERENCES', 50),
        fallbackToCache: this.getBoolEnv('AI_FALLBACK_TO_CACHE', true),
        
        // TensorFlow.js configuration
        tensorflow: {
          backend: process.env.TENSORFLOW_BACKEND || 'cpu', // cpu, gpu, webgl
          debugMode: this.getBoolEnv('TENSORFLOW_DEBUG', false),
          memoryGrowth: this.getBoolEnv('TENSORFLOW_MEMORY_GROWTH', true),
          
          // CPU configuration
          cpu: {
            numThreads: this.getIntEnv('TENSORFLOW_CPU_THREADS', 0), // 0 = auto
            enableProfiling: this.getBoolEnv('TENSORFLOW_CPU_PROFILING', false)
          },
          
          // GPU configuration (if available)
          gpu: {
            memoryLimit: this.getIntEnv('TENSORFLOW_GPU_MEMORY_LIMIT', 1024), // MB
            allowMemoryGrowth: this.getBoolEnv('TENSORFLOW_GPU_MEMORY_GROWTH', true)
          }
        },
        
        // Model-specific settings
        models: {
          preloadModels: this.getArrayEnv('AI_PRELOAD_MODELS', ['collaborative-filtering', 'content-based', 'hybrid-recommender']),
          warmupOnLoad: this.getBoolEnv('AI_WARMUP_ON_LOAD', true),
          modelCacheSize: this.getIntEnv('AI_MODEL_CACHE_SIZE', 10),
          
          // Model versioning
          versioning: {
            enabled: this.getBoolEnv('AI_MODEL_VERSIONING', true),
            strategy: process.env.AI_VERSIONING_STRATEGY || 'semantic', // semantic, timestamp
            autoUpdate: this.getBoolEnv('AI_AUTO_UPDATE_MODELS', false)
          }
        }
      },

      // Security Configuration
      security: {
        // API Authentication
        apiKey: {
          required: this.getBoolEnv('API_KEY_REQUIRED', true),
          header: process.env.API_KEY_HEADER || 'X-API-Key',
          keys: this.getArrayEnv('API_KEYS', []),
          adminKey: process.env.ADMIN_API_KEY
        },
        
        // JWT Configuration
        jwt: {
          enabled: this.getBoolEnv('JWT_ENABLED', false),
          secret: process.env.JWT_SECRET,
          algorithm: process.env.JWT_ALGORITHM || 'HS256',
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE
        },
        
        // Rate Limiting
        rateLimit: {
          enabled: this.getBoolEnv('RATE_LIMIT_ENABLED', true),
          windowMs: this.getIntEnv('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
          maxRequests: this.getIntEnv('RATE_LIMIT_MAX_REQUESTS', 1000),
          keyGenerator: process.env.RATE_LIMIT_KEY_GENERATOR || 'ip', // ip, user, tenant
          
          // Per-tenant limits
          tenantLimits: {
            enabled: this.getBoolEnv('TENANT_RATE_LIMITS_ENABLED', true),
            defaultLimits: {
              requestsPerSecond: this.getIntEnv('TENANT_REQUESTS_PER_SECOND', 100),
              requestsPerMinute: this.getIntEnv('TENANT_REQUESTS_PER_MINUTE', 1000),
              requestsPerHour: this.getIntEnv('TENANT_REQUESTS_PER_HOUR', 10000)
            }
          }
        },
        
        // CORS Configuration
        cors: {
          enabled: this.getBoolEnv('CORS_ENABLED', true),
          origins: this.getArrayEnv('CORS_ORIGINS', ['*']),
          methods: this.getArrayEnv('CORS_METHODS', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
          allowedHeaders: this.getArrayEnv('CORS_ALLOWED_HEADERS', [
            'Authorization',
            'Content-Type',
            'X-Tenant-ID',
            'X-User-ID',
            'X-Session-ID',
            'X-API-Key'
          ]),
          credentials: this.getBoolEnv('CORS_CREDENTIALS', true),
          maxAge: this.getIntEnv('CORS_MAX_AGE', 86400) // 24 hours
        },
        
        // Data Encryption
        encryption: {
          algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
          key: process.env.ENCRYPTION_KEY,
          keyDerivation: {
            algorithm: process.env.KEY_DERIVATION_ALGORITHM || 'pbkdf2',
            iterations: this.getIntEnv('KEY_DERIVATION_ITERATIONS', 100000),
            salt: process.env.ENCRYPTION_SALT
          }
        }
      },

      // Monitoring & Observability
      monitoring: {
        // Metrics
        metrics: {
          enabled: this.getBoolEnv('METRICS_ENABLED', true),
          endpoint: process.env.METRICS_ENDPOINT || '/metrics',
          format: process.env.METRICS_FORMAT || 'harper-native',
          collectInterval: this.getIntEnv('METRICS_COLLECT_INTERVAL', 15000),
          
          // Harper Cloud native metrics
          harperCloud: {
            enabled: this.getBoolEnv('HARPER_CLOUD_METRICS_ENABLED', true),
            endpoint: process.env.HARPER_CLOUD_METRICS_ENDPOINT || '/proxy/metrics',
            realtime: this.getBoolEnv('HARPER_REALTIME_METRICS_ENABLED', true)
          }
        },
        
        // Health Checks
        health: {
          enabled: this.getBoolEnv('HEALTH_CHECKS_ENABLED', true),
          endpoint: process.env.HEALTH_ENDPOINT || '/proxy/health',
          interval: this.getIntEnv('HEALTH_CHECK_INTERVAL', 30000),
          timeout: this.getIntEnv('HEALTH_CHECK_TIMEOUT', 5000),
          
          // Component health checks
          checks: {
            database: this.getBoolEnv('HEALTH_CHECK_DATABASE', true),
            cache: this.getBoolEnv('HEALTH_CHECK_CACHE', true),
            aiModels: this.getBoolEnv('HEALTH_CHECK_AI_MODELS', true),
            externalAPIs: this.getBoolEnv('HEALTH_CHECK_EXTERNAL_APIS', true)
          }
        },
        
        // Logging
        logging: {
          level: process.env.LOG_LEVEL || 'info',
          format: process.env.LOG_FORMAT || 'json', // json, text, structured
          timestamp: this.getBoolEnv('LOG_TIMESTAMP', true),
          colorize: this.getBoolEnv('LOG_COLORIZE', false),
          
          // Log destinations
          console: {
            enabled: this.getBoolEnv('LOG_CONSOLE_ENABLED', true),
            level: process.env.LOG_CONSOLE_LEVEL || 'info'
          },
          
          file: {
            enabled: this.getBoolEnv('LOG_FILE_ENABLED', false),
            path: process.env.LOG_FILE_PATH || '/var/log/edge-ai-proxy/app.log',
            maxSize: process.env.LOG_FILE_MAX_SIZE || '100MB',
            maxFiles: this.getIntEnv('LOG_FILE_MAX_FILES', 10),
            level: process.env.LOG_FILE_LEVEL || 'info'
          },
          
          // External logging services
          elasticsearch: {
            enabled: this.getBoolEnv('LOG_ELASTICSEARCH_ENABLED', false),
            url: process.env.ELASTICSEARCH_URL,
            index: process.env.ELASTICSEARCH_LOG_INDEX || 'edge-ai-proxy-logs',
            level: process.env.LOG_ELASTICSEARCH_LEVEL || 'info'
          },
          
          syslog: {
            enabled: this.getBoolEnv('LOG_SYSLOG_ENABLED', false),
            host: process.env.SYSLOG_HOST || 'localhost',
            port: this.getIntEnv('SYSLOG_PORT', 514),
            facility: process.env.SYSLOG_FACILITY || 'local0',
            level: process.env.LOG_SYSLOG_LEVEL || 'info'
          }
        },
        
        // Distributed Tracing
        tracing: {
          enabled: this.getBoolEnv('TRACING_ENABLED', false),
          serviceName: process.env.TRACING_SERVICE_NAME || 'edge-ai-proxy',
          
          // Jaeger configuration
          jaeger: {
            enabled: this.getBoolEnv('JAEGER_ENABLED', false),
            endpoint: process.env.JAEGER_ENDPOINT,
            agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
            agentPort: this.getIntEnv('JAEGER_AGENT_PORT', 6832),
            
            sampler: {
              type: process.env.JAEGER_SAMPLER_TYPE || 'probabilistic',
              param: this.getFloatEnv('JAEGER_SAMPLER_PARAM', 0.1)
            }
          },
          
          // Zipkin configuration
          zipkin: {
            enabled: this.getBoolEnv('ZIPKIN_ENABLED', false),
            endpoint: process.env.ZIPKIN_ENDPOINT,
            sampleRate: this.getFloatEnv('ZIPKIN_SAMPLE_RATE', 0.1)
          }
        }
      },

      // External API Configuration
      externalAPIs: {
        // Upstream timeout settings
        timeout: {
          connect: this.getIntEnv('EXTERNAL_API_CONNECT_TIMEOUT', 5000),
          request: this.getIntEnv('EXTERNAL_API_REQUEST_TIMEOUT', 30000),
          response: this.getIntEnv('EXTERNAL_API_RESPONSE_TIMEOUT', 30000)
        },
        
        // Retry configuration
        retry: {
          attempts: this.getIntEnv('EXTERNAL_API_RETRY_ATTEMPTS', 3),
          delay: this.getIntEnv('EXTERNAL_API_RETRY_DELAY', 1000),
          backoff: process.env.EXTERNAL_API_RETRY_BACKOFF || 'exponential' // linear, exponential
        },
        
        // Circuit breaker
        circuitBreaker: {
          enabled: this.getBoolEnv('CIRCUIT_BREAKER_ENABLED', true),
          failureThreshold: this.getIntEnv('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
          resetTimeout: this.getIntEnv('CIRCUIT_BREAKER_RESET_TIMEOUT', 60000),
          monitoringPeriod: this.getIntEnv('CIRCUIT_BREAKER_MONITORING_PERIOD', 60000)
        }
      },

      // Feature Flags
      features: {
        // AI Features
        aiPersonalization: this.getBoolEnv('FEATURE_AI_PERSONALIZATION', true),
        dynamicPricing: this.getBoolEnv('FEATURE_DYNAMIC_PRICING', false),
        predictivePrefetch: this.getBoolEnv('FEATURE_PREDICTIVE_PREFETCH', false),
        realTimeRecommendations: this.getBoolEnv('FEATURE_REALTIME_RECOMMENDATIONS', true),
        
        // Caching Features
        multiLayerCache: this.getBoolEnv('FEATURE_MULTI_LAYER_CACHE', true),
        intelligentEviction: this.getBoolEnv('FEATURE_INTELLIGENT_EVICTION', true),
        cacheCompression: this.getBoolEnv('FEATURE_CACHE_COMPRESSION', true),
        
        // Analytics Features
        userBehaviorTracking: this.getBoolEnv('FEATURE_USER_BEHAVIOR_TRACKING', true),
        realTimeAnalytics: this.getBoolEnv('FEATURE_REALTIME_ANALYTICS', true),
        advancedMetrics: this.getBoolEnv('FEATURE_ADVANCED_METRICS', false),
        
        // Development Features
        mockMode: this.getBoolEnv('FEATURE_MOCK_MODE', false),
        debugEndpoints: this.getBoolEnv('FEATURE_DEBUG_ENDPOINTS', false),
        verboseLogging: this.getBoolEnv('FEATURE_VERBOSE_LOGGING', false)
      },

      // Performance Tuning
      performance: {
        // Request handling
        maxRequestSize: process.env.MAX_REQUEST_SIZE || '10MB',
        keepAliveTimeout: this.getIntEnv('KEEP_ALIVE_TIMEOUT', 65000),
        headersTimeout: this.getIntEnv('HEADERS_TIMEOUT', 60000),
        bodyTimeout: this.getIntEnv('BODY_TIMEOUT', 0),
        
        // Concurrency limits
        maxConcurrentRequests: this.getIntEnv('MAX_CONCURRENT_REQUESTS', 1000),
        maxConcurrentAIInferences: this.getIntEnv('MAX_CONCURRENT_AI_INFERENCES', 50),
        
        // Memory management
        memoryLimitMB: this.getIntEnv('MEMORY_LIMIT_MB', 4096),
        gcInterval: this.getIntEnv('GC_INTERVAL_MS', 30000),
        
        // CPU optimization
        clusterMode: this.getBoolEnv('CLUSTER_MODE', false),
        workerCount: this.getIntEnv('WORKER_COUNT', 0), // 0 = auto (CPU count)
        
        // Compression
        compression: {
          enabled: this.getBoolEnv('COMPRESSION_ENABLED', true),
          threshold: this.getIntEnv('COMPRESSION_THRESHOLD', 1024),
          level: this.getIntEnv('COMPRESSION_LEVEL', 6) // 1-9
        }
      }
    };
  }

  getEnvironmentConfig(environment) {
    const configs = {
      development: {
        app: {
          port: 3000
        },
        database: {
          host: 'localhost',
          port: 9925
        },
        security: {
          apiKey: { required: false },
          rateLimit: { enabled: false }
        },
        monitoring: {
          logging: { level: 'debug', colorize: true },
          tracing: { enabled: false }
        },
        features: {
          mockMode: true,
          debugEndpoints: true,
          verboseLogging: true
        }
      },

      test: {
        app: {
          port: 0 // Random port for testing
        },
        database: {
          schema: 'edge_ai_proxy_test'
        },
        cache: {
          maxSize: '100MB'
        },
        security: {
          apiKey: { required: false },
          rateLimit: { enabled: false }
        },
        monitoring: {
          logging: { level: 'error' },
          metrics: { enabled: false },
          health: { enabled: false }
        },
        features: {
          mockMode: true,
          aiPersonalization: false
        }
      },

      staging: {
        security: {
          apiKey: { required: true },
          rateLimit: { enabled: true }
        },
        monitoring: {
          logging: { level: 'info' },
          tracing: { enabled: true },
          metrics: { enabled: true }
        },
        features: {
          mockMode: false,
          debugEndpoints: true,
          dynamicPricing: true
        }
      },

      production: {
        database: {
          pool: { min: 5, max: 50 }
        },
        cache: {
          maxSize: '4GB'
        },
        security: {
          apiKey: { required: true },
          rateLimit: { 
            enabled: true,
            maxRequests: 10000
          }
        },
        monitoring: {
          logging: { 
            level: 'warn',
            file: { enabled: true },
            elasticsearch: { enabled: true }
          },
          tracing: { enabled: true },
          metrics: { enabled: true }
        },
        features: {
          mockMode: false,
          debugEndpoints: false,
          verboseLogging: false,
          advancedMetrics: true
        },
        performance: {
          clusterMode: true,
          compression: { enabled: true }
        }
      }
    };

    return configs[environment] || {};
  }

  mergeConfigs(base, override) {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeConfigs(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  // Helper methods for environment variable parsing
  getBoolEnv(name, defaultValue = false) {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  getIntEnv(name, defaultValue = 0) {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getFloatEnv(name, defaultValue = 0.0) {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getArrayEnv(name, defaultValue = []) {
    const value = process.env[name];
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  getPackageVersion() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
      return packageData.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  // Public methods
  get(key) {
    return key.split('.').reduce((obj, k) => obj?.[k], this.config);
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  getAll() {
    return { ...this.config };
  }

  getEnvironment() {
    return this.environment;
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isProduction() {
    return this.environment === 'production';
  }

  isTest() {
    return this.environment === 'test';
  }

  validate() {
    const errors = [];
    
    // Required configuration validation
    const required = [
      'database.username',
      'database.password'
    ];
    
    for (const key of required) {
      if (!this.has(key) || !this.get(key)) {
        errors.push(`Missing required configuration: ${key}`);
      }
    }
    
    // Conditional validation
    if (this.get('security.jwt.enabled') && !this.get('security.jwt.secret')) {
      errors.push('JWT secret is required when JWT is enabled');
    }
    
    if (this.get('monitoring.tracing.jaeger.enabled') && !this.get('monitoring.tracing.jaeger.endpoint')) {
      errors.push('Jaeger endpoint is required when Jaeger tracing is enabled');
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
  }
}

// Export singleton instance
export const environmentConfig = new EnvironmentConfig();
export default environmentConfig;