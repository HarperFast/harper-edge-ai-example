# Demo API Endpoints

The Edge AI Proxy is now configured for **demo mode** with mock responses that simulate real e-commerce APIs without requiring actual API keys.

## Available Demo Endpoints

### Amazon Mock APIs
```bash
# Search for products
curl "http://localhost:3000/api/searchitems" \
  -H "X-Tenant-ID: amazon" \
  -H "Content-Type: application/json"

# Get product details  
curl "http://localhost:3000/api/getitems" \
  -H "X-Tenant-ID: amazon" \
  -H "Content-Type: application/json"
```

### Rakuten Mock APIs
```bash
# Search Ichiba items
curl "http://localhost:3000/api/IchibaItem/Search/20170706" \
  -H "X-Tenant-ID: rakuten" \
  -H "Content-Type: application/json"
```

### Zalando Mock APIs
```bash
# Search fashion articles
curl "http://localhost:3000/api/articles" \
  -H "X-Tenant-ID: zalando" \
  -H "Content-Type: application/json"

# Get categories
curl "http://localhost:3000/api/categories" \
  -H "X-Tenant-ID: zalando" \
  -H "Content-Type: application/json"

# Get brands
curl "http://localhost:3000/api/brands" \
  -H "X-Tenant-ID: zalando" \
  -H "Content-Type: application/json"
```

## Features Demonstrated

### AI-Powered Personalization
- Product recommendations based on user behavior
- Dynamic pricing optimization
- Content personalization

### Caching & Performance
- Intelligent LRU caching with configurable TTL
- Cache hit/miss reporting in response headers
- Simulated response times (20-120ms)

### Multi-Tenant Support
- Each tenant (Amazon, Rakuten, Zalando) has different:
  - Rate limits
  - Personalization settings
  - Response formats
  - Localization (English, Japanese, German)

## Response Headers

All mock responses include metadata headers:
- `X-Proxy-Cache: MOCK` - Indicates mock response
- `X-Proxy-Enhanced: true` - AI personalization applied
- `X-Proxy-Request-Id: <uuid>` - Request tracking
- `X-Proxy-Response-Time: <ms>` - Simulated response time

## Example Response (Amazon)

```json
{
  "SearchResult": {
    "TotalResultCount": 1000,
    "SearchURL": "https://www.amazon.com/s?k=electronics",
    "Items": [
      {
        "ASIN": "B08N5WRWNW",
        "DetailPageURL": "https://www.amazon.com/dp/B08N5WRWNW",
        "ItemInfo": {
          "Title": {
            "DisplayValue": "Echo Dot (4th Gen) | Smart speaker with Alexa | Charcoal"
          }
        },
        "Offers": {
          "Listings": [{
            "Price": {
              "Amount": 4999,
              "Currency": "USD",
              "DisplayAmount": "$49.99"
            }
          }]
        }
      }
    ]
  }
}
```

## Testing the Demo

1. Start the proxy service:
   ```bash
   npm run dev
   ```

2. Test endpoints using curl or your favorite HTTP client

3. Check the console logs for mock response indicators: `🎭 Mock response for amazon:searchitems`

4. View the client demo at: `http://localhost:3000` (if built with `npm run build`)

## Next Steps

To connect to real APIs:
1. Get actual API keys from Amazon, Rakuten, Zalando
2. Update `config/tenants.json` with real API keys
3. The proxy will automatically fall back to real API calls when mock data isn't available