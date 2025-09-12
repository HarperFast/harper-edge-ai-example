/**
 * Retraining Jobs Schema for Harper-fabric
 * Tracks AI model retraining jobs for outdoor gear personalization
 */

export const retrainingJobsSchema = {
  name: 'retraining_jobs',
  description: 'AI model retraining job tracking for outdoor gear recommendations',
  
  attributes: {
    id: {
      type: 'string',
      primary: true,
      required: true,
      description: 'Unique job identifier'
    },
    
    status: {
      type: 'string',
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      required: true,
      description: 'Current job status'
    },
    
    job_type: {
      type: 'string',
      enum: ['full_retrain', 'incremental_update', 'seasonal_adjustment', 'feedback_integration'],
      default: 'incremental_update',
      description: 'Type of retraining job'
    },
    
    triggered_at: {
      type: 'timestamp',
      required: true,
      description: 'When the job was triggered'
    },
    
    started_at: {
      type: 'timestamp',
      description: 'When the job actually started processing'
    },
    
    completed_at: {
      type: 'timestamp',
      description: 'When the job completed (success or failure)'
    },
    
    data_points_used: {
      type: 'number',
      default: 0,
      description: 'Number of data points used for retraining'
    },
    
    confidence_threshold: {
      type: 'number',
      description: 'Minimum confidence threshold for including data points',
      validation: {
        min: 0,
        max: 1
      }
    },
    
    model_version_before: {
      type: 'string',
      description: 'Model version before retraining'
    },
    
    model_version_after: {
      type: 'string',
      description: 'Model version after retraining'
    },
    
    performance_improvement: {
      type: 'json',
      description: 'Performance metrics comparison',
      schema: {
        type: 'object',
        properties: {
          accuracyBefore: { type: 'number' },
          accuracyAfter: { type: 'number' },
          avgInferenceTimeBefore: { type: 'number' },
          avgInferenceTimeAfter: { type: 'number' },
          improvement: { type: 'number' }
        }
      }
    },
    
    training_config: {
      type: 'json',
      description: 'Training configuration used',
      schema: {
        type: 'object',
        properties: {
          learningRate: { type: 'number' },
          batchSize: { type: 'number' },
          epochs: { type: 'number' },
          validationSplit: { type: 'number' },
          activities: { 
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    
    result: {
      type: 'json',
      description: 'Detailed job result information',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          error: { type: 'string' },
          metrics: { type: 'object' },
          warnings: { 
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    
    resource_usage: {
      type: 'json',
      description: 'Resource usage during training',
      schema: {
        type: 'object',
        properties: {
          maxMemoryMB: { type: 'number' },
          avgCpuPercent: { type: 'number' },
          durationSeconds: { type: 'number' },
          diskUsageMB: { type: 'number' }
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
      name: 'idx_jobs_status',
      fields: ['status'],
      type: 'btree'
    },
    {
      name: 'idx_jobs_triggered',
      fields: ['triggered_at'],
      type: 'btree'
    },
    {
      name: 'idx_jobs_type',
      fields: ['job_type'],
      type: 'btree'
    },
    {
      name: 'idx_jobs_completed',
      fields: ['completed_at'],
      type: 'btree'
    }
  ],
  
  constraints: [
    {
      name: 'positive_data_points',
      type: 'check',
      expression: 'data_points_used >= 0'
    },
    {
      name: 'valid_completion_order',
      type: 'check',
      expression: 'completed_at IS NULL OR completed_at >= triggered_at'
    }
  ],
  
  triggers: [
    {
      name: 'update_retraining_timestamp',
      event: 'BEFORE UPDATE',
      action: 'SET updated_at = NOW()'
    },
    {
      name: 'set_started_timestamp',
      event: 'BEFORE UPDATE',
      condition: 'OLD.status != "running" AND NEW.status = "running"',
      action: 'SET started_at = NOW()'
    },
    {
      name: 'set_completed_timestamp',
      event: 'BEFORE UPDATE',
      condition: 'OLD.status NOT IN ("completed", "failed", "cancelled") AND NEW.status IN ("completed", "failed", "cancelled")',
      action: 'SET completed_at = NOW()'
    }
  ]
};