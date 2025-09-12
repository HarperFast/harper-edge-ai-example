/**
 * Harper Data Service
 * Replaces SQLite database.js with Harper-native data access
 * Provides data access for AI inference statistics and model retraining
 */

import { v4 as uuidv4 } from 'uuid';

export class HarperDataService {
  constructor(harperClient) {
    this.harper = harperClient;
    this.schemas = [
      'sessions',
      'statistics', 
      'user_feedback',
      'performance_metrics',
      'retraining_jobs'
    ];
  }

  /**
   * Initialize Harper schemas if they don't exist
   */
  async initialize() {
    console.log('Initializing Harper Data Service for outdoor gear AI...');
    
    try {
      // Verify all schemas exist
      for (const schema of this.schemas) {
        const exists = await this.harper.describeTable(schema);
        if (!exists) {
          console.warn(`Schema ${schema} not found - ensure Harper schemas are deployed`);
        }
      }
      
      console.log('Harper Data Service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Harper Data Service:', error);
      throw error;
    }
  }

  /**
   * Store AI inference statistics batch
   */
  async storeStatistics(data) {
    const { sessionId, deviceInfo, statistics, receivedAt } = data;
    
    try {
      // Upsert session
      await this.upsertSession({
        id: sessionId,
        device_info: deviceInfo,
        created_at: receivedAt,
        last_activity: receivedAt,
        total_inferences: statistics.length
      });

      // Store statistics
      let stored = 0;
      for (const stat of statistics) {
        try {
          await this.harper.insert('statistics', {
            id: stat.id,
            session_id: sessionId,
            timestamp: new Date(stat.timestamp),
            model_version: stat.modelVersion,
            model_alpha: stat.modelAlpha,
            inference_time: stat.inferenceTime,
            preprocessing_time: stat.preprocessingTime || 0,
            total_time: stat.totalTime || stat.inferenceTime,
            memory_usage: stat.memoryUsage,
            top_prediction: stat.topPrediction,
            all_predictions: stat.predictions,
            input_metadata: stat.inputMetadata || {},
            user_feedback: stat.userFeedback,
            page_url: stat.pageUrl,
            created_at: new Date()
          });

          // Store user feedback if present
          if (stat.userFeedback && stat.userFeedback.timestamp) {
            await this.storeUserFeedback(stat.id, stat.userFeedback);
          }

          stored++;
        } catch (err) {
          console.error('Error storing statistic:', err);
        }
      }

      // Update daily metrics
      await this.updateDailyMetrics();

      return { stored, total: statistics.length };

    } catch (error) {
      console.error('Error storing statistics batch:', error);
      throw error;
    }
  }

  /**
   * Upsert session record
   */
  async upsertSession(sessionData) {
    try {
      // Try to get existing session
      const existing = await this.harper.searchByHash('sessions', {
        id: sessionData.id
      });

      if (existing && existing.length > 0) {
        // Update existing session
        await this.harper.update('sessions', {
          id: sessionData.id,
          last_activity: sessionData.last_activity,
          total_inferences: existing[0].total_inferences + sessionData.total_inferences
        });
      } else {
        // Insert new session
        await this.harper.insert('sessions', sessionData);
      }
    } catch (error) {
      console.error('Error upserting session:', error);
      throw error;
    }
  }

  /**
   * Store user feedback
   */
  async storeUserFeedback(statId, feedback) {
    try {
      await this.harper.insert('user_feedback', {
        id: uuidv4(),
        stat_id: statId,
        is_correct: feedback.isCorrect,
        corrected_label: feedback.correctedLabel,
        confidence: feedback.confidence,
        feedback_timestamp: new Date(feedback.timestamp),
        feedback_type: feedback.type || 'gear_recommendation',
        additional_notes: feedback.notes,
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error storing user feedback:', error);
      throw error;
    }
  }

  /**
   * Update daily performance metrics
   */
  async updateDailyMetrics() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Get daily statistics aggregation
      const dailyStats = await this.harper.sql(`
        SELECT 
          COUNT(*) as total_inferences,
          AVG(inference_time) as average_inference_time,
          MIN(inference_time) as min_inference_time,
          MAX(inference_time) as max_inference_time,
          COUNT(DISTINCT session_id) as unique_sessions
        FROM statistics
        WHERE DATE(created_at) = '${today}'
      `);

      // Get average confidence from predictions
      const confidenceStats = await this.harper.sql(`
        SELECT AVG(CAST(top_prediction->>'$.probability' AS REAL)) as average_confidence
        FROM statistics
        WHERE DATE(created_at) = '${today}'
        AND JSON_VALID(top_prediction)
      `);

      // Get accuracy from user feedback
      const accuracyStats = await this.harper.sql(`
        SELECT 
          AVG(CASE WHEN is_correct = true THEN 1.0 ELSE 0.0 END) as accuracy_rate
        FROM user_feedback f
        JOIN statistics s ON f.stat_id = s.id
        WHERE DATE(s.created_at) = '${today}'
      `);

      // Get top activities for the day
      const topActivities = await this.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avgConfidence
        FROM statistics
        WHERE DATE(created_at) = '${today}'
        AND JSON_VALID(input_metadata)
        AND JSON_VALID(top_prediction)
        GROUP BY input_metadata->>'$.activity'
        ORDER BY count DESC
        LIMIT 10
      `);

      const metrics = {
        id: `metrics_${today.replace(/-/g, '')}`,
        date: today,
        total_inferences: dailyStats[0]?.total_inferences || 0,
        average_inference_time: dailyStats[0]?.average_inference_time,
        min_inference_time: dailyStats[0]?.min_inference_time,
        max_inference_time: dailyStats[0]?.max_inference_time,
        average_confidence: confidenceStats[0]?.average_confidence,
        accuracy_rate: accuracyStats[0]?.accuracy_rate,
        unique_sessions: dailyStats[0]?.unique_sessions || 0,
        top_activities: topActivities || [],
        created_at: new Date(),
        updated_at: new Date()
      };

      // Upsert daily metrics
      await this.harper.upsert('performance_metrics', metrics);
      
    } catch (error) {
      console.error('Error updating daily metrics:', error);
      throw error;
    }
  }

  /**
   * Get statistics summary with filtering
   */
  async getStatisticsSummary(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      
      if (filters.startDate) {
        whereClause += ` AND created_at >= '${filters.startDate.toISOString()}'`;
      }
      
      if (filters.endDate) {
        whereClause += ` AND created_at <= '${filters.endDate.toISOString()}'`;
      }
      
      if (filters.sessionId) {
        whereClause += ` AND session_id = '${filters.sessionId}'`;
      }

      const summary = await this.harper.sql(`
        SELECT 
          COUNT(*) as total_inferences,
          COUNT(DISTINCT session_id) as unique_sessions,
          AVG(inference_time) as avg_inference_time,
          MIN(inference_time) as min_inference_time,
          MAX(inference_time) as max_inference_time,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence,
          MIN(created_at) as first_inference,
          MAX(created_at) as last_inference
        FROM statistics
        ${whereClause}
      `);

      // Get top predictions
      const topPredictions = await this.harper.sql(`
        SELECT 
          top_prediction->>'$.className' as class_name,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_probability
        FROM statistics
        ${whereClause}
        AND JSON_VALID(top_prediction)
        GROUP BY top_prediction->>'$.className'
        ORDER BY count DESC
        LIMIT 10
      `);

      // Get hourly performance for last 24 hours
      const hourlyPerformance = await this.harper.sql(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count,
          AVG(inference_time) as avg_time
        FROM statistics
        WHERE created_at >= NOW() - INTERVAL 1 DAY
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `);

      return {
        ...summary[0],
        topPredictions,
        hourlyPerformance
      };

    } catch (error) {
      console.error('Error getting statistics summary:', error);
      throw error;
    }
  }

  /**
   * Export training data for model retraining
   */
  async exportTrainingData(options = {}) {
    const { includeUserFeedback = true, minConfidence = 0, limit = 10000 } = options;
    
    try {
      let query = `
        SELECT 
          s.id,
          s.timestamp,
          s.model_version,
          s.inference_time,
          s.top_prediction,
          s.all_predictions,
          s.input_metadata
      `;

      if (includeUserFeedback) {
        query += `,
          f.is_correct,
          f.corrected_label,
          f.confidence as feedback_confidence
        FROM statistics s
        LEFT JOIN user_feedback f ON s.id = f.stat_id
        `;
      } else {
        query += ' FROM statistics s ';
      }

      query += `
        WHERE CAST(s.top_prediction->>'$.probability' AS REAL) >= ${minConfidence}
        AND JSON_VALID(s.top_prediction)
        ORDER BY s.created_at DESC
        LIMIT ${limit}
      `;

      const data = await this.harper.sql(query);
      return data;

    } catch (error) {
      console.error('Error exporting training data:', error);
      throw error;
    }
  }

  /**
   * Create a new retraining job
   */
  async createRetrainingJob(jobConfig) {
    try {
      const job = {
        id: uuidv4(),
        status: 'queued',
        job_type: jobConfig.type || 'incremental_update',
        triggered_at: new Date(),
        data_points_used: 0,
        confidence_threshold: jobConfig.confidenceThreshold || 0.7,
        model_version_before: jobConfig.currentVersion,
        training_config: jobConfig.trainingConfig || {},
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.harper.insert('retraining_jobs', job);
      return job;
    } catch (error) {
      console.error('Error creating retraining job:', error);
      throw error;
    }
  }

  /**
   * Update retraining job status
   */
  async updateRetrainingJob(jobId, updates) {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date()
      };

      await this.harper.update('retraining_jobs', {
        id: jobId,
        ...updateData
      });
    } catch (error) {
      console.error('Error updating retraining job:', error);
      throw error;
    }
  }

  /**
   * Get recent retraining jobs
   */
  async getRetrainingJobs(limit = 50) {
    try {
      return await this.harper.searchByValue('retraining_jobs', 'id', '*', {
        order: 'created_at DESC',
        limit
      });
    } catch (error) {
      console.error('Error getting retraining jobs:', error);
      throw error;
    }
  }

  /**
   * Clean up old statistics (data retention)
   */
  async cleanupOldStatistics(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
    
    try {
      // Delete old statistics
      const deletedStats = await this.harper.sql(`
        DELETE FROM statistics 
        WHERE created_at < '${cutoffDate.toISOString()}'
      `);

      // Clean up orphaned sessions
      const deletedSessions = await this.harper.sql(`
        DELETE FROM sessions 
        WHERE id NOT IN (SELECT DISTINCT session_id FROM statistics)
      `);

      return {
        deletedStatistics: deletedStats.length,
        deletedSessions: deletedSessions.length,
        cutoffDate: cutoffDate.toISOString()
      };
    } catch (error) {
      console.error('Error cleaning up old statistics:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics for date range
   */
  async getPerformanceMetrics(startDate, endDate) {
    try {
      return await this.harper.sql(`
        SELECT * FROM performance_metrics
        WHERE date >= '${startDate}' AND date <= '${endDate}'
        ORDER BY date DESC
      `);
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }
}

export default HarperDataService;