const { getDatabase } = require('../database/connection');
const { EmbedBuilder } = require('discord.js');

class AuditLogger {
    constructor() {
        this.db = getDatabase();
        this.logBuffer = new Map(); // Buffer for batch inserts
        this.bufferSize = 50;
        this.flushInterval = 15000; // 15 seconds
        this.severityLevels = {
            LOW: 1,
            MEDIUM: 2,
            HIGH: 3,
            CRITICAL: 4
        };
        
        // Start periodic flush
        this.startPeriodicFlush();
    }

    /**
     * Log administrative action
     */
    async logAdminAction(guildId, userId, userTag, action, targetType = null, targetId = null, details = null, success = true, ipAddress = null) {
        return await this.logAuditEvent({
            guild_id: guildId,
            user_id: userId,
            user_tag: userTag,
            action: `admin_${action}`,
            target_type: targetType,
            target_id: targetId,
            details: details,
            success: success ? 1 : 0,
            ip_address: ipAddress,
            severity: this.getActionSeverity(action),
            category: 'administration'
        });
    }

    /**
     * Log configuration change
     */
    async logConfigurationChange(guildId, userId, userTag, changeType, oldValue, newValue, channelId = null, success = true) {
        const details = {
            changeType,
            oldValue: this.sanitizeValue(oldValue),
            newValue: this.sanitizeValue(newValue),
            channelId
        };

        return await this.logAuditEvent({
            guild_id: guildId,
            user_id: userId,
            user_tag: userTag,
            action: `config_${changeType}`,
            target_type: 'configuration',
            target_id: channelId,
            details: JSON.stringify(details),
            success: success ? 1 : 0,
            severity: this.getConfigurationSeverity(changeType),
            category: 'configuration'
        });
    }

    /**
     * Log permission change
     */
    async logPermissionChange(guildId, userId, userTag, permissionAction, targetUserId, roleId, permissionLevel, success = true) {
        const details = {
            permissionAction,
            targetUserId,
            roleId,
            permissionLevel,
            timestamp: new Date().toISOString()
        };

        return await this.logAuditEvent({
            guild_id: guildId,
            user_id: userId,
            user_tag: userTag,
            action: `permission_${permissionAction}`,
            target_type: 'permission',
            target_id: targetUserId || roleId,
            details: JSON.stringify(details),
            success: success ? 1 : 0,
            severity: this.severityLevels.HIGH,
            category: 'security'
        });
    }

    /**
     * Log security event
     */
    async logSecurityEvent(guildId, userId, userTag, eventType, details = null, severity = 'MEDIUM', ipAddress = null) {
        return await this.logAuditEvent({
            guild_id: guildId,
            user_id: userId,
            user_tag: userTag,
            action: `security_${eventType}`,
            target_type: 'security',
            target_id: null,
            details: details ? JSON.stringify(details) : null,
            success: 1,
            ip_address: ipAddress,
            severity: this.severityLevels[severity.toUpperCase()] || this.severityLevels.MEDIUM,
            category: 'security'
        });
    }

    /**
     * Log webhook event
     */
    async logWebhookEvent(guildId, userId, userTag, webhookAction, boardId, webhookId, success = true, error = null) {
        const details = {
            webhookAction,
            boardId,
            webhookId,
            error: error ? error.message : null
        };

        return await this.logAuditEvent({
            guild_id: guildId,
            user_id: userId,
            user_tag: userTag,
            action: `webhook_${webhookAction}`,
            target_type: 'webhook',
            target_id: webhookId,
            details: JSON.stringify(details),
            success: success ? 1 : 0,
            severity: success ? this.severityLevels.LOW : this.severityLevels.MEDIUM,
            category: 'webhook'
        });
    }

    /**
     * Log system event
     */
    async logSystemEvent(eventType, details = null, severity = 'LOW') {
        return await this.logAuditEvent({
            guild_id: 'SYSTEM',
            user_id: 'SYSTEM',
            user_tag: 'System',
            action: `system_${eventType}`,
            target_type: 'system',
            target_id: null,
            details: details ? JSON.stringify(details) : null,
            success: 1,
            severity: this.severityLevels[severity.toUpperCase()] || this.severityLevels.LOW,
            category: 'system'
        });
    }

    /**
     * Core audit logging method
     */
    async logAuditEvent(eventData) {
        try {
            const auditEntry = {
                ...eventData,
                timestamp: new Date().toISOString(),
                id: `${Date.now()}_${Math.random()}`
            };

            // Add to buffer for batch processing
            this.logBuffer.set(auditEntry.id, auditEntry);

            // Immediate processing for critical events
            if (eventData.severity >= this.severityLevels.CRITICAL) {
                await this.processCriticalEvent(auditEntry);
            }

            // Flush if buffer is full
            if (this.logBuffer.size >= this.bufferSize) {
                await this.flushLogBuffer();
            }

            return true;

        } catch (error) {
            console.error('❌ Error logging audit event:', error);
            return false;
        }
    }

    /**
     * Process critical security events immediately
     */
    async processCriticalEvent(auditEntry) {
        try {
            // Immediately write to database
            await this.writeAuditEntry(auditEntry);

            // Send real-time notification if audit channel is configured
            await this.sendCriticalEventNotification(auditEntry);

            console.warn(`🚨 CRITICAL AUDIT EVENT: ${auditEntry.action} by ${auditEntry.user_tag} in guild ${auditEntry.guild_id}`);

        } catch (error) {
            console.error('❌ Error processing critical event:', error);
        }
    }

    /**
     * Flush audit log buffer to database
     */
    async flushLogBuffer() {
        if (this.logBuffer.size === 0) return;

        try {
            const logsToFlush = Array.from(this.logBuffer.values());
            this.logBuffer.clear();

            // Batch insert to database
            for (const logEntry of logsToFlush) {
                await this.writeAuditEntry(logEntry);
            }

            console.log(`📝 Flushed ${logsToFlush.length} audit logs to database`);

        } catch (error) {
            console.error('❌ Error flushing audit log buffer:', error);
        }
    }

    /**
     * Write individual audit entry to database
     */
    async writeAuditEntry(auditEntry) {
        const insertQuery = `
            INSERT INTO audit_log 
            (guild_id, user_id, user_tag, action, target_type, target_id, details, ip_address, success, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.runQuery(insertQuery, [
            auditEntry.guild_id,
            auditEntry.user_id,
            auditEntry.user_tag,
            auditEntry.action,
            auditEntry.target_type,
            auditEntry.target_id,
            auditEntry.details,
            auditEntry.ip_address,
            auditEntry.success,
            auditEntry.timestamp
        ]);
    }

    /**
     * Start periodic buffer flush
     */
    startPeriodicFlush() {
        setInterval(async () => {
            await this.flushLogBuffer();
        }, this.flushInterval);
    }

    /**
     * Get audit logs for a guild
     */
    async getGuildAuditLogs(guildId, options = {}) {
        try {
            const {
                limit = 50,
                offset = 0,
                action = null,
                userId = null,
                timeframe = '30d',
                category = null,
                severity = null
            } = options;

            let query = `
                SELECT * FROM audit_log 
                WHERE guild_id = ?
            `;
            const params = [guildId];

            // Add filters
            if (action) {
                query += ` AND action LIKE ?`;
                params.push(`%${action}%`);
            }

            if (userId) {
                query += ` AND user_id = ?`;
                params.push(userId);
            }

            if (category) {
                query += ` AND action LIKE ?`;
                params.push(`${category}_%`);
            }

            // Add time condition
            const timeCondition = this.getTimeCondition(timeframe);
            query += ` AND ${timeCondition}`;

            query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const logs = await this.db.allQuery(query, params);

            // Get total count for pagination
            let countQuery = `
                SELECT COUNT(*) as total FROM audit_log 
                WHERE guild_id = ? AND ${timeCondition}
            `;
            const countParams = [guildId];
            
            if (action) {
                countQuery += ` AND action LIKE ?`;
                countParams.push(`%${action}%`);
            }
            
            if (userId) {
                countQuery += ` AND user_id = ?`;
                countParams.push(userId);
            }

            const totalResult = await this.db.getQuery(countQuery, countParams);
            const total = totalResult ? totalResult.total : 0;

            return {
                logs: logs || [],
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: (offset + limit) < total
                },
                filters: { action, userId, timeframe, category, severity }
            };

        } catch (error) {
            console.error('❌ Error getting guild audit logs:', error);
            return { logs: [], pagination: { total: 0, limit, offset, hasMore: false }, filters: {} };
        }
    }

    /**
     * Get security summary for a guild
     */
    async getSecuritySummary(guildId, timeframe = '30d') {
        try {
            const timeCondition = this.getTimeCondition(timeframe);

            // Security event counts by type
            const securityEvents = await this.db.allQuery(`
                SELECT action, COUNT(*) as count, 
                       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
                FROM audit_log 
                WHERE guild_id = ? AND action LIKE 'security_%' AND ${timeCondition}
                GROUP BY action 
                ORDER BY count DESC
            `, [guildId]);

            // Permission changes
            const permissionChanges = await this.db.allQuery(`
                SELECT user_tag, COUNT(*) as changes
                FROM audit_log 
                WHERE guild_id = ? AND action LIKE 'permission_%' AND ${timeCondition}
                GROUP BY user_id, user_tag 
                ORDER BY changes DESC
                LIMIT 10
            `, [guildId]);

            // Admin actions
            const adminActions = await this.db.allQuery(`
                SELECT action, user_tag, COUNT(*) as count
                FROM audit_log 
                WHERE guild_id = ? AND action LIKE 'admin_%' AND ${timeCondition}
                GROUP BY action, user_id, user_tag 
                ORDER BY count DESC
                LIMIT 15
            `, [guildId]);

            // Failed actions (potential security concerns)
            const failedActions = await this.db.allQuery(`
                SELECT action, user_tag, COUNT(*) as failures, 
                       MAX(timestamp) as last_failure
                FROM audit_log 
                WHERE guild_id = ? AND success = 0 AND ${timeCondition}
                GROUP BY action, user_id, user_tag 
                ORDER BY failures DESC
                LIMIT 10
            `, [guildId]);

            // Calculate security score
            const securityScore = this.calculateSecurityScore({
                securityEvents,
                permissionChanges,
                adminActions,
                failedActions
            });

            return {
                timeframe,
                securityScore,
                summary: {
                    totalSecurityEvents: securityEvents.reduce((sum, event) => sum + event.count, 0),
                    permissionChanges: permissionChanges.reduce((sum, change) => sum + change.changes, 0),
                    adminActions: adminActions.reduce((sum, action) => sum + action.count, 0),
                    failedActions: failedActions.reduce((sum, failure) => sum + failure.failures, 0)
                },
                details: {
                    securityEvents,
                    permissionChanges,
                    adminActions,
                    failedActions
                },
                recommendations: this.generateSecurityRecommendations(securityScore, failedActions),
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error getting security summary:', error);
            return this.getEmptySecuritySummary(timeframe);
        }
    }

    /**
     * Send critical event notification to audit channel
     */
    async sendCriticalEventNotification(auditEntry) {
        try {
            // This would require Discord client access
            // For now, we'll log the critical event
            console.warn(`🚨 CRITICAL AUDIT EVENT: ${JSON.stringify(auditEntry)}`);
            
            // In a full implementation, this would:
            // 1. Get the guild's audit channel configuration
            // 2. Create a rich embed with the critical event details
            // 3. Send the notification to the audit channel
            // 4. Optionally ping administrators

        } catch (error) {
            console.error('❌ Error sending critical event notification:', error);
        }
    }

    /**
     * Create audit log embed for Discord display
     */
    createAuditLogEmbed(logs, title = 'Audit Logs') {
        const embed = new EmbedBuilder()
            .setColor(this.getEmbedColor(logs))
            .setTitle(`📋 ${title}`)
            .setTimestamp()
            .setFooter({ text: 'Discord-Trello Bot • Audit Logs' });

        if (logs.length === 0) {
            embed.setDescription('No audit logs found for the specified criteria.');
            return embed;
        }

        // Add recent log entries
        const recentLogs = logs.slice(0, 10);
        for (const log of recentLogs) {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const status = log.success ? '✅' : '❌';
            const severity = this.getSeverityEmoji(log.action);
            
            embed.addFields({
                name: `${severity} ${log.action}`,
                value: `**User**: ${log.user_tag}\n**Time**: ${timestamp}\n**Status**: ${status}${log.details ? `\n**Details**: ${this.truncateDetails(log.details)}` : ''}`,
                inline: false
            });
        }

        if (logs.length > 10) {
            embed.setDescription(`Showing 10 of ${logs.length} total entries. Use pagination to view more.`);
        }

        return embed;
    }

    // Helper methods
    getActionSeverity(action) {
        const severityMap = {
            'reset': this.severityLevels.HIGH,
            'permission_change': this.severityLevels.HIGH,
            'webhook_register': this.severityLevels.MEDIUM,
            'webhook_unregister': this.severityLevels.MEDIUM,
            'config_export': this.severityLevels.MEDIUM,
            'config_import': this.severityLevels.HIGH,
            'template_apply': this.severityLevels.MEDIUM
        };
        
        return severityMap[action] || this.severityLevels.LOW;
    }

    getConfigurationSeverity(changeType) {
        const severityMap = {
            'channel_mapping_add': this.severityLevels.LOW,
            'channel_mapping_remove': this.severityLevels.MEDIUM,
            'default_config_set': this.severityLevels.MEDIUM,
            'default_config_remove': this.severityLevels.MEDIUM,
            'webhook_register': this.severityLevels.MEDIUM,
            'webhook_unregister': this.severityLevels.MEDIUM
        };
        
        return severityMap[changeType] || this.severityLevels.LOW;
    }

    sanitizeValue(value) {
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value).substring(0, 500); // Truncate long values
    }

    getTimeCondition(timeframe) {
        const conditions = {
            '1h': "timestamp > datetime('now', '-1 hour')",
            '1d': "timestamp > datetime('now', '-1 day')",
            '7d': "timestamp > datetime('now', '-7 days')",
            '30d': "timestamp > datetime('now', '-30 days')",
            '90d': "timestamp > datetime('now', '-90 days')",
            'all': '1=1'
        };
        
        return conditions[timeframe] || conditions['30d'];
    }

    calculateSecurityScore(data) {
        let score = 100;
        
        // Deduct for failed actions
        const totalFailures = data.failedActions.reduce((sum, failure) => sum + failure.failures, 0);
        score -= Math.min(totalFailures * 2, 30);
        
        // Deduct for excessive permission changes
        const totalPermissionChanges = data.permissionChanges.reduce((sum, change) => sum + change.changes, 0);
        if (totalPermissionChanges > 10) {
            score -= Math.min((totalPermissionChanges - 10) * 1, 15);
        }
        
        // Deduct for security events
        const securityEventCount = data.securityEvents.reduce((sum, event) => sum + event.count, 0);
        score -= Math.min(securityEventCount * 3, 25);
        
        return Math.max(score, 0);
    }

    generateSecurityRecommendations(securityScore, failedActions) {
        const recommendations = [];
        
        if (securityScore < 70) {
            recommendations.push({
                type: 'urgent',
                message: 'Security score is below 70%. Review recent audit logs for potential security issues.',
                action: 'Review failed actions and implement additional security measures.'
            });
        }
        
        if (failedActions.length > 5) {
            recommendations.push({
                type: 'warning',
                message: 'High number of failed actions detected.',
                action: 'Check for potential unauthorized access attempts or configuration issues.'
            });
        }
        
        if (securityScore >= 90) {
            recommendations.push({
                type: 'info',
                message: 'Excellent security posture maintained.',
                action: 'Continue monitoring and maintain current security practices.'
            });
        }
        
        return recommendations;
    }

    getEmbedColor(logs) {
        const hasFailures = logs.some(log => !log.success);
        const hasCritical = logs.some(log => log.action.includes('security_') || log.action.includes('permission_'));
        
        if (hasFailures) return 0xff0000; // Red
        if (hasCritical) return 0xffa500; // Orange
        return 0x0079bf; // Blue
    }

    getSeverityEmoji(action) {
        if (action.includes('security_') || action.includes('permission_')) return '🚨';
        if (action.includes('admin_')) return '⚠️';
        if (action.includes('webhook_')) return '🔗';
        if (action.includes('config_')) return '⚙️';
        return 'ℹ️';
    }

    truncateDetails(details, maxLength = 100) {
        if (!details) return '';
        if (details.length <= maxLength) return details;
        return details.substring(0, maxLength) + '...';
    }

    getEmptySecuritySummary(timeframe) {
        return {
            timeframe,
            securityScore: 100,
            summary: {
                totalSecurityEvents: 0,
                permissionChanges: 0,
                adminActions: 0,
                failedActions: 0
            },
            details: {
                securityEvents: [],
                permissionChanges: [],
                adminActions: [],
                failedActions: []
            },
            recommendations: [{
                type: 'info',
                message: 'No audit data available for the specified timeframe.',
                action: 'Continue using the bot to generate audit logs.'
            }],
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Health check for audit logger
     */
    async healthCheck() {
        try {
            await this.db.getQuery('SELECT 1');
            
            return {
                healthy: true,
                bufferSize: this.logBuffer.size,
                maxBufferSize: this.bufferSize,
                flushInterval: this.flushInterval,
                features: {
                    auditLogging: true,
                    securityMonitoring: true,
                    batchProcessing: true,
                    criticalEventProcessing: true
                }
            };

        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                bufferSize: this.logBuffer.size
            };
        }
    }

    /**
     * Get audit statistics
     */
    async getAuditStatistics(guildId = null, timeframe = '30d') {
        try {
            const timeCondition = this.getTimeCondition(timeframe);
            let query = `
                SELECT 
                    COUNT(*) as total_logs,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_actions,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_actions,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT guild_id) as unique_guilds
                FROM audit_log 
                WHERE ${timeCondition}
            `;
            
            const params = [];
            if (guildId) {
                query += ' AND guild_id = ?';
                params.push(guildId);
            }

            const stats = await this.db.getQuery(query, params);
            
            return {
                ...stats,
                successRate: stats.total_logs > 0 ? (stats.successful_actions / stats.total_logs) * 100 : 0,
                bufferUtilization: (this.logBuffer.size / this.bufferSize) * 100,
                timeframe
            };

        } catch (error) {
            console.error('❌ Error getting audit statistics:', error);
            return {
                total_logs: 0,
                successful_actions: 0,
                failed_actions: 0,
                unique_users: 0,
                unique_guilds: 0,
                successRate: 0,
                bufferUtilization: 0,
                timeframe
            };
        }
    }
}

module.exports = { AuditLogger };