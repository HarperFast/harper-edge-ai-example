/**
 * Statistics Schema for Harper-fabric
 * Stores AI inference statistics for outdoor gear personalization
 */

export const statisticsSchema = {
  name: 'statistics',
  description: 'AI inference statistics for outdoor gear recommendations',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique statistic record identifier'
    },
    
    session_id: {
      type: 'string',
      required: true,
      description: 'Reference to sessions table',
      foreignKey: {
        table: 'sessions',
        field: 'id'
      }
    },
    
    timestamp: {
      type: 'timestamp',
      required: true,
      description: 'When the inference occurred'
    },
    
    model_version: {
      type: 'string',
      required: true,
      description: 'AI model version used for inference'
    },
    
    model_alpha: {
      type: 'number',
      description: 'Model confidence adjustment parameter'
    },
    
    inference_time: {
      type: 'number',
      required: true,
      description: 'Time taken for AI inference in milliseconds'
    },
    
    preprocessing_time: {
      type: 'number',
      default: 0,
      description: 'Time taken for data preprocessing in milliseconds'
    },
    
    total_time: {
      type: 'number',
      required: true,
      description: 'Total processing time in milliseconds'
    },
    
    memory_usage: {
      type: 'json',
      description: 'Memory usage statistics during inference',
      schema: {
        type: 'object',
        properties: {
          rss: { type: 'number' },
          heapTotal: { type: 'number' },
          heapUsed: { type: 'number' },
          external: { type: 'number' }
        }
      }
    },
    
    top_prediction: {
      type: 'json',
      required: true,
      description: 'Top prediction result',
      schema: {
        type: 'object',
        properties: {
          className: { type: 'string' },
          probability: { type: 'number' },
          category: { type: 'string' },
          activity: { type: 'string' }
        }
      }
    },
    
    all_predictions: {
      type: 'json',
      required: true,
      description: 'All prediction results',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            className: { type: 'string' },
            probability: { type: 'number' },
            category: { type: 'string' }
          }
        }
      }
    },
    
    input_metadata: {
      type: 'json',
      description: 'Metadata about the input data',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          activity: { type: 'string' },
          experience: { type: 'string' },
          season: { type: 'string' }
        }
      }
    },
    
    user_feedback: {
      type: 'json',
      description: 'User feedback on the recommendation',
      schema: {
        type: 'object',
        properties: {
          isCorrect: { type: 'boolean' },
          correctedLabel: { type: 'string' },
          confidence: { type: 'number' },
          timestamp: { type: 'number' }
        }
      }
    },
    
    page_url: {
      type: 'string',
      description: 'URL where inference was performed'
    },
    
    created_at: {
      type: 'timestamp',
      default: 'now',
      required: true,
      description: 'Record creation timestamp'
    }
  },
  
  indexes: [
    {
      name: 'idx_statistics_session',
      fields: ['session_id'],
      type: 'btree'
    },
    {
      name: 'idx_statistics_timestamp',
      fields: ['timestamp'],
      type: 'btree'
    },
    {
      name: 'idx_statistics_created',
      fields: ['created_at'],
      type: 'btree'
    },
    {
      name: 'idx_statistics_model',
      fields: ['model_version'],
      type: 'btree'
    }
  ],
  
  constraints: [
    {
      name: 'positive_inference_time',
      type: 'check',
      expression: 'inference_time > 0'
    },
    {
      name: 'positive_total_time',
      type: 'check',
      expression: 'total_time > 0'
    }
  ]
};