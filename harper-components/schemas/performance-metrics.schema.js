/**
 * Performance Metrics Schema for Harper-fabric
 * Daily aggregated performance metrics for outdoor gear AI system
 */

export const performanceMetricsSchema = {
  name: 'performance_metrics',
  description: 'Daily performance metrics for outdoor gear AI personalization',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique metrics record identifier'
    },
    
    date: {
      type: 'date',
      required: true,
      unique: true,
      description: 'Date for these metrics'
    },
    
    total_inferences: {
      type: 'number',
      default: 0,
      description: 'Total number of AI inferences for the day'
    },
    
    average_inference_time: {
      type: 'number',
      description: 'Average inference time in milliseconds'
    },
    
    min_inference_time: {
      type: 'number',
      description: 'Minimum inference time in milliseconds'
    },
    
    max_inference_time: {
      type: 'number',
      description: 'Maximum inference time in milliseconds'
    },
    
    average_confidence: {
      type: 'number',
      description: 'Average prediction confidence (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    accuracy_rate: {
      type: 'number',
      description: 'Accuracy rate based on user feedback (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    unique_sessions: {
      type: 'number',
      default: 0,
      description: 'Number of unique sessions for the day'
    },
    
    top_activities: {
      type: 'json',
      description: 'Most popular outdoor activities for the day',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            activity: { type: 'string' },
            count: { type: 'number' },
            avgConfidence: { type: 'number' }
          }
        }
      }
    },
    
    gear_categories: {
      type: 'json',
      description: 'Breakdown by gear category',
      schema: {
        type: 'object',
        patternProperties: {
          '^[a-zA-Z0-9-_]+$': {
            type: 'object',
            properties: {
              count: { type: 'number' },
              avgTime: { type: 'number' },
              accuracy: { type: 'number' }
            }
          }
        }
      }
    },
    
    seasonal_trends: {
      type: 'json',
      description: 'Seasonal gear trends for the day',
      schema: {
        type: 'object',
        properties: {
          summer: { type: 'number' },
          fall: { type: 'number' },
          winter: { type: 'number' },
          spring: { type: 'number' }
        }
      }
    },
    
    created_at: {
      type: 'timestamp',
      default: 'now',
      required: true,
      description: 'Record creation timestamp'
    },
    
    updated_at: {
      type: 'timestamp',
      default: 'now',
      description: 'Last update timestamp'
    }
  },
  
  indexes: [
    {
      name: 'idx_metrics_date',
      fields: ['date'],
      type: 'btree',
      unique: true
    },
    {
      name: 'idx_metrics_created',
      fields: ['created_at'],
      type: 'btree'
    }
  ],
  
  constraints: [
    {
      name: 'positive_inferences',
      type: 'check',
      expression: 'total_inferences >= 0'
    },
    {
      name: 'positive_sessions',
      type: 'check',
      expression: 'unique_sessions >= 0'
    }
  ],
  
  triggers: [
    {
      name: 'update_metrics_timestamp',
      event: 'BEFORE UPDATE',
      action: 'SET updated_at = NOW()'
    }
  ]
};