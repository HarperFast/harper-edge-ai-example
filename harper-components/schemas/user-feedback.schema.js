/**
 * User Feedback Schema for Harper-fabric
 * Stores user feedback on outdoor gear recommendations for model improvement
 */

export const userFeedbackSchema = {
  name: 'user_feedback',
  description: 'User feedback on outdoor gear AI recommendations',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique feedback identifier'
    },
    
    stat_id: {
      type: 'string',
      required: true,
      description: 'Reference to statistics table',
      foreignKey: {
        table: 'statistics',
        field: 'id'
      }
    },
    
    is_correct: {
      type: 'boolean',
      required: true,
      description: 'Whether the recommendation was correct'
    },
    
    corrected_label: {
      type: 'string',
      description: 'User-provided correct category/activity if recommendation was wrong'
    },
    
    confidence: {
      type: 'number',
      description: 'User confidence in their feedback (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    feedback_timestamp: {
      type: 'timestamp',
      required: true,
      description: 'When the user provided feedback'
    },
    
    feedback_type: {
      type: 'string',
      enum: ['gear_recommendation', 'activity_match', 'experience_level', 'seasonal_appropriateness'],
      description: 'Type of feedback provided'
    },
    
    additional_notes: {
      type: 'string',
      description: 'Additional user comments'
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
      name: 'idx_feedback_stat',
      fields: ['stat_id'],
      type: 'btree'
    },
    {
      name: 'idx_feedback_timestamp',
      fields: ['feedback_timestamp'],
      type: 'btree'
    },
    {
      name: 'idx_feedback_type',
      fields: ['feedback_type'],
      type: 'btree'
    },
    {
      name: 'idx_feedback_correct',
      fields: ['is_correct'],
      type: 'btree'
    }
  ]
};