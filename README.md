# Alpine Gear Co - Harper Edge AI Proxy

A Harper native Edge AI Proxy Service for outdoor gear personalization with intelligent caching, ML-powered recommendations, and dynamic pricing.

## 🏔️ Overview

This service provides an intelligent proxy layer for outdoor gear APIs, featuring:

- **Harper-native architecture** - Fully integrated with Harper data layer
- **Edge AI personalization** - TensorFlow.js models for gear recommendations
- **Multi-layer caching** - Hot/warm/cold storage with Harper cold storage
- **Multi-tenant support** - Dynamic tenant configuration in Harper
- **Activity-based matching** - Hiking, climbing, camping, mountaineering
- **Real-time analytics** - Performance metrics and user behavior tracking

## 🚀 Quick Start

### Prerequisites
- Harper Cloud account or local Harper installation
- Node.js 18+
- Git

### Deployment

#### Option 1: Harper Cloud
```bash
# Deploy to Harper Cloud
harperdb deploy
```

#### Option 2: Local Harper
```bash
# Start local Harper development server
harperdb dev .

# The service will be available at http://localhost:9925
```

### Development
```bash
# Install dependencies
npm install

# Start proxy server (for testing)
npm start

# Run Harper development mode
npm run dev
```

## 🏗️ Architecture

### Harper-Native Components
```
┌─────────────────────────────────────────┐
│           Harper                        │
├─────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────────┐    │
│  │ Resources   │ │ Data Schemas    │    │
│  │ & Routes    │ │ (Tenants, etc.) │    │
│  └─────────────┘ └─────────────────┘    │
├─────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────────┐    │
│  │ AI Engine   │ │ Cache Extension │    │
│  │ (TF.js)     │ │ (Multi-layer)   │    │
│  └─────────────┘ └─────────────────┘    │
├─────────────────────────────────────────┤
│         Harper Cold Storage             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Tenants  │ │Sessions │ │Analytics│   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### Data Flow
1. **Request** → Harper Resource Handler
2. **Tenant lookup** → Harper cold storage (cached)  
3. **AI processing** → TensorFlow.js personalization
4. **Cache check** → Multi-layer cache system
5. **API proxy** → Upstream gear APIs
6. **Response enhancement** → AI-powered personalization
7. **Analytics** → Harper data layer storage

## 📊 Key Features

### Intelligent Caching
- **Hot Cache**: 30-second TTL for frequent requests
- **Warm Cache**: 5-minute TTL for moderate requests  
- **Cold Cache**: Harper native cold storage
- **Cache stampede prevention**

### AI Personalization
- **Activity-based recommendations** (hiking, climbing, etc.)
- **Experience level matching** (beginner, intermediate, expert)
- **Seasonal gear optimization**
- **Real-time model inference** with TensorFlow.js

### Analytics & Monitoring
- **Real-time metrics** stored in Harper
- **Performance tracking** with statistical analysis
- **User behavior analytics** for model improvement
- **Automated model retraining** triggers

## 🛠️ Configuration

### Tenant Management
Tenants are stored in Harper cold storage and auto-seeded from JSON:

```javascript
// Managed dynamically via Harper APIs
GET    /proxy/tenants         // List all tenants
GET    /proxy/tenants/{id}    // Get specific tenant
POST   /proxy/tenants         // Create new tenant
PUT    /proxy/tenants/{id}    // Update tenant
DELETE /proxy/tenants/{id}    // Deactivate tenant
```

### Environment Variables
```bash
# Harper Configuration (if needed)
HARPERDB_URL=your-harper-instance
HARPERDB_USERNAME=your-username  
HARPERDB_PASSWORD=your-password

# AI Model Configuration  
AI_MODEL_PATH=./models
AI_CACHE_SIZE=1GB
AI_INFERENCE_TIMEOUT=5000
```

## 🔌 API Usage

### Basic Proxy Request
```bash
# Route: /api/{tenant}/{proxy+}
curl -X GET "https://your-harper-instance/api/alpine-gear-co/products/search?q=hiking+boots" \
  -H "X-User-ID: user123" \
  -H "X-Session-ID: session456"
```

### Health & Metrics
```bash
# Health check
curl https://your-harper-instance/proxy/health

# Performance metrics  
curl https://your-harper-instance/proxy/metrics
```

## 📈 Performance

### Benchmarks
- **Sub-10ms** response time for cached requests
- **<100ms** AI inference time for personalization
- **1GB** default cache capacity with intelligent eviction
- **Multi-tenant** isolation with per-tenant rate limiting

### Scaling
- **Horizontal**: Deploy multiple Harper instances
- **Vertical**: Increase Harper instance resources
- **Edge**: Distribute Harper instances globally

## 🗂️ Project Structure

```
├── harper-components/          # Harper native components
│   ├── resources.js           # Main proxy and tenant resources
│   ├── schemas/               # Harper data schemas
│   │   ├── tenants.schema.js  # Tenant configurations
│   │   ├── sessions.schema.js # User sessions
│   │   └── statistics.schema.js # Analytics data
│   ├── ai/                    # AI/ML components
│   │   ├── PersonalizationEngine.js
│   │   └── HarperModelRetrainer.js
│   ├── utils/                 # Utilities and services
│   │   ├── HarperDataService.js
│   │   ├── HarperTenantService.js
│   │   └── HarperStatsProcessor.js
│   ├── extensions/            # Harper extensions
│   │   └── CacheExtension.js  # Multi-layer caching
│   └── data/                  # Seed data and configurations
│       └── seed-tenants.json  # Initial tenant configurations
├── proxy-server/              # Legacy Express.js server (for development)
├── models/                    # TensorFlow.js AI models  
└── docs/                      # Documentation
```

## 🧪 Testing

```bash
# Run proxy server tests
npm test

# Test Harper components
harperdb test

# Load testing
npm run load-test
```

## 📚 Documentation

- [API Reference](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)  
- [AI Model Guide](./docs/AI_MODELS.md)
- [Caching Strategy](./docs/CACHING.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For support, please visit:
- [Harper Documentation](https://docs.harperdb.io)
- [Harper Community Discord](https://discord.gg/harperdb)
- [GitHub Issues](https://github.com/Harper/harper-edge-ai-personalization-example/issues)

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🏷️ Tags

`harperdb` `edge-ai` `personalization` `outdoor-gear` `proxy` `tensorflow` `caching` `multi-tenant`