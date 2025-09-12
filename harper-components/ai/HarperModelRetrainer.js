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
      // Check data volume for outdoor gear predictions
      const dataVolume = await this.dataService.harper.sql(`
        SELECT COUNT(*) as count 
        FROM statistics 
        WHERE created_at >= NOW() - INTERVAL 7 DAY
      `);

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

      // Check feedback volume from outdoor enthusiasts
      const feedbackCount = await this.dataService.harper.sql(`
        SELECT COUNT(*) as count 
        FROM user_feedback 
        WHERE created_at >= NOW() - INTERVAL 7 DAY
      `);

      triggers.metrics.feedbackCount = feedbackCount[0]?.count || 0;

      if (feedbackCount[0]?.count >= this.retrainingThresholds.minUserFeedback) {
        triggers.reasons.push(`Sufficient outdoor gear user feedback: ${feedbackCount[0].count}`);
      }

      // Check time since last retrain
      const lastRetrain = await this.dataService.harper.sql(`
        SELECT MAX(triggered_at) as last_time 
        FROM retraining_jobs 
        WHERE status = 'completed'
      `);

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
      // Get recent accuracy from user feedback
      const recentAccuracy = await this.dataService.harper.sql(`
        SELECT 
          AVG(CASE WHEN is_correct = true THEN 1.0 ELSE 0.0 END) as accuracy
        FROM user_feedback f
        JOIN statistics s ON f.stat_id = s.id
        WHERE f.created_at >= NOW() - INTERVAL 3 DAY
      `);

      // Get baseline accuracy (last 30 days before recent period)
      const baselineAccuracy = await this.dataService.harper.sql(`
        SELECT 
          AVG(CASE WHEN is_correct = true THEN 1.0 ELSE 0.0 END) as accuracy
        FROM user_feedback f
        JOIN statistics s ON f.stat_id = s.id
        WHERE f.created_at >= NOW() - INTERVAL 33 DAY
        AND f.created_at < NOW() - INTERVAL 3 DAY
      `);

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

      // Get current seasonal preferences
      const currentSeasonalData = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          COUNT(*) as count
        FROM statistics
        WHERE created_at >= NOW() - INTERVAL 30 DAY
        AND JSON_VALID(input_metadata)
        GROUP BY input_metadata->>'$.activity'
        ORDER BY count DESC
      `);

      // Compare with historical seasonal data
      const historicalSeasonalData = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          COUNT(*) as count
        FROM statistics
        WHERE created_at >= '${lastYearSeason.toISOString().split('T')[0]}' - INTERVAL 30 DAY
        AND created_at < '${lastYearSeason.toISOString().split('T')[0]}' + INTERVAL 30 DAY
        AND JSON_VALID(input_metadata)
        GROUP BY input_metadata->>'$.activity'
        ORDER BY count DESC
      `);

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
      // Get recent prediction patterns by activity
      const recentPatterns = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          top_prediction->>'$.className' as prediction,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence
        FROM statistics
        WHERE created_at >= NOW() - INTERVAL 7 DAY
        AND JSON_VALID(input_metadata)
        AND JSON_VALID(top_prediction)
        GROUP BY input_metadata->>'$.activity', top_prediction->>'$.className'
        ORDER BY activity, count DESC
      `);

      // Get baseline patterns from 2-4 weeks ago
      const baselinePatterns = await this.dataService.harper.sql(`
        SELECT 
          input_metadata->>'$.activity' as activity,
          top_prediction->>'$.className' as prediction,
          COUNT(*) as count,
          AVG(CAST(top_prediction->>'$.probability' AS REAL)) as avg_confidence
        FROM statistics
        WHERE created_at >= NOW() - INTERVAL 28 DAY
        AND created_at < NOW() - INTERVAL 14 DAY
        AND JSON_VALID(input_metadata)
        AND JSON_VALID(top_prediction)
        GROUP BY input_metadata->>'$.activity', top_prediction->>'$.className'
        ORDER BY activity, count DESC
      `);

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