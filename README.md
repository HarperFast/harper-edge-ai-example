# TensorFlow.js Edge Inference System

A production-ready edge inference system that runs ML models directly in the browser with automatic statistics collection for continuous model improvement.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   MobileNet  │  │  Statistics  │  │ Performance  │    │
│  │   Model v2   │  │  Collector   │  │   Monitor    │    │
│  │  (TF.js)     │  │              │  │              │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                           │                                │
│                    ┌──────▼───────┐                       │
│                    │   Batching   │                       │
│                    │   & Queue    │                       │
│                    └──────┬───────┘                       │
│                           │                                │
└───────────────────────────┼─────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Node.js Server                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   REST API   │  │   SQLite     │  │   Retrainer  │    │
│  │   Endpoints  │  │   Database   │  │   Pipeline   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                           │                                │
│                    ┌──────▼───────┐                       │
│                    │  Data Export │                       │
│                    │  (JSON/CSV)  │                       │
│                    └───────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Client-Side (Browser)
- **MobileNet v2 Model**: Pre-trained ImageNet model for image classification
- **Real-time Inference**: <50ms inference time on modern hardware
- **WebGL Acceleration**: Automatic GPU utilization via TensorFlow.js
- **Offline Support**: Local storage for statistics when offline
- **Intelligent Batching**: Automatic batching of statistics for efficient transmission

### Server-Side (Node.js)
- **Statistics Collection**: RESTful API for receiving inference data
- **SQLite Database**: Efficient storage with indexing for fast queries
- **Data Export**: Multiple formats (JSON, CSV, TFRecord) for retraining
- **Performance Metrics**: Real-time analytics and trend analysis
- **Automatic Triggers**: Smart retraining triggers based on accuracy drift

## Model Specifications

**MobileNet v2 (Recommended)**
- Input Size: 224x224x3
- Model Size: ~14MB (α=1.0)
- Accuracy: 71.8% top-1 on ImageNet
- Inference Speed: 20-50ms (browser dependent)
- Optimization Options:
  - α=0.25: ~1.9MB, 50.6% accuracy, <10ms inference
  - α=0.50: ~3.4MB, 65.4% accuracy, ~15ms inference
  - α=0.75: ~6.9MB, 69.8% accuracy, ~25ms inference
  - α=1.00: ~14MB, 71.8% accuracy, ~40ms inference

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- Modern browser with WebGL support
- 4GB+ RAM recommended

### Installation

```bash
# Install dependencies
npm install

# Build client bundle
npm run build

# Start the server
npm start
```

### Development Mode

```bash
# Terminal 1: Start server with auto-reload
npm run dev

# Terminal 2: Start webpack dev server
npm run watch
```

Access the application at `http://localhost:3000`

## Statistics Collection

### Inference Statistics Collected

```javascript
{
  // Model Information
  modelVersion: "2.0",
  modelAlpha: 1.0,
  
  // Predictions
  predictions: [
    { className: "dog", probability: 0.92, rank: 1 },
    { className: "cat", probability: 0.05, rank: 2 }
  ],
  
  // Performance Metrics
  inferenceTime: 35.2,        // ms
  preprocessingTime: 5.1,      // ms
  totalTime: 40.3,            // ms
  
  // Memory Usage
  memoryUsage: {
    numTensors: 42,
    numBytes: 15728640,       // ~15MB
    numDataBuffers: 42
  },
  
  // User Feedback (if provided)
  userFeedback: {
    isCorrect: false,
    correctedLabel: "wolf",
    confidence: 1.0
  },
  
  // Device Information
  deviceInfo: {
    gpu: { vendor: "Intel", renderer: "Iris Pro" },
    webglVersion: "webgl2",
    deviceMemory: 8,
    hardwareConcurrency: 8
  }
}
```

### Data Flow for Retraining

1. **Collection Phase**
   - Browser collects inference statistics
   - Batches data (default: 25 predictions)
   - Sends to server every 20 seconds or on batch full

2. **Storage Phase**
   - Server validates and stores in SQLite
   - Calculates performance metrics
   - Monitors for accuracy degradation

3. **Export Phase**
   - Export endpoint provides training data
   - Filters by confidence threshold
   - Includes user corrections

4. **Retraining Phase**
   - Triggered by:
     - Accuracy drop >10%
     - 1000+ new data points
     - 7 days since last training
   - Exports data in TensorFlow-compatible format
   - Supports fine-tuning or full retraining

## API Endpoints

### Statistics Collection
```http
POST /api/statistics
Content-Type: application/json

{
  "sessionId": "abc123",
  "deviceInfo": {...},
  "statistics": [...]
}
```

### Export Training Data
```http
GET /api/export/training-data?format=json&includeUserFeedback=true&minConfidence=0.7
```

### Performance Metrics
```http
GET /api/metrics/performance
```

### Trigger Retraining
```http
POST /api/retrain/trigger
{
  "minDataPoints": 1000,
  "confidenceThreshold": 0.8
}
```

## Performance Optimization

### Client-Side Optimizations
1. **Model Warmup**: First inference primes GPU pipeline
2. **WebGL Flags**: Optimized texture packing and F16 precision
3. **Tensor Disposal**: Automatic memory management
4. **Image Preprocessing**: Efficient resizing and normalization

### Server-Side Optimizations
1. **Database Indexing**: Fast queries on session_id, timestamp
2. **Batch Processing**: Efficient bulk inserts
3. **Data Compression**: Gzip compression for responses
4. **Connection Pooling**: Reused database connections

## Deployment Considerations

### Edge Deployment
- **CDN**: Serve model files from CDN for faster loading
- **Service Worker**: Cache model for offline use
- **Progressive Loading**: Load model in background
- **Model Quantization**: Use INT8 quantization for 4x size reduction

### Server Deployment
- **Horizontal Scaling**: Stateless design supports multiple instances
- **Database Replication**: Read replicas for analytics
- **Queue System**: Add Redis/RabbitMQ for high volume
- **Model Versioning**: A/B testing with multiple model versions

## Security Considerations

1. **Data Privacy**: All inference happens client-side
2. **HTTPS Only**: Encrypted data transmission
3. **Input Validation**: Server validates all incoming data
4. **Rate Limiting**: Prevent abuse of API endpoints
5. **Data Retention**: Automatic cleanup of old statistics

## Monitoring & Debugging

### Client Metrics
- Inference time percentiles (P50, P95, P99)
- Memory usage trends
- Error rates and types
- Device capability distribution

### Server Metrics
- Request volume and latency
- Database performance
- Storage utilization
- Retraining trigger frequency

## Future Enhancements

1. **Federated Learning**: On-device training without data transmission
2. **Model Compression**: Automatic pruning and quantization
3. **Multi-Model Support**: A/B testing different architectures
4. **Edge Caching**: Intelligent caching of common predictions
5. **WebAssembly Backend**: WASM SIMD for faster CPU inference

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open a GitHub issue or contact the development team.