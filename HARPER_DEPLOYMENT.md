# Deploying Alpine Gear Co Edge AI Proxy as Harper-fabric Component

This guide explains how to deploy the Alpine Gear Co Edge AI Proxy as a Harper-fabric native component.

## Prerequisites

1. **Harper-fabric CLI installed**
   ```bash
   npm install -g @harperdb/harper-fabric
   ```

2. **HarperDB instance running**
   - HarperDB 4.0+ with Harper-fabric enabled
   - Admin credentials available

## Deployment Steps

### 1. Navigate to Harper Component Directory
```bash
cd harper-components/
```

### 2. Initialize Harper-fabric Component
```bash
# Initialize the component (if not already done)
harper-fabric init

# Or if already initialized, verify configuration
harper-fabric config validate
```

### 3. Deploy to Harper-fabric
```bash
# Deploy the component
harper-fabric deploy

# Check deployment status
harper-fabric status
```

### 4. Alternative: Deploy with Custom Configuration
```bash
# Deploy with specific environment
harper-fabric deploy --env production

# Deploy with custom port
harper-fabric deploy --port 3000

# Deploy with clustering enabled
harper-fabric deploy --cluster --instances 3
```

## Component Structure for Harper-fabric

The component includes all necessary Harper-fabric files:

```
harper-components/
├── resources.js              # Main Harper Resource classes
├── harperdb-config.yaml     # Component configuration
├── package.json             # Component metadata
├── schemas/                 # Database schemas
├── ai/                      # AI/ML components  
├── utils/                   # Utility classes
├── extensions/              # Harper extensions
└── deployment/              # Deployment configs
```

## Configuration Files

### 1. Component Configuration (`harperdb-config.yaml`)
Already configured with:
- Component metadata (EdgeAIProxy v1.0.0)
- Database schemas (tenants, user_profiles, metrics)
- Performance settings (caching, clustering)
- Security configuration

### 2. Package Configuration (`package.json`)
Harper-fabric component with:
- Proper dependencies
- Component entry point
- Harper-fabric metadata

### 3. Resources (`resources.js`)
Harper Resource classes:
- `ProxyResource` - Main proxy functionality
- `TenantResource` - Multi-tenant management
- `MetricsResource` - Performance monitoring

## Environment Variables for Harper-fabric

Set these environment variables for Harper deployment:

```bash
# Harper Database Connection
export HARPERDB_HOST=your-harperdb-host
export HARPERDB_PORT=9925
export HARPERDB_USERNAME=HDB_ADMIN
export HARPERDB_PASSWORD=your-password

# Component Configuration
export COMPONENT_NAME=EdgeAIProxy
export COMPONENT_PORT=3000
export NODE_ENV=production

# AI Features
export AI_MODELS_PATH=./ai/models
export FEATURE_AI_PERSONALIZATION=true
export FEATURE_DYNAMIC_PRICING=true

# Caching
export CACHE_MAX_SIZE=2GB
export CACHE_DEFAULT_TTL=300

# API Keys (for demo)
export PROXY_API_KEY=alpine-demo-key
```

## Deployment Commands

### Local Harper Deployment
```bash
# Navigate to harper-components directory
cd harper-components/

# Deploy to local HarperDB
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

# Configure for outdoor gear workload
harperdb cloud config set alpine-edge-ai-proxy \
  --memory "4GB" \
  --cpu "2000m" \
  --instances 3

# Set environment variables for production
harperdb cloud env set alpine-edge-ai-proxy \
  AI_MODELS_PATH=./models \
  CACHE_MAX_SIZE=4GB \
  FEATURE_AI_PERSONALIZATION=true
```

### Development with Harper
```bash
# Development mode with hot reload
harperdb dev . --watch --logs

# Test locally before cloud deployment
harperdb run . --env development
```

## Verify Deployment

### 1. Local Harper Verification
```bash
# Check local deployment status
harperdb status

# View component logs
harperdb logs

# Test health endpoint locally
curl http://localhost:3000/proxy/health
```

### 2. Harper Cloud Verification
```bash
# Check cloud deployment status
harperdb cloud status alpine-edge-ai-proxy

# View cloud logs
harperdb cloud logs alpine-edge-ai-proxy

# Test health endpoint on cloud
curl https://alpine-edge-ai-proxy.harpercloud.io/proxy/health
```

### 3. Test Alpine Gear Co Features
```bash
# Test outdoor gear search (works on both local and cloud)
curl -X POST "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{"query": "hiking boots", "activity": "backpacking"}'

# Test gear finder
curl -X POST "http://localhost:3000/api/alpine-gear-co/gear-finder" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{"activity": "backpacking", "experience": "intermediate"}'
```

## Scaling and Management

### Local Harper Scaling
```bash
# For local development, scaling is managed by HarperDB
# Check current resource usage
harperdb status

# Monitor performance
harperdb monitor
```

### Harper Cloud Scaling
```bash
# Scale cloud instances
harperdb cloud scale alpine-edge-ai-proxy --instances 5

# Scale with resource limits for outdoor gear workload
harperdb cloud scale alpine-edge-ai-proxy \
  --instances 3 \
  --memory "4GB" \
  --cpu "2000m" \
  --storage "20GB"
```

### Update Component
```bash
# Update component code (local)
harperdb deploy .

# Update on Harper Cloud
harperdb cloud deploy alpine-edge-ai-proxy --update

# Rolling update with zero downtime
harperdb cloud deploy alpine-edge-ai-proxy --rolling
```

### Component Configuration
```bash
# View current configuration (local)
harperdb config

# View Harper Cloud configuration
harperdb cloud config show alpine-edge-ai-proxy

# Update environment variables
harperdb cloud env set alpine-edge-ai-proxy \
  AI_MODELS_PATH=./models/v2 \
  CACHE_MAX_SIZE=8GB \
  SEASONAL_GEAR_CACHE=true
```

## Monitoring and Observability

### Harper Native Monitoring
```bash
# Local monitoring
harperdb monitor
harperdb metrics

# Harper Cloud monitoring  
harperdb cloud monitor alpine-edge-ai-proxy
harperdb cloud metrics alpine-edge-ai-proxy --period 1h

# Real-time metrics for outdoor gear analytics
curl -N http://localhost:3000/proxy/metrics/realtime
```

### Harper Cloud Dashboard
Access comprehensive monitoring through Harper Cloud:
- Real-time outdoor gear recommendation performance
- AI model inference metrics for hiking/climbing gear
- Multi-tenant analytics (Alpine Gear Co, Mountain Sports, Adventure Outfitters)
- Seasonal cache performance (summer vs winter gear)
- User segmentation effectiveness

### Custom Metrics Endpoints
The component exposes Harper-compatible metrics:
- `/proxy/health` - Component and AI model health
- `/proxy/metrics` - Outdoor gear personalization metrics
- `/proxy/metrics/realtime` - Real-time activity-based analytics

## Database Schema Management

### Initialize Schemas
```bash
# Create database schemas
harper-fabric db init

# Run schema migrations
harper-fabric db migrate
```

### Load Initial Data
```bash
# Load tenant configurations
harper-fabric db seed --file data/seed-tenants.json

# Load demo data
harper-fabric db seed --file data/alpine-gear-mock-responses.json
```

## Troubleshooting

### Common Issues

1. **Component Won't Start**
   ```bash
   # Check logs
   harper-fabric logs alpine-edge-ai-proxy --tail 100
   
   # Check configuration
   harper-fabric config validate
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   harper-fabric db test
   
   # Check database status
   harper-fabric db status
   ```

3. **AI Models Not Loading**
   ```bash
   # Check model files
   ls -la ai/models/
   
   # Update model path
   harper-fabric config set alpine-edge-ai-proxy \
     --env AI_MODELS_PATH=/app/ai/models
   ```

## Advanced Configuration

### Custom Resource Configuration
Edit `resources.js` to customize Harper Resource behavior:

```javascript
// Example: Custom route configuration
export class ProxyResource extends Resource {
  static routes = [
    { method: 'GET', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    { method: 'POST', path: '/api/{tenant}/{proxy+}', handler: 'handleProxyRequest' },
    // Add custom routes
    { method: 'GET', path: '/api/alpine-gear/{category}', handler: 'handleCategorySearch' }
  ];
}
```

### Custom Extensions
Add Harper extensions in `extensions/` directory:

```javascript
// extensions/CustomCacheExtension.js
export class CustomCacheExtension extends Extension {
  // Custom caching logic for outdoor gear
}
```

## Harper Production Checklist

**Local Harper Deployment:**
- [ ] HarperDB instance running and accessible
- [ ] Environment variables configured for outdoor gear workload
- [ ] Database schemas deployed (tenants, user_profiles, metrics)
- [ ] AI models loaded and validated
- [ ] Health checks passing (`/proxy/health`)
- [ ] Metrics endpoints responding (`/proxy/metrics`)

**Harper Cloud Deployment:**
- [ ] Harper Cloud account setup and authenticated
- [ ] Component deployed with appropriate resource limits
- [ ] Environment variables configured in cloud
- [ ] Database schemas synchronized
- [ ] Load testing completed for outdoor gear scenarios
- [ ] Harper Cloud monitoring configured
- [ ] Backup strategy configured through Harper Cloud
- [ ] SSL/TLS automatically handled by Harper Cloud
- [ ] Rate limiting configured for multi-tenant outdoor retailers

## Next Steps

**For Local Development:**
1. Deploy component: `harperdb deploy .`
2. Test all outdoor gear endpoints with curl commands
3. Configure local monitoring
4. Test Alpine Gear Co personalization features

**For Harper Cloud Production:**
1. Deploy to cloud: `harperdb cloud deploy --name alpine-edge-ai-proxy`
2. Configure scaling for outdoor retail workload
3. Set up Harper Cloud monitoring and alerting
4. Test multi-tenant outdoor gear functionality
5. Configure CI/CD pipeline through Harper Cloud

This Harper component provides all the Alpine Gear Co Edge AI Proxy functionality optimized for Harper's native architecture!