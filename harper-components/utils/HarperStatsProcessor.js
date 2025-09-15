/**
 * Harper Statistics Processor
 * Analyzes and processes outdoor gear inference statistics using Harper data layer
 * Provides insights and prepares data for outdoor gear model retraining
 */

import HarperDataService from './HarperDataService.js';

export class HarperStatsProcessor {
  constructor(harperDataService) {
    this.dataService = harperDataService;
    this.confidenceThresholds = {
      low: 0.6,
      high: 0.85
    };
    this.performanceThresholds = {
      slowInference: 100, // ms
      fastInference: 30,  // ms
      highMemory: 150 * 1024 * 1024 // 150MB
    };
  }

  /**
   * Process incoming outdoor gear statistics for insights
   */
  async processIncomingStats(statistics) {
    const insights = {
      batchSize: statistics.length,
      averageInferenceTime: 0,
      averageConfidence: 0,
      lowConfidencePredictions: [],
      gearCategoryDistribution: {},
      activityDistribution: {},
      seasonalTrends: {},
      performanceFlags: [],
      outdoorSpecificMetrics: {}
    };

    let totalInferenceTime = 0;
    let totalConfidence = 0;
    const activities = new Map();
    const seasons = new Map();
    const gearTypes = new Map();

    for (const stat of statistics) {
      // Accumulate inference times
      totalInferenceTime += stat.inferenceTime;

      // Accumulate confidence scores
      const topConfidence = stat.topPrediction.probability;
      totalConfidence += topConfidence;

      // Track low confidence predictions for outdoor gear
      if (topConfidence < this.confidenceThresholds.low) {
        insights.lowConfidencePredictions.push({
          id: stat.id,
          className: stat.topPrediction.className,
          confidence: topConfidence,
          timestamp: stat.timestamp,
          activity: stat.inputMetadata?.activity,
          experience: stat.inputMetadata?.experience
        });
      }

      // Track gear category distribution
      const gearCategory = stat.topPrediction.category || stat.topPrediction.className;
      insights.gearCategoryDistribution[gearCategory] = (insights.gearCategoryDistribution[gearCategory] || 0) + 1;

      // Track activity distribution for outdoor activities
      if (stat.inputMetadata?.activity) {
        const activity = stat.inputMetadata.activity;
        activities.set(activity, (activities.get(activity) || 0) + 1);
        insights.activityDistribution[activity] = activities.get(activity);
      }

      // Track seasonal trends
      if (stat.inputMetadata?.season) {
        const season = stat.inputMetadata.season;
        seasons.set(season, (seasons.get(season) || 0) + 1);
        insights.seasonalTrends[season] = seasons.get(season);
      }

      // Check for performance issues with outdoor gear inference
      if (stat.inferenceTime > this.performanceThresholds.slowInference) {
        insights.performanceFlags.push({
          type: 'slow_inference',
          statId: stat.id,
          value: stat.inferenceTime,
          threshold: this.performanceThresholds.slowInference,
          activity: stat.inputMetadata?.activity
        });
      }

      // Check memory usage for complex outdoor gear models
      if (stat.memoryUsage?.heapUsed > this.performanceThresholds.highMemory) {
        insights.performanceFlags.push({
          type: 'high_memory',
          statId: stat.id,
          value: stat.memoryUsage.heapUsed,
          threshold: this.performanceThresholds.highMemory
        });
      }
    }

    // Calculate averages
    insights.averageInferenceTime = totalInferenceTime / statistics.length;
    insights.averageConfidence = totalConfidence / statistics.length;

    // Calculate outdoor gear specific metrics
    insights.outdoorSpecificMetrics = await this.calculateOutdoorMetrics(statistics);

    return insights;
  }

  /**
   * Calculate outdoor gear specific metrics
   */
  async calculateOutdoorMetrics(statistics) {
    const metrics = {
      experienceLevelBreakdown: {},
      activityAccuracy: {},
      seasonalPreferences: {},
      gearCompatibilitySuccess: 0,
      personalizedRecommendationRate: 0
    };

    // Analyze by experience level
    const experienceLevels = ['beginner', 'intermediate', 'expert'];
    for (const level of experienceLevels) {
      const levelStats = statistics.filter(s => s.inputMetadata?.experience === level);
      if (levelStats.length > 0) {
        metrics.experienceLevelBreakdown[level] = {
          count: levelStats.length,
          averageConfidence: levelStats.reduce((sum, s) => sum + s.topPrediction.probability, 0) / levelStats.length,
          topCategories: this.getTopCategories(levelStats, 3)
        };
      }
    }

    // Calculate activity-specific accuracy (requires feedback data)
    const activitiesWithFeedback = await this.getActivitiesWithFeedback();
    for (const [activity, accuracy] of activitiesWithFeedback) {
      metrics.activityAccuracy[activity] = accuracy;
    }

    // Analyze seasonal preferences
    const currentSeason = this.getCurrentSeason();
    const seasonalStats = statistics.filter(s => s.inputMetadata?.season === currentSeason);
    if (seasonalStats.length > 0) {
      metrics.seasonalPreferences = {
        currentSeason,
        recommendationCount: seasonalStats.length,
        topGearTypes: this.getTopCategories(seasonalStats, 5),
        averageSeasonalConfidence: seasonalStats.reduce((sum, s) => sum + s.topPrediction.probability, 0) / seasonalStats.length
      };
    }

    // Calculate personalization success rate
    const personalizedStats = statistics.filter(s => s.topPrediction.probability > this.confidenceThresholds.high);
    metrics.personalizedRecommendationRate = personalizedStats.length / statistics.length;

    return metrics;
  }

  /**
   * Generate comprehensive analytics report for outdoor gear AI
   */
  async generateAnalyticsReport(dateRange = 7) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (dateRange * 24 * 60 * 60 * 1000));

      // Get basic statistics summary
      const summary = await this.dataService.getStatisticsSummary({
        startDate,
        endDate
      });

      // Get outdoor gear specific analytics
      const outdoorAnalytics = await this.getOutdoorGearAnalytics(startDate, endDate);

      // Get performance trends
      const performanceTrends = await this.getPerformanceTrends(startDate, endDate);

      // Get user engagement metrics
      const engagementMetrics = await this.getUserEngagementMetrics(startDate, endDate);

      return {
        reportDate: new Date(),
        dateRange: { startDate, endDate, days: dateRange },
        summary,
        outdoorAnalytics,
        performanceTrends,
        engagementMetrics,
        recommendations: this.generateRecommendations(summary, outdoorAnalytics, performanceTrends)
      };

    } catch (error) {
      console.error('Error generating analytics report:', error);
      throw error;
    }
  }

  /**
   * Get outdoor gear specific analytics using Harper-native operations
   */
  async getOutdoorGearAnalytics(startDate, endDate) {
    try {
      // Get all statistics for the date range using Harper-native search
      const dateRangeStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: startDate.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than_or_equal',
            search_value: endDate.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Activity breakdown - client-side processing
      const activityMap = new Map();
      dateRangeStats.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        const inferenceTime = stat.inference_time || 0;
        
        if (activity) {
          if (!activityMap.has(activity)) {
            activityMap.set(activity, { count: 0, totalConfidence: 0, totalInferenceTime: 0 });
          }
          const data = activityMap.get(activity);
          data.count++;
          data.totalConfidence += confidence;
          data.totalInferenceTime += inferenceTime;
        }
      });

      const activityBreakdown = Array.from(activityMap.entries())
        .map(([activity, data]) => ({
          activity,
          count: data.count,
          avg_confidence: data.count > 0 ? data.totalConfidence / data.count : 0,
          avg_inference_time: data.count > 0 ? data.totalInferenceTime / data.count : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Gear category performance - client-side processing  
      const categoryMap = new Map();
      dateRangeStats.forEach(stat => {
        const category = stat.top_prediction?.category;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        
        if (category) {
          if (!categoryMap.has(category)) {
            categoryMap.set(category, { recommendations: 0, totalConfidence: 0, highConfidenceCount: 0 });
          }
          const data = categoryMap.get(category);
          data.recommendations++;
          data.totalConfidence += confidence;
          if (confidence > 0.8) data.highConfidenceCount++;
        }
      });

      const gearCategoryPerformance = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          recommendations: data.recommendations,
          avg_confidence: data.recommendations > 0 ? data.totalConfidence / data.recommendations : 0,
          high_confidence_count: data.highConfidenceCount
        }))
        .sort((a, b) => b.recommendations - a.recommendations);

      // Seasonal trends - client-side processing
      const seasonMap = new Map();
      dateRangeStats.forEach(stat => {
        const season = stat.input_metadata?.season;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        
        if (season) {
          if (!seasonMap.has(season)) {
            seasonMap.set(season, { count: 0, totalConfidence: 0 });
          }
          const data = seasonMap.get(season);
          data.count++;
          data.totalConfidence += confidence;
        }
      });

      const seasonalTrends = Array.from(seasonMap.entries())
        .map(([season, data]) => ({
          season,
          count: data.count,
          avg_confidence: data.count > 0 ? data.totalConfidence / data.count : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Experience level analysis - client-side processing
      const experienceMap = new Map();
      dateRangeStats.forEach(stat => {
        const experience = stat.input_metadata?.experience;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        const inferenceTime = stat.inference_time || 0;
        
        if (experience) {
          if (!experienceMap.has(experience)) {
            experienceMap.set(experience, { count: 0, totalConfidence: 0, totalProcessingTime: 0 });
          }
          const data = experienceMap.get(experience);
          data.count++;
          data.totalConfidence += confidence;
          data.totalProcessingTime += inferenceTime;
        }
      });

      const experienceLevelAnalysis = Array.from(experienceMap.entries())
        .map(([experience_level, data]) => ({
          experience_level,
          count: data.count,
          avg_confidence: data.count > 0 ? data.totalConfidence / data.count : 0,
          avg_processing_time: data.count > 0 ? data.totalProcessingTime / data.count : 0
        }))
        .sort((a, b) => b.count - a.count);

      return {
        activityBreakdown,
        gearCategoryPerformance,
        seasonalTrends,
        experienceLevelAnalysis
      };

    } catch (error) {
      console.error('Error getting outdoor gear analytics:', error);
      return {};
    }
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(startDate, endDate) {
    try {
      // Get statistics for the date range using Harper-native search
      const dateRangeStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: startDate.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than_or_equal',
            search_value: endDate.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Group by date and calculate daily performance metrics - client-side processing
      const dailyMap = new Map();
      dateRangeStats.forEach(stat => {
        // Extract date part from timestamp
        const date = new Date(stat.created_at).toISOString().split('T')[0];
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        const inferenceTime = stat.inference_time || 0;
        
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            inference_count: 0,
            totalInferenceTime: 0,
            totalConfidence: 0,
            slow_inferences: 0
          });
        }
        
        const dayData = dailyMap.get(date);
        dayData.inference_count++;
        dayData.totalInferenceTime += inferenceTime;
        dayData.totalConfidence += confidence;
        if (inferenceTime > 100) {
          dayData.slow_inferences++;
        }
      });

      const dailyPerformance = Array.from(dailyMap.entries())
        .map(([date, data]) => ({
          date,
          inference_count: data.inference_count,
          avg_inference_time: data.inference_count > 0 ? data.totalInferenceTime / data.inference_count : 0,
          avg_confidence: data.inference_count > 0 ? data.totalConfidence / data.inference_count : 0,
          slow_inferences: data.slow_inferences
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return { dailyPerformance };

    } catch (error) {
      console.error('Error getting performance trends:', error);
      return {};
    }
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(startDate, endDate) {
    try {
      // Get statistics for the date range
      const statistics = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: startDate.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than_or_equal',
            search_value: endDate.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Get sessions data
      const sessions = await this.dataService.harper.searchByConditions('sessions', {
        operation: 'search_by_conditions', 
        database: 'data',
        table: 'sessions',
        conditions: [],
        get_attributes: ['*']
      });

      // Get user feedback data
      const userFeedback = await this.dataService.harper.searchByConditions('user_feedback', {
        operation: 'search_by_conditions',
        database: 'data', 
        table: 'user_feedback',
        conditions: [],
        get_attributes: ['*']
      });

      // Create lookup maps for efficient joining - client-side processing
      const sessionMap = new Map();
      sessions.forEach(session => {
        sessionMap.set(session.id, session);
      });

      const feedbackMap = new Map();
      userFeedback.forEach(feedback => {
        if (!feedbackMap.has(feedback.stat_id)) {
          feedbackMap.set(feedback.stat_id, []);
        }
        feedbackMap.get(feedback.stat_id).push(feedback);
      });

      // Calculate engagement metrics
      const uniqueSessions = new Set();
      let totalSessionInferences = 0;
      let sessionCount = 0;
      let positiveFeedback = 0;
      let totalFeedback = 0;

      statistics.forEach(stat => {
        // Count unique sessions
        if (stat.session_id) {
          uniqueSessions.add(stat.session_id);
          
          // Add session inference data for averaging
          const session = sessionMap.get(stat.session_id);
          if (session && session.total_inferences) {
            totalSessionInferences += session.total_inferences;
            sessionCount++;
          }
        }

        // Count feedback
        const feedback = feedbackMap.get(stat.id);
        if (feedback) {
          feedback.forEach(f => {
            totalFeedback++;
            if (f.is_correct === true) {
              positiveFeedback++;
            }
          });
        }
      });

      return {
        unique_sessions: uniqueSessions.size,
        total_interactions: statistics.length,
        avg_inferences_per_session: sessionCount > 0 ? totalSessionInferences / sessionCount : 0,
        positive_feedback: positiveFeedback,
        total_feedback: totalFeedback
      };

    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      return {};
    }
  }

  /**
   * Generate recommendations based on analytics
   */
  generateRecommendations(summary, outdoorAnalytics, performanceTrends) {
    const recommendations = [];

    // Performance recommendations
    if (summary.avg_inference_time > this.performanceThresholds.slowInference) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Optimize Outdoor Gear Model Performance',
        description: `Average inference time (${summary.avg_inference_time.toFixed(0)}ms) exceeds threshold. Consider model optimization or hardware scaling.`,
        action: 'Investigate model complexity and consider quantization for outdoor gear models.'
      });
    }

    // Confidence recommendations
    if (summary.avg_confidence < this.confidenceThresholds.high) {
      recommendations.push({
        type: 'accuracy',
        priority: 'medium',
        title: 'Improve Outdoor Gear Recommendation Confidence',
        description: `Average confidence (${(summary.avg_confidence * 100).toFixed(1)}%) could be improved for better outdoor gear recommendations.`,
        action: 'Consider retraining with more outdoor gear data or improving feature engineering.'
      });
    }

    // Activity-specific recommendations
    if (outdoorAnalytics.activityBreakdown) {
      const lowPerformingActivities = outdoorAnalytics.activityBreakdown.filter(a => a.avg_confidence < 0.7);
      if (lowPerformingActivities.length > 0) {
        recommendations.push({
          type: 'model_improvement',
          priority: 'medium',
          title: 'Improve Specific Outdoor Activity Recommendations',
          description: `Activities with low confidence: ${lowPerformingActivities.map(a => a.activity).join(', ')}`,
          action: 'Collect more training data for these specific outdoor activities.'
        });
      }
    }

    return recommendations;
  }

  /**
   * Helper methods
   */
  getTopCategories(statistics, limit = 5) {
    const categoryCount = {};
    statistics.forEach(stat => {
      const category = stat.topPrediction.category || stat.topPrediction.className;
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    return Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category, count]) => ({ category, count }));
  }

  async getActivitiesWithFeedback() {
    try {
      // Get all statistics with user feedback using Harper-native operations
      const statistics = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [],
        get_attributes: ['*']
      });

      const userFeedback = await this.dataService.harper.searchByConditions('user_feedback', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'user_feedback', 
        conditions: [],
        get_attributes: ['*']
      });

      // Create feedback lookup map
      const feedbackMap = new Map();
      userFeedback.forEach(feedback => {
        if (!feedbackMap.has(feedback.stat_id)) {
          feedbackMap.set(feedback.stat_id, []);
        }
        feedbackMap.get(feedback.stat_id).push(feedback);
      });

      // Process statistics with feedback - client-side processing
      const activityMetrics = new Map();
      
      statistics.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        const feedback = feedbackMap.get(stat.id);
        
        if (activity && feedback && feedback.length > 0) {
          if (!activityMetrics.has(activity)) {
            activityMetrics.set(activity, { correct: 0, total: 0 });
          }
          
          const metrics = activityMetrics.get(activity);
          feedback.forEach(f => {
            metrics.total++;
            if (f.is_correct === true) {
              metrics.correct++;
            }
          });
        }
      });

      // Filter activities with at least 10 feedback entries and calculate accuracy
      return Array.from(activityMetrics.entries())
        .filter(([activity, metrics]) => metrics.total >= 10)
        .map(([activity, metrics]) => [activity, metrics.correct / metrics.total]);
    } catch (error) {
      console.error('Error getting activities with feedback:', error);
      return [];
    }
  }

  getCurrentSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  /**
   * Get health score for the outdoor gear AI system
   */
  calculateHealthScore(metrics) {
    let score = 100;
    const issues = [];

    // Performance penalty
    if (metrics.avg_inference_time > this.performanceThresholds.slowInference) {
      score -= 20;
      issues.push('Slow inference performance');
    }

    // Confidence penalty
    if (metrics.avg_confidence < this.confidenceThresholds.high) {
      score -= 15;
      issues.push('Low confidence scores');
    }

    // Data volume penalty
    if (metrics.total_inferences < 100) {
      score -= 25;
      issues.push('Insufficient data volume');
    }

    // Feedback penalty
    if (!metrics.feedback_rate || metrics.feedback_rate < 0.1) {
      score -= 10;
      issues.push('Low user feedback rate');
    }

    return {
      score: Math.max(0, score),
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
      issues
    };
  }
}

export default HarperStatsProcessor;