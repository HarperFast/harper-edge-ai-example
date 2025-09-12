/**
 * Harper-fabric Cluster Configuration
 * Production deployment settings for the Edge AI Proxy Service
 */

export default {
  // Component Information
  component: {
    name: 'EdgeAIProxy',
    version: '1.0.0',
    description: 'Alpine Gear Co Edge AI Proxy Service for Outdoor Equipment Personalization',
    maintainer: 'AI/ML Team',
    repository: 'https://github.com/your-org/harper-edge-ai-proxy'
  },

  // Cluster Configuration
  cluster: {
    // Number of instances to run
    instances: parseInt(process.env.CLUSTER_INSTANCES) || 3,
    
    // Load balancing strategy
    loadBalancer: {
      strategy: 'round-robin', // round-robin, least-connections, weighted, ip-hash
      healthCheck: {
        enabled: true,
        path: '/proxy/health',
        interval: 30000, // 30 seconds
        timeout: 5000,   // 5 seconds
        retries: 3
      },
      sticky: false // Set to true for session affinity
    },

    // Auto-scaling configuration
    autoScaling: {
      enabled: process.env.NODE_ENV === 'production',
      minInstances: 2,
      maxInstances: 10,
      
      // Scale up triggers
      scaleUp: {
        cpuThreshold: 70,      // Scale up when CPU > 70%
        memoryThreshold: 80,   // Scale up when memory > 80%
        requestRate: 1000,     // Scale up when requests/min > 1000
        responseTime: 500,     // Scale up when avg response time > 500ms
        cooldown: 300000       // 5 minutes cooldown between scale operations
      },
      
      // Scale down triggers
      scaleDown: {
        cpuThreshold: 30,      // Scale down when CPU < 30%
        memoryThreshold: 50,   // Scale down when memory < 50%
        requestRate: 200,      // Scale down when requests/min < 200
        responseTime: 100,     // Scale down when avg response time < 100ms
        cooldown: 600000       // 10 minutes cooldown
      }
    },

    // Rolling deployment configuration
    deployment: {
      strategy: 'rolling',     // rolling, blue-green, canary
      maxUnavailable: 1,       // Max instances down during deployment
      maxSurge: 1,            // Max additional instances during deployment
      
      // Health checks during deployment
      readinessProbe: {
        path: '/proxy/ready',
        initialDelay: 30000,   // 30 seconds
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3
      },
      
      livenessProbe: {
        path: '/proxy/health',
        initialDelay: 60000,   // 60 seconds
        periodSeconds: 30,
        timeoutSeconds: 10,
        failureThreshold: 3
      }
    }
  },

  // Resource Allocation
  resources: {
    // Per instance resource limits
    limits: {
      cpu: process.env.CPU_LIMIT || '2000m',      // 2 CPU cores
      memory: process.env.MEMORY_LIMIT || '4Gi',  // 4GB RAM
      storage: process.env.STORAGE_LIMIT || '20Gi' // 20GB storage
    },
    
    // Per instance resource requests (guaranteed)
    requests: {
      cpu: process.env.CPU_REQUEST || '500m',     // 0.5 CPU cores
      memory: process.env.MEMORY_REQUEST || '1Gi', // 1GB RAM
      storage: process.env.STORAGE_REQUEST || '5Gi' // 5GB storage
    },

    // AI model resource allocation
    aiResources: {
      modelMemory: '2Gi',        // Memory reserved for AI models
      inferenceThreads: 4,       // Threads for AI inference
      modelCacheSize: '1Gi',     // AI model cache size
      tensorflowMemory: '1Gi'    // TensorFlow.js memory limit
    }
  },

  // Database Configuration
  database: {
    // Clustering settings
    clustering: {
      enabled: true,
      mode: 'master-slave',      // master-slave, master-master
      nodes: parseInt(process.env.DB_NODES) || 3,
      replicationFactor: 2
    },
    
    // Performance settings
    performance: {
      connectionPool: {
        min: 5,
        max: 20,
        idleTimeout: 30000,
        acquireTimeout: 60000
      },
      
      // Query optimization
      queryCache: {
        enabled: true,
        size: '256MB',
        ttl: 300 // 5 minutes
      },
      
      // Indexing strategy
      indexing: {
        autoOptimize: true,
        rebuildThreshold: 0.3, // Rebuild when fragmentation > 30%
        backgroundMaintenance: true
      }
    },
    
    // Backup configuration
    backup: {
      enabled: true,
      schedule: '0 2 * * *', // Daily at 2 AM
      retention: 7,          // Keep 7 days of backups
      compression: true,
      incremental: true
    },
    
    // Partitioning for large tables
    partitioning: {
      metrics: {
        type: 'time',
        interval: 'daily',
        retention: '30 days',
        autoCleanup: true
      },
      user_profiles: {
        type: 'hash',
        field: 'tenant_id',
        partitions: 8
      }
    }
  },

  // Network Configuration
  networking: {
    // Port configuration
    ports: {
      http: parseInt(process.env.PORT) || 3000,
      metrics: 9090,
      health: 8080,
      admin: 8081
    },
    
    // TLS/SSL configuration
    tls: {
      enabled: process.env.NODE_ENV === 'production',
      certPath: process.env.TLS_CERT_PATH || '/etc/ssl/certs/server.crt',
      keyPath: process.env.TLS_KEY_PATH || '/etc/ssl/private/server.key',
      minVersion: 'TLSv1.2',
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ]
    },

    // Rate limiting (global)
    rateLimiting: {
      enabled: true,
      global: {
        requestsPerSecond: 1000,
        requestsPerMinute: 10000,
        requestsPerHour: 100000
      },
      
      // Per-IP rate limiting
      perIP: {
        requestsPerSecond: 50,
        requestsPerMinute: 500,
        requestsPerHour: 5000,
        banDuration: 3600000 // 1 hour
      }
    },

    // CORS configuration
    cors: {
      enabled: true,
      origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Tenant-ID',
        'X-User-ID',
        'X-Session-ID',
        'X-Request-ID'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours
    }
  },

  // Monitoring & Observability
  monitoring: {
    // Metrics collection
    metrics: {
      enabled: true,
      endpoint: '/metrics',
      format: 'harper-native',
      
      // Custom metrics
      custom: {
        aiInferenceTime: true,
        cacheHitRate: true,
        tenantMetrics: true,
        personalizationRate: true
      }
    },

    // Logging configuration
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: 'json',
      
      // Log destinations
      outputs: [
        {
          type: 'console',
          enabled: true
        },
        {
          type: 'file',
          enabled: process.env.NODE_ENV === 'production',
          path: '/var/log/edge-ai-proxy/app.log',
          maxSize: '100MB',
          maxFiles: 10
        },
        {
          type: 'elasticsearch',
          enabled: process.env.ELASTICSEARCH_URL ? true : false,
          url: process.env.ELASTICSEARCH_URL,
          index: 'edge-ai-proxy-logs'
        }
      ],
      
      // Request logging
      requests: {
        enabled: true,
        includeHeaders: false,
        includeBodies: false,
        skipPaths: ['/proxy/health', '/proxy/ready', '/metrics']
      }
    },

    // Distributed tracing
    tracing: {
      enabled: process.env.JAEGER_ENDPOINT ? true : false,
      sampler: {
        type: 'probabilistic',
        param: 0.1 // Sample 10% of requests
      },
      reporter: {
        endpoint: process.env.JAEGER_ENDPOINT,
        flushInterval: 1000
      }
    },

    // Application Performance Monitoring (APM)
    apm: {
      enabled: process.env.APM_SERVER_URL ? true : false,
      serverUrl: process.env.APM_SERVER_URL,
      serviceName: 'edge-ai-proxy',
      environment: process.env.NODE_ENV
    }
  },

  // Security Configuration
  security: {
    // API security
    api: {
      authentication: {
        required: true,
        methods: ['api_key', 'jwt'],
        
        // API key validation
        apiKey: {
          header: 'X-API-Key',
          validateLength: true,
          minLength: 32
        },
        
        // JWT validation
        jwt: {
          secret: process.env.JWT_SECRET,
          algorithms: ['HS256', 'RS256'],
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE
        }
      },
      
      // Request validation
      validation: {
        maxRequestSize: '10MB',
        allowedContentTypes: [
          'application/json',
          'application/x-www-form-urlencoded'
        ],
        
        // Header validation
        requiredHeaders: ['X-Tenant-ID'],
        
        // Parameter sanitization
        sanitization: {
          enabled: true,
          xss: true,
          sqlInjection: true
        }
      }
    },

    // Data protection
    dataProtection: {
      // PII handling
      pii: {
        enabled: true,
        fields: ['email', 'phone', 'address', 'name'],
        anonymization: true,
        encryption: {
          algorithm: 'aes-256-gcm',
          keyRotation: 86400000 // 24 hours
        }
      },
      
      // Data retention
      retention: {
        userProfiles: '2 years',
        metrics: '90 days',
        logs: '30 days',
        aiMetrics: '1 year'
      }
    }
  },

  // Feature Flags
  features: {
    // AI/ML features
    ai: {
      personalization: {
        enabled: process.env.ENABLE_PERSONALIZATION !== 'false',
        fallbackOnError: true
      },
      
      dynamicPricing: {
        enabled: process.env.ENABLE_DYNAMIC_PRICING === 'true',
        maxDiscount: 0.3
      },
      
      modelPreloading: {
        enabled: true,
        models: ['collaborative-filtering', 'content-based', 'hybrid-recommender']
      }
    },

    // Caching features
    caching: {
      multiLayer: {
        enabled: true,
        intelligentEviction: true
      },
      
      compression: {
        enabled: true,
        threshold: 1024,
        algorithm: 'gzip'
      },
      
      predictivePrefetch: {
        enabled: process.env.ENABLE_PREFETCH === 'true',
        maxQueueSize: 1000
      }
    },

    // Analytics features
    analytics: {
      realTimeMetrics: {
        enabled: true,
        updateInterval: 1000
      },
      
      userBehaviorTracking: {
        enabled: true,
        anonymized: true
      },
      
      aiModelAnalytics: {
        enabled: true,
        detailedMetrics: process.env.NODE_ENV === 'development'
      }
    }
  },

  // Development & Testing
  development: {
    // Hot reload
    hotReload: {
      enabled: process.env.NODE_ENV === 'development',
      watchPaths: ['./resources.js', './ai/', './utils/', './extensions/']
    },
    
    // Mock services
    mocks: {
      enabled: process.env.ENABLE_MOCKS === 'true',
      
      // Mock AI models
      aiModels: {
        enabled: true,
        responseDelay: 50 // ms
      },
      
      // Mock external APIs
      externalAPIs: {
        enabled: true,
        errorRate: 0.05 // 5% error rate
      }
    },
    
    // Debug options
    debug: {
      verboseLogging: process.env.DEBUG === 'true',
      memoryProfiling: process.env.PROFILE_MEMORY === 'true',
      cpuProfiling: process.env.PROFILE_CPU === 'true'
    }
  },

  // Environment-specific overrides
  environments: {
    production: {
      cluster: {
        instances: 6,
        autoScaling: { enabled: true }
      },
      database: {
        clustering: { nodes: 5 },
        backup: { enabled: true }
      },
      monitoring: {
        logging: { level: 'warn' },
        tracing: { enabled: true }
      }
    },
    
    staging: {
      cluster: {
        instances: 2,
        autoScaling: { enabled: false }
      },
      features: {
        ai: { dynamicPricing: { enabled: true } }
      },
      development: {
        debug: { verboseLogging: true }
      }
    },
    
    development: {
      cluster: {
        instances: 1,
        autoScaling: { enabled: false }
      },
      security: {
        api: { authentication: { required: false } }
      },
      development: {
        mocks: { enabled: true },
        debug: { verboseLogging: true }
      }
    }
  }
};