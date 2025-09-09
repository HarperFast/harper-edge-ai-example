/**
 * Performance Monitor - Tracks and visualizes inference performance metrics
 * Provides real-time performance insights and historical tracking
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = [];
        this.maxMetrics = 100; // Keep last 100 measurements
        this.inferenceStartTime = null;
        this.preprocessingStartTime = null;
        this.chart = null;
        this.chartData = {
            labels: [],
            datasets: [{
                label: 'Inference Time (ms)',
                data: [],
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        };
    }

    /**
     * Start inference timing
     */
    startInference() {
        this.inferenceStartTime = performance.now();
        this.preprocessingStartTime = performance.now();
        return this.inferenceStartTime;
    }

    /**
     * Mark end of preprocessing
     */
    endPreprocessing() {
        if (this.preprocessingStartTime) {
            const preprocessingTime = performance.now() - this.preprocessingStartTime;
            return preprocessingTime;
        }
        return 0;
    }

    /**
     * End inference timing and calculate metrics
     */
    endInference() {
        if (!this.inferenceStartTime) {
            return null;
        }

        const totalTime = performance.now() - this.inferenceStartTime;
        const preprocessingTime = this.endPreprocessing();

        const metrics = {
            totalTime: totalTime,
            preprocessingTime: preprocessingTime,
            inferenceTime: totalTime - preprocessingTime,
            timestamp: Date.now()
        };

        this.inferenceStartTime = null;
        this.preprocessingStartTime = null;

        return metrics;
    }

    /**
     * Add metric to history
     */
    addMetric(metric) {
        this.metrics.push(metric);

        // Keep only last N metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }

        // Calculate statistics
        this.calculateStatistics();
    }

    /**
     * Calculate performance statistics
     */
    calculateStatistics() {
        if (this.metrics.length === 0) {
            return null;
        }

        const inferenceTimes = this.metrics.map(m => m.inferenceTime);
        const confidences = this.metrics.map(m => m.confidence).filter(c => c !== undefined);

        return {
            count: this.metrics.length,
            avgInferenceTime: this.average(inferenceTimes),
            minInferenceTime: Math.min(...inferenceTimes),
            maxInferenceTime: Math.max(...inferenceTimes),
            stdInferenceTime: this.standardDeviation(inferenceTimes),
            p50InferenceTime: this.percentile(inferenceTimes, 50),
            p95InferenceTime: this.percentile(inferenceTimes, 95),
            p99InferenceTime: this.percentile(inferenceTimes, 99),
            avgConfidence: confidences.length > 0 ? this.average(confidences) : 0,
            throughput: this.calculateThroughput()
        };
    }

    /**
     * Calculate throughput (inferences per second)
     */
    calculateThroughput() {
        if (this.metrics.length < 2) {
            return 0;
        }

        const timeRange = this.metrics[this.metrics.length - 1].timestamp - this.metrics[0].timestamp;
        if (timeRange === 0) {
            return 0;
        }

        return (this.metrics.length * 1000) / timeRange; // Convert to per second
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        const stats = this.calculateStatistics();
        if (!stats) {
            return { status: 'No data available' };
        }

        const report = {
            summary: stats,
            trends: this.analyzeTrends(),
            bottlenecks: this.identifyBottlenecks(),
            recommendations: this.generateRecommendations(stats)
        };

        return report;
    }

    /**
     * Analyze performance trends
     */
    analyzeTrends() {
        if (this.metrics.length < 10) {
            return { insufficient_data: true };
        }

        // Split metrics into halves for comparison
        const midpoint = Math.floor(this.metrics.length / 2);
        const firstHalf = this.metrics.slice(0, midpoint);
        const secondHalf = this.metrics.slice(midpoint);

        const firstAvg = this.average(firstHalf.map(m => m.inferenceTime));
        const secondAvg = this.average(secondHalf.map(m => m.inferenceTime));

        const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

        return {
            trend: percentChange > 5 ? 'degrading' : percentChange < -5 ? 'improving' : 'stable',
            percentChange: percentChange,
            firstHalfAvg: firstAvg,
            secondHalfAvg: secondAvg
        };
    }

    /**
     * Identify performance bottlenecks
     */
    identifyBottlenecks() {
        const bottlenecks = [];
        const stats = this.calculateStatistics();

        if (!stats) {
            return bottlenecks;
        }

        // Check for high variance
        if (stats.stdInferenceTime > stats.avgInferenceTime * 0.5) {
            bottlenecks.push({
                type: 'high_variance',
                severity: 'medium',
                description: 'Inference times are highly variable',
                impact: `Standard deviation: ${stats.stdInferenceTime.toFixed(1)}ms`
            });
        }

        // Check for outliers
        const outliers = this.metrics.filter(m => 
            m.inferenceTime > stats.p95InferenceTime * 1.5
        );

        if (outliers.length > 0) {
            bottlenecks.push({
                type: 'outliers',
                severity: 'low',
                description: `${outliers.length} inference outliers detected`,
                impact: 'May indicate intermittent performance issues'
            });
        }

        // Check for memory pressure
        const memoryMetrics = this.metrics.filter(m => m.memoryUsage).map(m => m.memoryUsage);
        if (memoryMetrics.length > 0) {
            const avgMemory = this.average(memoryMetrics);
            if (avgMemory > 100 * 1024 * 1024) { // 100MB
                bottlenecks.push({
                    type: 'high_memory',
                    severity: 'high',
                    description: 'High memory usage detected',
                    impact: `Average: ${(avgMemory / 1024 / 1024).toFixed(1)}MB`
                });
            }
        }

        return bottlenecks;
    }

    /**
     * Generate performance recommendations
     */
    generateRecommendations(stats) {
        const recommendations = [];

        // Check inference time
        if (stats.avgInferenceTime > 100) {
            recommendations.push({
                priority: 'high',
                category: 'performance',
                suggestion: 'Consider using a smaller model (lower alpha value) for faster inference',
                expectedImprovement: '2-4x faster inference'
            });
        }

        // Check variance
        if (stats.stdInferenceTime > stats.avgInferenceTime * 0.3) {
            recommendations.push({
                priority: 'medium',
                category: 'stability',
                suggestion: 'Implement model warmup to reduce inference time variance',
                expectedImprovement: 'More consistent performance'
            });
        }

        // Check percentile distribution
        if (stats.p99InferenceTime > stats.p50InferenceTime * 3) {
            recommendations.push({
                priority: 'medium',
                category: 'reliability',
                suggestion: 'Investigate and address performance outliers',
                expectedImprovement: 'Better worst-case performance'
            });
        }

        // Check throughput
        if (stats.throughput < 10) {
            recommendations.push({
                priority: 'low',
                category: 'optimization',
                suggestion: 'Consider batch processing for higher throughput',
                expectedImprovement: 'Higher overall throughput'
            });
        }

        return recommendations;
    }

    /**
     * Update performance chart
     */
    updateChart(inferenceTime) {
        // Add new data point
        const timestamp = new Date().toLocaleTimeString();
        this.chartData.labels.push(timestamp);
        this.chartData.datasets[0].data.push(inferenceTime);

        // Keep only last 20 points for visualization
        if (this.chartData.labels.length > 20) {
            this.chartData.labels.shift();
            this.chartData.datasets[0].data.shift();
        }

        // Update chart if it exists
        if (this.chart) {
            this.chart.update();
        } else {
            this.initializeChart();
        }
    }

    /**
     * Initialize Chart.js chart
     */
    initializeChart() {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) return;

        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            // Load Chart.js dynamically
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => {
                this.createChart(canvas);
            };
            document.head.appendChild(script);
        } else {
            this.createChart(canvas);
        }
    }

    /**
     * Create the chart instance
     */
    createChart(canvas) {
        const ctx = canvas.getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: this.chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Inference Time (ms)'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Export performance data
     */
    exportMetrics() {
        const report = this.getPerformanceReport();
        const exportData = {
            timestamp: Date.now(),
            metrics: this.metrics,
            report: report
        };

        return exportData;
    }

    /**
     * Utility: Calculate average
     */
    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Utility: Calculate standard deviation
     */
    standardDeviation(arr) {
        if (arr.length === 0) return 0;
        const avg = this.average(arr);
        const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
        return Math.sqrt(this.average(squareDiffs));
    }

    /**
     * Utility: Calculate percentile
     */
    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = [];
        this.chartData.labels = [];
        this.chartData.datasets[0].data = [];
        if (this.chart) {
            this.chart.update();
        }
    }
}

export default PerformanceMonitor;