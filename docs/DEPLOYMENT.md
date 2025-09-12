# Deployment Guide

This guide covers deploying the Harper Edge AI Proxy to Harper Cloud or local Harper instances.

## 🚀 Harper Cloud Deployment

### Prerequisites
- Harper Cloud account
- Harper CLI installed: `npm install -g harperdb`
- Project repository cloned locally

### Steps

1. **Login to Harper Cloud**
```bash
harperdb login
```

2. **Deploy the Component**
```bash
# From the project root directory
harperdb deploy

# Follow prompts to configure your instance
```

3. **Verify Deployment**
```bash
# Check component status
harperdb status

# Test health endpoint
curl https://your-instance.harperdbcloud.com/proxy/health
```

### Configuration

The component will automatically:
- Create all necessary Harper schemas
- Seed tenant configurations from `harper-components/data/seed-tenants.json`
- Initialize AI models and caching layers

## 🏠 Local Harper Development

### Prerequisites  
- Node.js 18+
- Harper CLI: `npm install -g harperdb`

### Steps

1. **Start Development Server**
```bash
# From the harper-components directory
harperdb dev .

# Server will start on http://localhost:9925
```

2. **Initialize Data**
```bash
# The component auto-initializes on first request
curl http://localhost:9925/proxy/health
```

3. **Development Workflow**
```bash
# Watch for changes
harperdb dev . --watch

# Run tests
harperdb test
```

## 🔧 Configuration

### Environment Variables

```bash
# Optional: Harper instance configuration
HARPERDB_URL=your-harper-instance-url
HARPERDB_USERNAME=your-username
HARPERDB_PASSWORD=your-password

# AI Model settings
AI_CACHE_SIZE=1GB
AI_INFERENCE_TIMEOUT=5000
AI_MODEL_PATH=./models

# Caching configuration
CACHE_HOT_TTL=30000
CACHE_WARM_TTL=300000
CACHE_COLD_TTL=3600000
```

### Tenant Configuration

Tenants are automatically seeded from the backup configuration file. To add new tenants:

```bash
# Via API
curl -X POST https://your-instance/proxy/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-outdoor-store",
    "name": "New Outdoor Store",
    "baseUrl": "https://api.newstore.com/v1",
    "apiKey": "your-api-key",
    "categoryWeights": {
      "hiking-boots": 1.8,
      "backpacks": 1.7
    }
  }'
```

## 📊 Monitoring

### Health Checks
```bash
# System health
curl https://your-instance/proxy/health

# Detailed metrics
curl https://your-instance/proxy/metrics

# Tenant status
curl https://your-instance/proxy/tenants
```

### Performance Monitoring

The component automatically tracks:
- Request/response times
- Cache hit rates  
- AI model performance
- Tenant usage statistics

Data is stored in Harper schemas and available via the metrics API.

## 🔍 Troubleshooting

### Common Issues

**Component won't start:**
```bash
# Check Harper CLI version
harperdb --version

# Verify project structure
ls -la harper-components/
```

**Tenant seeding fails:**
```bash
# Check seed file exists
ls -la harper-components/data/seed-tenants.json

# Manual initialization
harperdb run initialize
```

**AI models not loading:**
```bash
# Check model files
ls -la models/

# Verify TensorFlow.js installation
npm list @tensorflow/tfjs
```

### Log Analysis

```bash
# Harper component logs
harperdb logs

# Local development logs
tail -f ~/.harperdb/logs/component.log
```

## 🚀 Production Deployment

### Harper Cloud Production

1. **Create Production Instance**
```bash
harperdb create-instance --type production
```

2. **Deploy with Environment**
```bash
harperdb deploy --environment production
```

3. **Configure Load Balancing**
```bash
# Harper handles load balancing automatically
# Configure DNS to point to your Harper instance
```

### Scaling Considerations

- **Horizontal Scaling**: Deploy to multiple Harper regions
- **Vertical Scaling**: Upgrade Harper instance size
- **Caching**: Leverage Harper's distributed caching
- **Model Distribution**: AI models are cached per instance

## 🔒 Security

### API Security
- All endpoints require valid tenant configuration
- Rate limiting applied per tenant
- Request validation and sanitization

### Data Security  
- Tenant configurations encrypted in Harper
- Analytics data anonymized
- HTTPS enforced on all endpoints

### Access Control
```bash
# Set up Harper user roles
harperdb create-user --role readonly
harperdb create-user --role admin
```

## 📈 Performance Optimization

### Caching Strategy
- Hot cache: 30s TTL for frequent requests
- Warm cache: 5min TTL for moderate requests  
- Cold storage: Harper native persistence
- Intelligent cache warming based on usage patterns

### AI Model Optimization
- Model quantization for faster inference
- Batch processing for multiple predictions
- Lazy loading of specialized models
- Memory management and cleanup

### Database Optimization
- Proper indexing on Harper schemas
- Query optimization using Harper native methods
- Data retention policies for analytics
- Automated cleanup of old session data