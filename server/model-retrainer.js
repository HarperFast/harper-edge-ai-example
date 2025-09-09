/**
 * Model Retrainer - Manages model retraining triggers and workflows
 * Coordinates data export and retraining pipeline execution
 */

class ModelRetrainer {
    constructor(database) {
        this.db = database;
        this.retrainingJob = null;
        this.retrainingThresholds = {
            minDataPoints: 1000,
            minAccuracyDrop: 0.1,
            maxTimeSinceLastRetrain: 7 * 24 * 60 * 60 * 1000, // 7 days
            minUserFeedback: 100
        };
    }

    /**
     * Check if retraining should be triggered
     */
    async checkRetrainingTrigger() {
        const triggers = {
            shouldRetrain: false,
            reasons: [],
            metrics: {}
        };

        // Check data volume
        const dataVolume = await this.db.get(
            'SELECT COUNT(*) as count FROM statistics WHERE timestamp >= ?',
            [Date.now() - this.retrainingThresholds.maxTimeSinceLastRetrain]
        );

        triggers.metrics.dataVolume = dataVolume.count;

        if (dataVolume.count >= this.retrainingThresholds.minDataPoints) {
            triggers.reasons.push(`Sufficient data points: ${dataVolume.count}`);
        }

        // Check accuracy degradation
        const accuracyMetrics = await this.checkAccuracyDegradation();
        triggers.metrics.accuracy = accuracyMetrics;

        if (accuracyMetrics.degraded) {
            triggers.shouldRetrain = true;
            triggers.reasons.push(`Accuracy degradation detected: ${accuracyMetrics.currentAccuracy.toFixed(2)}`);
        }

        // Check feedback volume
        const feedbackCount = await this.db.get(
            'SELECT COUNT(*) as count FROM user_feedback WHERE timestamp >= ?',
            [Date.now() - this.retrainingThresholds.maxTimeSinceLastRetrain]
        );

        triggers.metrics.feedbackCount = feedbackCount.count;

        if (feedbackCount.count >= this.retrainingThresholds.minUserFeedback) {
            triggers.reasons.push(`Sufficient user feedback: ${feedbackCount.count}`);
        }

        // Check time since last retrain
        const lastRetrain = await this.db.get(
            'SELECT MAX(triggered_at) as last_time FROM retraining_jobs WHERE status = ?',
            ['completed']
        );

        if (lastRetrain.last_time) {
            const timeSinceLastRetrain = Date.now() - lastRetrain.last_time;
            triggers.metrics.timeSinceLastRetrain = timeSinceLastRetrain;

            if (timeSinceLastRetrain > this.retrainingThresholds.maxTimeSinceLastRetrain) {
                triggers.shouldRetrain = true;
                triggers.reasons.push('Maximum time since last retrain exceeded');
            }
        } else {
            triggers.shouldRetrain = true;
            triggers.reasons.push('No previous retraining found');
        }

        // Check for drift in prediction distribution
        const drift = await this.checkPredictionDrift();
        triggers.metrics.drift = drift;

        if (drift.significant) {
            triggers.shouldRetrain = true;
            triggers.reasons.push(`Significant prediction drift detected: ${drift.score.toFixed(2)}`);
        }

        // Final decision
        if (triggers.reasons.length >= 2 && dataVolume.count >= this.retrainingThresholds.minDataPoints) {
            triggers.shouldRetrain = true;
        }

        return triggers;
    }

    /**
     * Check for accuracy degradation
     */
    async checkAccuracyDegradation() {
        // Get accuracy for last 7 days
        const recentAccuracy = await this.db.get(`
            SELECT 
                CAST(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / 
                NULLIF(COUNT(*), 0) as accuracy
            FROM user_feedback
            WHERE timestamp >= ?
        `, [Date.now() - 7 * 24 * 60 * 60 * 1000]);

        // Get historical accuracy
        const historicalAccuracy = await this.db.get(`
            SELECT AVG(accuracy_rate) as accuracy
            FROM performance_metrics
            WHERE date < date('now', '-7 days')
        `);

        const current = recentAccuracy.accuracy || 0;
        const historical = historicalAccuracy.accuracy || 0.9;

        return {
            currentAccuracy: current,
            historicalAccuracy: historical,
            degraded: historical - current > this.retrainingThresholds.minAccuracyDrop
        };
    }

    /**
     * Check for prediction distribution drift
     */
    async checkPredictionDrift() {
        // Get recent distribution
        const recentDist = await this.db.all(`
            SELECT 
                json_extract(top_prediction, '$.className') as class_name,
                COUNT(*) as count
            FROM statistics
            WHERE timestamp >= ?
            GROUP BY class_name
        `, [Date.now() - 24 * 60 * 60 * 1000]);

        // Get historical distribution
        const historicalDist = await this.db.all(`
            SELECT 
                json_extract(top_prediction, '$.className') as class_name,
                COUNT(*) as count
            FROM statistics
            WHERE timestamp < ? AND timestamp >= ?
            GROUP BY class_name
        `, [
            Date.now() - 24 * 60 * 60 * 1000,
            Date.now() - 8 * 24 * 60 * 60 * 1000
        ]);

        // Calculate KL divergence
        const klDivergence = this.calculateKLDivergence(recentDist, historicalDist);

        return {
            score: klDivergence,
            significant: klDivergence > 0.5,
            recentDistribution: recentDist,
            historicalDistribution: historicalDist
        };
    }

    /**
     * Calculate KL divergence between two distributions
     */
    calculateKLDivergence(dist1, dist2) {
        // Create maps for easy lookup
        const map1 = new Map(dist1.map(d => [d.class_name, d.count]));
        const map2 = new Map(dist2.map(d => [d.class_name, d.count]));

        // Get all unique classes
        const allClasses = new Set([...map1.keys(), ...map2.keys()]);

        // Calculate totals
        const total1 = Array.from(map1.values()).reduce((a, b) => a + b, 0);
        const total2 = Array.from(map2.values()).reduce((a, b) => a + b, 0);

        if (total1 === 0 || total2 === 0) return 0;

        // Calculate KL divergence
        let klDiv = 0;
        for (const className of allClasses) {
            const p = (map1.get(className) || 1) / total1; // Add smoothing
            const q = (map2.get(className) || 1) / total2;
            
            if (p > 0 && q > 0) {
                klDiv += p * Math.log(p / q);
            }
        }

        return klDiv;
    }

    /**
     * Trigger model retraining
     */
    async triggerRetraining(options = {}) {
        // Check if retraining is already in progress
        const inProgress = await this.db.get(
            'SELECT * FROM retraining_jobs WHERE status = ?',
            ['in_progress']
        );

        if (inProgress) {
            return {
                success: false,
                message: 'Retraining already in progress',
                jobId: inProgress.id
            };
        }

        // Create new retraining job
        const jobResult = await this.db.run(
            `INSERT INTO retraining_jobs 
            (status, triggered_at, data_points_used, confidence_threshold)
            VALUES (?, ?, ?, ?)`,
            [
                'in_progress',
                Date.now(),
                options.minDataPoints || this.retrainingThresholds.minDataPoints,
                options.confidenceThreshold || 0.7
            ]
        );

        const jobId = jobResult.lastID;

        // Start retraining process (async)
        this.executeRetraining(jobId, options).catch(error => {
            console.error('Retraining failed:', error);
            this.updateJobStatus(jobId, 'failed', { error: error.message });
        });

        return {
            success: true,
            message: 'Retraining triggered successfully',
            jobId: jobId
        };
    }

    /**
     * Execute the retraining process
     */
    async executeRetraining(jobId, options) {
        try {
            console.log(`Starting retraining job ${jobId}`);

            // Step 1: Export training data
            const trainingData = await this.db.exportTrainingData({
                includeUserFeedback: true,
                minConfidence: options.confidenceThreshold || 0.7
            });

            console.log(`Exported ${trainingData.length} training samples`);

            // Step 2: Prepare data for retraining
            const preparedData = this.prepareTrainingData(trainingData);

            // Step 3: Generate retraining configuration
            const config = this.generateRetrainingConfig(preparedData);

            // Step 4: In a real system, this would trigger the actual retraining
            // For now, we'll simulate it
            const retrainingResult = await this.simulateRetraining(preparedData, config);

            // Step 5: Update job status
            await this.updateJobStatus(jobId, 'completed', {
                dataPointsUsed: trainingData.length,
                result: retrainingResult,
                completedAt: Date.now()
            });

            console.log(`Retraining job ${jobId} completed successfully`);

            return retrainingResult;

        } catch (error) {
            await this.updateJobStatus(jobId, 'failed', {
                error: error.message,
                completedAt: Date.now()
            });
            throw error;
        }
    }

    /**
     * Prepare training data for model retraining
     */
    prepareTrainingData(rawData) {
        const prepared = {
            samples: [],
            labels: new Set(),
            statistics: {
                totalSamples: rawData.length,
                withFeedback: 0,
                correctedLabels: 0
            }
        };

        for (const item of rawData) {
            const sample = {
                id: item.id,
                timestamp: item.timestamp,
                predictions: item.all_predictions,
                topPrediction: item.top_prediction,
                metadata: item.input_metadata
            };

            // Include user feedback if available
            if (item.is_correct !== null) {
                sample.feedback = {
                    isCorrect: item.is_correct,
                    correctedLabel: item.corrected_label,
                    confidence: item.feedback_confidence
                };
                prepared.statistics.withFeedback++;

                if (item.corrected_label) {
                    prepared.statistics.correctedLabels++;
                    prepared.labels.add(item.corrected_label);
                }
            }

            // Add original predicted labels
            prepared.labels.add(item.top_prediction.className);
            prepared.samples.push(sample);
        }

        prepared.labels = Array.from(prepared.labels);
        return prepared;
    }

    /**
     * Generate retraining configuration
     */
    generateRetrainingConfig(preparedData) {
        return {
            modelType: 'mobilenet_v2',
            baseModel: 'imagenet',
            fineTuning: true,
            epochs: Math.min(10, Math.ceil(preparedData.samples.length / 100)),
            batchSize: 32,
            learningRate: 0.0001,
            optimizer: 'adam',
            loss: 'categorical_crossentropy',
            metrics: ['accuracy', 'top_k_categorical_accuracy'],
            validationSplit: 0.2,
            augmentation: {
                enabled: true,
                rotation: 20,
                zoom: 0.1,
                horizontalFlip: true
            },
            callbacks: {
                earlyStopping: {
                    monitor: 'val_loss',
                    patience: 3
                },
                modelCheckpoint: {
                    monitor: 'val_accuracy',
                    saveBeest: true
                }
            }
        };
    }

    /**
     * Simulate retraining (in production, this would trigger actual training)
     */
    async simulateRetraining(data, config) {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
            success: true,
            modelVersion: '2.1-custom',
            metrics: {
                finalAccuracy: 0.92 + Math.random() * 0.06,
                finalLoss: 0.15 + Math.random() * 0.1,
                validationAccuracy: 0.90 + Math.random() * 0.05,
                trainingTime: 3600 + Math.random() * 1800
            },
            improvements: {
                accuracyGain: 0.03 + Math.random() * 0.02,
                inferenceSpeedGain: -5 + Math.random() * 3
            },
            exportPath: '/models/mobilenet_v2_custom_' + Date.now() + '.json'
        };
    }

    /**
     * Update job status in database
     */
    async updateJobStatus(jobId, status, details = {}) {
        await this.db.run(
            `UPDATE retraining_jobs 
            SET status = ?, completed_at = ?, result = ?
            WHERE id = ?`,
            [
                status,
                details.completedAt || null,
                JSON.stringify(details),
                jobId
            ]
        );
    }

    /**
     * Get retraining status
     */
    async getRetrainingStatus() {
        // Get latest job
        const latestJob = await this.db.get(
            'SELECT * FROM retraining_jobs ORDER BY triggered_at DESC LIMIT 1'
        );

        if (!latestJob) {
            return {
                hasActiveJob: false,
                message: 'No retraining jobs found'
            };
        }

        const result = JSON.parse(latestJob.result || '{}');

        return {
            hasActiveJob: latestJob.status === 'in_progress',
            jobId: latestJob.id,
            status: latestJob.status,
            triggeredAt: latestJob.triggered_at,
            completedAt: latestJob.completed_at,
            dataPointsUsed: latestJob.data_points_used,
            result: result,
            nextCheckIn: this.calculateNextCheckIn(latestJob)
        };
    }

    /**
     * Calculate when next retraining check should occur
     */
    calculateNextCheckIn(lastJob) {
        if (lastJob.status === 'in_progress') {
            return Date.now() + 60 * 1000; // Check in 1 minute
        }

        const timeSinceCompletion = Date.now() - (lastJob.completed_at || lastJob.triggered_at);
        
        if (timeSinceCompletion < 24 * 60 * 60 * 1000) {
            return Date.now() + 6 * 60 * 60 * 1000; // Check in 6 hours
        }

        return Date.now() + 24 * 60 * 60 * 1000; // Check daily
    }
}

module.exports = ModelRetrainer;