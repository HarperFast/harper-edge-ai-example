/**
 * Database Module - SQLite database for storing inference statistics
 * Provides efficient storage and retrieval of statistics for model retraining
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class Database {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../data/statistics.db');
        this.db = null;
    }

    /**
     * Initialize database and create tables
     */
    async initialize() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        await fs.mkdir(dataDir, { recursive: true });

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables()
                        .then(() => this.createIndexes())
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    /**
     * Create database tables
     */
    async createTables() {
        const queries = [
            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                device_info TEXT,
                created_at INTEGER,
                last_activity INTEGER,
                total_inferences INTEGER DEFAULT 0
            )`,

            // Statistics table
            `CREATE TABLE IF NOT EXISTS statistics (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                timestamp INTEGER,
                model_version TEXT,
                model_alpha REAL,
                inference_time REAL,
                preprocessing_time REAL,
                total_time REAL,
                memory_usage TEXT,
                top_prediction TEXT,
                all_predictions TEXT,
                input_metadata TEXT,
                user_feedback TEXT,
                page_url TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )`,

            // User feedback table
            `CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stat_id TEXT,
                is_correct INTEGER,
                corrected_label TEXT,
                confidence REAL,
                timestamp INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                FOREIGN KEY (stat_id) REFERENCES statistics(id)
            )`,

            // Performance metrics table
            `CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                total_inferences INTEGER,
                average_inference_time REAL,
                min_inference_time REAL,
                max_inference_time REAL,
                average_confidence REAL,
                accuracy_rate REAL,
                unique_sessions INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )`,

            // Retraining jobs table
            `CREATE TABLE IF NOT EXISTS retraining_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT,
                triggered_at INTEGER,
                completed_at INTEGER,
                data_points_used INTEGER,
                confidence_threshold REAL,
                result TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }
        console.log('Database tables created');
    }

    /**
     * Create database indexes for performance
     */
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_statistics_session ON statistics(session_id)',
            'CREATE INDEX IF NOT EXISTS idx_statistics_timestamp ON statistics(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_statistics_created ON statistics(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_feedback_stat ON user_feedback(stat_id)',
            'CREATE INDEX IF NOT EXISTS idx_metrics_date ON performance_metrics(date)'
        ];

        for (const index of indexes) {
            await this.run(index);
        }
        console.log('Database indexes created');
    }

    /**
     * Store statistics batch
     */
    async storeStatistics(data) {
        const { sessionId, deviceInfo, statistics, receivedAt } = data;
        
        // Begin transaction
        await this.run('BEGIN TRANSACTION');

        try {
            // Upsert session
            await this.run(
                `INSERT OR REPLACE INTO sessions (id, device_info, created_at, last_activity, total_inferences)
                VALUES (?, ?, ?, ?, 
                    COALESCE((SELECT total_inferences FROM sessions WHERE id = ?), 0) + ?)`,
                [sessionId, JSON.stringify(deviceInfo), receivedAt, receivedAt, sessionId, statistics.length]
            );

            // Insert statistics
            let stored = 0;
            for (const stat of statistics) {
                try {
                    await this.run(
                        `INSERT INTO statistics 
                        (id, session_id, timestamp, model_version, model_alpha, 
                         inference_time, preprocessing_time, total_time, memory_usage,
                         top_prediction, all_predictions, input_metadata, user_feedback, page_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            stat.id,
                            sessionId,
                            stat.timestamp,
                            stat.modelVersion,
                            stat.modelAlpha,
                            stat.inferenceTime,
                            stat.preprocessingTime || 0,
                            stat.totalTime || stat.inferenceTime,
                            JSON.stringify(stat.memoryUsage),
                            JSON.stringify(stat.topPrediction),
                            JSON.stringify(stat.predictions),
                            JSON.stringify(stat.inputMetadata || {}),
                            JSON.stringify(stat.userFeedback),
                            stat.pageUrl
                        ]
                    );

                    // Store user feedback if present
                    if (stat.userFeedback) {
                        await this.storeUserFeedback(stat.id, stat.userFeedback);
                    }

                    stored++;
                } catch (err) {
                    console.error('Error storing stat:', err);
                }
            }

            // Commit transaction
            await this.run('COMMIT');

            // Update daily metrics
            await this.updateDailyMetrics();

            return { stored, total: statistics.length };

        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Store user feedback
     */
    async storeUserFeedback(statId, feedback) {
        return this.run(
            `INSERT INTO user_feedback (stat_id, is_correct, corrected_label, confidence, timestamp)
            VALUES (?, ?, ?, ?, ?)`,
            [
                statId,
                feedback.isCorrect ? 1 : 0,
                feedback.correctedLabel,
                feedback.confidence,
                feedback.timestamp
            ]
        );
    }

    /**
     * Update daily performance metrics
     */
    async updateDailyMetrics() {
        const date = new Date().toISOString().split('T')[0];
        
        const metrics = await this.get(
            `SELECT 
                COUNT(*) as total_inferences,
                AVG(inference_time) as avg_inference_time,
                MIN(inference_time) as min_inference_time,
                MAX(inference_time) as max_inference_time,
                AVG(json_extract(top_prediction, '$.probability')) as avg_confidence,
                COUNT(DISTINCT session_id) as unique_sessions
            FROM statistics
            WHERE DATE(timestamp/1000, 'unixepoch') = ?`,
            [date]
        );

        // Calculate accuracy if feedback is available
        const accuracy = await this.get(
            `SELECT 
                CAST(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / 
                NULLIF(COUNT(*), 0) as accuracy_rate
            FROM user_feedback f
            JOIN statistics s ON f.stat_id = s.id
            WHERE DATE(s.timestamp/1000, 'unixepoch') = ?`,
            [date]
        );

        await this.run(
            `INSERT OR REPLACE INTO performance_metrics 
            (date, total_inferences, average_inference_time, min_inference_time, 
             max_inference_time, average_confidence, accuracy_rate, unique_sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                date,
                metrics.total_inferences,
                metrics.avg_inference_time,
                metrics.min_inference_time,
                metrics.max_inference_time,
                metrics.avg_confidence,
                accuracy?.accuracy_rate || null,
                metrics.unique_sessions
            ]
        );
    }

    /**
     * Get statistics summary
     */
    async getStatisticsSummary(filters = {}) {
        let query = `
            SELECT 
                COUNT(*) as total_inferences,
                COUNT(DISTINCT session_id) as unique_sessions,
                AVG(inference_time) as avg_inference_time,
                MIN(inference_time) as min_inference_time,
                MAX(inference_time) as max_inference_time,
                AVG(json_extract(top_prediction, '$.probability')) as avg_confidence,
                MIN(timestamp) as first_inference,
                MAX(timestamp) as last_inference
            FROM statistics
            WHERE 1=1
        `;

        const params = [];

        if (filters.startDate) {
            query += ' AND timestamp >= ?';
            params.push(filters.startDate.getTime());
        }

        if (filters.endDate) {
            query += ' AND timestamp <= ?';
            params.push(filters.endDate.getTime());
        }

        if (filters.sessionId) {
            query += ' AND session_id = ?';
            params.push(filters.sessionId);
        }

        const summary = await this.get(query, params);

        // Get top predictions
        const topPredictions = await this.all(
            `SELECT 
                json_extract(top_prediction, '$.className') as class_name,
                COUNT(*) as count,
                AVG(json_extract(top_prediction, '$.probability')) as avg_probability
            FROM statistics
            WHERE 1=1 ${filters.sessionId ? 'AND session_id = ?' : ''}
            GROUP BY class_name
            ORDER BY count DESC
            LIMIT 10`,
            filters.sessionId ? [filters.sessionId] : []
        );

        // Get performance by hour
        const hourlyPerformance = await this.all(
            `SELECT 
                strftime('%H', timestamp/1000, 'unixepoch') as hour,
                COUNT(*) as count,
                AVG(inference_time) as avg_time
            FROM statistics
            WHERE timestamp >= ?
            GROUP BY hour
            ORDER BY hour`,
            [Date.now() - 24 * 60 * 60 * 1000] // Last 24 hours
        );

        return {
            ...summary,
            topPredictions,
            hourlyPerformance
        };
    }

    /**
     * Export training data
     */
    async exportTrainingData(options = {}) {
        const { includeUserFeedback = true, minConfidence = 0 } = options;

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
            WHERE json_extract(s.top_prediction, '$.probability') >= ?
            ORDER BY s.timestamp DESC
            LIMIT 10000
        `;

        const data = await this.all(query, [minConfidence]);

        // Parse JSON fields
        return data.map(row => ({
            ...row,
            top_prediction: JSON.parse(row.top_prediction),
            all_predictions: JSON.parse(row.all_predictions),
            input_metadata: JSON.parse(row.input_metadata || '{}')
        }));
    }

    /**
     * Clean up old statistics
     */
    async cleanupOldStatistics(daysToKeep) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        
        const result = await this.run(
            'DELETE FROM statistics WHERE timestamp < ?',
            [cutoffTime]
        );

        // Clean up orphaned sessions
        await this.run(
            `DELETE FROM sessions 
            WHERE id NOT IN (SELECT DISTINCT session_id FROM statistics)`
        );

        return {
            deletedStatistics: result.changes,
            cutoffDate: new Date(cutoffTime).toISOString()
        };
    }

    /**
     * Helper: Run query
     */
    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Helper: Get single row
     */
    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Helper: Get all rows
     */
    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Close database connection
     */
    close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        console.log('Database connection closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Database;