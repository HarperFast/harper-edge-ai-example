#!/bin/bash

set -o pipefail 

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color


function output_errors(){
   # I'd use LINENO, but it seems to references weird when hitting pipefail
   local exit_status=$?
   local failing_command=$BASH_COMMAND

   echo "** ERROR ** " >&2
   echo -e "${RED}Exit Status: $exit_status" >&2
   echo -e "Command:     '$failing_command'${NC}" >&2

   exit $exit_status
}

trap 'output_errors' ERR

echo "🧠 Harper Edge AI Example - Demo"
echo "=================================="
echo

# Check if server is running
echo "Checking server status..."
if ! curl -s http://localhost:9925/health > /dev/null 2>&1; then
  echo "❌ Server not running!"
  echo "Start it with: npm run dev"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo

# Health Check
echo -e "${BLUE}1. Health Check:${NC}"
echo "-------------------"
curl -s http://localhost:9926/Status | jq
echo

# Personalize Products - Trail Running
echo -e "${BLUE}2. Product Personalization (Trail Running):${NC}"
echo "--------------------------------------------"
curl -s -X POST http://localhost:9926/Personalize \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "id": "trail-runner-pro",
        "name": "Trail Runner Pro Shoes",
        "description": "Lightweight running shoes for mountain trails",
        "category": "footwear"
      },
      {
        "id": "ultralight-backpack",
        "name": "Ultralight Backpack 40L",
        "description": "Minimalist pack for fast hiking",
        "category": "packs"
      },
      {
        "id": "rain-jacket",
        "name": "Waterproof Rain Jacket",
        "description": "Breathable shell for wet conditions",
        "category": "outerwear"
      }
    ],
    "userContext": {
      "activityType": "trail-running",
      "experienceLevel": "advanced",
      "season": "spring"
    }
  }' | jq
echo

# Personalize Products - Winter Camping
echo -e "${BLUE}3. Product Personalization (Winter Camping):${NC}"
echo "---------------------------------------------"
curl -s -X POST http://localhost:9926/Personalize \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "id": "winter-tent",
        "name": "4-Season Winter Tent",
        "description": "Heavy-duty shelter for snow camping and extreme cold",
        "category": "shelter"
      },
      {
        "id": "sleeping-bag",
        "name": "Down Sleeping Bag -20F",
        "description": "Ultralight down insulation for winter conditions",
        "category": "sleeping"
      },
      {
        "id": "trail-runner-pro",
        "name": "Trail Runner Pro Shoes",
        "description": "Lightweight running shoes for mountain trails",
        "category": "footwear"
      }
    ],
    "userContext": {
      "activityType": "winter-camping",
      "experienceLevel": "beginner",
      "season": "winter"
    }
  }' | jq
echo

echo -e "${GREEN}✅ Demo completed!${NC}"
echo
echo "Try your own requests:"
echo "  curl -X POST http://localhost:9926/personalize -H 'Content-Type: application/json' -d '{...}'"
