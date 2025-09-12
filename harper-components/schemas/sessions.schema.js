/**
 * Sessions Schema for Harper-fabric
 * Tracks user sessions for outdoor gear personalization
 */

export const sessionsSchema = {
  name: 'sessions',
  description: 'User session tracking for outdoor gear AI personalization',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique session identifier'
    },
    
    device_info: {
      type: 'json',
      description: 'Device and browser information',
      schema: {
        type: 'object',
        properties: {
          userAgent: { type: 'string' },
          platform: { type: 'string' },
          language: { type: 'string' },
          screenResolution: { type: 'string' }
        }
      }
    },
    
    created_at: {
      type: 'timestamp',
      default: 'now',
      required: true,
      description: 'Session creation timestamp'
    },
    
    last_activity: {
      type: 'timestamp',
      default: 'now',
      description: 'Last activity timestamp'
    },
    
    total_inferences: {
      type: 'number',
      default: 0,
      description: 'Total number of AI inferences in this session'
    }
  },
  
  indexes: [
    {
      name: 'idx_sessions_created',
      fields: ['created_at'],
      type: 'btree'
    },
    {
      name: 'idx_sessions_activity',
      fields: ['last_activity'],
      type: 'btree'
    }
  ],
  
  constraints: [
    {
      name: 'positive_inferences',
      type: 'check',
      expression: 'total_inferences >= 0'
    }
  ]
};