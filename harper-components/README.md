# Alpine Gear Co Harper Edge AI Proxy Service

A production-ready Harper component that provides intelligent proxy services with AI-powered personalization for outdoor gear APIs. This component leverages Harper's native multi-tenancy, distributed caching, and real-time capabilities while adding sophisticated AI/ML personalization features for hiking, climbing, camping, and expedition equipment.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Alpine Gear Co Web Store                  │
├─────────────────────────────────────────────────────────────┤
│       Outdoor Gear API Requests with Tenant & User Context  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Alpine Gear Co Harper Edge AI Proxy                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Outdoor Gear │  │  Harper DB   │  │ Outdoor AI   │     │
│  │  Resources   │  │   Schemas    │  │ Models (TF.js)│     │
│  │              │  │              │  │              │     │
│  │ • ProxyRes   │  │ • tenants    │  │ • Activity   │     │
│  │ • TenantRes  │  │ • hikers     │  │ • Seasonal   │     │
│  │ • MetricsRes │  │ • gear       │  │ • Compatibility│    │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │      Seasonal Outdoor Gear Multi-Layer Cache       │    │
│  │  Hot (30s) → Warm (5min) → Cold (1hr) → Persistent │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Outdoor Gear APIs (Alpine Gear Co, Mountain Sports, etc.) │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Harper Native Integration
- **Resource-based Architecture**: Built using Harper Resource classes
- **Native Multi-tenancy**: Leverages Harper's tenant isolation capabilities  
- **Distributed Database**: Uses Harper for configuration and analytics storage
- **Built-in Clustering**: Automatic scaling and load balancing
- **Real-time Analytics**: Native support for streaming metrics

### AI-Powered Personalization
- **Product Recommendations**: Collaborative and content-based filtering
- **Dynamic Pricing**: ML-driven pricing optimization by user segment
- **Search Enhancement**: Personalized result ranking and re-ordering
- **User Segmentation**: Automatic classification (premium, price-sensitive, etc.)
- **Content Personalization**: Dynamic CTAs and messaging

### Performance Optimizations
- **Multi-layer Caching**: Hot/Warm/Cold memory layers + persistent storage
- **Intelligent Eviction**: AI-driven cache management
- **Request Deduplication**: Automatic batching of identical requests
- **Circuit Breaker**: Automatic failover to cached responses
- **Compression**: Automatic data compression for large responses

## Quick Start

### Prerequisites
- Node.js 18+ 
- Harper 4.0+
- 4GB+ RAM (for AI models)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd harper-components

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize Harper component
harperdb init

# Start development server
npm run dev
```

### Environment Configuration

```bash
# Harper Database
HARPERDB_HOST=localhost
HARPERDB_PORT=9925
HARPERDB_USERNAME=HDB_ADMIN
HARPERDB_PASSWORD=your_password

# API Security
API_KEY_REQUIRED=true
API_KEYS=your-api-key-1,your-api-key-2

# AI Features
AI_MODELS_PATH=./models
AI_INFERENCE_TIMEOUT=100
FEATURE_AI_PERSONALIZATION=true
FEATURE_DYNAMIC_PRICING=false

# Caching
CACHE_MAX_SIZE=2GB
CACHE_DEFAULT_TTL=300
CACHE_COMPRESSION_ENABLED=true

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
HEALTH_CHECKS_ENABLED=true
```

## Usage

### Basic Proxy Request
```javascript
// Route requests through the proxy with tenant identification
const response = await fetch('http://localhost:3000/api/alpine-gear-co/products/search', {
  method: 'POST',
  headers: {
    'X-User-ID': 'hiker_sarah_123',
    'X-Session-ID': 'session_abc123', 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'hiking boots',
    category: 'footwear',
    activity: 'backpacking'
  })
});

const data = await response.json();
console.log('Personalized results:', data);
```

### Tenant Management
```javascript
// Create a new tenant
const tenant = await fetch('http://localhost:3000/proxy/tenants', {
  method: 'POST',
  headers: { 'X-API-Key': 'admin-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'alpine-gear-co',
    name: 'Alpine Gear Co - Premium Outdoor Equipment',
    baseUrl: 'https://api.alpinegear.co/v1',
    apiKey: 'demo-mode-no-key-required',
    endpoints: [
      {
        name: 'gear-finder',
        pattern: '^gear-finder$',
        cacheable: true,
        cacheTTL: 300,
        personalization: {
          enabled: true,
          type: 'gear-recommendations'
        }
      }
    ]
  })
});
```

### Metrics and Monitoring
```javascript
// Get performance metrics
const metrics = await fetch('http://localhost:3000/proxy/metrics?tenantId=alpine-gear-co&period=1h');
const data = await metrics.json();

// Real-time metrics stream
const eventSource = new EventSource('http://localhost:3000/proxy/metrics/realtime');
eventSource.onmessage = (event) => {
  const metrics = JSON.parse(event.data);
  console.log('Real-time metrics:', metrics);
};
```

## Component Structure

```
harper-components/
├── resources.js                 # Main Harper Resource classes
├── harperdb-config.yaml        # Harper component configuration
├── package.json                # Harper component metadata
│
├── ai/                         # AI/ML components
│   ├── PersonalizationEngine.js
│   └── ModelManager.js
│
├── schemas/                    # Database schemas
│   ├── tenants.schema.js
│   ├── user-profiles.schema.js  
│   └── metrics.schema.js
│
├── utils/                      # Utility classes
│   ├── ResponseEnhancer.js
│   ├── TenantValidator.js
│   └── MetricsCollector.js
│
├── extensions/                 # Harper extensions
│   └── CacheExtension.js
│
└── deployment/                 # Deployment configuration
    ├── cluster.config.js
    └── environment.config.js
```

## API Endpoints

### Proxy Endpoints
- `GET/POST/PUT/DELETE /api/{tenant}/{proxy+}` - Main proxy endpoint
- `GET/POST/PUT/DELETE /api/{proxy+}` - Legacy header-based routing

### Management Endpoints  
- `GET /proxy/tenants` - List all tenants
- `POST /proxy/tenants` - Create new tenant
- `PUT /proxy/tenants/{id}` - Update tenant
- `DELETE /proxy/tenants/{id}` - Delete tenant

### Monitoring Endpoints
- `GET /proxy/health` - Component health check
- `GET /proxy/ready` - Readiness probe
- `GET /proxy/metrics` - Performance metrics
- `GET /proxy/metrics/realtime` - Real-time metrics stream

### Cache Management
- `GET /proxy/cache/stats` - Cache statistics  
- `POST /proxy/cache/clear` - Clear cache entries
- `POST /proxy/cache/warm` - Warm cache with data

## AI Model Configuration

### Supported Models
- **Collaborative Filtering**: User-item interaction based recommendations
- **Content-based Filtering**: Product feature similarity matching  
- **Hybrid Recommender**: Combined approach for better accuracy
- **User Segmentation**: Automatic user classification
- **Price Elasticity**: Dynamic pricing optimization

### Model Setup
```bash
# Create models directory
mkdir -p models

# Download pre-trained models (example)
wget https://example.com/models/collaborative-filtering.tar.gz
tar -xzf collaborative-filtering.tar.gz -C models/

# Or use mock models for development
export ENABLE_MOCK_MODELS=true
npm run dev
```

## Deployment

### Local Development
```bash
npm run dev          # Development with hot reload
npm run test         # Run test suite
npm run build        # Build for production
```

### Harper Cluster
```bash
# Deploy to Harper cluster
harperdb deploy --config deployment/cluster.config.js

# Check deployment status
harperdb status

# Scale instances
harperdb scale --instances 5
```

### Local Harper Deployment
```bash
# Deploy to local Harper instance
harperdb deploy .

# Run in development mode
harperdb dev .

# Run in production mode
harperdb run .
```

### Harper Cloud Deployment
```bash
# Login to Harper Cloud
harperdb cloud login

# Deploy to Harper Cloud
harperdb cloud deploy --name alpine-edge-ai-proxy

# Configure environment variables
harperdb cloud config set \
  --app alpine-edge-ai-proxy \
  --env AI_MODELS_PATH=./models \
  --env CACHE_MAX_SIZE=4GB

# Scale instances on Harper Cloud
harperdb cloud scale alpine-edge-ai-proxy --instances 3

# View deployment status
harperdb cloud status alpine-edge-ai-proxy
```

## Monitoring and Observability

### Key Metrics
- **Request Rate**: Requests per second by tenant/endpoint
- **Response Time**: P50, P95, P99 percentiles  
- **Cache Hit Rate**: Cache effectiveness across layers
- **AI Inference Time**: ML model performance
- **Error Rate**: HTTP error percentages
- **Enhancement Rate**: AI personalization adoption

### Harper-native Monitoring
```bash
# Built-in Harper monitoring
harperdb monitor alpine-edge-ai-proxy

# View component metrics
harperdb metrics alpine-edge-ai-proxy

# Real-time metrics stream
curl -N http://localhost:3000/proxy/metrics/realtime
```

### Harper Cloud Dashboard
Access comprehensive monitoring through Harper Cloud console:
- System performance metrics across all instances
- AI model inference performance and accuracy
- Multi-layer cache efficiency and hit rates  
- Tenant-specific analytics and usage patterns
- Real-time outdoor gear recommendation effectiveness

## Development

### Adding New AI Models
1. Place model files in `models/{model-name}/`
2. Update `ai/ModelManager.js` configuration
3. Implement enhancement logic in `ai/PersonalizationEngine.js`
4. Add model metrics to monitoring

### Custom Enhancement Types
```javascript
// In ResponseEnhancer.js
async enhanceCustomType(data, userContext, tenant) {
  // Your custom enhancement logic
  return enhancedData;
}

// Register in constructor
this.enhancementTypes['custom-type'] = this.enhanceCustomType.bind(this);
```

### Adding New Schemas
1. Create schema file in `schemas/`
2. Export schema definition
3. Add to `harperdb-config.yaml`
4. Run migration: `harperdb migrate`

## Performance Tuning

### Cache Optimization
- **Hot Cache**: Small, frequently accessed items (< 10KB)
- **Warm Cache**: Medium items and personalized content (< 100KB) 
- **Cold Cache**: Large, infrequently accessed items
- **Persistent**: Long-term storage in Harper

### AI Model Optimization
- Enable model quantization: `TENSORFLOW_QUANTIZATION=true`
- Adjust inference timeout: `AI_INFERENCE_TIMEOUT=50` 
- Limit concurrent inferences: `AI_MAX_CONCURRENT_INFERENCES=25`
- Use GPU acceleration: `TENSORFLOW_BACKEND=gpu`

### Memory Management
- Set memory limits: `MEMORY_LIMIT_MB=4096`
- Enable garbage collection: `GC_INTERVAL_MS=30000`
- Monitor heap usage: `FEATURE_MEMORY_PROFILING=true`

## Troubleshooting

### Common Issues

**High Memory Usage**
```bash
# Check AI model memory consumption
curl http://localhost:3000/proxy/metrics | grep ai_model_memory

# Reduce model cache size
export AI_MODEL_CACHE_SIZE=5
```

**Cache Miss Rate**
```bash
# Check cache statistics  
curl http://localhost:3000/proxy/cache/stats

# Adjust TTL for your use case
export CACHE_DEFAULT_TTL=600
```

**AI Inference Timeout**
```bash
# Increase timeout
export AI_INFERENCE_TIMEOUT=200

# Check model performance
curl http://localhost:3000/proxy/metrics | grep inference_time
```

### Debug Mode
```bash
# Enable verbose logging
export LOG_LEVEL=debug
export FEATURE_VERBOSE_LOGGING=true

# Enable debug endpoints
export FEATURE_DEBUG_ENDPOINTS=true
```

## Security Considerations

- **API Key Authentication**: Required for production use
- **Rate Limiting**: Per-tenant and per-IP limits
- **Data Encryption**: PII data encrypted at rest
- **Input Validation**: All requests sanitized
- **CORS Protection**: Configurable origin restrictions

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: [Report bugs and feature requests](https://github.com/Harper/harper-edge-ai-personalization-example/issues)
- Documentation: [Harper Documentation](https://docs.harperdb.io)  
- Community: [Harper Discord](https://discord.gg/harperdb)

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit pull request

---

Built with ❤️ using Harper and TensorFlow.js