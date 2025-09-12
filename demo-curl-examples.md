# Alpine Gear Co Edge AI Proxy - Live Demo with curl

This demonstrates the Alpine Gear Co Edge AI Proxy Service with real curl commands showing AI-powered personalization for outdoor gear.

## Prerequisites

Ensure the proxy server is running:
```bash
npm start
# Server should be running on http://localhost:3000
```

## Health & System Status

### 1. Health Check
```bash
# Check overall system health
curl -s http://localhost:3000/proxy/health | jq '.'

# Check specific component health
curl -s http://localhost:3000/proxy/health | jq '.cache.status, .models.status, .tenants.status'
```

### 2. System Metrics
```bash
# Get overall system metrics
curl -s http://localhost:3000/proxy/metrics | jq '.'

# Get Alpine Gear Co specific metrics
curl -s "http://localhost:3000/proxy/metrics?tenantId=alpine-gear-co" | jq '.requests, .responses'

# Get metrics for last hour
curl -s "http://localhost:3000/proxy/metrics?period=1h" | jq '.period, .requests.total'
```

## Alpine Gear Co Demo Scenarios

### Scenario 1: Sarah the Intermediate Hiker

**User Profile:** Sarah is an intermediate hiker looking for backpacking gear

```bash
# 1. Search for hiking boots (shows personalization)
curl -X POST "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "X-Session-ID: session_abc123" \
  -d '{
    "query": "hiking boots",
    "category": "footwear", 
    "priceRange": {"min": 150, "max": 350},
    "activities": ["hiking", "backpacking"]
  }' | jq '.products[0:3] | .[] | {name, price, personalizedScore}'
```

```bash
# 2. Get personalized gear recommendations
curl -X POST "http://localhost:3000/api/alpine-gear-co/recommendations" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{
    "activity": "backpacking",
    "experience": "intermediate",
    "season": "fall", 
    "budget": 500
  }' | jq '.recommendations[0:5] | .[] | {name, category, reason}'
```

```bash
# 3. Use intelligent gear finder
curl -X POST "http://localhost:3000/api/alpine-gear-co/gear-finder" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{
    "activity": "backpacking",
    "duration": "3-5 days",
    "season": "fall",
    "experience": "intermediate",
    "groupSize": 2
  }' | jq '.gearSystem | keys'
```

### Scenario 2: Mike the Expert Climber

**User Profile:** Mike is an expert climber looking for technical gear

```bash
# 1. Search for climbing gear (different personalization)
curl -X POST "http://localhost:3000/api/mountain-sports-api/gear/search" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: climber_mike_456" \
  -d '{
    "query": "climbing gear",
    "category": "climbing-gear",
    "disciplines": ["sport-climbing", "traditional-climbing"]
  }' | jq '.products[0:3] | .[] | {name, difficulty, personalizedScore}'
```

```bash
# 2. Get expert climbing recommendations  
curl -X POST "http://localhost:3000/api/mountain-sports-api/expert-picks" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: climber_mike_456" \
  -d '{
    "activity": "rock-climbing",
    "skill_level": "intermediate"
  }' | jq '.expertPicks[0:3] | .[] | {product, expertReason}'
```

### Scenario 3: Alex the Expedition Leader  

**User Profile:** Alex leads high-altitude expeditions

```bash
# 1. Search for expedition gear
curl -X POST "http://localhost:3000/api/adventure-outfitters/expeditions/gear" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: explorer_alex_789" \
  -d '{
    "expeditionType": "high-altitude",
    "duration": "21+ days",
    "altitude": "above_5000m", 
    "climate": "extreme-cold"
  }' | jq '.expeditionGear | keys'
```

```bash
# 2. Professional gear recommendations
curl -X POST "http://localhost:3000/api/adventure-outfitters/professional/gear" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: explorer_alex_789" \
  -d '{
    "profession": "mountain-guide",
    "certification": "IFMGA",
    "specialization": "alpine-climbing"
  }' | jq '.professionalGear[0:5] | .[] | {name, certification}'
```

## Advanced Features Demo

### 1. Gear Compatibility Analysis
```bash
# Check if gear items work together
curl -X POST "http://localhost:3000/api/alpine-gear-co/gear-compatibility" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "ag-boot-001", "category": "footwear"},
      {"id": "ms-crampon-001", "category": "climbing-gear"}, 
      {"id": "ao-tent-001", "category": "shelter"}
    ],
    "activity": "winter-mountaineering"
  }' | jq '.compatibility'
```

### 2. Seasonal Transition Recommendations
```bash
# Get seasonal gear transition advice
curl -X POST "http://localhost:3000/api/alpine-gear-co/seasonal-transitions" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{
    "currentSeason": "summer",
    "upcomingSeason": "fall",
    "activities": ["hiking", "backpacking"],
    "location": "colorado"
  }' | jq '.transitions'
```

### 3. Expert Consultation
```bash
# Get expert advice for gear selection
curl -X POST "http://localhost:3000/api/adventure-outfitters/expert-consultation" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: explorer_alex_789" \
  -d '{
    "question": "Best rope system for alpine climbing",
    "experience": "intermediate", 
    "budget": 800,
    "location": "canadian-rockies"
  }' | jq '.consultation'
```

## Cache Performance Demo

### 1. Cache Statistics
```bash
# View cache performance
curl -s http://localhost:3000/proxy/cache/stats | jq '{hitRate, missRate, evictionRate}'
```

### 2. Demonstrate Cache Hits
```bash
# First request (cache miss)
echo "=== First Request (Cache Miss) ===" 
time curl -s "http://localhost:3000/api/alpine-gear-co/products/ag-boot-001" \
  -H "X-User-ID: hiker_sarah_123" | jq '.name' 

# Second request (cache hit - should be faster)
echo "=== Second Request (Cache Hit) ===" 
time curl -s "http://localhost:3000/api/alpine-gear-co/products/ag-boot-001" \
  -H "X-User-ID: hiker_sarah_123" | jq '.name'
```

### 3. Check Response Headers
```bash
# View proxy enhancement headers
curl -I "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "X-User-ID: hiker_sarah_123" | grep -E "X-Proxy|X-Personalization|X-User-Segment"
```

## Performance Monitoring

### 1. Real-time Metrics Stream
```bash
# Start real-time metrics monitoring (run in separate terminal)
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3000/proxy/metrics/realtime"
```

### 2. Personalization Effectiveness
```bash
# Check personalization statistics
curl -s http://localhost:3000/proxy/metrics | jq '.userActivity, .personalization'
```

### 3. Tenant Performance
```bash
# Compare performance across outdoor gear retailers
for tenant in "alpine-gear-co" "mountain-sports-api" "adventure-outfitters"; do
  echo "=== $tenant ==="
  curl -s "http://localhost:3000/proxy/metrics?tenantId=$tenant" | jq '.requests, .responses.averageTime'
done
```

## Error Handling & Circuit Breaker

### 1. Circuit Breaker Status
```bash
# Check circuit breaker health
curl -s http://localhost:3000/proxy/health | jq '.circuitBreaker'
```

### 2. Rate Limiting Demo
```bash
# Rapid requests to trigger rate limiting
for i in {1..15}; do
  curl -s "http://localhost:3000/api/alpine-gear-co/products/search" \
    -H "X-User-ID: rate_test_user" \
    -d '{"query":"boots"}' | jq -r '.error // .products[0].name // "Success"'
done
```

## User Segmentation Demo

### 1. Different User Segments
```bash
# Beginner user - gets basic gear recommendations
curl -X POST "http://localhost:3000/api/alpine-gear-co/recommendations" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: beginner_hiker_001" \
  -d '{"activity": "hiking", "experience": "beginner"}' | jq '.userSegment, .recommendations[0].difficulty'

# Expert user - gets advanced gear recommendations  
curl -X POST "http://localhost:3000/api/alpine-gear-co/recommendations" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: expert_mountaineer_001" \
  -d '{"activity": "mountaineering", "experience": "expert"}' | jq '.userSegment, .recommendations[0].difficulty'
```

## Complete Demo Script

Save this as `run_demo.sh` for a complete demonstration:

```bash
#!/bin/bash

echo "🏔️  Alpine Gear Co Edge AI Proxy Demo"
echo "====================================="

# Health Check
echo "1. System Health:"
curl -s http://localhost:3000/proxy/health | jq '.status'

# Sarah's hiking gear search
echo "2. Sarah's Hiking Boot Search:"
curl -X POST "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{"query": "hiking boots", "activities": ["hiking"]}' | jq '.products[0].name'

# Mike's climbing gear  
echo "3. Mike's Expert Climbing Gear:"
curl -X POST "http://localhost:3000/api/mountain-sports-api/expert-picks" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: climber_mike_456" \
  -d '{"activity": "rock-climbing", "skill_level": "intermediate"}' | jq '.expertPicks[0].product'

# Cache performance
echo "4. Cache Performance:"
curl -s http://localhost:3000/proxy/cache/stats | jq '{hitRate, utilizationRate}'

# Metrics summary
echo "5. Request Metrics:"
curl -s http://localhost:3000/proxy/metrics | jq '.requests.total'

echo "Demo completed! 🎉"
```

Make it executable and run:
```bash
chmod +x run_demo.sh
./run_demo.sh
```

This demonstrates the full Alpine Gear Co Edge AI Proxy with personalization, caching, metrics, and outdoor gear-specific features!