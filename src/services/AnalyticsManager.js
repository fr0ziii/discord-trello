const { getDatabase } = require('../database/connection');

class AnalyticsManager {
    constructor() {
        this.db = getDatabase();
        this.metricsBuffer = new Map(); // Buffer for batch inserts
        this.bufferSize = 100;
        this.flushInterval = 30000; // 30 seconds
        this.performanceMetrics = {
            commandCounts: new Map(),
            responseTimes: [],
            errorCounts: new Map(),
            lastFlush: Date.now()
        };
        
        // Start periodic flush
        this.startPeriodicFlush();
    }

    /**
     * Record command execution analytics
     */
    async recordCommandExecution(guildId, channelId, userId, command, args = [], executionTime = 0, success = true, errorMessage = null, boardId = null) {
        try {
            const analyticsData = {
                guild_id: guildId,
                channel_id: channelId,
                user_id: userId,
                command: command,
                command_args: args.length > 0 ? args.join(' ') : null,
                execution_time: executionTime,
                success: success ? 1 : 0,
                error_message: errorMessage,
                board_id: boardId,
                timestamp: new Date().toISOString()
            };

            // Add to buffer for batch processing
            const bufferId = `${Date.now()}_${Math.random()}`;
            this.metricsBuffer.set(bufferId, analyticsData);

            // Update in-memory performance metrics
            this.updatePerformanceMetrics(command, executionTime, success, errorMessage);

            // Flush if buffer is full
            if (this.metricsBuffer.size >= this.bufferSize) {
                await this.flushMetricsBuffer();
            }

            return true;

        } catch (error) {
            console.error('❌ Error recording command execution:', error);
            return false;
        }
    }

    /**
     * Update in-memory performance metrics for real-time monitoring
     */
    updatePerformanceMetrics(command, executionTime, success, errorMessage) {
        // Update command counts
        const currentCount = this.performanceMetrics.commandCounts.get(command) || 0;
        this.performanceMetrics.commandCounts.set(command, currentCount + 1);

        // Update response times (keep last 1000 entries)
        this.performanceMetrics.responseTimes.push(executionTime);
        if (this.performanceMetrics.responseTimes.length > 1000) {
            this.performanceMetrics.responseTimes.shift();
        }

        // Update error counts
        if (!success && errorMessage) {
            const errorKey = this.categorizeError(errorMessage);
            const currentErrorCount = this.performanceMetrics.errorCounts.get(errorKey) || 0;
            this.performanceMetrics.errorCounts.set(errorKey, currentErrorCount + 1);
        }
    }

    /**
     * Categorize errors for better analytics
     */
    categorizeError(errorMessage) {
        const message = errorMessage.toLowerCase();
        
        if (message.includes('permission') || message.includes('unauthorized')) {
            return 'permission_error';
        } else if (message.includes('network') || message.includes('timeout')) {
            return 'network_error';
        } else if (message.includes('trello') || message.includes('api')) {
            return 'api_error';
        } else if (message.includes('database') || message.includes('sql')) {
            return 'database_error';
        } else if (message.includes('validation') || message.includes('invalid')) {
            return 'validation_error';
        } else {
            return 'other_error';
        }
    }

    /**
     * Flush metrics buffer to database
     */
    async flushMetricsBuffer() {
        if (this.metricsBuffer.size === 0) return;

        try {
            const metricsToFlush = Array.from(this.metricsBuffer.values());
            this.metricsBuffer.clear();

            // Batch insert to database
            const insertQuery = `
                INSERT INTO usage_analytics 
                (guild_id, channel_id, user_id, command, command_args, execution_time, success, error_message, board_id, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            for (const metric of metricsToFlush) {
                await this.db.runQuery(insertQuery, [
                    metric.guild_id,
                    metric.channel_id,
                    metric.user_id,
                    metric.command,
                    metric.command_args,
                    metric.execution_time,
                    metric.success,
                    metric.error_message,
                    metric.board_id,
                    metric.timestamp
                ]);
            }

            console.log(`📊 Flushed ${metricsToFlush.length} analytics metrics to database`);

        } catch (error) {
            console.error('❌ Error flushing metrics buffer:', error);
        }
    }

    /**
     * Start periodic buffer flush
     */
    startPeriodicFlush() {
        setInterval(async () => {
            await this.flushMetricsBuffer();
            this.performanceMetrics.lastFlush = Date.now();
        }, this.flushInterval);
    }

    /**
     * Get usage analytics for a specific guild
     */
    async getGuildAnalytics(guildId, timeframe = '30d') {
        try {
            const timeCondition = this.getTimeCondition(timeframe);
            
            // Command usage statistics
            const commandStats = await this.db.allQuery(`
                SELECT command, COUNT(*) as count, AVG(execution_time) as avg_time, 
                       (SUM(success) * 100.0 / COUNT(*)) as success_rate
                FROM usage_analytics 
                WHERE guild_id = ? AND ${timeCondition}
                GROUP BY command 
                ORDER BY count DESC
            `, [guildId]);

            // Channel activity
            const channelStats = await this.db.allQuery(`
                SELECT channel_id, COUNT(*) as activity_count, 
                       COUNT(DISTINCT user_id) as unique_users
                FROM usage_analytics 
                WHERE guild_id = ? AND ${timeCondition}
                GROUP BY channel_id 
                ORDER BY activity_count DESC
            `, [guildId]);

            // User activity
            const userStats = await this.db.allQuery(`
                SELECT user_id, COUNT(*) as command_count, 
                       COUNT(DISTINCT command) as unique_commands
                FROM usage_analytics 
                WHERE guild_id = ? AND ${timeCondition}
                GROUP BY user_id 
                ORDER BY command_count DESC
                LIMIT 10
            `, [guildId]);

            // Daily activity trend
            const dailyActivity = await this.db.allQuery(`
                SELECT DATE(timestamp) as date, COUNT(*) as commands, 
                       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
                FROM usage_analytics 
                WHERE guild_id = ? AND ${timeCondition}
                GROUP BY DATE(timestamp) 
                ORDER BY date DESC
                LIMIT 30
            `, [guildId]);

            // Error analysis
            const errorStats = await this.db.allQuery(`
                SELECT error_message, COUNT(*) as error_count
                FROM usage_analytics 
                WHERE guild_id = ? AND success = 0 AND ${timeCondition}
                GROUP BY error_message 
                ORDER BY error_count DESC
                LIMIT 10
            `, [guildId]);

            // Board usage statistics
            const boardStats = await this.db.allQuery(`
                SELECT board_id, COUNT(*) as usage_count, 
                       COUNT(DISTINCT user_id) as unique_users
                FROM usage_analytics 
                WHERE guild_id = ? AND board_id IS NOT NULL AND ${timeCondition}
                GROUP BY board_id 
                ORDER BY usage_count DESC
            `, [guildId]);

            return {
                timeframe,
                summary: {
                    totalCommands: commandStats.reduce((sum, stat) => sum + stat.count, 0),
                    uniqueUsers: userStats.length,
                    averageResponseTime: commandStats.reduce((sum, stat) => sum + (stat.avg_time || 0), 0) / Math.max(commandStats.length, 1),
                    overallSuccessRate: commandStats.reduce((sum, stat) => sum + (stat.success_rate || 0), 0) / Math.max(commandStats.length, 1)
                },
                commands: commandStats,
                channels: channelStats,
                users: userStats,
                dailyActivity,
                errors: errorStats,
                boards: boardStats,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error getting guild analytics:', error);
            return this.getEmptyAnalytics(timeframe);
        }
    }

    /**
     * Get real-time performance metrics
     */
    getRealTimeMetrics() {
        const responseTimes = this.performanceMetrics.responseTimes;
        const avgResponseTime = responseTimes.length > 0 
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
            : 0;

        const totalCommands = Array.from(this.performanceMetrics.commandCounts.values())
            .reduce((sum, count) => sum + count, 0);

        const totalErrors = Array.from(this.performanceMetrics.errorCounts.values())
            .reduce((sum, count) => sum + count, 0);

        const errorRate = totalCommands > 0 ? (totalErrors / totalCommands) * 100 : 0;
        const successRate = 100 - errorRate;

        return {
            averageResponseTime: Math.round(avgResponseTime),
            successRate: Math.round(successRate * 100) / 100,
            errorRate: Math.round(errorRate * 100) / 100,
            totalCommands,
            totalErrors,
            bufferSize: this.metricsBuffer.size,
            lastFlush: this.performanceMetrics.lastFlush,
            topCommands: this.getTopCommands(5),
            topErrors: this.getTopErrors(5),
            timestamp: Date.now()
        };
    }

    /**
     * Get system-wide analytics across all guilds
     */
    async getSystemAnalytics(timeframe = '30d') {
        try {
            const timeCondition = this.getTimeCondition(timeframe);

            // Global command statistics
            const globalCommandStats = await this.db.allQuery(`
                SELECT command, COUNT(*) as count, AVG(execution_time) as avg_time
                FROM usage_analytics 
                WHERE ${timeCondition}
                GROUP BY command 
                ORDER BY count DESC
            `);

            // Guild activity ranking
            const guildActivity = await this.db.allQuery(`
                SELECT guild_id, COUNT(*) as activity_count, 
                       COUNT(DISTINCT user_id) as unique_users,
                       COUNT(DISTINCT channel_id) as active_channels
                FROM usage_analytics 
                WHERE ${timeCondition}
                GROUP BY guild_id 
                ORDER BY activity_count DESC
                LIMIT 20
            `);

            // Performance trends
            const performanceTrends = await this.db.allQuery(`
                SELECT DATE(timestamp) as date, 
                       AVG(execution_time) as avg_response_time,
                       (SUM(success) * 100.0 / COUNT(*)) as success_rate,
                       COUNT(*) as total_commands
                FROM usage_analytics 
                WHERE ${timeCondition}
                GROUP BY DATE(timestamp) 
                ORDER BY date DESC
                LIMIT 30
            `);

            // Popular board usage across system
            const boardUsage = await this.db.allQuery(`
                SELECT board_id, COUNT(*) as usage_count, 
                       COUNT(DISTINCT guild_id) as guild_count,
                       COUNT(DISTINCT user_id) as user_count
                FROM usage_analytics 
                WHERE board_id IS NOT NULL AND ${timeCondition}
                GROUP BY board_id 
                ORDER BY usage_count DESC
                LIMIT 15
            `);

            return {
                timeframe,
                globalStats: {
                    totalCommands: globalCommandStats.reduce((sum, stat) => sum + stat.count, 0),
                    activeGuilds: guildActivity.length,
                    averageResponseTime: globalCommandStats.reduce((sum, stat) => sum + (stat.avg_time || 0), 0) / Math.max(globalCommandStats.length, 1)
                },
                commands: globalCommandStats,
                guilds: guildActivity,
                performance: performanceTrends,
                boards: boardUsage,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error getting system analytics:', error);
            return this.getEmptySystemAnalytics(timeframe);
        }
    }

    /**
     * Record system metric for monitoring
     */
    async recordSystemMetric(metricName, metricValue) {
        try {
            await this.db.runQuery(`
                INSERT INTO system_statistics (metric_name, metric_value, timestamp)
                VALUES (?, ?, datetime('now'))
            `, [metricName, JSON.stringify(metricValue)]);

            return true;

        } catch (error) {
            console.error('❌ Error recording system metric:', error);
            return false;
        }
    }

    /**
     * Get health metrics for monitoring
     */
    async getHealthMetrics() {
        try {
            const recentMetrics = await this.db.allQuery(`
                SELECT metric_name, metric_value, timestamp
                FROM system_statistics 
                WHERE timestamp > datetime('now', '-1 hour')
                ORDER BY timestamp DESC
            `);

            const dbHealth = await this.testDatabaseHealth();
            const realTimeMetrics = this.getRealTimeMetrics();

            return {
                healthy: dbHealth.healthy && realTimeMetrics.errorRate < 10,
                database: dbHealth,
                realTime: realTimeMetrics,
                recentMetrics: recentMetrics.map(metric => ({
                    name: metric.metric_name,
                    value: JSON.parse(metric.metric_value),
                    timestamp: metric.timestamp
                })),
                bufferStatus: {
                    size: this.metricsBuffer.size,
                    maxSize: this.bufferSize,
                    utilizationPercent: (this.metricsBuffer.size / this.bufferSize) * 100
                }
            };

        } catch (error) {
            console.error('❌ Error getting health metrics:', error);
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get analytics dashboard data
     */
    async getDashboardData(guildId, timeframe = '7d') {
        try {
            const analytics = await this.getGuildAnalytics(guildId, timeframe);
            const realTime = this.getRealTimeMetrics();
            
            // Calculate trends and insights
            const insights = await this.generateInsights(analytics);
            
            return {
                overview: analytics.summary,
                realTime,
                trends: {
                    dailyActivity: analytics.dailyActivity,
                    topCommands: analytics.commands.slice(0, 5),
                    topChannels: analytics.channels.slice(0, 5),
                    topUsers: analytics.users.slice(0, 5)
                },
                insights,
                health: {
                    systemHealth: realTime.successRate > 95 ? 'excellent' : realTime.successRate > 90 ? 'good' : 'needs_attention',
                    responseTime: realTime.averageResponseTime < 500 ? 'fast' : realTime.averageResponseTime < 1000 ? 'acceptable' : 'slow',
                    errorRate: realTime.errorRate < 1 ? 'low' : realTime.errorRate < 5 ? 'moderate' : 'high'
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error getting dashboard data:', error);
            return this.getEmptyDashboard(timeframe);
        }
    }

    // Helper methods
    getTimeCondition(timeframe) {
        const conditions = {
            '1d': "timestamp > datetime('now', '-1 day')",
            '7d': "timestamp > datetime('now', '-7 days')",
            '30d': "timestamp > datetime('now', '-30 days')",
            '90d': "timestamp > datetime('now', '-90 days')",
            'all': '1=1'
        };
        
        return conditions[timeframe] || conditions['30d'];
    }

    getTopCommands(limit = 5) {
        return Array.from(this.performanceMetrics.commandCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([command, count]) => ({ command, count }));
    }

    getTopErrors(limit = 5) {
        return Array.from(this.performanceMetrics.errorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([error, count]) => ({ error, count }));
    }

    async testDatabaseHealth() {
        try {
            const startTime = Date.now();
            await this.db.getQuery('SELECT 1');
            const responseTime = Date.now() - startTime;
            
            return {
                healthy: true,
                responseTime,
                status: 'connected'
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                status: 'disconnected'
            };
        }
    }

    async generateInsights(analytics) {
        const insights = [];
        
        // Performance insights
        if (analytics.summary.averageResponseTime > 1000) {
            insights.push({
                type: 'performance',
                severity: 'warning',
                message: 'Average response time is above 1 second',
                suggestion: 'Consider optimizing database queries or increasing server resources'
            });
        }
        
        // Usage insights
        if (analytics.summary.totalCommands > 1000) {
            insights.push({
                type: 'usage',
                severity: 'info',
                message: 'High command usage detected',
                suggestion: 'Your server is actively using the bot - consider exploring advanced features'
            });
        }
        
        // Error insights
        if (analytics.summary.overallSuccessRate < 95) {
            insights.push({
                type: 'reliability',
                severity: 'error',
                message: 'Success rate is below 95%',
                suggestion: 'Check error logs and configurations for potential issues'
            });
        }
        
        return insights;
    }

    getEmptyAnalytics(timeframe) {
        return {
            timeframe,
            summary: { totalCommands: 0, uniqueUsers: 0, averageResponseTime: 0, overallSuccessRate: 0 },
            commands: [],
            channels: [],
            users: [],
            dailyActivity: [],
            errors: [],
            boards: [],
            generatedAt: new Date().toISOString()
        };
    }

    getEmptySystemAnalytics(timeframe) {
        return {
            timeframe,
            globalStats: { totalCommands: 0, activeGuilds: 0, averageResponseTime: 0 },
            commands: [],
            guilds: [],
            performance: [],
            boards: [],
            generatedAt: new Date().toISOString()
        };
    }

    getEmptyDashboard(timeframe) {
        return {
            overview: { totalCommands: 0, uniqueUsers: 0, averageResponseTime: 0, overallSuccessRate: 0 },
            realTime: { averageResponseTime: 0, successRate: 0, errorRate: 0, totalCommands: 0 },
            trends: { dailyActivity: [], topCommands: [], topChannels: [], topUsers: [] },
            insights: [],
            health: { systemHealth: 'unknown', responseTime: 'unknown', errorRate: 'unknown' },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Cleanup old analytics data
     */
    async cleanupOldData(retentionDays = 90) {
        try {
            const result = await this.db.runQuery(`
                DELETE FROM usage_analytics 
                WHERE timestamp < datetime('now', '-${retentionDays} days')
            `);

            const systemResult = await this.db.runQuery(`
                DELETE FROM system_statistics 
                WHERE timestamp < datetime('now', '-${retentionDays} days')
            `);

            console.log(`🧹 Cleaned up analytics data older than ${retentionDays} days`);
            return true;

        } catch (error) {
            console.error('❌ Error cleaning up old analytics data:', error);
            return false;
        }
    }
}

module.exports = { AnalyticsManager };