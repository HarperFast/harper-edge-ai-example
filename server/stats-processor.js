/**
 * Statistics Processor - Analyzes and processes inference statistics
 * Provides insights and prepares data for model retraining
 */

class StatsProcessor {
    constructor(database) {
        this.db = database;
    }

    /**
     * Process incoming statistics for insights
     */
    async processIncomingStats(statistics) {
        const insights = {
            batchSize: statistics.length,
            averageInferenceTime: 0,
            averageConfidence: 0,
            lowConfidencePredictions: [],
            classDistribution: {},
            performanceFlags: []
        };

        let totalInferenceTime = 0;
        let totalConfidence = 0;

        for (const stat of statistics) {
            // Accumulate inference times
            totalInferenceTime += stat.inferenceTime;

            // Accumulate confidence scores
            const topConfidence = stat.topPrediction.probability;
            totalConfidence += topConfidence;

            // Track low confidence predictions
            if (topConfidence < 0.7) {
                insights.lowConfidencePredictions.push({
                    id: stat.id,
                    className: stat.topPrediction.className,
                    confidence: topConfidence,
                    timestamp: stat.timestamp
                });
            }

            // Track class distribution
            const className = stat.topPrediction.className;
            insights.classDistribution[className] = (insights.classDistribution[className] || 0) + 1;

            // Check for performance issues
            if (stat.inferenceTime > 100) {
                insights.performanceFlags.push({
                    type: 'slow_inference',
                    statId: stat.id,
                    inferenceTime: stat.inferenceTime
                });
            }

            // Check memory usage
            if (stat.memoryUsage && stat.memoryUsage.numBytes > 100 * 1024 * 1024) {
                insights.performanceFlags.push({
                    type: 'high_memory',
                    statId: stat.id,
                    memoryBytes: stat.memoryUsage.numBytes
                });
            }
        }

        insights.averageInferenceTime = totalInferenceTime / statistics.length;
        insights.averageConfidence = totalConfidence / statistics.length;

        // Identify anomalies
        insights.anomalies = this.detectAnomalies(statistics);

        // Calculate diversity score
        insights.diversityScore = this.calculateDiversityScore(insights.classDistribution);

        return insights;
    }

    /**
     * Detect anomalies in statistics
     */
    detectAnomalies(statistics) {
        const anomalies = [];

        // Calculate statistical thresholds
        const inferenceTimes = statistics.map(s => s.inferenceTime);
        const mean = inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length;
        const stdDev = Math.sqrt(
            inferenceTimes.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / inferenceTimes.length
        );

        // Detect outliers (3 standard deviations)
        statistics.forEach(stat => {
            if (Math.abs(stat.inferenceTime - mean) > 3 * stdDev) {
                anomalies.push({
                    type: 'inference_time_outlier',
                    statId: stat.id,
                    value: stat.inferenceTime,
                    zscore: (stat.inferenceTime - mean) / stdDev
                });
            }

            // Check for unusual confidence patterns
            if (stat.predictions && stat.predictions.length > 1) {
                const topTwo = stat.predictions.slice(0, 2);
                const confidenceDiff = topTwo[0].probability - topTwo[1].probability;
                
                if (confidenceDiff < 0.1) {
                    anomalies.push({
                        type: 'ambiguous_prediction',
                        statId: stat.id,
                        topClasses: topTwo.map(p => p.className),
                        confidences: topTwo.map(p => p.probability)
                    });
                }
            }
        });

        return anomalies;
    }

    /**
     * Calculate diversity score for class distribution
     */
    calculateDiversityScore(classDistribution) {
        const values = Object.values(classDistribution);
        const total = values.reduce((a, b) => a + b, 0);
        
        // Calculate Shannon entropy
        let entropy = 0;
        for (const count of values) {
            const probability = count / total;
            if (probability > 0) {
                entropy -= probability * Math.log2(probability);
            }
        }

        // Normalize to 0-1 range
        const maxEntropy = Math.log2(Object.keys(classDistribution).length);
        return maxEntropy > 0 ? entropy / maxEntropy : 0;
    }

    /**
     * Calculate performance metrics
     */
    async calculatePerformanceMetrics() {
        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

        // Get recent statistics
        const dailyStats = await this.db.all(
            'SELECT * FROM performance_metrics WHERE created_at >= ? ORDER BY date DESC',
            [dayAgo]
        );

        const weeklyStats = await this.db.all(
            'SELECT * FROM performance_metrics WHERE created_at >= ? ORDER BY date DESC',
            [weekAgo]
        );

        // Calculate trends
        const trends = this.calculateTrends(weeklyStats);

        // Get real-time metrics
        const realtimeMetrics = await this.db.get(`
            SELECT 
                COUNT(*) as total_inferences_24h,
                AVG(inference_time) as avg_inference_time_24h,
                COUNT(DISTINCT session_id) as unique_sessions_24h
            FROM statistics
            WHERE timestamp >= ?
        `, [dayAgo]);

        // Get feedback metrics
        const feedbackMetrics = await this.db.get(`
            SELECT 
                COUNT(*) as total_feedback,
                CAST(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / 
                NULLIF(COUNT(*), 0) as accuracy_rate,
                COUNT(DISTINCT corrected_label) as unique_corrections
            FROM user_feedback
            WHERE timestamp >= ?
        `, [weekAgo]);

        // Get top misclassifications
        const misclassifications = await this.db.all(`
            SELECT 
                json_extract(s.top_prediction, '$.className') as predicted_class,
                f.corrected_label,
                COUNT(*) as count
            FROM user_feedback f
            JOIN statistics s ON f.stat_id = s.id
            WHERE f.is_correct = 0 AND f.timestamp >= ?
            GROUP BY predicted_class, corrected_label
            ORDER BY count DESC
            LIMIT 10
        `, [weekAgo]);

        return {
            daily: dailyStats,
            weekly: weeklyStats,
            trends: trends,
            realtime: realtimeMetrics,
            feedback: feedbackMetrics,
            misclassifications: misclassifications,
            health: this.calculateHealthScore({
                dailyStats,
                feedbackMetrics,
                realtimeMetrics
            })
        };
    }

    /**
     * Calculate trends from historical data
     */
    calculateTrends(weeklyStats) {
        if (weeklyStats.length < 2) {
            return { insufficient_data: true };
        }

        // Sort by date
        weeklyStats.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate linear regression for inference time
        const inferenceTimeTrend = this.linearRegression(
            weeklyStats.map((s, i) => [i, s.average_inference_time])
        );

        // Calculate linear regression for volume
        const volumeTrend = this.linearRegression(
            weeklyStats.map((s, i) => [i, s.total_inferences])
        );

        return {
            inferenceTime: {
                slope: inferenceTimeTrend.slope,
                trend: inferenceTimeTrend.slope > 0 ? 'increasing' : 'decreasing',
                percentChange: this.calculatePercentChange(weeklyStats, 'average_inference_time')
            },
            volume: {
                slope: volumeTrend.slope,
                trend: volumeTrend.slope > 0 ? 'increasing' : 'decreasing',
                percentChange: this.calculatePercentChange(weeklyStats, 'total_inferences')
            }
        };
    }

    /**
     * Simple linear regression
     */
    linearRegression(points) {
        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (const [x, y] of points) {
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    /**
     * Calculate percent change
     */
    calculatePercentChange(data, field) {
        if (data.length < 2) return 0;
        const first = data[0][field];
        const last = data[data.length - 1][field];
        return ((last - first) / first) * 100;
    }

    /**
     * Calculate system health score
     */
    calculateHealthScore(metrics) {
        let score = 100;
        const issues = [];

        // Check inference time
        if (metrics.realtime.avg_inference_time_24h > 50) {
            score -= 10;
            issues.push('High average inference time');
        }

        // Check accuracy
        if (metrics.feedback.accuracy_rate && metrics.feedback.accuracy_rate < 0.8) {
            score -= 20;
            issues.push('Low accuracy rate');
        }

        // Check volume
        if (metrics.realtime.total_inferences_24h < 100) {
            score -= 5;
            issues.push('Low inference volume');
        }

        return {
            score: Math.max(0, score),
            status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
            issues: issues
        };
    }

    /**
     * Convert data to CSV format
     */
    async convertToCSV(data) {
        if (!data || data.length === 0) {
            return '';
        }

        // Create CSV header
        const headers = [
            'id', 'timestamp', 'model_version', 'inference_time',
            'top_class', 'top_confidence', 'is_correct', 'corrected_label'
        ];

        let csv = headers.join(',') + '\n';

        // Add data rows
        for (const row of data) {
            const values = [
                row.id,
                row.timestamp,
                row.model_version,
                row.inference_time,
                row.top_prediction.className,
                row.top_prediction.probability,
                row.is_correct !== undefined ? row.is_correct : '',
                row.corrected_label || ''
            ];

            csv += values.map(v => `"${v}"`).join(',') + '\n';
        }

        return csv;
    }

    /**
     * Convert data to TFRecord format (simplified)
     */
    async convertToTFRecord(data) {
        // This is a simplified version - in production, you'd use proper TFRecord encoding
        const records = data.map(row => ({
            features: {
                id: row.id,
                timestamp: row.timestamp,
                predictions: row.all_predictions,
                feedback: {
                    is_correct: row.is_correct,
                    corrected_label: row.corrected_label
                }
            }
        }));

        return Buffer.from(JSON.stringify(records));
    }
}

module.exports = StatsProcessor;