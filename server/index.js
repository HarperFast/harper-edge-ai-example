/**
 * E-Commerce Personalization Server
 * Handles metrics collection, user behavior tracking, and model retraining for recommendation systems
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
const Database = require('./database');
const StatsProcessor = require('./stats-processor');
const ModelRetrainer = require('./model-retrainer');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database and processors
const db = new Database();
const statsProcessor = new StatsProcessor(db);
const modelRetrainer = new ModelRetrainer(db);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for TensorFlow.js
}));
app.use(compression());
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));
app.use('/models', express.static(path.join(__dirname, '../models')));

// API Routes

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

/**
 * Receive e-commerce metrics and behavior data
 */
app.post('/api/metrics', async (req, res) => {
    try {
        const { sessionId, userId, deviceInfo, interactions, recommendations, conversions, realtimeMetrics } = req.body;
        
        // Validate payload
        if (!sessionId) {
            return res.status(400).json({
                error: 'Invalid payload',
                message: 'Missing session ID'
            });
        }

        const totalEvents = (interactions?.length || 0) + (recommendations?.length || 0) + (conversions?.length || 0);
        console.log(`Received ${totalEvents} events from session ${sessionId}`);

        // Store e-commerce metrics in database
        const result = await db.storeEcommerceMetrics({
            sessionId,
            userId,
            deviceInfo,
            interactions,
            recommendations,
            conversions,
            realtimeMetrics,
            receivedAt: Date.now()
        });

        // Process e-commerce metrics for insights
        const insights = await statsProcessor.processEcommerceMetrics({
            interactions,
            recommendations,
            conversions,
            realtimeMetrics
        });

        // Check if retraining is needed
        const retrainingStatus = await modelRetrainer.checkRetrainingTrigger();

        res.json({
            success: true,
            received: totalEvents,
            stored: result.stored,
            insights: insights,
            retrainingStatus: retrainingStatus,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error processing statistics:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Get aggregated statistics
 */
app.get('/api/statistics/summary', async (req, res) => {
    try {
        const { startDate, endDate, sessionId } = req.query;
        
        const summary = await db.getStatisticsSummary({
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            sessionId: sessionId || null
        });

        res.json({
            success: true,
            summary: summary,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error getting summary:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Export data for retraining
 */
app.get('/api/export/training-data', async (req, res) => {
    try {
        const { format = 'json', includeUserFeedback = true, minConfidence = 0 } = req.query;
        
        const exportData = await db.exportTrainingData({
            includeUserFeedback: includeUserFeedback === 'true',
            minConfidence: parseFloat(minConfidence)
        });

        if (format === 'csv') {
            // Convert to CSV format
            const csv = await statsProcessor.convertToCSV(exportData);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=training-data.csv');
            res.send(csv);
        } else if (format === 'tfrecord') {
            // Convert to TFRecord format for TensorFlow
            const tfrecord = await statsProcessor.convertToTFRecord(exportData);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment; filename=training-data.tfrecord');
            res.send(tfrecord);
        } else {
            // Default JSON format
            res.json({
                success: true,
                dataPoints: exportData.length,
                exportedAt: Date.now(),
                data: exportData
            });
        }

    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Get model performance metrics
 */
app.get('/api/metrics/performance', async (req, res) => {
    try {
        const metrics = await statsProcessor.calculatePerformanceMetrics();
        
        res.json({
            success: true,
            metrics: metrics,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error calculating metrics:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Trigger model retraining
 */
app.post('/api/retrain/trigger', async (req, res) => {
    try {
        const { minDataPoints = 1000, confidenceThreshold = 0.8 } = req.body;
        
        const retrainingResult = await modelRetrainer.triggerRetraining({
            minDataPoints,
            confidenceThreshold
        });

        res.json({
            success: true,
            result: retrainingResult,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error triggering retraining:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Get retraining status
 */
app.get('/api/retrain/status', async (req, res) => {
    try {
        const status = await modelRetrainer.getRetrainingStatus();
        
        res.json({
            success: true,
            status: status,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error getting retraining status:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Clean up old statistics
 */
app.post('/api/maintenance/cleanup', async (req, res) => {
    try {
        const { daysToKeep = 30 } = req.body;
        
        const cleanupResult = await db.cleanupOldStatistics(daysToKeep);
        
        res.json({
            success: true,
            result: cleanupResult,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error during cleanup:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Serve the client application
 */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    });
});

// Initialize database and start server
async function startServer() {
    try {
        await db.initialize();
        console.log('Database initialized');

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('API Endpoints:');
            console.log('  POST /api/metrics - Receive e-commerce metrics');
            console.log('  GET  /api/statistics/summary - Get aggregated statistics');
            console.log('  GET  /api/export/training-data - Export data for retraining');
            console.log('  GET  /api/metrics/performance - Get model performance metrics');
            console.log('  POST /api/retrain/trigger - Trigger model retraining');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await db.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await db.close();
    process.exit(0);
});

startServer();