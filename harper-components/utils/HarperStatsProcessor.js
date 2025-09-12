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
   * Get outdoor gear specific analytics
   */
  async getOutdoorGearAnalytics(startDate, endDate) {
    try {
      // Activity breakdown
      const activityBreakdown = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence,
          AVG(inference_time) as avg_inference_time
        FROM statistics
        WHERE created_at >= '${startDate.toISOString()}'
        AND created_at <= '${endDate.toISOString()}'
        AND JSON_VALID(input_metadata)
        GROUP BY input_metadata->>'$.activity'
        ORDER BY count DESC
      `);

      // Gear category performance
      const gearCategoryPerformance = await this.dataService.harper.sql(`
        SELECT 
          top_prediction->>'$.category' as category,
          COUNT(*) as recommendations,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence,
          COUNT(CASE WHEN CAST(top_prediction->>'$.probability' AS REAL) > 0.8 THEN 1 END) as high_confidence_count
        FROM statistics
        WHERE created_at >= '${startDate.toISOString()}'
        AND created_at <= '${endDate.toISOString()}'
        AND JSON_VALID(top_prediction)
        GROUP BY top_prediction->>'$.category'
        ORDER BY recommendations DESC
      `);

      // Seasonal trends
      const seasonalTrends = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.season' as season,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence
        FROM statistics
        WHERE created_at >= '${startDate.toISOString()}'
        AND created_at <= '${endDate.toISOString()}'
        AND JSON_VALID(input_metadata)
        GROUP BY input_metadata->>'$.season'
      `);

      // Experience level analysis
      const experienceLevelAnalysis = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.experience' as experience_level,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence,
          AVG(inference_time) as avg_processing_time
        FROM statistics
        WHERE created_at >= '${startDate.toISOString()}'
        AND created_at <= '${endDate.toISOString()}'
        AND JSON_VALID(input_metadata)
        GROUP BY input_metadata->>'$.experience'
      `);

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
      const dailyPerformance = await this.dataService.harper.sql(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as inference_count,
          AVG(inference_time) as avg_inference_time,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence,
          COUNT(CASE WHEN inference_time > 100 THEN 1 END) as slow_inferences
        FROM statistics
        WHERE created_at >= '${startDate.toISOString()}'
        AND created_at <= '${endDate.toISOString()}'
        AND JSON_VALID(top_prediction)
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

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
      const engagementData = await this.dataService.harper.sql(`
        SELECT 
          COUNT(DISTINCT s.session_id) as unique_sessions,
          COUNT(*) as total_interactions,
          AVG(sess.total_inferences) as avg_inferences_per_session,
          COUNT(CASE WHEN f.is_correct = true THEN 1 END) as positive_feedback,
          COUNT(f.id) as total_feedback
        FROM statistics s
        LEFT JOIN sessions sess ON s.session_id = sess.id
        LEFT JOIN user_feedback f ON s.id = f.stat_id
        WHERE s.created_at >= '${startDate.toISOString()}'
        AND s.created_at <= '${endDate.toISOString()}'
      `);

      return engagementData[0] || {};

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
      const results = await this.dataService.harper.sql(`
        SELECT 
          s.input_metadata->>'$.activity' as activity,
          AVG(CASE WHEN f.is_correct = true THEN 1.0 ELSE 0.0 END) as accuracy
        FROM statistics s
        JOIN user_feedback f ON s.id = f.stat_id
        WHERE JSON_VALID(s.input_metadata)
        GROUP BY s.input_metadata->>'$.activity'
        HAVING COUNT(*) >= 10
      `);

      return results.map(r => [r.activity, r.accuracy]);
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