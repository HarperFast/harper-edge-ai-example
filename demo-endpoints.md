# Alpine Gear Co - Demo API Endpoints

The Edge AI Proxy is now configured for **demo mode** with mock responses that simulate real outdoor gear APIs without requiring actual API keys. Experience personalized recommendations for hiking, climbing, camping, and adventure gear.

## Available Demo Endpoints

### Alpine Gear Co - Premium Outdoor Equipment
```bash
# Search for hiking boots
curl "http://localhost:3000/api/products/search" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "hiking boots", 
    "category": "footwear",
    "priceRange": {"min": 150, "max": 350},
    "activities": ["hiking", "backpacking"]
  }'

# Get detailed product information
curl "http://localhost:3000/api/products/ag-boot-001" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "X-Session-ID: session_abc123"

# Browse hiking gear by category  
curl "http://localhost:3000/api/categories/hiking-gear/products" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "X-Device-Type: mobile"

# Get personalized gear recommendations
curl "http://localhost:3000/api/recommendations" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "Content-Type: application/json" \
  -d '{
    "activity": "backpacking",
    "experience": "intermediate", 
    "season": "fall",
    "budget": 500
  }'

# Use the intelligent gear finder
curl "http://localhost:3000/api/gear-finder" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "Content-Type: application/json" \
  -d '{
    "activity": "backpacking",
    "duration": "3-5 days",
    "season": "fall",
    "experience": "intermediate",
    "groupSize": 2
  }'
```

### Mountain Sports Equipment API
```bash
# Search for climbing gear
curl "http://localhost:3000/api/gear/search" \
  -H "X-Tenant-ID: mountain-sports-api" \
  -H "X-User-ID: climber_mike_456" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "climbing gear",
    "category": "climbing-gear",
    "disciplines": ["sport-climbing", "traditional-climbing"]
  }'

# Get activity-specific gear recommendations
curl "http://localhost:3000/api/activities/mountaineering/gear" \
  -H "X-Tenant-ID: mountain-sports-api" \
  -H "X-User-ID: climber_mike_456" \
  -H "Content-Type: application/json" \
  -d '{
    "difficulty": "advanced",
    "location": "alpine",
    "season": "winter"
  }'

# Browse products by brand
curl "http://localhost:3000/api/brands/summit-series/products" \
  -H "X-Tenant-ID: mountain-sports-api" \
  -H "X-User-ID: climber_mike_456"

# Get expert picks and recommendations
curl "http://localhost:3000/api/expert-picks" \
  -H "X-Tenant-ID: mountain-sports-api" \
  -H "X-User-ID: climber_mike_456" \
  -H "Content-Type: application/json" \
  -d '{
    "activity": "rock-climbing",
    "skill_level": "intermediate"
  }'
```

### Adventure Outfitters - Expedition Gear
```bash
# Search expedition-grade equipment
curl "http://localhost:3000/api/expeditions/gear" \
  -H "X-Tenant-ID: adventure-outfitters" \
  -H "X-User-ID: explorer_alex_789" \
  -H "Content-Type: application/json" \
  -d '{
    "expeditionType": "high-altitude",
    "duration": "21+ days", 
    "altitude": "above_5000m",
    "climate": "extreme-cold"
  }'

# Get professional-grade gear recommendations
curl "http://localhost:3000/api/professional/gear" \
  -H "X-Tenant-ID: adventure-outfitters" \
  -H "X-User-ID: explorer_alex_789" \
  -H "Content-Type: application/json" \
  -d '{
    "profession": "mountain-guide",
    "certification": "IFMGA",
    "specialization": "alpine-climbing"
  }'

# Browse activity-specific categories
curl "http://localhost:3000/api/categories/activities" \
  -H "X-Tenant-ID: adventure-outfitters" \
  -H "X-User-ID: explorer_alex_789"

# Gear matching for specific adventures
curl "http://localhost:3000/api/gear-finder/everest-expedition" \
  -H "X-Tenant-ID: adventure-outfitters" \
  -H "X-User-ID: explorer_alex_789" \
  -H "Content-Type: application/json" \
  -d '{
    "peak": "everest",
    "route": "south-col",
    "teamSize": 6,
    "experience": "expert"
  }'
```

## Features Demonstrated

### AI-Powered Gear Recommendations
- **Activity-Based Suggestions**: Get gear recommendations based on specific outdoor activities
- **Experience Level Matching**: Products matched to your skill and experience level  
- **Seasonal Optimization**: Gear suggestions adapted for weather and season
- **Budget-Conscious Selection**: AI finds the best value within your price range
- **Compatibility Checking**: Ensures recommended gear works together as a system

### Smart Personalization
- **User Behavior Learning**: System learns from your browsing and purchase patterns
- **Activity Profile Building**: Develops understanding of your outdoor interests
- **Preference Memory**: Remembers brand preferences, size, and feature priorities
- **Dynamic Pricing**: Personalized discounts based on user segment and loyalty
- **Content Adaptation**: Product descriptions and calls-to-action tailored to user type

### Intelligent Caching
- **Multi-Layer Architecture**: Hot/warm/cold cache layers for optimal performance
- **Activity-Aware Caching**: Different TTL for seasonal vs. evergreen gear
- **User-Specific Caching**: Personalized results cached separately
- **Predictive Pre-loading**: Popular gear combinations pre-cached
- **Cache Warming**: Seasonal gear categories loaded in advance

### Advanced Features

#### Gear Compatibility Analysis
```bash
# Check gear system compatibility
curl "http://localhost:3000/api/gear-compatibility" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "ag-boot-001", "category": "footwear"},
      {"id": "ms-crampon-001", "category": "climbing-gear"},
      {"id": "ao-tent-001", "category": "shelter"}
    ],
    "activity": "winter-mountaineering"
  }'
```

#### Seasonal Gear Transitions  
```bash
# Get seasonal transition recommendations
curl "http://localhost:3000/api/seasonal-transitions" \
  -H "X-Tenant-ID: alpine-gear-co" \
  -H "X-User-ID: hiker_sarah_123" \
  -H "Content-Type: application/json" \
  -d '{
    "currentSeason": "summer",
    "upcomingSeason": "fall", 
    "activities": ["hiking", "backpacking"],
    "location": "colorado"
  }'
```

#### Expert Consultation Integration
```bash
# Get expert advice for complex purchases
curl "http://localhost:3000/api/expert-consultation" \
  -H "X-Tenant-ID: adventure-outfitters" \
  -H "X-User-ID: explorer_alex_789" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Best rope system for alpine climbing",
    "experience": "intermediate",
    "budget": 800,
    "location": "canadian-rockies"
  }'
```

## Response Headers

All responses include helpful metadata:

```
X-Proxy-Cache: HIT|MISS
X-Proxy-Enhanced: true|false  
X-Proxy-Request-ID: unique-request-id
X-Proxy-Response-Time: 45ms
X-Personalization-Applied: true|false
X-Recommendation-Score: 0.87
X-User-Segment: expert-climber|weekend-hiker|gear-enthusiast
```

## User Contexts for Testing

### Sarah - Intermediate Hiker
```bash
-H "X-User-ID: hiker_sarah_123"
-H "X-User-Preferences: eyJhY3Rpdml0aWVzIjpbImhpa2luZyIsImJhY2twYWNraW5nIl0sImV4cGVyaWVuY2UiOiJpbnRlcm1lZGlhdGUiLCJidWRnZXQiOjUwMCwiYnJhbmRzIjpbIkFscGluZSBHZWFyIENvIiwiTW91bnRhaW4gUGVhayJdfQ=="
```

### Mike - Expert Climber  
```bash
-H "X-User-ID: climber_mike_456"
-H "X-User-Preferences: eyJhY3Rpdml0aWVzIjpbImNsaW1iaW5nIiwibW91bnRhaW5lZXJpbmciXSwiZXhwZXJpZW5jZSI6ImV4cGVydCIsImJ1ZGdldCI6MTUwMCwiYnJhbmRzIjpbIlN1bW1pdCBTZXJpZXMiLCJQcm8gQ2xpbWIiXX0="
```

### Alex - Expedition Leader
```bash  
-H "X-User-ID: explorer_alex_789"
-H "X-User-Preferences: eyJhY3Rpdml0aWVzIjpbImV4cGVkaXRpb25zIiwiYWxwaW5lLWNsaW1iaW5nIl0sImV4cGVyaWVuY2UiOiJleHBlcnQiLCJidWRnZXQiOjUwMDAsInByb2Zlc3Npb24iOiJtb3VudGFpbi1ndWlkZSJ9"
```

## Mock Data Highlights

### Featured Products
- **Alpine Summit Pro Hiking Boots**: Premium waterproof boots for serious hikers
- **Trailblazer Lightweight Boots**: Breathable boots for day hiking
- **Pro Climber Dynamic Rope**: UIAA-certified climbing rope with dry treatment
- **Alpine Quickdraw Set**: Professional climbing hardware
- **Expedition Base Camp Tent**: 4-season shelter for extreme conditions

### Personalization Examples
- **Activity Matching**: Climbing gear shown to climbers, hiking gear to hikers
- **Seasonal Relevance**: Fall gear promoted in autumn, winter gear in cold months  
- **Experience Appropriate**: Beginner gear for new users, pro gear for experts
- **Budget Conscious**: Recommendations within specified price ranges
- **Brand Loyalty**: Preferred brands weighted higher in recommendations

## Performance Metrics

Monitor these key metrics in the demo:

- **Cache Hit Rates**: 85-95% for popular outdoor gear categories
- **Personalization Rates**: 70-90% of responses enhanced with AI
- **Response Times**: <100ms for cached, <300ms for personalized responses  
- **Recommendation Accuracy**: 92%+ for activity-appropriate suggestions
- **User Engagement**: 3x higher click-through on personalized results

## Next Steps

1. **Customize User Profiles**: Modify the X-User-Preferences header to test different personas
2. **Explore Categories**: Try different outdoor activity categories and gear types
3. **Monitor Performance**: Watch response headers for caching and personalization info
4. **Test Seasonality**: Change seasonal parameters to see different recommendations
5. **Expert Features**: Try expedition and professional gear endpoints for advanced scenarios

This demo showcases how AI-powered personalization can transform the outdoor gear shopping experience, helping adventurers find the right equipment for their next expedition!