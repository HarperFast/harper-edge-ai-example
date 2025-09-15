/**
 * TrainingManagerExtension - Harper Extension for AI model training management
 * Manages retraining workflows, triggers, and model lifecycle for Harper-fabric
 */

import { HarperModelRetrainer } from '../ai/HarperModelRetrainer.js';
import HarperDataService from '../utils/HarperDataService.js';

export class TrainingManagerExtension {
  constructor(options = {}) {
    this.name = 'TrainingManagerExtension';
    this.version = '1.0.0';
    this.retrainer = null;
    this.dataService = null;
    this.initialized = false;
    this.harperdb = null;
    this.trainingJobs = new Map();
    this.scheduledJobs = new Map();
  }

  // Harper Extension lifecycle method
  async start(options = {}) {
    console.log('Starting TrainingManagerExtension...');
    
    try {
      // Store HarperDB instance for database operations
      this.harperdb = options.harperdb;
      
      // Initialize data service
      this.dataService = new HarperDataService(this.harperdb);
      
      // Initialize model retrainer
      this.retrainer = new HarperModelRetrainer(this.dataService);
      
      // Start monitoring for training triggers
      this.startTrainingMonitor();
      
      this.initialized = true;
      console.log('TrainingManagerExtension started successfully');
      
      return this;
    } catch (error) {
      console.error('Failed to start TrainingManagerExtension:', error);
      throw error;
    }
  }

  // Public API for Resources to use
  async triggerRetraining(modelName, reason = 'manual', options = {}) {
    if (!this.initialized) {
      throw new Error('TrainingManagerExtension not initialized');
    }

    try {
      const jobId = `training_${modelName}_${Date.now()}`;
      
      const trainingJob = {
        id: jobId,
        modelName,
        reason,
        options,
        status: 'queued',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store training job in Harper database
      if (this.harperdb) {
        await this.harperdb.insert('retraining_jobs', trainingJob);
      }

      // Add to active training jobs
      this.trainingJobs.set(jobId, trainingJob);

      // Start retraining process
      const result = await this.executeTrainingJob(jobId);
      
      return {
        jobId,
        status: result.success ? 'started' : 'failed',
        message: result.message,
        details: result.details
      };
    } catch (error) {
      console.error(`Failed to trigger retraining for ${modelName}:`, error);
      throw error;
    }
  }

  async scheduleRetraining(modelName, schedule, options = {}) {
    if (!this.initialized) {
      throw new Error('TrainingManagerExtension not initialized');
    }

    try {
      const scheduleId = `schedule_${modelName}_${Date.now()}`;
      
      const scheduledJob = {
        id: scheduleId,
        modelName,
        schedule,
        options,
        active: true,
        createdAt: new Date(),
        nextRun: this.calculateNextRun(schedule)
      };

      // Store scheduled job in Harper database
      if (this.harperdb) {
        await this.harperdb.insert('training_schedules', scheduledJob);
      }

      // Add to scheduled jobs
      this.scheduledJobs.set(scheduleId, scheduledJob);

      return {
        scheduleId,
        status: 'scheduled',
        nextRun: scheduledJob.nextRun
      };
    } catch (error) {
      console.error(`Failed to schedule retraining for ${modelName}:`, error);
      throw error;
    }
  }

  async cancelTraining(jobId) {
    if (!this.initialized) {
      throw new Error('TrainingManagerExtension not initialized');
    }

    try {
      const job = this.trainingJobs.get(jobId);
      if (!job) {
        throw new Error(`Training job ${jobId} not found`);
      }

      // Cancel the job
      job.status = 'cancelled';
      job.updatedAt = new Date();

      // Update in Harper database
      if (this.harperdb) {
        await this.harperdb.update('retraining_jobs', 
          { id: jobId },
          { status: 'cancelled', updated_at: new Date() }
        );
      }

      return {
        jobId,
        status: 'cancelled'
      };
    } catch (error) {
      console.error(`Failed to cancel training job ${jobId}:`, error);
      throw error;
    }
  }

  async getTrainingStatus(jobId) {
    if (!this.initialized) return null;

    try {
      const job = this.trainingJobs.get(jobId);
      if (job) return job;

      // Check Harper database
      if (this.harperdb) {
        const results = await this.harperdb.searchByConditions('retraining_jobs', [
          { search_attribute: 'id', search_value: jobId }
        ]);
        
        return results && results.length > 0 ? results[0] : null;
      }

      return null;
    } catch (error) {
      console.error(`Failed to get training status for job ${jobId}:`, error);
      return null;
    }
  }

  async listTrainingJobs(filter = {}) {
    if (!this.initialized) return [];

    try {
      const activeJobs = Array.from(this.trainingJobs.values());
      
      if (this.harperdb) {
        const conditions = [];
        if (filter.modelName) {
          conditions.push({ search_attribute: 'modelName', search_value: filter.modelName });
        }
        if (filter.status) {
          conditions.push({ search_attribute: 'status', search_value: filter.status });
        }

        const dbJobs = await this.harperdb.searchByConditions('retraining_jobs', conditions);
        
        // Merge and deduplicate
        const allJobs = [...activeJobs];
        dbJobs?.forEach(dbJob => {
          if (!allJobs.find(job => job.id === dbJob.id)) {
            allJobs.push(dbJob);
          }
        });

        return allJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return activeJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('Failed to list training jobs:', error);
      return [];
    }
  }

  async checkRetrainingTriggers() {
    if (!this.initialized) return [];

    try {
      return await this.retrainer.checkRetrainingTriggers();
    } catch (error) {
      console.error('Failed to check retraining triggers:', error);
      return [];
    }
  }

  async getModelMetrics(modelName) {
    if (!this.initialized) return null;

    try {
      return await this.retrainer.getModelMetrics(modelName);
    } catch (error) {
      console.error(`Failed to get metrics for model ${modelName}:`, error);
      return null;
    }
  }

  // Internal methods
  async executeTrainingJob(jobId) {
    try {
      const job = this.trainingJobs.get(jobId);
      if (!job) {
        throw new Error(`Training job ${jobId} not found`);
      }

      // Update job status
      job.status = 'running';
      job.updatedAt = new Date();
      
      if (this.harperdb) {
        await this.harperdb.update('retraining_jobs', 
          { id: jobId },
          { status: 'running', updated_at: new Date() }
        );
      }

      // Execute retraining
      const result = await this.retrainer.triggerRetraining(
        job.modelName,
        job.reason,
        job.options
      );

      // Update job with results
      job.status = result.success ? 'completed' : 'failed';
      job.result = result;
      job.updatedAt = new Date();

      if (this.harperdb) {
        await this.harperdb.update('retraining_jobs', 
          { id: jobId },
          { 
            status: job.status,
            result: result,
            updated_at: new Date()
          }
        );
      }

      return result;
    } catch (error) {
      // Mark job as failed
      const job = this.trainingJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.updatedAt = new Date();

        if (this.harperdb) {
          await this.harperdb.update('retraining_jobs', 
            { id: jobId },
            { 
              status: 'failed',
              error: error.message,
              updated_at: new Date()
            }
          );
        }
      }

      throw error;
    }
  }

  startTrainingMonitor() {
    // Check for scheduled training jobs every 5 minutes
    this.monitorInterval = setInterval(async () => {
      try {
        await this.processScheduledJobs();
        await this.cleanupCompletedJobs();
      } catch (error) {
        console.error('Training monitor error:', error);
      }
    }, 5 * 60 * 1000);

    // Check for automatic retraining triggers every 15 minutes
    this.triggerCheckInterval = setInterval(async () => {
      try {
        const triggers = await this.checkRetrainingTriggers();
        
        for (const trigger of triggers) {
          if (trigger.shouldRetrain) {
            await this.triggerRetraining(
              trigger.modelName, 
              trigger.reason,
              trigger.options
            );
          }
        }
      } catch (error) {
        console.error('Automatic trigger check error:', error);
      }
    }, 15 * 60 * 1000);
  }

  async processScheduledJobs() {
    const now = new Date();
    
    for (const [scheduleId, scheduledJob] of this.scheduledJobs) {
      if (scheduledJob.active && scheduledJob.nextRun <= now) {
        try {
          await this.triggerRetraining(
            scheduledJob.modelName,
            'scheduled',
            scheduledJob.options
          );

          // Update next run time
          scheduledJob.nextRun = this.calculateNextRun(scheduledJob.schedule);
          
          if (this.harperdb) {
            await this.harperdb.update('training_schedules', 
              { id: scheduleId },
              { next_run: scheduledJob.nextRun }
            );
          }
        } catch (error) {
          console.error(`Failed to execute scheduled training for ${scheduledJob.modelName}:`, error);
        }
      }
    }
  }

  async cleanupCompletedJobs() {
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
    
    for (const [jobId, job] of this.trainingJobs) {
      if ((job.status === 'completed' || job.status === 'failed') && 
          job.updatedAt < cutoffTime) {
        this.trainingJobs.delete(jobId);
      }
    }
  }

  calculateNextRun(schedule) {
    // Simple schedule parsing - in production, use a proper cron library
    const now = new Date();
    
    if (schedule.includes('hourly')) {
      return new Date(now.getTime() + 60 * 60 * 1000);
    } else if (schedule.includes('daily')) {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (schedule.includes('weekly')) {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    
    // Default to daily
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  // Health and diagnostics
  async getHealth() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      activeTrainingJobs: this.trainingJobs.size,
      scheduledJobs: this.scheduledJobs.size,
      retrainer: this.retrainer ? await this.retrainer.getHealth() : null,
      timestamp: Date.now()
    };
  }

  isReady() {
    return this.initialized && this.retrainer && this.dataService;
  }

  // Configuration
  getConfig() {
    return {
      name: this.name,
      version: this.version,
      initialized: this.initialized,
      activeTrainingJobs: this.trainingJobs.size,
      scheduledJobs: this.scheduledJobs.size
    };
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down TrainingManagerExtension...');
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    if (this.triggerCheckInterval) {
      clearInterval(this.triggerCheckInterval);
    }
    
    // Cancel all active training jobs
    for (const [jobId, job] of this.trainingJobs) {
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'cancelled';
        job.updatedAt = new Date();
      }
    }
    
    this.trainingJobs.clear();
    this.scheduledJobs.clear();
    this.initialized = false;
    this.harperdb = null;
    console.log('TrainingManagerExtension shut down');
  }
}

// Harper Extension export pattern
export default TrainingManagerExtension;