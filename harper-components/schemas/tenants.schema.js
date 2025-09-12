/**
 * Tenants Schema - Alpine Gear Co Tenant Configuration
 * Stores tenant configuration in Harper cold storage instead of JSON files
 */

export const tenantsSchema = {
  name: 'tenants',
  description: 'Outdoor gear retailer tenant configurations',
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique tenant identifier'
    },
    name: {
      type: 'string',
      required: true,
      description: 'Display name of the tenant'
    },
    baseUrl: {
      type: 'string',
      required: true,
      description: 'API base URL for the tenant'
    },
    apiKey: {
      type: 'string',
      required: true,
      description: 'API key for tenant authentication'
    },
    apiKeyHeader: {
      type: 'string',
      required: true,
      description: 'Header name for API key'
    },
    responseFormat: {
      type: 'string',
      required: true,
      description: 'Expected response format from tenant API'
    },
    recommendationLimit: {
      type: 'number',
      required: true,
      description: 'Maximum number of recommendations to return'
    },
    personalizationBoost: {
      type: 'number',
      required: true,
      description: 'Boost factor for personalized results'
    },
    maxDiscount: {
      type: 'number',
      required: true,
      description: 'Maximum discount percentage allowed'
    },
    pricingStrategy: {
      type: 'string',
      required: true,
      description: 'Pricing optimization strategy'
    },
    categoryWeights: {
      type: 'json',
      required: true,
      description: 'Outdoor gear category weighting configuration',
      schema: {
        type: 'object',
        additionalProperties: { type: 'number' }
      }
    },
    endpoints: {
      type: 'json',
      required: true,
      description: 'Endpoint configuration for caching and personalization',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            pattern: { type: 'string' },
            cacheable: { type: 'boolean' },
            cacheTTL: { type: 'number' },
            personalization: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                type: { type: 'string' }
              }
            }
          }
        }
      }
    },
    segmentationRules: {
      type: 'json',
      required: true,
      description: 'User segmentation rules',
      schema: {
        type: 'object',
        properties: {
          purchaseThreshold: { type: 'number' },
          valueThreshold: { type: 'number' },
          frequencyThreshold: { type: 'number' }
        }
      }
    },
    contentRules: {
      type: 'json',
      required: true,
      description: 'Content personalization rules',
      schema: {
        type: 'object',
        properties: {
          purchaseIntent: {
            type: 'object',
            properties: {
              callToAction: { type: 'string' },
              urgency: { type: 'string' }
            }
          },
          mobile: {
            type: 'object',
            properties: {
              layout: { type: 'string' },
              imageSize: { type: 'string' }
            }
          },
          darkTheme: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' }
            }
          }
        }
      }
    },
    rateLimits: {
      type: 'json',
      required: true,
      description: 'Rate limiting configuration',
      schema: {
        type: 'object',
        properties: {
          requestsPerSecond: { type: 'number' },
          requestsPerMinute: { type: 'number' },
          requestsPerHour: { type: 'number' }
        }
      }
    },
    headers: {
      type: 'json',
      required: true,
      description: 'Default headers to send with requests',
      schema: {
        type: 'object',
        additionalProperties: { type: 'string' }
      }
    },
    active: {
      type: 'boolean',
      required: true,
      default: true,
      description: 'Whether this tenant is active'
    },
    created_at: {
      type: 'date',
      required: true,
      default: () => new Date(),
      description: 'When this tenant configuration was created'
    },
    updated_at: {
      type: 'date',
      required: true,
      default: () => new Date(),
      description: 'When this tenant configuration was last updated'
    }
  },
  indexes: [
    { fields: ['active'] },
    { fields: ['created_at'] },
    { fields: ['name'] }
  ]
};

export default tenantsSchema;