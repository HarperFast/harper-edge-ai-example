# AI Models Guide

This guide explains how to find, download, and integrate AI models for the Harper Edge AI Proxy outdoor gear personalization system.

## 🧠 Overview

The Harper Edge AI Proxy uses TensorFlow.js models for real-time personalization of outdoor gear recommendations. The system supports multiple model types optimized for hiking, climbing, camping, and mountaineering equipment.

## 📋 Supported Model Types

### Real TensorFlow.js Models (npm packages)
- **`@tensorflow-models/universal-sentence-encoder`** - Text embedding for product descriptions and search
- **`@tensorflow-models/mobilenet`** - Image classification for gear photos
- **`@tensorflow-models/toxicity`** - Content moderation for user reviews and comments

### Custom Business Intelligence Models
- **`ab-testing-engine`** - Statistical A/B testing with Chi-square significance analysis
- **`price-sensitivity-analyzer`** - Price elasticity calculation and revenue optimization

### Harper Extensions Integration
- **`ProxyServiceExtension`** - Harper Extension wrapping PersonalizationEngine for AI orchestration
- **`ModelManagerExtension`** - Harper Extension for TensorFlow.js model lifecycle management
- **`TrainingManagerExtension`** - Harper Extension for retraining workflows and scheduling

## 🚀 Quick Setup

### Option 1: Core Models (Recommended)
```bash
# Install core TensorFlow.js models via npm
npm run setup-models

# Or install only core models
npm run setup-models -- --core-only
```

### Option 2: Advanced Models
```bash
# Install all models including A/B testing and price sensitivity
npm run setup-advanced-models

# Or install specific categories
npm run setup-advanced-models -- --custom     # Custom business models only
npm run setup-advanced-models -- --tensorflow # Additional TensorFlow models
```

### Option 3: Validation
```bash
# Verify all models are working
npm run test-models
```

## 📦 Model Sources

### TensorFlow.js Models (Real npm packages)
We use real TensorFlow.js models from Google's model hub:

```bash
# Install via npm (handled automatically by setup scripts)
npm install @tensorflow-models/universal-sentence-encoder
npm install @tensorflow-models/mobilenet
npm install @tensorflow-models/toxicity
npm install @tensorflow/tfjs @tensorflow/tfjs-node
```

### Using TensorFlow.js Models
```javascript
// Universal Sentence Encoder for text similarity
import * as use from '@tensorflow-models/universal-sentence-encoder';
const model = await use.load();
const embeddings = await model.embed(['hiking boots', 'waterproof jacket']);

// MobileNet for image classification
import * as mobilenet from '@tensorflow-models/mobilenet';
const model = await mobilenet.load();
// const predictions = await model.classify(imageElement); // Browser only

// Toxicity detection for content moderation
import * as toxicity from '@tensorflow-models/toxicity';
const model = await toxicity.load(0.9);
const predictions = await model.classify(['Great product!']);
```

### Custom Business Models
Our custom models are JavaScript classes, not TensorFlow.js models:
```
models/
├── ab-testing-engine/
│   ├── ab-testing-engine.js
│   └── model-info.json
├── price-sensitivity-analyzer/
│   ├── price-sensitivity-analyzer.js
│   └── model-info.json
└── personalization-engine/
    ├── PersonalizationEngine.js
    └── model-info.json
```

## 🔧 Model Configuration

### Model Integration
Models are integrated through Harper Extensions architecture:

```javascript
// ProxyServiceExtension manages PersonalizationEngine integration
const proxyService = extensions.proxyService;
const enhanced = await proxyService.enhanceResponse(response, userContext, tenant, endpoint);

// ModelManagerExtension handles TensorFlow.js models
const modelManager = extensions.modelManager;
await modelManager.loadModel('universal-sentence-encoder', './models/use/', options);
const model = await modelManager.getModel('universal-sentence-encoder');

// TrainingManagerExtension orchestrates retraining workflows
const trainingManager = extensions.trainingManager;
await trainingManager.scheduleRetraining('recommendation-model', 'daily', options);
```

### Environment Variables
```bash
# Model configuration
AI_MODEL_PATH=./models
AI_CACHE_SIZE=1GB
AI_INFERENCE_TIMEOUT=5000
AI_MODEL_WARMUP=true
```

## 📊 Model Requirements

### Input Formats

#### A/B Testing Engine
```javascript
// Create an experiment
const experiment = abTest.createExperiment('gear-recommendation-test', {
  name: 'New Recommendation Algorithm',
  variants: [
    { id: 'control', name: 'Current Algorithm', weight: 50 },
    { id: 'treatment', name: 'AI-Enhanced Algorithm', weight: 50 }
  ]
});

// Assign user to variant
const assignment = abTest.assignUserToVariant('gear-recommendation-test', 'user123');
```

#### Price Sensitivity Analyzer
```javascript
// Record price and demand data
analyzer.recordPricePoint('hiking-boots-001', 150, 25); // price: $150, demand: 25 units
analyzer.recordPricePoint('hiking-boots-001', 140, 30); // price: $140, demand: 30 units

// Calculate elasticity
const elasticity = analyzer.calculateElasticity('hiking-boots-001');
console.log('Price elasticity:', elasticity.elasticity);
```

#### Universal Sentence Encoder
```javascript
// Generate embeddings for product descriptions
const model = await use.load();
const sentences = ['waterproof hiking boots', 'insulated winter jacket'];
const embeddings = await model.embed(sentences);
const similarity = calculateCosineSimilarity(embeddings);
```

### Output Formats

#### A/B Test Results
```javascript
{
  experimentId: 'gear-recommendation-test',
  variant: 'treatment',
  conversionRate: 0.23,
  significance: 0.95,
  isSignificant: true,
  recommendation: 'Deploy treatment variant'
}
```

#### Price Optimization Results
```javascript
{
  currentPrice: 150,
  recommendedPrice: 142.50,
  expectedRevenue: 4275.00,
  improvementPercent: 12.5,
  elasticity: -0.8,
  confidence: 'high'
}
```

## 🧪 Training Your Own Models

### A/B Testing Data Collection
```javascript
// Track experiment events
abTest.trackEvent('gear-recommendation-test', 'user123', 'conversion', {
  productId: 'hiking-boots-001',
  revenue: 150,
  timestamp: Date.now()
});

// Analyze results
const results = abTest.analyzeExperiment('gear-recommendation-test');
```

### Price Sensitivity Training
```javascript
// Historical price and demand data
analyzer.recordPricePoint('product-001', 120, 35);
analyzer.recordPricePoint('product-001', 130, 28);
analyzer.recordPricePoint('product-001', 140, 22);

// Calculate optimal pricing
const optimization = analyzer.optimizePrice('product-001', 130, {
  minPrice: 110,
  maxPrice: 160
});
```

### Model Validation
```bash
# Test all models and integrations
npm run test-models

# Test specific components
node -e "import('./models/ab-testing-engine/ab-testing-engine.js').then(m => console.log('A/B Testing ready!'))"
node -e "import('./models/price-sensitivity-analyzer/price-sensitivity-analyzer.js').then(m => console.log('Price analysis ready!'))"
```

## 🔍 Testing Models

### Comprehensive Testing
```bash
# Run complete test suite
npm run test-models

# Test Harper components
npm run validate-harper

# Run Jest tests (if available)
npm test
```

### API Integration Testing
```bash
# Test personalization with A/B testing
curl -X POST http://localhost:3001/api/alpine-gear-co/personalize \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "products": ["hiking-boot-1", "backpack-2"],
    "userContext": {
      "activityType": "hiking",
      "experienceLevel": "intermediate",
      "season": "summer"
    }
  }'

# Test A/B experiment assignment
curl -X GET http://localhost:3001/api/alpine-gear-co/experiment/gear-rec-test \
  -H "X-User-ID: test-user-123"

# Test price optimization
curl -X POST http://localhost:3001/api/alpine-gear-co/optimize-price \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "hiking-boots-001",
    "currentPrice": 150,
    "constraints": { "minPrice": 120, "maxPrice": 180 }
  }'
```

## 🚨 Troubleshooting

### Common Issues

#### TensorFlow.js Model Issues
```bash
# Check TensorFlow.js backend installation
node -e "import('@tensorflow/tfjs-node').then(() => console.log('TF.js backend OK')).catch(e => console.error('Backend missing:', e))"

# Test Universal Sentence Encoder
node -e "
import('@tensorflow-models/universal-sentence-encoder').then(async use => {
  const model = await use.load();
  console.log('Universal Sentence Encoder loaded successfully');
}).catch(err => console.error('Model load failed:', err));
"
```

#### Memory Issues
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable model cleanup
export AI_MODEL_CLEANUP=true
export AI_MODEL_TTL=300000
```

#### Inference Timeout
```javascript
// Adjust timeout settings
const engine = new PersonalizationEngine({
  inferenceTimeout: 200,  // Increase from default 100ms
  fallbackToCache: true   // Enable fallback
});
```

### Debug Mode
```bash
# Enable detailed logging
export DEBUG=ai:personalization,ai:models
export AI_LOG_LEVEL=debug

# Run with profiling
node --prof app.js
```

## 📈 Performance Optimization

### Model Optimization
```bash
# Quantize models for faster inference
python scripts/quantize_models.py --input models/ --output models_optimized/

# Use GraphModel for better performance
tensorflowjs_converter --input_format keras --output_format tfjs_graph_model model.h5 models/graph/
```

### Caching Strategy
```javascript
// Enable model caching
const engine = new PersonalizationEngine({
  modelCachePath: './models',
  enableModelCache: true,
  cacheCompression: true,
  preloadModels: ['collaborative-filtering', 'content-based']
});
```

### Batch Processing
```javascript
// Process multiple requests together
const recommendations = await engine.batchPersonalize([
  { userId: 'user1', context: {...} },
  { userId: 'user2', context: {...} },
  { userId: 'user3', context: {...} }
]);
```

## 🔐 Model Security

### Model Validation
```javascript
// Verify model integrity
const modelHash = await engine.validateModel('collaborative-filtering');
console.log('Model hash:', modelHash);
```

### Secure Model Storage
```bash
# Encrypt sensitive models
gpg --symmetric --cipher-algo AES256 models/user-segmentation/
```

## 📚 Resources

### Documentation
- [TensorFlow.js Guide](https://www.tensorflow.org/js)
- [TensorFlow.js Models](https://github.com/tensorflow/tfjs-models)
- [Harper Documentation](https://docs.harperdb.io)

### Real Model Repositories
- [TensorFlow.js Models Hub](https://github.com/tensorflow/tfjs-models)
- [Universal Sentence Encoder](https://www.tensorflow.org/hub/tutorials/semantic_similarity_with_tf_hub_universal_encoder)
- [MobileNet on TensorFlow Hub](https://tfhub.dev/google/imagenet/mobilenet_v1_100_224/classification/5)

### Community
- [Harper Community Discord](https://discord.gg/harperdb)
- [TensorFlow.js Community](https://www.tensorflow.org/js/community)
- [Testing Guide](./TESTING.md)

---

For additional support, visit our [Harper Community Discord](https://discord.gg/harperdb) or see the comprehensive [Testing Guide](./TESTING.md).