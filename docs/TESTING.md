# Testing Guide

Complete testing documentation for the Harper Edge AI Proxy outdoor gear personalization system.

## 🧪 Test Commands Overview

### Core Test Commands

```bash
# Test all AI models (recommended first test)
npm run test-models

# Validate Harper component structure
npm run validate-harper

# Run Jest test suite (if exists)
npm test
```

### Model Installation Tests

```bash
# Install and test core TensorFlow.js models
npm run setup-models -- --core-only
npm run test-models

# Install and test all advanced models
npm run setup-advanced-models -- --all
npm run test-models

# Install custom models only (A/B testing, pricing)
npm run setup-advanced-models -- --custom

# Install optional TensorFlow models only
npm run setup-advanced-models -- --tensorflow
```

## 📋 Test Results Interpretation

### Model Test Results (npm run test-models)

```
✅ PASS - Package Installation (3/3 TensorFlow.js packages)
✅ PASS - Model Structure (model info files valid)  
✅ PASS - Real Model Loading (Universal Sentence Encoder, Toxicity, MobileNet)
✅ PASS - PersonalizationEngine (Harper AI engine importable)

🎉 All tests passed! Your AI models are ready to use.
```

**What this means:**
- **Package Installation**: Core TensorFlow.js models are installed via npm
- **Model Structure**: Configuration files exist and are valid
- **Real Model Loading**: Models actually load and run inference successfully
- **PersonalizationEngine**: Harper's AI engine can access all models

## 🔬 Individual Model Testing

### Test A/B Testing Engine
```bash
node -e "
import { ABTestingEngine } from './models/ab-testing-engine/ab-testing-engine.js';
const abTest = new ABTestingEngine();
const exp = abTest.createExperiment('test', {
  name: 'Hiking Boot Test',
  variants: [{ id: 'control', weight: 50 }, { id: 'test', weight: 50 }]
});
console.log('✅ A/B Testing Engine works!');
console.log('Created experiment:', exp.name);
"
```

### Test Price Sensitivity Analyzer
```bash
node -e "
import { PriceSensitivityAnalyzer } from './models/price-sensitivity-analyzer/price-sensitivity-analyzer.js';
const analyzer = new PriceSensitivityAnalyzer();
analyzer.recordPricePoint('boots', 150, 25);
analyzer.recordPricePoint('boots', 140, 30);
analyzer.recordPricePoint('boots', 160, 20);
const elasticity = analyzer.calculateElasticity('boots');
console.log('✅ Price Sensitivity Analyzer works!');
console.log('Elasticity:', elasticity.elasticity.toFixed(3), '(' + elasticity.interpretation.type + ')');
"
```

### Test TensorFlow.js Models
```bash
node -e "
import * as use from '@tensorflow-models/universal-sentence-encoder';
const model = await use.load();
const embeddings = await model.embed(['hiking boots', 'waterproof jacket']);
console.log('✅ Universal Sentence Encoder works!');
console.log('Embedding dimensions:', embeddings.shape);
"
```

## 🌐 API Testing

### Start the Server
```bash
# Option 1: Express server (development)
npm start

# Option 2: Harper development mode (recommended)
harperdb dev .
```

### Test Health Endpoints
```bash
# Health check
curl http://localhost:3001/proxy/health

# Metrics endpoint  
curl http://localhost:3001/proxy/metrics
```

### Test Personalization API
```bash
# Basic personalization request
curl -X POST http://localhost:3001/api/alpine-gear-co/personalize \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker123" \
  -d '{
    "products": ["hiking-boot-1", "backpack-2"], 
    "userContext": {
      "activityType": "hiking",
      "experienceLevel": "intermediate", 
      "season": "summer"
    }
  }'

# A/B testing variant assignment
curl -X GET http://localhost:3001/api/alpine-gear-co/experiment/gear-rec-test \
  -H "X-User-ID: hiker123"

# Price optimization request
curl -X POST http://localhost:3001/api/alpine-gear-co/optimize-price \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "hiking-boots-001",
    "currentPrice": 150,
    "constraints": { "minPrice": 120, "maxPrice": 180 }
  }'
```

## ⚠️ Common Issues & Solutions

### Model Loading Issues
```
❌ Universal Sentence Encoder - No backend found in registry
```
**Solution**: TensorFlow.js backend missing
```bash
npm install @tensorflow/tfjs @tensorflow/tfjs-node --legacy-peer-deps
```

### Import Path Issues
```
❌ PersonalizationEngine file not found  
```
**Solution**: Check file paths are absolute
```bash
# Verify PersonalizationEngine exists
ls harper-components/ai/PersonalizationEngine.js
```

### Dependency Conflicts
```
❌ ERESOLVE could not resolve dependencies
```
**Solution**: Use legacy peer deps flag
```bash
npm install --legacy-peer-deps
```

## 📊 Performance Testing

### Load Testing Models
```bash
# Test model loading performance
time npm run test-models

# Memory usage during model loading
node --max-old-space-size=4096 scripts/test-models.js
```

### API Load Testing
```bash
# Install Apache Bench
brew install httpd  # macOS
sudo apt-get install apache2-utils  # Ubuntu

# Test API performance
ab -n 1000 -c 10 http://localhost:3001/proxy/health
```

## 🎯 Test Coverage

### Current Test Coverage
- ✅ **TensorFlow.js Models**: 3/3 core models working
- ✅ **Custom Models**: 6/6 advanced models functional
- ✅ **PersonalizationEngine**: Integration verified
- ✅ **API Endpoints**: Health and metrics responding
- ⚠️ **Integration Tests**: Limited API testing
- ❌ **Performance Tests**: Not automated
- ❌ **End-to-End Tests**: Manual testing only

### Test Development Priorities
1. Automated API integration tests
2. Performance benchmarking suite  
3. End-to-end user journey tests
4. Model accuracy validation tests
5. Load testing automation

## 🔄 Continuous Testing

### Development Workflow
```bash
# Before committing changes
npm run validate-harper  # Check Harper components
npm run test-models      # Verify AI functionality
npm test                 # Run Jest tests

# After model changes
npm run setup-advanced-models -- --custom
npm run test-models
```

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Test AI Models
  run: |
    npm install
    npm run setup-models -- --core-only
    npm run test-models
```

This testing guide provides comprehensive coverage for validating your Harper Edge AI Proxy system functionality.