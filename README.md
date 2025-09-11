# Edge AI Proxy Service

A production-ready edge AI proxy service that provides transparent caching and personalization layer for e-commerce APIs with real-time ML-powered recommendations and dynamic pricing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    E-commerce Frontend                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Product     │  │   Search     │  │   Cart &     │       │
│  │  Listings    │  │   Results    │  │  Checkout    │       │
│  └──────┬───────┘  └─────┬────────┘  └──────┬───────┘       │
│         │                │                  │               │
│         └────────────────┼──────────────────┘               │
│                          │ API Calls                        │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Edge AI Proxy Service                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐  ┌──────────────┐    │
│  │   Proxy      │     │   Cache      │  │  AI Models   │    │
│  │  Manager     │     │  Manager     │  │  (TF.js)     │    │
│  └──────┬───────┘     └─────┬────────┘  └──────┬───────┘    │
│         │                   │                  │            │
│         └───────────────────┼──────────────────┘            │
│                             │                               │
│                    ┌────────▼───────┐                       │
│                    │ Personalization│                       │
│                    │   Engine       │                       │
│                    └──────┬─────────┘                       │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │ Proxied API Calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            E-commerce APIs (Shopify, WooCommerce, etc.)     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Products   │  │   Orders     │  │   Content    │       │
│  │   Catalog    │  │   History    │  │   Management │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Proxy Layer
- **Multi-tenant Support**: Configure multiple e-commerce platforms (Shopify, WooCommerce, custom APIs)
- **Intelligent Caching**: LRU cache with configurable TTL per endpoint type
- **Rate Limiting**: Per-tenant rate limiting with circuit breaker pattern
- **Request/Response Transformation**: Normalize different API formats

### AI-Powered Personalization
- **Product Recommendations**: Real-time ML-powered product suggestions
- **Dynamic Pricing**: AI-driven pricing optimization based on user segments
- **Content Personalization**: Personalized product descriptions and CTAs
- **Search Enhancement**: Improved search results based on user behavior

### Performance & Monitoring
- **Edge Caching**: Reduce API calls with intelligent cache invalidation
- **Circuit Breaker**: Automatic failover to cached responses
- **Performance Metrics**: Real-time monitoring of cache hit rates, response times
- **Statistics Collection**: Detailed analytics for continuous improvement

## Configuration

### Multi-Tenant Setup

Configure tenants in `config/tenants.json`:

```json
{
  "tenants": [
    {
      "id": "demo-store",
      "name": "Demo E-commerce Store",
      "baseUrl": "https://api.demo-store.com",
      "apiKey": "your-api-key",
      "endpoints": [
        {
          "name": "product-listing",
          "pattern": "^products(/.*)?$",
          "cacheable": true,
          "cacheTTL": 300,
          "personalization": {
            "enabled": true,
            "type": "product-listing"
          }
        }
      ]
    }
  ]
}
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Cache Configuration
CACHE_MAX_SIZE=2GB
CACHE_DEFAULT_TTL=300
CACHE_PERSONALIZATION_TTL=60

# AI Model Configuration
MODEL_CACHE_PATH=./models
INFERENCE_TIMEOUT=100
FALLBACK_TO_CACHE=true

# Rate Limiting
RATE_LIMIT_PER_SECOND=100
RATE_LIMIT_PER_MINUTE=1000
RATE_LIMIT_PER_HOUR=10000
```

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- 4GB+ RAM recommended for AI models
- Redis (optional, for distributed caching)

### Installation

```bash
# Install dependencies
npm install

# Build client bundle
npm run build

# Start the proxy service
npm start
```

### Development Mode

```bash
# Terminal 1: Start server with auto-reload
npm run dev

# Terminal 2: Start webpack dev server for client demo
npm run watch
```

### Usage

Once running, configure your e-commerce frontend to use the proxy:

```javascript
// Instead of direct API calls to your e-commerce platform
const response = await fetch('https://your-store.myshopify.com/api/products');

// Route through the Edge AI Proxy
const response = await fetch('http://localhost:3000/api/proxy/demo-store/products', {
  headers: {
    'X-Tenant-ID': 'demo-store'
  }
});
```

## API Endpoints

### Proxy Endpoints
```http
GET /api/proxy/{tenant-id}/{endpoint}
```

### Statistics & Monitoring
```http
GET /api/stats/performance
GET /api/stats/cache
GET /api/stats/personalization
```

### Configuration Management
```http
GET /api/config/tenants
POST /api/config/tenant/{tenant-id}/endpoints
```

## Personalization Features

### Product Recommendations
- Collaborative filtering based on user behavior
- Content-based filtering using product attributes
- Hybrid approach combining multiple signals

### Dynamic Pricing
- Segment-based pricing optimization
- A/B testing for price sensitivity
- Real-time demand-based adjustments

### Content Personalization
- Dynamic product descriptions
- Personalized call-to-action buttons
- Localized content and currency

## Deployment Considerations

### Production Deployment
- **Load Balancing**: Stateless design supports horizontal scaling
- **Caching**: Add Redis for distributed caching across instances
- **Security**: Configure HTTPS, API key validation, rate limiting
- **Monitoring**: Set up health checks and alerting

### Performance Optimization
- **CDN Integration**: Cache static assets and model files
- **Database Optimization**: Use connection pooling and read replicas
- **Model Optimization**: Use quantized models for faster inference

## Security

- **API Key Management**: Secure tenant API key storage and rotation
- **Rate Limiting**: Prevent abuse with per-tenant limits
- **Input Validation**: Sanitize all proxy requests and responses
- **HTTPS Only**: Encrypted communication between all components
- **Audit Logging**: Track all proxy requests for security monitoring

## Monitoring & Analytics

### Key Metrics
- **Cache Performance**: Hit rates, miss rates, eviction rates
- **API Performance**: Response times, error rates, throughput
- **Personalization Effectiveness**: Click-through rates, conversion rates
- **System Health**: Memory usage, CPU utilization, error logs

### Dashboard Access
Access monitoring dashboard at `http://localhost:3000/dashboard` (when running locally)

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open a GitHub issue or contact the development team.