/**
 * Harper Data Service
 * Demonstrates Harper-native data access patterns for AI applications
 * 
 * NOTE: Some complex aggregation queries still use .sql() for advanced operations
 * like JSON extraction, JOINs, and statistical functions. In production, you might:
 * - Use Harper's native aggregation features when available
 * - Implement client-side aggregation for complex statistics  
 * - Use Harper's built-in analytics capabilities
 * - Cache pre-computed aggregations for performance
 * 
 * The key patterns demonstrated are Harper-native CRUD operations using:
 * - insert() for creating records
 * - searchByValue() and searchByConditions() for querying
 * - update() for modifications
 * - delete() for cleanup
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
      // Get daily statistics aggregation using Harper-native operations
      const todayStart = new Date(today);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayStatistics = await this.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: todayStart.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than_or_equal', 
            search_value: todayEnd.toISOString()
          }
        ],
        get_attributes: ['*']
      });
      
      // Calculate aggregations client-side
      const inferenceTimes = todayStatistics.map(s => s.inference_time || 0).filter(t => t > 0);
      const uniqueSessions = new Set(todayStatistics.map(s => s.session_id)).size;
      
      const dailyStats = [{
        total_inferences: todayStatistics.length,
        average_inference_time: inferenceTimes.length > 0 ? inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length : 0,
        min_inference_time: inferenceTimes.length > 0 ? Math.min(...inferenceTimes) : 0,
        max_inference_time: inferenceTimes.length > 0 ? Math.max(...inferenceTimes) : 0,
        unique_sessions: uniqueSessions
      }];

      // Calculate average confidence from predictions client-side
      const confidenceValues = todayStatistics
        .filter(s => s.top_prediction && s.top_prediction.probability)
        .map(s => parseFloat(s.top_prediction.probability));
      
      const confidenceStats = [{
        average_confidence: confidenceValues.length > 0 ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0
      }];

      // Get accuracy from user feedback using Harper-native operations
      const todayStatIds = todayStatistics.map(s => s.id);
      
      let todayFeedback = [];
      if (todayStatIds.length > 0) {
        // Get feedback for today's statistics
        const allFeedback = await this.harper.searchByValue('user_feedback', '*', {
          operation: 'search_by_value',
          database: 'data',
          table: 'user_feedback',
          search_attribute: '*',
          search_value: '*',
          get_attributes: ['*']
        });
        
        todayFeedback = allFeedback.filter(f => todayStatIds.includes(f.stat_id));
      }
      
      const accuracyStats = [{
        accuracy_rate: todayFeedback.length > 0 ? 
          todayFeedback.filter(f => f.is_correct === true).length / todayFeedback.length : 0
      }];

      // Calculate top activities client-side
      const activityMap = new Map();
      
      todayStatistics.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        const confidence = stat.top_prediction?.probability;
        
        if (activity && confidence) {
          if (!activityMap.has(activity)) {
            activityMap.set(activity, { count: 0, totalConfidence: 0, confidenceScores: [] });
          }
          
          const data = activityMap.get(activity);
          data.count++;
          data.totalConfidence += parseFloat(confidence);
          data.confidenceScores.push(parseFloat(confidence));
        }
      });
      
      const topActivities = Array.from(activityMap.entries())
        .map(([activity, data]) => ({
          activity,
          count: data.count,
          avgConfidence: data.count > 0 ? data.totalConfidence / data.count : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

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
      // Build search conditions for Harper-native query
      const conditions = [];
      
      if (filters.startDate) {
        conditions.push({
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: filters.startDate.toISOString()
        });
      }
      
      if (filters.endDate) {
        conditions.push({
          search_attribute: 'created_at',
          search_type: 'less_than_or_equal',
          search_value: filters.endDate.toISOString()
        });
      }
      
      if (filters.sessionId) {
        conditions.push({
          search_attribute: 'session_id',
          search_value: filters.sessionId
        });
      }

      // Get filtered statistics using Harper-native operations
      let filteredStats;
      if (conditions.length > 0) {
        filteredStats = await this.harper.searchByConditions('statistics', {
          operation: 'search_by_conditions',
          database: 'data',
          table: 'statistics',
          conditions,
          get_attributes: ['*']
        });
      } else {
        filteredStats = await this.harper.searchByValue('statistics', '*', {
          operation: 'search_by_value',
          database: 'data', 
          table: 'statistics',
          search_attribute: '*',
          search_value: '*',
          get_attributes: ['*']
        });
      }
      
      // Calculate summary statistics client-side
      const inferenceTimes = filteredStats.map(s => s.inference_time || 0).filter(t => t > 0);
      const confidenceValues = filteredStats
        .filter(s => s.top_prediction && s.top_prediction.probability)
        .map(s => parseFloat(s.top_prediction.probability));
      const createdDates = filteredStats.map(s => new Date(s.created_at)).sort((a, b) => a - b);
      const uniqueSessions = new Set(filteredStats.map(s => s.session_id)).size;
      
      const summary = [{
        total_inferences: filteredStats.length,
        unique_sessions: uniqueSessions,
        avg_inference_time: inferenceTimes.length > 0 ? inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length : 0,
        min_inference_time: inferenceTimes.length > 0 ? Math.min(...inferenceTimes) : 0,
        max_inference_time: inferenceTimes.length > 0 ? Math.max(...inferenceTimes) : 0,
        avg_confidence: confidenceValues.length > 0 ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0,
        first_inference: createdDates.length > 0 ? createdDates[0] : null,
        last_inference: createdDates.length > 0 ? createdDates[createdDates.length - 1] : null
      }];

      // Calculate top predictions client-side
      const predictionMap = new Map();
      
      filteredStats
        .filter(s => s.top_prediction && s.top_prediction.className && s.top_prediction.probability)
        .forEach(stat => {
          const className = stat.top_prediction.className;
          const probability = parseFloat(stat.top_prediction.probability);
          
          if (!predictionMap.has(className)) {
            predictionMap.set(className, { count: 0, totalProbability: 0 });
          }
          
          const data = predictionMap.get(className);
          data.count++;
          data.totalProbability += probability;
        });
      
      const topPredictions = Array.from(predictionMap.entries())
        .map(([class_name, data]) => ({
          class_name,
          count: data.count,
          avg_probability: data.count > 0 ? data.totalProbability / data.count : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Calculate hourly performance for last 24 hours client-side
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recent24hStats = filteredStats.filter(s => new Date(s.created_at) >= last24Hours);
      const hourlyMap = new Map();
      
      recent24hStats.forEach(stat => {
        const hour = new Date(stat.created_at).getHours();
        
        if (!hourlyMap.has(hour)) {
          hourlyMap.set(hour, { count: 0, totalTime: 0 });
        }
        
        const data = hourlyMap.get(hour);
        data.count++;
        data.totalTime += (stat.inference_time || 0);
      });
      
      const hourlyPerformance = Array.from(hourlyMap.entries())
        .map(([hour, data]) => ({
          hour,
          count: data.count,
          avg_time: data.count > 0 ? data.totalTime / data.count : 0
        }))
        .sort((a, b) => a.hour - b.hour);

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

      // Get all statistics using Harper-native operations\n      const allStatistics = await this.harper.searchByValue('statistics', '*', {\n        operation: 'search_by_value',\n        database: 'data',\n        table: 'statistics',\n        search_attribute: '*',\n        search_value: '*',\n        get_attributes: ['*']\n      });\n      \n      // Filter by minimum confidence and process client-side\n      const filteredStats = allStatistics\n        .filter(s => {\n          if (!s.top_prediction || !s.top_prediction.probability) return false;\n          return parseFloat(s.top_prediction.probability) >= minConfidence;\n        })\n        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))\n        .slice(0, limit);\n      \n      let data = filteredStats.map(s => ({\n        id: s.id,\n        timestamp: s.timestamp,\n        model_version: s.model_version,\n        inference_time: s.inference_time,\n        top_prediction: s.top_prediction,\n        all_predictions: s.all_predictions,\n        input_metadata: s.input_metadata\n      }));\n      \n      if (includeUserFeedback) {\n        // Get all user feedback for JOIN simulation\n        const allFeedback = await this.harper.searchByValue('user_feedback', '*', {\n          operation: 'search_by_value', \n          database: 'data',\n          table: 'user_feedback',\n          search_attribute: '*',\n          search_value: '*',\n          get_attributes: ['*']\n        });\n        \n        // Create feedback lookup map\n        const feedbackMap = new Map();\n        allFeedback.forEach(f => feedbackMap.set(f.stat_id, f));\n        \n        // Simulate LEFT JOIN by adding feedback data\n        data = data.map(record => {\n          const feedback = feedbackMap.get(record.id);\n          return {\n            ...record,\n            is_correct: feedback?.is_correct || null,\n            corrected_label: feedback?.corrected_label || null,\n            feedback_confidence: feedback?.confidence || null\n          };\n        });\n      }\n\n      // Data is now processed using Harper-native operations
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
      // Delete old statistics using Harper-native operations
      const allStats = await this.harper.searchByValue('statistics', '*', {
        operation: 'search_by_value',
        database: 'data',
        table: 'statistics',
        search_attribute: '*',
        search_value: '*',
        get_attributes: ['id', 'created_at']
      });
      
      // Filter old statistics client-side
      const oldStats = allStats.filter(stat => new Date(stat.created_at) < cutoffDate);
      
      // Delete old statistics using Harper-native delete operation
      let deletedStatsCount = 0;
      for (const stat of oldStats) {
        try {
          await this.harper.delete('statistics', [stat.id]);
          deletedStatsCount++;
        } catch (error) {
          console.warn(`Failed to delete statistic ${stat.id}:`, error);
        }
      }
      
      const deletedStats = { length: deletedStatsCount };

      // Clean up orphaned sessions
      // Get all session IDs that have statistics
      const statsWithSessions = await this.harper.searchByValue('statistics', 'session_id', '*');
      const activeSessionIds = new Set(statsWithSessions.map(stat => stat.session_id));
      
      // Get all sessions and filter out active ones
      const allSessions = await this.harper.searchByValue('sessions', 'id', '*');
      const orphanedSessions = allSessions.filter(session => !activeSessionIds.has(session.id));
      
      // Delete orphaned sessions
      let deletedSessionCount = 0;
      for (const session of orphanedSessions) {
        try {
          await this.harper.delete('sessions', session.id);
          deletedSessionCount++;
        } catch (error) {
          console.warn(`Failed to delete session ${session.id}:`, error);
        }
      }
      
      const deletedSessions = { length: deletedSessionCount };

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
      // Get all performance metrics and filter by date range
      const allMetrics = await this.harper.searchByValue('performance_metrics', 'date', '*');
      
      return allMetrics
        .filter(metric => {
          const metricDate = new Date(metric.date);
          return metricDate >= new Date(startDate) && metricDate <= new Date(endDate);
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }
}

export default HarperDataService;