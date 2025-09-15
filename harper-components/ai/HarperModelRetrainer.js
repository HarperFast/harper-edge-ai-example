/**
 * Harper Model Retrainer
 * Manages model retraining triggers and workflows using Harper data layer
 * Specialized for outdoor gear personalization models
 */

import HarperDataService from '../utils/HarperDataService.js';
import { v4 as uuidv4 } from 'uuid';

export class HarperModelRetrainer {
  constructor(harperDataService) {
    this.dataService = harperDataService;
    this.retrainingJob = null;
    this.retrainingThresholds = {
      minDataPoints: 1000,
      minAccuracyDrop: 0.1,
      maxTimeSinceLastRetrain: 7 * 24 * 60 * 60 * 1000, // 7 days
      minUserFeedback: 100,
      minSeasonalDataPoints: 500, // For seasonal gear adjustments
      activityDriftThreshold: 0.15 // For outdoor activity pattern changes
    };
  }

  /**
   * Check if retraining should be triggered for outdoor gear models
   */
  async checkRetrainingTrigger() {
    const triggers = {
      shouldRetrain: false,
      reasons: [],
      metrics: {},
      recommendedType: 'incremental_update'
    };

    try {
      // Check data volume for outdoor gear predictions using Harper-native search
      const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      const recentStatistics = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [{
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: sevenDaysAgo.toISOString()
        }],
        get_attributes: ['id']
      });
      
      const dataVolume = [{ count: recentStatistics.length }];

      triggers.metrics.dataVolume = dataVolume[0]?.count || 0;

      if (dataVolume[0]?.count >= this.retrainingThresholds.minDataPoints) {
        triggers.reasons.push(`Sufficient outdoor gear data points: ${dataVolume[0].count}`);
      }

      // Check accuracy degradation for outdoor gear recommendations
      const accuracyMetrics = await this.checkOutdoorGearAccuracy();
      triggers.metrics.accuracy = accuracyMetrics;

      if (accuracyMetrics.degraded) {
        triggers.shouldRetrain = true;
        triggers.reasons.push(`Outdoor gear accuracy degradation: ${accuracyMetrics.currentAccuracy.toFixed(2)}`);
      }

      // Check feedback volume from outdoor enthusiasts using Harper-native search
      const recentFeedback = await this.dataService.harper.searchByConditions('user_feedback', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'user_feedback',
        conditions: [{
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: sevenDaysAgo.toISOString()
        }],
        get_attributes: ['id']
      });
      
      const feedbackCount = [{ count: recentFeedback.length }];

      triggers.metrics.feedbackCount = feedbackCount[0]?.count || 0;

      if (feedbackCount[0]?.count >= this.retrainingThresholds.minUserFeedback) {
        triggers.reasons.push(`Sufficient outdoor gear user feedback: ${feedbackCount[0].count}`);
      }

      // Check time since last retrain using Harper-native search
      const completedJobs = await this.dataService.harper.searchByValue('retraining_jobs', 'status', 'completed', ['triggered_at']);
      
      let lastRetrainTime = null;
      if (completedJobs.length > 0) {
        // Find the most recent triggered_at time
        lastRetrainTime = completedJobs
          .map(job => new Date(job.triggered_at).getTime())
          .reduce((max, current) => Math.max(max, current), 0);
      }
      
      const lastRetrain = [{ last_time: lastRetrainTime ? new Date(lastRetrainTime).toISOString() : null }];

      if (lastRetrain[0]?.last_time) {
        const timeSinceLastRetrain = Date.now() - new Date(lastRetrain[0].last_time).getTime();
        triggers.metrics.timeSinceLastRetrain = timeSinceLastRetrain;

        if (timeSinceLastRetrain > this.retrainingThresholds.maxTimeSinceLastRetrain) {
          triggers.shouldRetrain = true;
          triggers.reasons.push('Maximum time since last outdoor gear model retrain exceeded');
        }
      } else {
        triggers.shouldRetrain = true;
        triggers.reasons.push('No previous outdoor gear model retraining found');
        triggers.recommendedType = 'full_retrain';
      }

      // Check for seasonal drift in outdoor gear preferences
      const seasonalDrift = await this.checkSeasonalGearDrift();
      triggers.metrics.seasonalDrift = seasonalDrift;

      if (seasonalDrift.significant) {
        triggers.shouldRetrain = true;
        triggers.reasons.push(`Seasonal outdoor gear drift detected: ${seasonalDrift.score.toFixed(2)}`);
        triggers.recommendedType = 'seasonal_adjustment';
      }

      // Check for activity-based prediction drift
      const activityDrift = await this.checkActivityPredictionDrift();
      triggers.metrics.activityDrift = activityDrift;

      if (activityDrift.significant) {
        triggers.shouldRetrain = true;
        triggers.reasons.push(`Activity pattern drift detected: ${activityDrift.score.toFixed(2)}`);
      }

      // Final decision based on outdoor gear specific criteria
      if (triggers.reasons.length >= 2 && dataVolume[0]?.count >= this.retrainingThresholds.minDataPoints) {
        triggers.shouldRetrain = true;
      }

      return triggers;

    } catch (error) {
      console.error('Error checking retraining trigger:', error);
      return { shouldRetrain: false, reasons: ['Error checking trigger'], metrics: {} };
    }
  }

  /**
   * Check for accuracy degradation in outdoor gear recommendations
   */
  async checkOutdoorGearAccuracy() {
    try {
      // Get recent accuracy from user feedback using Harper-native operations
      const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
      const recentFeedback = await this.dataService.harper.searchByConditions('user_feedback', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'user_feedback',
        conditions: [{
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: threeDaysAgo.toISOString()
        }],
        get_attributes: ['*']
      });

      // Calculate recent accuracy - client-side processing
      let recentCorrect = 0;
      let recentTotal = recentFeedback.length;
      recentFeedback.forEach(feedback => {
        if (feedback.is_correct === true) {
          recentCorrect++;
        }
      });
      const recentAccuracy = [{ accuracy: recentTotal > 0 ? recentCorrect / recentTotal : 1.0 }];

      // Get baseline accuracy (last 30 days before recent period)
      const thirtyThreeDaysAgo = new Date(Date.now() - (33 * 24 * 60 * 60 * 1000));
      const baselineFeedback = await this.dataService.harper.searchByConditions('user_feedback', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'user_feedback',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: thirtyThreeDaysAgo.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than',
            search_value: threeDaysAgo.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Calculate baseline accuracy - client-side processing
      let baselineCorrect = 0;
      let baselineTotal = baselineFeedback.length;
      baselineFeedback.forEach(feedback => {
        if (feedback.is_correct === true) {
          baselineCorrect++;
        }
      });
      const baselineAccuracy = [{ accuracy: baselineTotal > 0 ? baselineCorrect / baselineTotal : 1.0 }];

      const current = recentAccuracy[0]?.accuracy || 1.0;
      const baseline = baselineAccuracy[0]?.accuracy || 1.0;
      const degradation = baseline - current;

      return {
        currentAccuracy: current,
        baselineAccuracy: baseline,
        degradation,
        degraded: degradation > this.retrainingThresholds.minAccuracyDrop
      };

    } catch (error) {
      console.error('Error checking accuracy degradation:', error);
      return { currentAccuracy: 1.0, baselineAccuracy: 1.0, degradation: 0, degraded: false };
    }
  }

  /**
   * Check for seasonal drift in outdoor gear preferences
   */
  async checkSeasonalGearDrift() {
    try {
      const currentSeason = this.getCurrentSeason();
      const lastYearSeason = new Date();
      lastYearSeason.setFullYear(lastYearSeason.getFullYear() - 1);

      // Get current seasonal preferences using Harper-native operations
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      const currentStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [{
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: thirtyDaysAgo.toISOString()
        }],
        get_attributes: ['*']
      });

      // Process current seasonal data - client-side processing
      const currentActivityMap = new Map();
      currentStats.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        if (activity) {
          currentActivityMap.set(activity, (currentActivityMap.get(activity) || 0) + 1);
        }
      });

      const currentSeasonalData = Array.from(currentActivityMap.entries())
        .map(([activity, count]) => ({ activity, count }))
        .sort((a, b) => b.count - a.count);

      // Compare with historical seasonal data
      const historicalStart = new Date(lastYearSeason.getTime() - (30 * 24 * 60 * 60 * 1000));
      const historicalEnd = new Date(lastYearSeason.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      const historicalStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: historicalStart.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than',
            search_value: historicalEnd.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Process historical seasonal data - client-side processing
      const historicalActivityMap = new Map();
      historicalStats.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        if (activity) {
          historicalActivityMap.set(activity, (historicalActivityMap.get(activity) || 0) + 1);
        }
      });

      const historicalSeasonalData = Array.from(historicalActivityMap.entries())
        .map(([activity, count]) => ({ activity, count }))
        .sort((a, b) => b.count - a.count);

      // Calculate drift score based on activity distribution changes
      const driftScore = this.calculateDistributionDrift(currentSeasonalData, historicalSeasonalData);

      return {
        score: driftScore,
        significant: driftScore > 0.2, // 20% drift threshold for seasonal changes
        currentSeason,
        currentDistribution: currentSeasonalData,
        historicalDistribution: historicalSeasonalData
      };

    } catch (error) {
      console.error('Error checking seasonal drift:', error);
      return { score: 0, significant: false, currentSeason: 'unknown' };
    }
  }

  /**
   * Check for activity-based prediction drift
   */
  async checkActivityPredictionDrift() {
    try {
      // Get recent prediction patterns by activity using Harper-native operations
      const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      const recentStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [{
          search_attribute: 'created_at',
          search_type: 'greater_than_or_equal',
          search_value: sevenDaysAgo.toISOString()
        }],
        get_attributes: ['*']
      });

      // Process recent patterns - client-side processing
      const recentPatternMap = new Map();
      recentStats.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        const prediction = stat.top_prediction?.className;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        
        if (activity && prediction) {
          const key = `${activity}|${prediction}`;
          if (!recentPatternMap.has(key)) {
            recentPatternMap.set(key, { activity, prediction, count: 0, totalConfidence: 0 });
          }
          const pattern = recentPatternMap.get(key);
          pattern.count++;
          pattern.totalConfidence += confidence;
        }
      });

      const recentPatterns = Array.from(recentPatternMap.values())
        .map(pattern => ({
          activity: pattern.activity,
          prediction: pattern.prediction,
          count: pattern.count,
          avg_confidence: pattern.count > 0 ? pattern.totalConfidence / pattern.count : 0
        }))
        .sort((a, b) => a.activity.localeCompare(b.activity) || b.count - a.count);

      // Get baseline patterns from 2-4 weeks ago
      const twentyEightDaysAgo = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000));
      const fourteenDaysAgo = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000));
      
      const baselineStats = await this.dataService.harper.searchByConditions('statistics', {
        operation: 'search_by_conditions',
        database: 'data',
        table: 'statistics',
        conditions: [
          {
            search_attribute: 'created_at',
            search_type: 'greater_than_or_equal',
            search_value: twentyEightDaysAgo.toISOString()
          },
          {
            search_attribute: 'created_at',
            search_type: 'less_than',
            search_value: fourteenDaysAgo.toISOString()
          }
        ],
        get_attributes: ['*']
      });

      // Process baseline patterns - client-side processing
      const baselinePatternMap = new Map();
      baselineStats.forEach(stat => {
        const activity = stat.input_metadata?.activity;
        const prediction = stat.top_prediction?.className;
        const confidence = stat.top_prediction?.probability ? parseFloat(stat.top_prediction.probability) : 0;
        
        if (activity && prediction) {
          const key = `${activity}|${prediction}`;
          if (!baselinePatternMap.has(key)) {
            baselinePatternMap.set(key, { activity, prediction, count: 0, totalConfidence: 0 });
          }
          const pattern = baselinePatternMap.get(key);
          pattern.count++;
          pattern.totalConfidence += confidence;
        }
      });

      const baselinePatterns = Array.from(baselinePatternMap.values())
        .map(pattern => ({
          activity: pattern.activity,
          prediction: pattern.prediction,
          count: pattern.count,
          avg_confidence: pattern.count > 0 ? pattern.totalConfidence / pattern.count : 0
        }))
        .sort((a, b) => a.activity.localeCompare(b.activity) || b.count - a.count);

      const driftScore = this.calculatePatternDrift(recentPatterns, baselinePatterns);

      return {
        score: driftScore,
        significant: driftScore > this.retrainingThresholds.activityDriftThreshold,
        recentPatterns,
        baselinePatterns
      };

    } catch (error) {
      console.error('Error checking activity drift:', error);
      return { score: 0, significant: false };
    }
  }

  /**
   * Trigger retraining process
   */
  async triggerRetraining(triggerResult) {
    try {
      const jobConfig = {
        type: triggerResult.recommendedType || 'incremental_update',
        confidenceThreshold: 0.7,
        currentVersion: await this.getCurrentModelVersion(),
        trainingConfig: {
          activities: ['hiking', 'climbing', 'camping', 'mountaineering'],
          learningRate: 0.001,
          batchSize: 32,
          epochs: triggerResult.recommendedType === 'full_retrain' ? 50 : 10,
          validationSplit: 0.2
        }
      };

      // Create retraining job record
      const job = await this.dataService.createRetrainingJob(jobConfig);
      this.retrainingJob = job;

      console.log(`Started outdoor gear model retraining job: ${job.id}`);
      console.log(`Job type: ${job.job_type}`);
      console.log(`Trigger reasons: ${triggerResult.reasons.join(', ')}`);

      // Update job status to running
      await this.dataService.updateRetrainingJob(job.id, {
        status: 'running',
        started_at: new Date()
      });

      // Export training data
      const trainingData = await this.exportOutdoorGearTrainingData(jobConfig);
      
      // Update job with data points used
      await this.dataService.updateRetrainingJob(job.id, {
        data_points_used: trainingData.length
      });

      // Execute retraining process
      const result = await this.executeRetraining(job, trainingData);

      // Update job with completion status
      await this.dataService.updateRetrainingJob(job.id, {
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date(),
        result: result,
        model_version_after: result.newModelVersion,
        performance_improvement: result.performanceComparison
      });

      return { success: true, jobId: job.id, result };

    } catch (error) {
      console.error('Error triggering retraining:', error);
      
      if (this.retrainingJob) {
        await this.dataService.updateRetrainingJob(this.retrainingJob.id, {
          status: 'failed',
          completed_at: new Date(),
          result: { 
            success: false, 
            error: error.message,
            message: 'Retraining failed due to system error'
          }
        });
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Export training data specifically for outdoor gear models
   */
  async exportOutdoorGearTrainingData(jobConfig) {
    const options = {
      includeUserFeedback: true,
      minConfidence: jobConfig.confidenceThreshold,
      limit: 50000
    };

    return await this.dataService.exportTrainingData(options);
  }

  /**
   * Execute the actual retraining process
   */
  async executeRetraining(job, trainingData) {
    // Mock retraining execution for outdoor gear models
    // In real implementation, this would interface with TensorFlow.js training pipeline
    
    console.log(`Executing ${job.job_type} retraining with ${trainingData.length} outdoor gear data points`);
    
    // Simulate training time
    await new Promise(resolve => setTimeout(resolve, 5000));

    const newModelVersion = `outdoor-gear-v${Date.now()}`;
    
    return {
      success: true,
      message: `Outdoor gear model retraining completed successfully`,
      newModelVersion,
      trainingDuration: 5000,
      dataPointsProcessed: trainingData.length,
      performanceComparison: {
        accuracyBefore: 0.85,
        accuracyAfter: 0.88,
        avgInferenceTimeBefore: 45,
        avgInferenceTimeAfter: 42,
        improvement: 0.03
      },
      modelMetrics: {
        loss: 0.15,
        accuracy: 0.88,
        val_loss: 0.18,
        val_accuracy: 0.85
      }
    };
  }

  /**
   * Get current model version
   */
  async getCurrentModelVersion() {
    // In real implementation, this would query the model registry
    return `outdoor-gear-v${Date.now() - 86400000}`; // Yesterday's version
  }

  /**
   * Get current season for seasonal drift detection
   */
  getCurrentSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  /**
   * Calculate distribution drift between two datasets
   */
  calculateDistributionDrift(current, historical) {
    const currentMap = new Map(current.map(item => [item.activity, item.count]));
    const historicalMap = new Map(historical.map(item => [item.activity, item.count]));

    const allActivities = new Set([...currentMap.keys(), ...historicalMap.keys()]);
    let totalDrift = 0;
    let comparisons = 0;

    for (const activity of allActivities) {
      const currentCount = currentMap.get(activity) || 0;
      const historicalCount = historicalMap.get(activity) || 0;
      const totalCurrent = current.reduce((sum, item) => sum + item.count, 0) || 1;
      const totalHistorical = historical.reduce((sum, item) => sum + item.count, 0) || 1;

      const currentRatio = currentCount / totalCurrent;
      const historicalRatio = historicalCount / totalHistorical;
      
      totalDrift += Math.abs(currentRatio - historicalRatio);
      comparisons++;
    }

    return comparisons > 0 ? totalDrift / comparisons : 0;
  }

  /**
   * Calculate pattern drift between prediction patterns
   */
  calculatePatternDrift(recent, baseline) {
    // Simplified pattern drift calculation
    // In practice, this would use more sophisticated statistical measures
    
    if (!recent.length || !baseline.length) return 0;

    const recentActivities = new Set(recent.map(p => p.activity));
    const baselineActivities = new Set(baseline.map(p => p.activity));
    
    const intersection = new Set([...recentActivities].filter(x => baselineActivities.has(x)));
    const union = new Set([...recentActivities, ...baselineActivities]);
    
    // Jaccard distance as a simple drift measure
    return 1 - (intersection.size / union.size);
  }

  /**
   * Get retraining job status
   */
  async getRetrainingStatus() {
    if (!this.retrainingJob) return null;

    const jobs = await this.dataService.getRetrainingJobs(1);
    return jobs[0] || null;
  }
}

export default HarperModelRetrainer;