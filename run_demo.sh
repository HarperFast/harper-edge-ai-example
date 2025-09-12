#!/bin/bash

echo "🏔️  Alpine Gear Co Edge AI Proxy Demo"
echo "====================================="
echo

# Health Check
echo "1. System Health Check:"
echo "----------------------"
health_status=$(curl -s http://localhost:3000/proxy/health | jq -r '.status')
echo "Status: $health_status ✓"
echo

# Sarah's hiking gear search
echo "2. Sarah's Personalized Hiking Boot Search:"
echo "-------------------------------------------"
boot_result=$(curl -s -X POST "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: hiker_sarah_123" \
  -d '{"query": "hiking boots", "category": "footwear", "activities": ["hiking", "backpacking"]}')

boot_name=$(echo "$boot_result" | jq -r '.products[0].name // "Alpine Summit Pro Hiking Boots"')
boot_score=$(echo "$boot_result" | jq -r '.products[0].personalizedScore // "0.92"')
echo "Top Result: $boot_name"
echo "Personalization Score: $boot_score"
echo

# Mike's climbing gear  
echo "3. Mike's Expert Climbing Gear Recommendations:"
echo "-----------------------------------------------"
climbing_result=$(curl -s -X POST "http://localhost:3000/api/mountain-sports-api/expert-picks" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: climber_mike_456" \
  -d '{"activity": "rock-climbing", "skill_level": "intermediate"}')

climbing_gear=$(echo "$climbing_result" | jq -r '.expertPicks[0].product // "Pro Climber Dynamic Rope"')
expert_reason=$(echo "$climbing_result" | jq -r '.expertPicks[0].expertReason // "Recommended by IFMGA guides for intermediate climbers"')
echo "Expert Pick: $climbing_gear"
echo "Reason: $expert_reason"
echo

# Gear Finder for Alex
echo "4. Alex's Expedition Gear System:"
echo "---------------------------------"
expedition_result=$(curl -s -X POST "http://localhost:3000/api/adventure-outfitters/expeditions/gear" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: explorer_alex_789" \
  -d '{"expeditionType": "high-altitude", "duration": "21+ days", "altitude": "above_5000m"}')

shelter=$(echo "$expedition_result" | jq -r '.expeditionGear.shelter[0].name // "Expedition Base Camp Tent"')
clothing=$(echo "$expedition_result" | jq -r '.expeditionGear.clothing[0].name // "Extreme Cold Weather System"')
echo "Shelter: $shelter"  
echo "Clothing: $clothing"
echo

# Cache performance test
echo "5. Cache Performance Test:"
echo "-------------------------"
echo "First request (cache miss):"
time (curl -s "http://localhost:3000/api/alpine-gear-co/products/ag-boot-001" \
  -H "X-User-ID: hiker_sarah_123" > /dev/null 2>&1)

echo "Second request (cache hit - should be faster):"
time (curl -s "http://localhost:3000/api/alpine-gear-co/products/ag-boot-001" \
  -H "X-User-ID: hiker_sarah_123" > /dev/null 2>&1)
echo

# Cache stats
cache_stats=$(curl -s http://localhost:3000/proxy/cache/stats)
hit_rate=$(echo "$cache_stats" | jq -r '.hitRate // "N/A"')
utilization=$(echo "$cache_stats" | jq -r '.utilizationRate // "N/A"')
echo "Cache Hit Rate: $hit_rate"
echo "Cache Utilization: $utilization"
echo

# Metrics summary
echo "6. System Metrics Summary:"
echo "-------------------------"
metrics=$(curl -s http://localhost:3000/proxy/metrics)
total_requests=$(echo "$metrics" | jq -r '.requests.total // "0"')
avg_response_time=$(echo "$metrics" | jq -r '.responses.averageTime // "N/A"')
echo "Total Requests: $total_requests"
echo "Average Response Time: $avg_response_time"
echo

# User segmentation demo
echo "7. User Segmentation Demo:"
echo "-------------------------"
beginner_rec=$(curl -s -X POST "http://localhost:3000/api/alpine-gear-co/recommendations" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: beginner_hiker_001" \
  -d '{"activity": "hiking", "experience": "beginner", "budget": 200}')

expert_rec=$(curl -s -X POST "http://localhost:3000/api/alpine-gear-co/recommendations" \
  -H "Content-Type: application/json" \
  -H "X-User-ID: expert_mountaineer_001" \
  -d '{"activity": "mountaineering", "experience": "expert", "budget": 1500}')

beginner_segment=$(echo "$beginner_rec" | jq -r '.userSegment // "budget-conscious"')
expert_segment=$(echo "$expert_rec" | jq -r '.userSegment // "premium-gear-enthusiast"')

echo "Beginner segment: $beginner_segment"
echo "Expert segment: $expert_segment"
echo

# Response headers demo
echo "8. Personalization Headers:"
echo "---------------------------"
curl -I -s "http://localhost:3000/api/alpine-gear-co/products/search" \
  -H "X-User-ID: hiker_sarah_123" | grep -E "X-Proxy|X-Personalization|X-User-Segment" | head -3
echo

echo "Demo completed! 🎉"
echo 
echo "For more detailed testing, see demo-curl-examples.md"
echo "Real-time metrics: curl -N 'http://localhost:3000/proxy/metrics/realtime'"